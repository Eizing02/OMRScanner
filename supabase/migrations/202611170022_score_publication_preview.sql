-- Apply after 021. Keep the receiver wire schema and existing withdrawal chain.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202611170021') then
    raise exception 'INSTALL_021_FIRST';
  end if;
end $$;

-- One statement reads the candidates and builds the exact objects used in the queue.
create function private.mathquest_publication_snapshot(tenant uuid,target uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  with candidates as materialized (
    select r.scan_id,r.exam_version_id,r.score,r.max_score,r.percent,r.passed,r.confirmed_at,
      s.student_identity->>'studentCode' as print_code, st.student_code as current_code,
      private.mathquest_metadata(v.config_json) as metadata
    from public.exam_results r
    join public.exam_versions v on v.school_id=r.school_id and v.id=r.exam_version_id
    join public.scan_records s on s.school_id=r.school_id and s.id=r.scan_id
    left join public.students st on st.school_id=r.school_id and st.id=r.student_id
    where r.school_id=tenant and r.exam_id=target and r.status='confirmed' and r.student_id is not null
    order by r.scan_id limit 10001
  ), marked as materialized (
    select *, (print_code is null or print_code !~ '^[0-9]{5}$' or print_code is distinct from current_code)
      as identity_issue from candidates
  )
  select jsonb_build_object(
    'count',count(*),
    'versions',count(distinct metadata),
    'metadata',min(metadata::text)::jsonb,
    'reviewCount',(select count(*) from public.exam_results
      where school_id=tenant and exam_id=target and status='pending_review'),
    'invalidScore',coalesce(bool_or(max_score<=0 or score<0 or score>max_score or max_score>6000
      or score::text in ('NaN','Infinity','-Infinity') or max_score::text in ('NaN','Infinity','-Infinity')
      or confirmed_at is null),false),
    'identityCount',count(*) filter (where identity_issue),
    'identityIssues',coalesce((select jsonb_agg(jsonb_build_object('originalCode',
      case when print_code ~ '^[0-9]{5}$' then print_code else null end, 'currentCode',current_code)
      order by scan_id) from (select * from marked where identity_issue order by scan_id limit 30) issues),'[]'::jsonb),
    'results',coalesce(jsonb_agg(jsonb_build_object('source_scan_id',scan_id,'source_exam_version_id',exam_version_id,
       'student_code',print_code,'score',score,'max_score',max_score,'percent',round(percent,2),'passed',passed,
       'confirmed_at',to_char(confirmed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      order by print_code,scan_id),'[]'::jsonb)
  ) from marked;
$$;

create function private.mathquest_snapshot_fingerprint(snapshot jsonb,conn public.integration_connections,prior_revision bigint)
returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(jsonb_build_array(conn.id,conn.connection_id,conn.destination_school_id,
    coalesce(prior_revision,0),snapshot)::text,'UTF8')),'hex');
$$;

create function private.mathquest_snapshot_block(snapshot jsonb)
returns text language sql immutable set search_path='' as $$
  select case
    when (snapshot->>'count')::integer=0 then 'NO_CONFIRMED_RESULTS'
    when (snapshot->>'count')::integer>10000 then 'SYNC_LIMIT'
    when (snapshot->>'identityCount')::integer>0 then 'SCORE_IDENTITY_REVIEW'
    when (snapshot->>'versions')::integer<>1 then 'MIXED_EXAM_METADATA'
    when (snapshot->>'invalidScore')::boolean then 'ZERO_MAX_SCORE'
  end;
$$;

-- Keep the 011/012 checks around this writer and the original events used by retries.
create or replace function private.mathquest_enqueue_v010(tenant uuid,target uuid,local_conn uuid,actor uuid,wanted text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  conn public.integration_connections; pub public.exam_publications;
  snapshot jsonb; metadata jsonb; amount integer; blocked text; fingerprint text;
  revision_no bigint; batch integer; batches integer; event uuid; payload jsonb;
  text_body text; records jsonb; stamp text; prior_revision bigint;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  perform private.require_active_exam(tenant,target);
  select * into conn from public.integration_connections where id=local_conn and source_workspace_id=tenant
    and status='active' and not revocation_pending for share;
  if not found or (wanted='publish_results' and not conn.enabled) then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  if wanted not in ('publish_results','withdraw_exam') then raise exception 'FORBIDDEN'; end if;
  select * into pub from public.exam_publications where source_workspace_id=tenant and source_exam_id=target
    and local_connection_id=conn.id for update;
  if wanted='publish_results' then
    if pub.state='withdraw_pending' then raise exception 'PUBLICATION_PENDING'; end if;
    -- The revision row also fences concurrent first publications where no pub row exists.
    insert into private.score_publication_revisions(source_workspace_id,source_exam_id) values(tenant,target) on conflict do nothing;
    select revision into prior_revision from private.score_publication_revisions
      where source_workspace_id=tenant and source_exam_id=target for update;
    snapshot:=private.mathquest_publication_snapshot(tenant,target);
    blocked:=private.mathquest_snapshot_block(snapshot);
    if blocked is not null then raise exception '%',blocked; end if;
    amount:=(snapshot->>'count')::integer;
    metadata:=snapshot->'metadata';
    if private.mathquest_term_closed(tenant,local_conn,metadata) then raise exception 'TERM_CLOSED'; end if;
    batches:=(amount+99)/100;
    fingerprint:=private.mathquest_snapshot_fingerprint(snapshot,conn,prior_revision);
  else
    if pub.revision is null or pub.revision=0 then
      insert into public.exam_publications(source_workspace_id,source_exam_id,local_connection_id,state,requested_generation,materialized_generation)
        values(tenant,target,conn.id,'withdrawn',0,0) on conflict(source_workspace_id,source_exam_id,local_connection_id)
        do update set state='withdrawn',materialized_generation=excluded.materialized_generation;
      return jsonb_build_object('revision',0,'batches',0);
    end if;
    metadata:=pub.exam_metadata; amount:=0; batches:=1;
  end if;
  insert into private.score_publication_revisions(source_workspace_id,source_exam_id) values(tenant,target) on conflict do nothing;
  update private.score_publication_revisions set revision=revision+1 where source_workspace_id=tenant and source_exam_id=target returning revision into revision_no;
  insert into public.exam_publications(source_workspace_id,source_exam_id,local_connection_id,state,revision,exam_metadata,published_by,published_at)
    values(tenant,target,conn.id,case wanted when 'publish_results' then 'active' else 'withdraw_pending' end,revision_no,metadata,actor,now())
    on conflict(source_workspace_id,source_exam_id,local_connection_id) do update set state=excluded.state,revision=excluded.revision,
      exam_metadata=excluded.exam_metadata,published_by=actor,published_at=excluded.published_at,
      materialized_generation=public.exam_publications.requested_generation,last_error_code=null;
  update public.score_sync_outbox set status='superseded' where source_workspace_id=tenant and source_exam_id=target
    and revision<revision_no and status in ('pending','retry','blocked','dead_letter');
  stamp:=to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  for batch in 0..batches-1 loop
    records:='[]'::jsonb;
    if wanted='publish_results' then
      select coalesce(jsonb_agg(item order by ord),'[]'::jsonb) into records
        from jsonb_array_elements(snapshot->'results') with ordinality as rows(item,ord)
        where ord>batch*100 and ord<=(batch+1)*100;
    end if;
    event:=gen_random_uuid();
    payload:=jsonb_build_object('schema_version','1.0','event_id',event,'connection_id',conn.connection_id,
      'source_workspace_id',tenant,'source_exam_id',target,'publication_revision',revision_no,'action',wanted,
      'batch_index',batch,'batch_count',batches,'occurred_at',stamp,'exam',metadata,'results',records);
    text_body:=payload::text;
    insert into public.score_sync_outbox(event_id,source_workspace_id,source_exam_id,local_connection_id,revision,
      action,batch_index,batch_count,payload_text,payload_hash)
      values(event,tenant,target,conn.id,revision_no,wanted,batch,batches,text_body,encode(sha256(convert_to(text_body,'UTF8')),'hex'));
  end loop;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,actor,case wanted when 'publish_results' then 'publish_exam_scores' else 'withdraw_exam_scores' end,
      'integrations','score_publication',conn.id,jsonb_build_object('exam_id',target,'revision',revision_no,'count',amount),
      'บันทึกงานเผยแพร่คะแนน MathQuest');
  return jsonb_strip_nulls(jsonb_build_object('revision',revision_no,'batches',batches,'fingerprint',fingerprint));
end; $$;

alter function public.get_mathquest_status(jsonb) rename to get_mathquest_status_v012;
create function public.get_mathquest_status(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; snapshot jsonb; preview jsonb; prior_revision bigint; blocked text;
  tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid; conn public.integration_connections;
begin
  result:=public.get_mathquest_status_v012(input);
  if target is null or input->>'preview' is distinct from 'true' or result->'connection'->>'status' is distinct from 'active' then
    return result;
  end if;
  select * into conn from public.integration_connections where id=(result->'connection'->>'id')::uuid
    and source_workspace_id=tenant and status='active';
  if not found then return result; end if;
  select revision into prior_revision from private.score_publication_revisions where source_workspace_id=tenant and source_exam_id=target;
  snapshot:=private.mathquest_publication_snapshot(tenant,target);
  blocked:=private.mathquest_snapshot_block(snapshot);
  preview:=jsonb_build_object(
    'metadata',snapshot->'metadata',
    'confirmedCount',snapshot->'count',
    'reviewCount',snapshot->'reviewCount',
    'identityIssueCount',snapshot->'identityCount',
    'identityIssues',snapshot->'identityIssues',
    'blocked',blocked,
    'fingerprint',case when blocked is null then private.mathquest_snapshot_fingerprint(snapshot,conn,prior_revision) end
  );
  return jsonb_set(result,'{publication,preview}',preview);
end; $$;

alter function public.command_mathquest_publication(jsonb) rename to command_mathquest_publication_v012;
create function public.command_mathquest_publication(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.command_mathquest_publication_v012(input);
  if input->>'action'='publish' and input ? 'preview_fingerprint' and
      (input->>'preview_fingerprint' is null or input->>'preview_fingerprint' is distinct from result->>'fingerprint') then
    -- Roll back the newly queued revision, audit and receipt together.
    raise exception 'SCORE_PREVIEW_CHANGED';
  end if;
  if input->>'action'='retry' and input->>'frozen_retry'='true' and coalesce((result->>'batches')::integer,0)>0 then
    raise exception 'SCORE_PREVIEW_REQUIRED';
  end if;
  return result-'fingerprint';
end; $$;

revoke all on function private.mathquest_publication_snapshot(uuid,uuid),
  private.mathquest_snapshot_fingerprint(jsonb,public.integration_connections,bigint),private.mathquest_snapshot_block(jsonb),
  private.mathquest_enqueue_v010(uuid,uuid,uuid,uuid,text),public.get_mathquest_status_v012(jsonb),
  public.command_mathquest_publication_v012(jsonb),public.get_mathquest_status(jsonb),public.command_mathquest_publication(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.get_mathquest_status(jsonb),public.command_mathquest_publication(jsonb) to authenticated;
insert into private.app_installation(version) values('202611170022');
notify pgrst,'reload schema';
commit;
