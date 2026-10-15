-- Apply ONCE after 011, first in staging. No HTTP, score mutation or job revival.
-- Requires MathQuest receiver profile 1.1 for audited closed-term purge ACKs.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202610150011') then raise exception 'INSTALL_011_FIRST'; end if;
end $$;

create index mathquest_withdrawal_command_revision on private.score_sync_commands
  (source_workspace_id,source_exam_id,(result->>'revision')) where action='withdraw';

-- A frozen withdrawal is authorized by the committed owner command, not a
-- browser-supplied job type. Revision counters and command rows survive re-pair.
create function private.mathquest_withdrawal_authorized(job public.score_sync_outbox) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.integration_connections c join public.exam_publications p
      on p.local_connection_id=c.id and p.source_workspace_id=c.source_workspace_id
    where job.action='withdraw_exam' and c.id=job.local_connection_id and c.source_workspace_id=job.source_workspace_id
      and c.status='active' and not c.revocation_pending and private.mathquest_owner_active(c.source_workspace_id,c.created_by)
      and p.source_exam_id=job.source_exam_id and p.revision=job.revision and p.state in ('withdraw_pending','error')
      and job.payload_text::jsonb->>'action'='withdraw_exam'
      and job.payload_text::jsonb->>'connection_id'=c.connection_id::text
      and job.payload_text::jsonb->>'source_workspace_id'=job.source_workspace_id::text
      and job.payload_text::jsonb->>'source_exam_id'=job.source_exam_id::text
      and job.payload_text::jsonb->>'publication_revision'=job.revision::text
      and job.batch_index=0 and job.batch_count=1
      and job.payload_text::jsonb->>'batch_index'='0' and job.payload_text::jsonb->>'batch_count'='1'
      and job.payload_text::jsonb->'results'='[]'::jsonb and job.payload_text::jsonb->'exam'=p.exam_metadata
      and exists(select 1 from private.score_sync_commands cmd where cmd.source_workspace_id=job.source_workspace_id
        and cmd.source_exam_id=job.source_exam_id and cmd.action='withdraw' and cmd.result->>'revision'=job.revision::text)
      and not exists(select 1 from public.exam_publications old join public.integration_connections origin on origin.id=old.local_connection_id
        where old.source_workspace_id=job.source_workspace_id and old.source_exam_id=job.source_exam_id and old.state not in ('draft','withdrawn')
          and origin.destination_school_id is distinct from c.destination_school_id));
$$;

create function private.mathquest_can_withdraw(tenant uuid,target uuid,local_conn uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.integration_connections c where c.id=local_conn and c.source_workspace_id=tenant
    and c.status='active' and not c.revocation_pending and private.mathquest_owner_active(tenant,c.created_by)
    and exists(select 1 from public.exam_publications p where p.source_workspace_id=tenant and p.source_exam_id=target
      and p.revision>0 and p.state not in ('draft','withdrawn'))
    and not exists(select 1 from public.exam_publications p where p.source_workspace_id=tenant and p.source_exam_id=target
      and p.local_connection_id=local_conn and p.state='withdraw_pending')
    and not exists(select 1 from public.exam_publications p join public.integration_connections origin on origin.id=p.local_connection_id
      where p.source_workspace_id=tenant and p.source_exam_id=target and p.state not in ('draft','withdrawn')
        and origin.destination_school_id is distinct from c.destination_school_id));
$$;

alter function public.command_mathquest_publication(jsonb) rename to command_mathquest_publication_v011;
revoke all on function public.command_mathquest_publication_v011(jsonb) from public,anon,authenticated,service_role;
create function public.command_mathquest_publication(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid; request uuid:=(input->>'request_id')::uuid;
  wanted text:=input->>'action'; conn public.integration_connections; job public.score_sync_outbox; result jsonb; prior private.score_sync_commands;
begin
  if not private.owns_workspace(tenant) or input->>'consent' is distinct from 'true' or request is null then raise exception 'FORBIDDEN'; end if;
  perform private.require_active_exam(tenant,target);
  select * into prior from private.score_sync_commands where source_workspace_id=tenant and request_id=request;
  if found then
    if prior.source_exam_id<>target or prior.action<>wanted then raise exception 'SYNC_REQUEST_CONFLICT'; end if;
    return prior.result;
  end if;
  select * into conn from public.integration_connections where source_workspace_id=tenant and status='active' and not revocation_pending;
  if wanted='withdraw' then
    if not private.mathquest_can_withdraw(tenant,target,conn.id) then raise exception 'NO_PUBLICATION_TO_WITHDRAW'; end if;
  elsif wanted='retry' then
    select o.* into job from public.score_sync_outbox o join public.exam_publications p on p.source_workspace_id=o.source_workspace_id
      and p.source_exam_id=o.source_exam_id and p.local_connection_id=o.local_connection_id and p.revision=o.revision
      where o.source_workspace_id=tenant and o.source_exam_id=target and o.local_connection_id=conn.id and o.action='withdraw_exam'
      order by o.created_at desc limit 1;
    if job.event_id is not null then
      if not private.mathquest_withdrawal_authorized(job) or job.status in ('delivered','partial','superseded') then raise exception 'NO_WITHDRAWAL_TO_RETRY'; end if;
      if job.last_error_code in ('WITHDRAWAL_PROOF_REQUIRED','RECEIVER_CONFLICT') then raise exception 'WITHDRAWAL_PROOF_REQUIRED'; end if;
      if (select count(*) from private.score_sync_commands where source_workspace_id=tenant and created_at>now()-interval '1 minute')>=15 then raise exception 'RATE_LIMITED'; end if;
      -- A new lease is acquired later; neither event bytes nor an old lease revive.
      update public.score_sync_outbox set status='retry',next_attempt_at=now(),lease_token=null,lease_until=null
        where event_id=job.event_id and status in ('retry','blocked','dead_letter');
      update public.exam_publications set state='withdraw_pending',last_error_code=null,materialized_generation=requested_generation
        where source_workspace_id=tenant and source_exam_id=target and local_connection_id=conn.id and revision=job.revision;
      result:=jsonb_build_object('revision',job.revision,'batches',0);
      insert into private.score_sync_commands values(tenant,request,target,wanted,result,now());
      return result;
    end if;
  end if;
  return public.command_mathquest_publication_v011(input);
end; $$;

-- Preserve 010 claim bounds and lock semantics, but never select closed-term
-- publication jobs. Consented historical withdrawals may use a paused connection.
create or replace function public.mathquest_service_claim(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.score_sync_outbox; conn public.integration_connections;
begin
  update public.score_sync_outbox o set status='superseded',lease_token=null,lease_until=null
    from public.integration_connections c where c.id=o.local_connection_id and o.status='sending' and o.lease_until<now()
      and (c.status<>'active' or c.revocation_pending or (not c.enabled and o.action='publish_results'));
  update public.score_sync_outbox o set status='blocked',last_error_code='TERM_CLOSED',lease_token=null,lease_until=null
    from public.integration_connections c,public.integration_closed_terms t
    where o.action='publish_results' and o.status in ('pending','retry','sending') and c.id=o.local_connection_id
      and t.source_workspace_id=o.source_workspace_id and t.destination_school_id=c.destination_school_id
      and o.payload_text::jsonb->'exam'->>'academic_year'=t.academic_year::text and o.payload_text::jsonb->'exam'->>'term'=t.term::text
      and (input->>'school_id' is null or o.source_workspace_id=(input->>'school_id')::uuid)
      and (input->>'exam_id' is null or o.source_exam_id=(input->>'exam_id')::uuid);
  select o.* into job from public.score_sync_outbox o join public.integration_connections c on c.id=o.local_connection_id
    where ((o.status in ('pending','retry') and o.next_attempt_at<=now()) or (o.status='sending' and o.lease_until<now()))
      and c.status='active' and not c.revocation_pending and private.mathquest_owner_active(c.source_workspace_id,c.created_by)
      and ((o.action='publish_results' and c.enabled and not private.mathquest_term_closed(o.source_workspace_id,o.local_connection_id,o.payload_text::jsonb->'exam'))
        or (o.action='withdraw_exam' and private.mathquest_withdrawal_authorized(o)))
      and (input->>'school_id' is null or o.source_workspace_id=(input->>'school_id')::uuid)
      and (input->>'exam_id' is null or o.source_exam_id=(input->>'exam_id')::uuid)
    order by o.created_at,o.batch_index limit 1 for update of o skip locked;
  if not found then return null; end if;
  update public.score_sync_outbox set status='sending',attempt_count=attempt_count+1,lease_token=gen_random_uuid(),lease_until=now()+interval '30 seconds'
    where event_id=job.event_id returning * into job;
  return to_jsonb(job)||jsonb_build_object('token_secret',(select token_secret from private.integration_secrets where connection_id=job.local_connection_id));
end; $$;

create or replace function public.mathquest_service_validate_lease(input jsonb) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.score_sync_outbox o join public.integration_connections c on c.id=o.local_connection_id
    where o.event_id=(input->>'event_id')::uuid and o.lease_token=(input->>'lease_token')::uuid and o.status='sending' and o.lease_until>now()
      and c.status='active' and not c.revocation_pending and private.mathquest_owner_active(c.source_workspace_id,c.created_by)
      and ((o.action='publish_results' and c.enabled and not private.mathquest_term_closed(o.source_workspace_id,o.local_connection_id,o.payload_text::jsonb->'exam'))
        or (o.action='withdraw_exam' and private.mathquest_withdrawal_authorized(o))));
$$;

alter function public.mathquest_service_finish(jsonb) rename to mathquest_service_finish_v011;
revoke all on function public.mathquest_service_finish_v011(jsonb) from public,anon,authenticated,service_role;
create function public.mathquest_service_finish(input jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare job public.score_sync_outbox; conn public.integration_connections; metadata jsonb; failure_code text; done boolean;
begin
  select * into job from public.score_sync_outbox where event_id=(input->>'event_id')::uuid;
  if job.event_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||job.source_workspace_id::text,0));
  select * into job from public.score_sync_outbox where event_id=(input->>'event_id')::uuid and lease_token=(input->>'lease_token')::uuid and status='sending' for update;
  if not found or not public.mathquest_service_validate_lease(input) then return false; end if;
  if input->>'error_code' is distinct from 'TERM_CLOSED' then
    done:=public.mathquest_service_finish_v011(input);
    -- A stale reply is not a withdrawal receipt. Permit a fresh explicit higher
    -- withdrawal after reconciliation, never endless replay of this old event.
    if done and job.action='withdraw_exam' and input->'ack'->>'status'='stale_ignored' then
      update public.exam_publications set state='error' where source_workspace_id=job.source_workspace_id and source_exam_id=job.source_exam_id
        and local_connection_id=job.local_connection_id and revision=job.revision and last_error_code='RECEIVER_CONFLICT';
    end if;
    return done;
  end if;
  if input->'ack' is not null and input->'ack'<>'null'::jsonb then raise exception 'INVALID_ACK'; end if;
  select * into conn from public.integration_connections where id=job.local_connection_id;
  metadata:=job.payload_text::jsonb->'exam';
  insert into public.integration_closed_terms(source_workspace_id,destination_school_id,academic_year,term)
    values(job.source_workspace_id,conn.destination_school_id,(metadata->>'academic_year')::integer,(metadata->>'term')::integer) on conflict do nothing;
  -- Never cancel another exam's withdrawal or reuse its lease after a denial.
  update public.score_sync_outbox o set status='blocked',last_error_code='TERM_CLOSED',lease_token=null,lease_until=null
    from public.integration_connections c where c.id=o.local_connection_id and c.destination_school_id=conn.destination_school_id
      and o.source_workspace_id=job.source_workspace_id and o.action='publish_results'
      and o.payload_text::jsonb->'exam'->>'academic_year'=metadata->>'academic_year' and o.payload_text::jsonb->'exam'->>'term'=metadata->>'term'
      and o.status in ('pending','sending','retry','blocked','dead_letter');
  update public.exam_publications p set state='error',last_error_code='TERM_CLOSED',materialized_generation=requested_generation
    from public.integration_connections c where c.id=p.local_connection_id and c.destination_school_id=conn.destination_school_id
      and p.source_workspace_id=job.source_workspace_id and p.exam_metadata->>'academic_year'=metadata->>'academic_year' and p.exam_metadata->>'term'=metadata->>'term'
      and p.state not in ('draft','withdrawn') and not exists(select 1 from public.score_sync_outbox o
        where o.source_workspace_id=p.source_workspace_id and o.source_exam_id=p.source_exam_id and o.local_connection_id=p.local_connection_id and o.revision=p.revision and o.action='withdraw_exam');
  failure_code:=case when job.action='withdraw_exam' then 'WITHDRAWAL_PROOF_REQUIRED' else 'TERM_CLOSED' end;
  if job.action='withdraw_exam' then
    update public.score_sync_outbox set status='blocked',last_error_code=failure_code,lease_token=null,lease_until=null where event_id=job.event_id;
    update public.exam_publications set state='error',last_error_code=failure_code,materialized_generation=requested_generation
      where source_workspace_id=job.source_workspace_id and source_exam_id=job.source_exam_id and local_connection_id=job.local_connection_id and revision=job.revision;
  end if;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message,severity)
    values(job.source_workspace_id,conn.created_by,'score_term_closed','integrations','score_sync_event',job.event_id,
      jsonb_build_object('academicYear',metadata->'academic_year','term',metadata->'term','errorCode',failure_code),
      case when job.action='withdraw_exam' then 'MathQuest ยังยืนยันการถอนคะแนนไม่ได้ กรุณาติดต่อผู้ดูแลปลายทาง' else 'MathQuest ปิดรับคะแนนภาคเรียนนี้แล้ว' end,'warning');
  return true;
end; $$;

alter function public.get_mathquest_status(jsonb) rename to get_mathquest_status_v011;
revoke all on function public.get_mathquest_status_v011(jsonb) from public,anon,authenticated,service_role;
create function public.get_mathquest_status(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid;
  conn public.integration_connections; job public.score_sync_outbox;
begin
  result:=public.get_mathquest_status_v011(input);
  if target is null then return result; end if;
  select * into conn from public.integration_connections where source_workspace_id=tenant and status='active';
  select o.* into job from public.score_sync_outbox o join public.exam_publications p on p.source_workspace_id=o.source_workspace_id
    and p.source_exam_id=o.source_exam_id and p.local_connection_id=o.local_connection_id and p.revision=o.revision
    where o.source_workspace_id=tenant and o.source_exam_id=target and o.local_connection_id=conn.id and o.action='withdraw_exam' order by o.created_at desc limit 1;
  result:=jsonb_set(result,'{publication,canWithdraw}',to_jsonb(private.mathquest_can_withdraw(tenant,target,conn.id)));
  result:=jsonb_set(result,'{publication,canRetryWithdrawal}',to_jsonb(job.event_id is not null and job.status in ('retry','blocked','dead_letter')
    and coalesce(job.last_error_code,'') not in ('WITHDRAWAL_PROOF_REQUIRED','RECEIVER_CONFLICT') and private.mathquest_withdrawal_authorized(job)));
  result:=jsonb_set(result,'{publication,withdrawalBlocked}',to_jsonb(job.event_id is not null and coalesce(job.last_error_code,'') in ('WITHDRAWAL_PROOF_REQUIRED','RECEIVER_CONFLICT')));
  return result;
end; $$;

revoke all on function private.mathquest_withdrawal_authorized(public.score_sync_outbox),private.mathquest_can_withdraw(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.command_mathquest_publication(jsonb),public.get_mathquest_status(jsonb),public.mathquest_service_claim(jsonb),public.mathquest_service_validate_lease(jsonb),public.mathquest_service_finish(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.command_mathquest_publication(jsonb),public.get_mathquest_status(jsonb) to authenticated;
grant execute on function public.mathquest_service_claim(jsonb),public.mathquest_service_validate_lease(jsonb),public.mathquest_service_finish(jsonb) to service_role;
insert into private.app_installation(version) values('202610150012');
notify pgrst,'reload schema';
commit;
