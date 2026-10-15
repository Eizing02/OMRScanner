-- Apply once AFTER 010. No HTTP, credential values or live-data seed.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202610150010') then raise exception 'INSTALL_010_FIRST'; end if;
end $$;

alter table public.integration_connections add column recovery_pending boolean not null default false;
create table public.integration_closed_terms (
  source_workspace_id uuid not null references public.schools(id), destination_school_id uuid not null,
  academic_year integer not null check(academic_year between 2500 and 2700), term integer not null check(term between 1 and 3),
  detected_at timestamptz not null default now(),
  primary key(source_workspace_id,destination_school_id,academic_year,term)
);
alter table public.integration_closed_terms enable row level security;
revoke all on public.integration_closed_terms from public,anon,authenticated,service_role;
grant select on public.integration_closed_terms to authenticated;
create policy own_closed_terms on public.integration_closed_terms for select to authenticated using(private.owns_workspace(source_workspace_id));

create function private.mathquest_term_closed(tenant uuid,local_conn uuid,metadata jsonb) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.integration_closed_terms t join public.integration_connections c
    on c.source_workspace_id=t.source_workspace_id and c.destination_school_id=t.destination_school_id
    where c.id=local_conn and c.source_workspace_id=tenant and t.academic_year=(metadata->>'academic_year')::integer and t.term=(metadata->>'term')::integer);
$$;

-- An old publication is retained after connection recovery, never falsely withdrawn.
alter function public.get_mathquest_status(jsonb) rename to get_mathquest_status_v010;
revoke all on function public.get_mathquest_status_v010(jsonb) from public,anon,authenticated,service_role;
create function public.get_mathquest_status(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid;
  conn public.integration_connections; pub public.exam_publications; previous boolean:=false;
begin
  result:=public.get_mathquest_status_v010(input); -- Preserves authenticated ownership/exam checks.
  select * into conn from public.integration_connections where source_workspace_id=tenant order by created_at desc,id desc limit 1;
  if conn.id is not null then result:=jsonb_set(result,'{connection,recoveryPending}',to_jsonb(conn.recovery_pending)); end if;
  if target is not null then
    select * into pub from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and local_connection_id=conn.id;
    if pub.revision is null or pub.revision=0 then
      select * into pub from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and state not in ('draft','withdrawn') order by revision desc limit 1;
      previous:=found;
      if previous then
        result:=jsonb_set(result,'{publication}',jsonb_build_object('state',pub.state,'revision',pub.revision,
          'confirmed',(result->'publication'->>'confirmed')::integer,'pending',0,'delivered',0,'unmatched','[]'::jsonb,'invalid','[]'::jsonb,
          'lastError','REMOTE_REVOKED','lastSyncAt',pub.last_sync_at));
      end if;
    end if;
    result:=jsonb_set(result,'{publication,recoveryRequired}',to_jsonb(previous));
    result:=jsonb_set(result,'{publication,termClosed}',to_jsonb(private.mathquest_term_closed(tenant,conn.id,pub.exam_metadata)
      or exists(select 1 from public.exam_results r join public.exam_versions v on v.id=r.exam_version_id
        where r.school_id=tenant and r.exam_id=target and r.status='confirmed' and private.mathquest_term_closed(tenant,conn.id,private.mathquest_metadata(v.config_json)))));
  end if;
  return result;
end; $$;

-- Retain 010 validation/serialization. Seed only enough historical identity for a
-- NEW authenticated connection to withdraw a publication from its previous token.
alter function private.mathquest_enqueue(uuid,uuid,uuid,uuid,text) rename to mathquest_enqueue_v010;
create function private.mathquest_enqueue(tenant uuid,target uuid,local_conn uuid,actor uuid,wanted text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare prior public.exam_publications; conn public.integration_connections;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  perform private.require_active_exam(tenant,target);
  select * into conn from public.integration_connections where id=local_conn and source_workspace_id=tenant and status='active' and not revocation_pending for share;
  if not found then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  if exists(select 1 from public.exam_publications p join public.integration_connections c on c.id=p.local_connection_id
    where p.source_workspace_id=tenant and p.source_exam_id=target and p.state not in ('draft','withdrawn')
      and c.destination_school_id is distinct from conn.destination_school_id) then raise exception 'RECOVERY_DESTINATION_MISMATCH'; end if;
  if wanted='publish_results' and exists(select 1 from public.exam_results r join public.exam_versions v on v.id=r.exam_version_id
    where r.school_id=tenant and r.exam_id=target and r.status='confirmed' and private.mathquest_term_closed(tenant,local_conn,private.mathquest_metadata(v.config_json))) then raise exception 'TERM_CLOSED'; end if;
  if not exists(select 1 from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and local_connection_id=local_conn and revision>0) then
    select * into prior from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and local_connection_id<>local_conn and state not in ('draft','withdrawn') order by revision desc limit 1;
    if found then
      if wanted<>'withdraw_exam' then raise exception 'PUBLICATION_RECOVERY_REQUIRED'; end if;
      insert into public.exam_publications(source_workspace_id,source_exam_id,local_connection_id,state,revision,exam_metadata)
        values(tenant,target,local_conn,'error',prior.revision,prior.exam_metadata)
        on conflict(source_workspace_id,source_exam_id,local_connection_id) do update set state='error',revision=excluded.revision,exam_metadata=excluded.exam_metadata;
    end if;
  end if;
  return private.mathquest_enqueue_v010(tenant,target,local_conn,actor,wanted);
end; $$;

-- Recovery must target the original school. An ACK from another school cannot
-- withdraw the first school's scores. A rejected activation retains the pairing
-- challenge so the pending-request cancellation handshake can revoke it remotely.
alter function public.mathquest_service_complete_pairing(jsonb) rename to mathquest_service_complete_pairing_v010;
revoke all on function public.mathquest_service_complete_pairing_v010(jsonb) from public,anon,authenticated,service_role;
create function public.mathquest_service_complete_pairing(input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; challenge jsonb;
begin
  if not private.mathquest_owner_active(tenant,(input->>'actor_id')::uuid) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select s.pairing_secret into challenge from private.integration_secrets s join public.integration_connections c on c.id=s.connection_id
    where c.id=(input->>'id')::uuid and c.source_workspace_id=tenant;
  if input->>'status'='active' and exists(select 1 from public.exam_publications p join public.integration_connections c on c.id=p.local_connection_id
    where p.source_workspace_id=tenant and p.state not in ('draft','withdrawn') and c.destination_school_id is distinct from (input->>'destination_school_id')::uuid)
    then raise exception 'RECOVERY_DESTINATION_MISMATCH'; end if;
  perform public.mathquest_service_complete_pairing_v010(input);
  -- An expired delivery window can coexist with an active remote connection.
  -- Keep the protected challenge for cancellation/operator recovery, not activation.
  if input->>'status' in ('rejected','expired') then update private.integration_secrets set pairing_secret=challenge where connection_id=(input->>'id')::uuid; end if;
end; $$;

alter function public.command_mathquest_publication(jsonb) rename to command_mathquest_publication_v010;
revoke all on function public.command_mathquest_publication_v010(jsonb) from public,anon,authenticated,service_role;
create function public.command_mathquest_publication(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid; conn public.integration_connections; pub public.exam_publications;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform private.require_active_exam(tenant,target);
  -- Delegate consent, request scope and saved-result checks before new gates.
  if exists(select 1 from private.score_sync_commands where source_workspace_id=tenant and request_id=(input->>'request_id')::uuid)
    then return public.command_mathquest_publication_v010(input); end if;
  select * into conn from public.integration_connections where source_workspace_id=tenant and status='active';
  if input->>'action' in ('publish','retry') then
    if exists(select 1 from public.exam_results r join public.exam_versions v on v.id=r.exam_version_id where r.school_id=tenant and r.exam_id=target and r.status='confirmed'
      and private.mathquest_term_closed(tenant,conn.id,private.mathquest_metadata(v.config_json))) then raise exception 'TERM_CLOSED'; end if;
    select * into pub from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and local_connection_id=conn.id;
    if pub.last_error_code='TERM_CLOSED' then raise exception 'TERM_CLOSED'; end if;
    if coalesce(pub.revision,0)=0 and exists(select 1 from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and local_connection_id<>conn.id and state not in ('draft','withdrawn')) then raise exception 'PUBLICATION_RECOVERY_REQUIRED'; end if;
  end if;
  return public.command_mathquest_publication_v010(input);
end; $$;

-- A known closed term cannot create more automatic requests. A new connection
-- also cannot auto-publish over historical scores awaiting verified withdrawal.
create or replace function private.mathquest_confirm_request() returns trigger language plpgsql security definer set search_path='' as $$
declare conn public.integration_connections; metadata jsonb;
begin
  if new.status<>'confirmed' or old.status='confirmed' then return new; end if;
  select * into conn from public.integration_connections where source_workspace_id=new.school_id and status='active' and enabled and not revocation_pending and mode='auto_after_confirm';
  if conn.id is null or new.confirmed_at<conn.auto_enabled_at or not private.mathquest_owner_active(new.school_id,conn.created_by) then return new; end if;
  select private.mathquest_metadata(config_json) into metadata from public.exam_versions where id=new.exam_version_id;
  if private.mathquest_term_closed(new.school_id,conn.id,metadata)
    or exists(select 1 from public.exam_publications where source_workspace_id=new.school_id and source_exam_id=new.exam_id and local_connection_id<>conn.id and state not in ('draft','withdrawn')) then return new; end if;
  insert into public.exam_publications(source_workspace_id,source_exam_id,local_connection_id,requested_generation,requested_by,requested_at)
    values(new.school_id,new.exam_id,conn.id,1,conn.created_by,now())
    on conflict(source_workspace_id,source_exam_id,local_connection_id) do update set requested_generation=public.exam_publications.requested_generation+1,requested_by=conn.created_by,requested_at=now()
      where public.exam_publications.state not in ('withdraw_pending','withdrawn');
  return new;
end; $$;

alter function public.mathquest_service_materialize(jsonb) rename to mathquest_service_materialize_v010;
revoke all on function public.mathquest_service_materialize_v010(jsonb) from public,anon,authenticated,service_role;
create function public.mathquest_service_materialize(input jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare pub public.exam_publications; conn public.integration_connections; amount integer:=0; code text;
begin
  for pub in select p.* from public.exam_publications p join public.integration_connections c on c.id=p.local_connection_id
    where p.requested_generation>p.materialized_generation and p.state not in ('withdraw_pending','withdrawn')
    and c.status='active' and c.enabled and not c.revocation_pending and c.mode='auto_after_confirm'
    and (input->>'school_id' is null or p.source_workspace_id=(input->>'school_id')::uuid)
    and (input->>'exam_id' is null or p.source_exam_id=(input->>'exam_id')::uuid)
    and p.requested_at<now()-interval '2 seconds' order by p.requested_at limit 5 loop
    if not pg_try_advisory_xact_lock(hashtextextended('scan:'||pub.source_workspace_id::text,0)) then continue; end if;
    select * into pub from public.exam_publications where source_workspace_id=pub.source_workspace_id and source_exam_id=pub.source_exam_id and local_connection_id=pub.local_connection_id for update;
    if pub.requested_generation<=pub.materialized_generation or pub.state in ('withdraw_pending','withdrawn') then continue; end if;
    select * into conn from public.integration_connections where id=pub.local_connection_id;
    if not private.mathquest_owner_active(pub.source_workspace_id,conn.created_by) then continue; end if;
    begin
      perform private.mathquest_enqueue(pub.source_workspace_id,pub.source_exam_id,conn.id,conn.created_by,'publish_results');
      amount:=amount+1;
    exception when others then
      code:=case when sqlerrm like '%TERM_CLOSED%' then 'TERM_CLOSED' when sqlerrm like '%PUBLICATION_RECOVERY_REQUIRED%' then 'PUBLICATION_RECOVERY_REQUIRED'
        when sqlerrm like '%RECOVERY_DESTINATION_MISMATCH%' then 'RECOVERY_DESTINATION_MISMATCH'
        when sqlerrm like '%MIXED_EXAM_METADATA%' then 'MIXED_EXAM_METADATA' when sqlerrm like '%ZERO_MAX_SCORE%' then 'ZERO_MAX_SCORE' else 'PUBLICATION_BLOCKED' end;
      update public.exam_publications set state='error',last_error_code=code,materialized_generation=requested_generation
        where source_workspace_id=pub.source_workspace_id and source_exam_id=pub.source_exam_id and local_connection_id=pub.local_connection_id;
    end;
  end loop;
  return amount;
end; $$;

-- Service-only, explicit recovery is allowed to revoke a failed connection even
-- with old publications. The verified remote ACK closes the CONNECTION only.
create function public.mathquest_service_recover(input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid; conn public.integration_connections; ack jsonb:=input->'ack';
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into conn from public.integration_connections where id=(input->>'id')::uuid and source_workspace_id=tenant for update;
  if not found or conn.status<>'active' then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  if input->>'finish' is distinct from 'true' then
    if conn.enabled and not conn.recovery_pending then raise exception 'RECOVERY_PAUSE_REQUIRED'; end if;
    update public.integration_connections set enabled=false,revocation_pending=true,recovery_pending=true,updated_at=now() where id=conn.id;
    return;
  end if;
  if not conn.recovery_pending or jsonb_typeof(ack) is distinct from 'object'
    or ack->>'schema_version' is distinct from '1.0' or ack->>'request_id' is distinct from conn.id::text or ack->>'status' is distinct from 'revoked'
    or (select count(*) from jsonb_object_keys(ack))<>3 then raise exception 'INVALID_ACK'; end if;
  update public.integration_connections set status='revoked',enabled=false,revocation_pending=false,recovery_pending=false,last_error_code='REMOTE_REVOKED',updated_at=now() where id=conn.id;
  update private.integration_secrets set token_secret=null,pairing_secret=null where connection_id=conn.id;
  update public.score_sync_outbox set status='superseded',lease_token=null,lease_until=null where local_connection_id=conn.id and status not in ('delivered','partial','superseded');
  update public.exam_publications set state='error',last_error_code='REMOTE_REVOKED',materialized_generation=requested_generation
    where local_connection_id=conn.id and state not in ('draft','withdrawn');
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,actor,'recover_score_connection','integrations','integration_connection',conn.id,'{"status":"revoked","scoresWithdrawn":false}', 'ยกเลิกการเชื่อมต่อเดิมเพื่อจับคู่ MathQuest ใหม่');
end; $$;

-- Bind new revoke callers to the credential row they actually used. Keep legacy
-- callers compatible, but never let normal revoke finish a recovery operation.
alter function public.mathquest_service_revoke(jsonb) rename to mathquest_service_revoke_v010;
revoke all on function public.mathquest_service_revoke_v010(jsonb) from public,anon,authenticated,service_role;
create function public.mathquest_service_revoke(input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare conn public.integration_connections; tenant uuid:=(input->>'school_id')::uuid;
begin
  if not private.mathquest_owner_active(tenant,(input->>'actor_id')::uuid) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into conn from public.integration_connections where source_workspace_id=tenant and status<>'revoked' for update;
  if conn.id is null then return; end if;
  if (input->>'id' is not null and input->>'id'<>conn.id::text) or conn.recovery_pending then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  perform public.mathquest_service_revoke_v010(input);
end; $$;

alter function public.mathquest_service_finish(jsonb) rename to mathquest_service_finish_v010;
revoke all on function public.mathquest_service_finish_v010(jsonb) from public,anon,authenticated,service_role;
create function public.mathquest_service_finish(input jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare job public.score_sync_outbox; conn public.integration_connections; metadata jsonb; done boolean;
begin
  select * into job from public.score_sync_outbox where event_id=(input->>'event_id')::uuid;
  if job.event_id is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||job.source_workspace_id::text,0));
  select * into job from public.score_sync_outbox where event_id=job.event_id and lease_token=(input->>'lease_token')::uuid and status='sending' for update;
  if not found then return false; end if;
  if input->>'error_code'='TERM_CLOSED' then
    select * into conn from public.integration_connections where id=job.local_connection_id;
    metadata:=job.payload_text::jsonb->'exam';
    insert into public.integration_closed_terms(source_workspace_id,destination_school_id,academic_year,term)
      values(job.source_workspace_id,conn.destination_school_id,(metadata->>'academic_year')::integer,(metadata->>'term')::integer) on conflict do nothing;
    update public.score_sync_outbox o set status='blocked',last_error_code='TERM_CLOSED',lease_token=null,lease_until=null
      from public.integration_connections c where c.id=o.local_connection_id and c.destination_school_id=conn.destination_school_id
      and o.source_workspace_id=job.source_workspace_id and (o.payload_text::jsonb->'exam'->>'academic_year')=metadata->>'academic_year'
      and (o.payload_text::jsonb->'exam'->>'term')=metadata->>'term' and o.status in ('pending','sending','retry','blocked','dead_letter');
    update public.exam_publications p set state='error',last_error_code='TERM_CLOSED',materialized_generation=requested_generation
      from public.integration_connections c where c.id=p.local_connection_id and c.destination_school_id=conn.destination_school_id
      and p.source_workspace_id=job.source_workspace_id and p.exam_metadata->>'academic_year'=metadata->>'academic_year' and p.exam_metadata->>'term'=metadata->>'term'
      and p.state not in ('draft','withdrawn');
    insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message,severity)
      values(job.source_workspace_id,conn.created_by,'score_term_closed','integrations','score_sync_event',job.event_id,
        jsonb_build_object('academicYear',metadata->'academic_year','term',metadata->'term'),'MathQuest ปิดรับคะแนนภาคเรียนนี้แล้ว','warning');
    return true;
  end if;
  done:=public.mathquest_service_finish_v010(input);
  if done and job.action='withdraw_exam' and input->'ack'->>'status'='processed'
    and exists(select 1 from public.exam_publications where source_workspace_id=job.source_workspace_id and source_exam_id=job.source_exam_id
      and local_connection_id=job.local_connection_id and revision=job.revision and state='withdrawn') then
    update public.exam_publications p set state='withdrawn',withdrawn_at=now(),last_error_code=null,materialized_generation=requested_generation
      from public.integration_connections old_conn,public.integration_connections new_conn
      where p.source_workspace_id=job.source_workspace_id and p.source_exam_id=job.source_exam_id and p.revision<=job.revision
        and old_conn.id=p.local_connection_id and new_conn.id=job.local_connection_id and old_conn.destination_school_id=new_conn.destination_school_id;
  end if;
  return done;
end; $$;

-- Closed-term rows must never be reclaimed by transport retry or expired leases.
alter function public.mathquest_service_claim(jsonb) rename to mathquest_service_claim_v010;
revoke all on function public.mathquest_service_claim_v010(jsonb) from public,anon,authenticated,service_role;
create function public.mathquest_service_claim(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update public.score_sync_outbox o set status='blocked',last_error_code='TERM_CLOSED',lease_token=null,lease_until=null
    from public.integration_connections c,public.integration_closed_terms t
    where o.status in ('pending','retry','sending') and c.id=o.local_connection_id
      and t.source_workspace_id=o.source_workspace_id and t.destination_school_id=c.destination_school_id
      and o.payload_text::jsonb->'exam'->>'academic_year'=t.academic_year::text and o.payload_text::jsonb->'exam'->>'term'=t.term::text
      and (input->>'school_id' is null or o.source_workspace_id=(input->>'school_id')::uuid)
      and (input->>'exam_id' is null or o.source_exam_id=(input->>'exam_id')::uuid);
  return public.mathquest_service_claim_v010(input);
end; $$;

do $$ declare fn record; begin
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname like 'mathquest_%') or (n.nspname='public' and p.proname like 'mathquest_service_%') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
  end loop;
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'mathquest_service_%' and p.proname not like '%_v010' loop
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;
revoke all on function public.get_mathquest_status(jsonb),public.command_mathquest_publication(jsonb) from public,anon,service_role;
grant execute on function public.get_mathquest_status(jsonb),public.command_mathquest_publication(jsonb) to authenticated;
insert into private.app_installation(version) values('202610150011');
notify pgrst,'reload schema';
commit;
