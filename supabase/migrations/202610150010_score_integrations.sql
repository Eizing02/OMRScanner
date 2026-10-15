-- Apply ONCE after 009, first in staging. No HTTP, secrets or production seed.
-- Optional score publication only; scanner/grading/print identity are unchanged.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202610090009') then
    raise exception 'INSTALL_009_FIRST';
  end if;
end $$;

create table public.integration_connections (
  id uuid primary key, source_workspace_id uuid not null references public.schools(id),
  provider text not null default 'mathquest' check(provider='mathquest'),
  connection_id uuid unique, destination_school_id uuid, destination_label text not null default '' check(length(destination_label)<=120),
  status text not null default 'pending_approval' check(status in ('pending_approval','active','revoked','error')),
  mode text not null default 'manual' check(mode in ('manual','auto_after_confirm')),
  enabled boolean not null default false, auto_enabled_at timestamptz,
  revocation_pending boolean not null default false,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  last_checked_at timestamptz, last_sync_at timestamptz, last_error_code text,
  unique(source_workspace_id,id),
  check(status<>'active' or (connection_id is not null and destination_school_id is not null))
);
create unique index mathquest_one_connection on public.integration_connections(source_workspace_id,provider) where status<>'revoked';
create table private.integration_secrets (
  connection_id uuid primary key references public.integration_connections(id),
  pairing_secret jsonb, token_secret jsonb,
  check(pairing_secret is null or (jsonb_typeof(pairing_secret)='object' and pairing_secret ?& array['v','nonce','tag','ciphertext'])),
  check(token_secret is null or (jsonb_typeof(token_secret)='object' and token_secret ?& array['v','nonce','tag','ciphertext']))
);
-- Logical exam IDs deliberately survive permanent deletion, re-pairing and revoke.
create table private.score_publication_revisions (
  source_workspace_id uuid not null references public.schools(id), source_exam_id uuid not null,
  revision bigint not null default 0 check(revision between 0 and 9007199254740991),
  primary key(source_workspace_id,source_exam_id)
);
create table public.exam_publications (
  source_workspace_id uuid not null, source_exam_id uuid not null, local_connection_id uuid not null,
  state text not null default 'draft' check(state in ('draft','active','withdraw_pending','withdrawn','error')),
  revision bigint not null default 0, exam_metadata jsonb,
  requested_generation bigint not null default 0, materialized_generation bigint not null default 0,
  requested_by uuid references auth.users(id), requested_at timestamptz,
  published_by uuid references auth.users(id), published_at timestamptz, withdrawn_at timestamptz,
  last_sync_at timestamptz, last_error_code text,
  primary key(source_workspace_id,source_exam_id,local_connection_id),
  foreign key(source_workspace_id,local_connection_id) references public.integration_connections(source_workspace_id,id)
);
create table public.score_sync_outbox (
  event_id uuid primary key, source_workspace_id uuid not null, source_exam_id uuid not null, local_connection_id uuid not null,
  revision bigint not null check(revision>=1), action text not null check(action in ('publish_results','withdraw_exam')),
  batch_index integer not null, batch_count integer not null check(batch_count between 1 and 100),
  payload_text text not null check(octet_length(payload_text)<=262144), payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check(status in ('pending','sending','delivered','partial','retry','blocked','dead_letter','superseded')),
  attempt_count integer not null default 0, next_attempt_at timestamptz not null default now(),
  lease_token uuid, lease_until timestamptz, last_error_code text, result_summary jsonb,
  created_at timestamptz not null default now(), delivered_at timestamptz,
  foreign key(source_workspace_id,source_exam_id,local_connection_id) references public.exam_publications(source_workspace_id,source_exam_id,local_connection_id),
  unique(source_workspace_id,source_exam_id,revision,batch_index), check(batch_index>=0 and batch_index<batch_count)
);
create index mathquest_due_jobs on public.score_sync_outbox(status,next_attempt_at,lease_until);
create index mathquest_exam_jobs on public.score_sync_outbox(source_workspace_id,source_exam_id,revision);
create table private.score_sync_commands (
  source_workspace_id uuid not null, request_id uuid not null, source_exam_id uuid not null,
  action text not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(source_workspace_id,request_id)
);
do $$ declare name text; begin
  foreach name in array array['integration_connections','exam_publications','score_sync_outbox'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);
    execute format('create policy own_integration on public.%I for select to authenticated using(private.owns_workspace(source_workspace_id))',name);
  end loop;
end $$;
grant select on public.integration_connections,public.exam_publications to authenticated;
-- A SELECT * is intentionally denied, even to the teacher. Payloads contain IDs.
grant select(event_id,source_workspace_id,source_exam_id,local_connection_id,revision,action,batch_index,batch_count,status,attempt_count,next_attempt_at,last_error_code,created_at,delivered_at)
  on public.score_sync_outbox to authenticated;
revoke all on private.integration_secrets,private.score_publication_revisions,private.score_sync_commands from public,anon,authenticated,service_role;

create function private.mathquest_connection_json(entry public.integration_connections) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',entry.id,'connectionId',entry.connection_id,'destinationSchoolId',entry.destination_school_id,
    'destinationLabel',entry.destination_label,'status',entry.status,'mode',entry.mode,'enabled',entry.enabled,
    'revocationPending',entry.revocation_pending,
    'lastSyncAt',entry.last_sync_at,'lastError',entry.last_error_code);
$$;
create function private.mathquest_metadata(config jsonb) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('title',config->>'title','subject',config->>'subject','exam_type',config->>'examType',
    'classroom',config->>'classroom','academic_year',(config->>'year')::integer,'term',(config->>'term')::integer);
$$;
create function private.mathquest_owner_active(tenant uuid,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.schools s join public.user_access u on u.user_id=s.created_by
    where s.id=tenant and s.created_by=actor and u.status='approved');
$$;

create function public.get_mathquest_status(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid;
  conn public.integration_connections; pub public.exam_publications; result jsonb; current_count integer;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  select * into conn from public.integration_connections where source_workspace_id=tenant order by created_at desc,id desc limit 1;
  if target is not null then
    if not exists(select 1 from public.exams where id=target and school_id=tenant) then raise exception 'EXAM_NOT_FOUND'; end if;
    select count(*) into current_count from public.exam_results where school_id=tenant and exam_id=target and status='confirmed' and student_id is not null;
    select * into pub from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and local_connection_id=conn.id;
    select jsonb_build_object('state',coalesce(pub.state,'draft'),'revision',coalesce(pub.revision,0),'confirmed',current_count,
      'pending',(select count(*) from public.score_sync_outbox where source_workspace_id=tenant and source_exam_id=target and revision=pub.revision and status in ('pending','sending','retry','blocked','dead_letter')),
      'delivered',(select coalesce(sum((result_summary->>'accepted')::integer),0) from public.score_sync_outbox where source_workspace_id=tenant and source_exam_id=target and revision=pub.revision and status in ('delivered','partial')),
      'unmatched',coalesce((select jsonb_agg(code order by code) from (select distinct a->>'student_code' code from public.score_sync_outbox o cross join lateral jsonb_array_elements(o.result_summary->'unmatched') a where o.source_workspace_id=tenant and o.source_exam_id=target and o.revision=pub.revision) codes),'[]'::jsonb),
      'invalid',coalesce((select jsonb_agg(code order by code) from (select distinct a->>'student_code' code from public.score_sync_outbox o cross join lateral jsonb_array_elements(o.result_summary->'invalid') a where o.source_workspace_id=tenant and o.source_exam_id=target and o.revision=pub.revision) codes),'[]'::jsonb),
      'lastError',pub.last_error_code,'lastSyncAt',pub.last_sync_at) into result;
  end if;
  return jsonb_build_object('connection',case when conn.id is null then null else private.mathquest_connection_json(conn) end,'publication',result);
end; $$;

-- Service-only onboarding. A teacher cannot fake activation via a direct RPC.
create function public.mathquest_service_start_pairing(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid; target uuid:=(input->>'request_id')::uuid; row public.integration_connections;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('integration:'||tenant::text,0));
  select * into row from public.integration_connections where id=target;
  if found then
    if row.source_workspace_id<>tenant or row.created_by<>actor then raise exception 'FORBIDDEN'; end if;
    if row.status<>'pending_approval' then raise exception 'CONNECTION_EXISTS'; end if;
  else
    if exists(select 1 from public.integration_connections where source_workspace_id=tenant and status<>'revoked') then raise exception 'CONNECTION_EXISTS'; end if;
    if (select count(*) from public.integration_connections where source_workspace_id=tenant and created_at>now()-interval '15 minutes')>=5 then raise exception 'RATE_LIMITED'; end if;
    insert into public.integration_connections(id,source_workspace_id,created_by) values(target,tenant,actor) returning * into row;
    insert into private.integration_secrets(connection_id,pairing_secret) values(target,input->'pairing_secret');
    insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
      values(tenant,actor,'request_score_connection','integrations','integration_connection',target,'{"provider":"mathquest"}','ขอเชื่อมต่อ MathQuest');
  end if;
  return jsonb_build_object('id',row.id,'secret',(select pairing_secret from private.integration_secrets where connection_id=row.id));
end; $$;
create function public.mathquest_service_credentials(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid; row public.integration_connections;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  select * into row from public.integration_connections where source_workspace_id=tenant and status<>'revoked' for update;
  if not found then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  if row.last_checked_at>now()-interval '5 seconds' then raise exception 'RATE_LIMITED'; end if;
  update public.integration_connections set last_checked_at=now() where id=row.id;
  return to_jsonb(row)||jsonb_build_object('secrets',(select to_jsonb(s) from private.integration_secrets s where s.connection_id=row.id));
end; $$;
create function public.mathquest_service_complete_pairing(input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid; row public.integration_connections;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  select * into row from public.integration_connections where id=(input->>'id')::uuid and source_workspace_id=tenant for update;
  if not found or row.status<>'pending_approval' or row.revocation_pending then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  if input->>'status'='active' then
    if input->>'connection_id' is null or input->>'destination_school_id' is null or length(input->>'destination_label')>120 or input->>'scope'<>'score:write' or input->'token_secret' is null or input->'token_secret'='null'::jsonb then raise exception 'FORBIDDEN'; end if;
    update public.integration_connections set status='active',enabled=true,connection_id=(input->>'connection_id')::uuid,
      destination_school_id=(input->>'destination_school_id')::uuid,destination_label=input->>'destination_label',updated_at=now(),last_error_code=null where id=row.id;
    update private.integration_secrets set token_secret=input->'token_secret',pairing_secret=null where connection_id=row.id;
  elsif input->>'status' in ('rejected','expired') then
    update public.integration_connections set status='error',last_error_code='CONNECTION_DENIED',updated_at=now() where id=row.id;
    update private.integration_secrets set pairing_secret=null where connection_id=row.id;
  else raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,actor,'complete_score_pairing','integrations','integration_connection',row.id,jsonb_build_object('status',input->>'status'),'ตรวจสถานะการอนุมัติ MathQuest');
end; $$;
create function public.set_mathquest_mode(input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; row public.integration_connections; wanted text:=input->>'mode'; desired_enabled boolean:=(input->>'enabled')::boolean;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if wanted is null or wanted not in ('manual','auto_after_confirm') or desired_enabled is null or input->>'consent' is distinct from 'true' then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into row from public.integration_connections where source_workspace_id=tenant and status='active' and not revocation_pending for update;
  if not found then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  update public.integration_connections set mode=wanted,enabled=desired_enabled,
    auto_enabled_at=case when wanted='auto_after_confirm' and desired_enabled and (row.mode<>'auto_after_confirm' or not row.enabled) then now() else auto_enabled_at end,updated_at=now() where id=row.id;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,auth.uid(),'change_score_mode','integrations','integration_connection',row.id,jsonb_build_object('mode',wanted,'enabled',desired_enabled),'เปลี่ยนการเผยแพร่คะแนนไป MathQuest');
end; $$;

-- Cumulative, frozen snapshots. Mixed metadata is rejected rather than guessed.
create function private.mathquest_enqueue(tenant uuid,target uuid,local_conn uuid,actor uuid,wanted text) returns jsonb language plpgsql security definer set search_path='' as $$
declare conn public.integration_connections; pub public.exam_publications; metadata jsonb; amount integer; versions integer;
  revision_no bigint; batch integer; batches integer; event uuid; payload jsonb; text_body text; records jsonb; stamp text;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  perform private.require_active_exam(tenant,target);
  select * into conn from public.integration_connections where id=local_conn and source_workspace_id=tenant and status='active' and not revocation_pending for share;
  if not found or (wanted='publish_results' and not conn.enabled) then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  if wanted not in ('publish_results','withdraw_exam') then raise exception 'FORBIDDEN'; end if;
  select * into pub from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and local_connection_id=conn.id for update;
  if wanted='publish_results' then
    if pub.state='withdraw_pending' then raise exception 'PUBLICATION_PENDING'; end if;
    select count(*),count(distinct private.mathquest_metadata(v.config_json)) into amount,versions
      from public.exam_results r join public.exam_versions v on v.id=r.exam_version_id
      where r.school_id=tenant and r.exam_id=target and r.status='confirmed' and r.student_id is not null;
    if amount=0 then raise exception 'NO_CONFIRMED_RESULTS'; end if;
    if amount>10000 then raise exception 'SYNC_LIMIT'; end if;
    if versions<>1 then raise exception 'MIXED_EXAM_METADATA'; end if;
    if exists(select 1 from public.exam_results r where r.school_id=tenant and r.exam_id=target and r.status='confirmed' and (r.max_score<=0 or r.score<0 or r.score>r.max_score or r.score::text in ('NaN','Infinity','-Infinity') or r.max_score::text in ('NaN','Infinity','-Infinity') or r.confirmed_at is null)) then raise exception 'ZERO_MAX_SCORE'; end if;
    select private.mathquest_metadata(v.config_json) into metadata from public.exam_results r join public.exam_versions v on v.id=r.exam_version_id
      where r.school_id=tenant and r.exam_id=target and r.status='confirmed' limit 1;
    batches:=ceil(amount/100.0)::integer;
  else
    if pub.revision is null or pub.revision=0 then
      insert into public.exam_publications(source_workspace_id,source_exam_id,local_connection_id,state,requested_generation,materialized_generation)
        values(tenant,target,conn.id,'withdrawn',0,0) on conflict(source_workspace_id,source_exam_id,local_connection_id) do update set state='withdrawn',materialized_generation=public.exam_publications.requested_generation;
      return jsonb_build_object('revision',0,'batches',0);
    end if;
    metadata:=pub.exam_metadata; amount:=0; batches:=1;
  end if;
  insert into private.score_publication_revisions(source_workspace_id,source_exam_id) values(tenant,target) on conflict do nothing;
  update private.score_publication_revisions set revision=revision+1 where source_workspace_id=tenant and source_exam_id=target returning revision into revision_no;
  insert into public.exam_publications(source_workspace_id,source_exam_id,local_connection_id,state,revision,exam_metadata,published_by,published_at)
    values(tenant,target,conn.id,case wanted when 'publish_results' then 'active' else 'withdraw_pending' end,revision_no,metadata,actor,now())
    on conflict(source_workspace_id,source_exam_id,local_connection_id) do update set state=excluded.state,revision=excluded.revision,exam_metadata=excluded.exam_metadata,
      published_by=actor,published_at=now(),materialized_generation=public.exam_publications.requested_generation,last_error_code=null;
  update public.score_sync_outbox set status='superseded' where source_workspace_id=tenant and source_exam_id=target and revision<revision_no and status in ('pending','retry','blocked','dead_letter');
  stamp:=to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  for batch in 0..batches-1 loop
    records:='[]'::jsonb;
    if wanted='publish_results' then
      select coalesce(jsonb_agg(item order by code),'[]'::jsonb) into records from (
        select st.student_code code,jsonb_build_object('source_scan_id',r.scan_id,'source_exam_version_id',r.exam_version_id,'student_code',st.student_code,
          'score',r.score,'max_score',r.max_score,'percent',round(r.percent,2),'passed',r.passed,'confirmed_at',to_char(r.confirmed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) item
        from public.exam_results r join public.students st on st.school_id=r.school_id and st.id=r.student_id
        where r.school_id=tenant and r.exam_id=target and r.status='confirmed' order by st.student_code limit 100 offset batch*100
      ) data;
    end if;
    event:=gen_random_uuid();
    payload:=jsonb_build_object('schema_version','1.0','event_id',event,'connection_id',conn.connection_id,'source_workspace_id',tenant,'source_exam_id',target,
      'publication_revision',revision_no,'action',wanted,'batch_index',batch,'batch_count',batches,'occurred_at',stamp,'exam',metadata,'results',records);
    text_body:=payload::text;
    insert into public.score_sync_outbox(event_id,source_workspace_id,source_exam_id,local_connection_id,revision,action,batch_index,batch_count,payload_text,payload_hash)
      values(event,tenant,target,conn.id,revision_no,wanted,batch,batches,text_body,encode(sha256(convert_to(text_body,'UTF8')),'hex'));
  end loop;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,actor,case wanted when 'publish_results' then 'publish_exam_scores' else 'withdraw_exam_scores' end,'integrations','score_publication',conn.id,
      jsonb_build_object('exam_id',target,'revision',revision_no,'count',amount),'บันทึกงานเผยแพร่คะแนน MathQuest');
  return jsonb_build_object('revision',revision_no,'batches',batches);
end; $$;

create function public.command_mathquest_publication(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid; request uuid:=(input->>'request_id')::uuid;
  wanted text:=input->>'action'; conn public.integration_connections; command private.score_sync_commands; pub public.exam_publications; result jsonb;
begin
  if not private.owns_workspace(tenant) or input->>'consent' is distinct from 'true' or request is null then raise exception 'FORBIDDEN'; end if;
  perform private.require_active_exam(tenant,target);
  select * into command from private.score_sync_commands where source_workspace_id=tenant and request_id=request;
  if found then
    if command.source_exam_id<>target or command.action<>wanted then raise exception 'SYNC_REQUEST_CONFLICT'; end if;
    return command.result;
  end if;
  if (select count(*) from private.score_sync_commands where source_workspace_id=tenant and created_at>now()-interval '1 minute')>=15 then raise exception 'RATE_LIMITED'; end if;
  select * into conn from public.integration_connections where source_workspace_id=tenant and status='active';
  if not found then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  select * into pub from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and local_connection_id=conn.id;
  if wanted='publish' then result:=private.mathquest_enqueue(tenant,target,conn.id,auth.uid(),'publish_results');
  elsif wanted='withdraw' then result:=private.mathquest_enqueue(tenant,target,conn.id,auth.uid(),'withdraw_exam');
  elsif wanted='retry' then
    if pub.state='withdrawn' then raise exception 'PUBLICATION_PENDING'; end if;
    if exists(select 1 from public.score_sync_outbox where source_workspace_id=tenant and source_exam_id=target and revision=pub.revision and status='partial')
      or pub.requested_generation>pub.materialized_generation then
      result:=private.mathquest_enqueue(tenant,target,conn.id,auth.uid(),'publish_results');
    else
      update public.score_sync_outbox set status='retry',next_attempt_at=now() where source_workspace_id=tenant and source_exam_id=target and revision=pub.revision and status in ('retry','blocked','dead_letter');
      result:=jsonb_build_object('revision',coalesce(pub.revision,0),'batches',0);
    end if;
  else raise exception 'FORBIDDEN'; end if;
  insert into private.score_sync_commands values(tenant,request,target,wanted,result,now());
  return result;
end; $$;

-- Confirm transaction only records a small durable refresh request. No HTTP or
-- payload serialization in the grading transaction. Only future confirms opt in.
create function private.mathquest_confirm_request() returns trigger language plpgsql security definer set search_path='' as $$
declare conn public.integration_connections;
begin
  if new.status<>'confirmed' or old.status='confirmed' then return new; end if;
  select * into conn from public.integration_connections where source_workspace_id=new.school_id and status='active' and enabled and not revocation_pending and mode='auto_after_confirm';
  if conn.id is null or new.confirmed_at<conn.auto_enabled_at or not private.mathquest_owner_active(new.school_id,conn.created_by) then return new; end if;
  insert into public.exam_publications(source_workspace_id,source_exam_id,local_connection_id,requested_generation,requested_by,requested_at)
    values(new.school_id,new.exam_id,conn.id,1,conn.created_by,now())
    on conflict(source_workspace_id,source_exam_id,local_connection_id) do update set requested_generation=public.exam_publications.requested_generation+1,requested_by=conn.created_by,requested_at=now()
      where public.exam_publications.state not in ('withdraw_pending','withdrawn');
  return new;
end; $$;
create trigger mathquest_confirm_request after update of status on public.exam_results for each row execute function private.mathquest_confirm_request();

create function public.mathquest_service_materialize(input jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare pub public.exam_publications; conn public.integration_connections; amount integer:=0; code text;
begin
  for pub in select p.* from public.exam_publications p join public.integration_connections c on c.id=p.local_connection_id
    where p.requested_generation>p.materialized_generation and p.state not in ('withdraw_pending','withdrawn') and c.status='active' and c.enabled and c.mode='auto_after_confirm'
      and (input->>'school_id' is null or p.source_workspace_id=(input->>'school_id')::uuid)
      and (input->>'exam_id' is null or p.source_exam_id=(input->>'exam_id')::uuid)
      and p.requested_at<now()-interval '2 seconds'
    order by p.requested_at limit 5 loop
    -- Match the existing scan transaction's lock order: workspace before publication.
    if not pg_try_advisory_xact_lock(hashtextextended('scan:'||pub.source_workspace_id::text,0)) then continue; end if;
    select * into pub from public.exam_publications where source_workspace_id=pub.source_workspace_id and source_exam_id=pub.source_exam_id and local_connection_id=pub.local_connection_id for update;
    if pub.requested_generation<=pub.materialized_generation or pub.state in ('withdraw_pending','withdrawn') then continue; end if;
    select * into conn from public.integration_connections where id=pub.local_connection_id;
    if not private.mathquest_owner_active(pub.source_workspace_id,conn.created_by) then continue; end if;
    begin
      perform private.mathquest_enqueue(pub.source_workspace_id,pub.source_exam_id,conn.id,conn.created_by,'publish_results');
      amount:=amount+1;
    exception when others then
      code:=case when sqlerrm like '%MIXED_EXAM_METADATA%' then 'MIXED_EXAM_METADATA' when sqlerrm like '%ZERO_MAX_SCORE%' then 'ZERO_MAX_SCORE' else 'PUBLICATION_BLOCKED' end;
      update public.exam_publications set state='error',last_error_code=code,materialized_generation=requested_generation
        where source_workspace_id=pub.source_workspace_id and source_exam_id=pub.source_exam_id and local_connection_id=pub.local_connection_id;
    end;
  end loop;
  return amount;
end; $$;
create function public.mathquest_service_claim(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.score_sync_outbox; conn public.integration_connections;
begin
  update public.score_sync_outbox o set status='superseded',lease_token=null,lease_until=null
    from public.integration_connections c where c.id=o.local_connection_id and o.status='sending' and o.lease_until<now()
      and (c.status<>'active' or c.revocation_pending or (not c.enabled and o.action='publish_results'));
  select o.* into job from public.score_sync_outbox o join public.integration_connections c on c.id=o.local_connection_id
    where ((o.status in ('pending','retry') and o.next_attempt_at<=now()) or (o.status='sending' and o.lease_until<now()))
      and c.status='active' and not c.revocation_pending and (c.enabled or o.action='withdraw_exam') and private.mathquest_owner_active(c.source_workspace_id,c.created_by)
      and (input->>'school_id' is null or o.source_workspace_id=(input->>'school_id')::uuid)
      and (input->>'exam_id' is null or o.source_exam_id=(input->>'exam_id')::uuid)
    order by o.created_at,o.batch_index limit 1 for update of o skip locked;
  if not found then return null; end if;
  update public.score_sync_outbox set status='sending',attempt_count=attempt_count+1,lease_token=gen_random_uuid(),lease_until=now()+interval '30 seconds'
    where event_id=job.event_id returning * into job;
  select * into conn from public.integration_connections where id=job.local_connection_id;
  return to_jsonb(job)||jsonb_build_object('token_secret',(select token_secret from private.integration_secrets where connection_id=conn.id));
end; $$;
create function public.mathquest_service_validate_lease(input jsonb) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.score_sync_outbox o join public.integration_connections c on c.id=o.local_connection_id
    where o.event_id=(input->>'event_id')::uuid and o.lease_token=(input->>'lease_token')::uuid and o.status='sending' and o.lease_until>now()
      and c.status='active' and not c.revocation_pending and (c.enabled or o.action='withdraw_exam') and private.mathquest_owner_active(c.source_workspace_id,c.created_by));
$$;
create function public.mathquest_service_finish(input jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare job public.score_sync_outbox; ack jsonb:=input->'ack'; code text:=input->>'error_code'; result_status text; current_revision bigint;
  expected_count integer; accepted_count integer; issue_count integer; actor uuid;
begin
  select source_workspace_id into job.source_workspace_id from public.score_sync_outbox where event_id=(input->>'event_id')::uuid;
  if job.source_workspace_id is not null then perform pg_advisory_xact_lock(hashtextextended('scan:'||job.source_workspace_id::text,0)); end if;
  select * into job from public.score_sync_outbox where event_id=(input->>'event_id')::uuid and lease_token=(input->>'lease_token')::uuid and status='sending' for update;
  if not found then return false; end if;
  select revision into current_revision from public.exam_publications where source_workspace_id=job.source_workspace_id and source_exam_id=job.source_exam_id and local_connection_id=job.local_connection_id;
  select created_by into actor from public.integration_connections where id=job.local_connection_id;
  if ack is not null and ack<>'null'::jsonb then
    -- Re-validate the receiver acknowledgment at the database boundary. This RPC is service-only,
    -- but a malformed privileged call must never persist arbitrary JSON or claim false delivery.
    if jsonb_typeof(ack)<>'object'
      or (select count(*) from jsonb_object_keys(ack))<>6
      or not (ack ?& array['schema_version','event_id','status','accepted','unmatched','invalid'])
      or ack->>'schema_version' is distinct from '1.0' or ack->>'event_id' is distinct from job.event_id::text
      or coalesce(ack->>'status','') not in ('processed','stale_ignored')
      or jsonb_typeof(ack->'accepted')<>'number' or (ack->>'accepted') !~ '^[0-9]+$'
      or jsonb_typeof(ack->'unmatched')<>'array' or jsonb_typeof(ack->'invalid')<>'array'
    then raise exception 'INVALID_ACK'; end if;
    accepted_count:=(ack->>'accepted')::integer;
    issue_count:=jsonb_array_length(ack->'unmatched')+jsonb_array_length(ack->'invalid');
    select jsonb_array_length(coalesce((job.payload_text::jsonb)->'results','[]'::jsonb)) into expected_count;
    if accepted_count>100 or issue_count>100
      or exists(select 1 from jsonb_array_elements((ack->'unmatched')||(ack->'invalid')) issue
        where case when jsonb_typeof(issue)<>'object' then true else
          (select count(*) from jsonb_object_keys(issue))<>2
          or not (issue ?& array['student_code','reason'])
          or jsonb_typeof(issue->'student_code') is distinct from 'string' or coalesce(issue->>'student_code','') !~ '^[0-9]{5}$'
          or jsonb_typeof(issue->'reason') is distinct from 'string'
          or coalesce(issue->>'reason','') not in ('STUDENT_NOT_FOUND','STUDENT_NOT_ELIGIBLE','INVALID_SCORE','IDENTITY_MAPPING_REQUIRED') end)
      or (select count(*) from jsonb_array_elements((ack->'unmatched')||(ack->'invalid'))) <>
         (select count(distinct issue->>'student_code') from jsonb_array_elements((ack->'unmatched')||(ack->'invalid')) issue)
      or exists(select 1 from jsonb_array_elements((ack->'unmatched')||(ack->'invalid')) issue
        where not exists(select 1 from jsonb_array_elements((job.payload_text::jsonb)->'results') result
          where result->>'student_code'=issue->>'student_code'))
      or (ack->>'status'='processed' and accepted_count+issue_count<>expected_count)
      or (ack->>'status'='stale_ignored' and (accepted_count<>0 or issue_count<>0))
    then raise exception 'INVALID_ACK'; end if;
    if ack->>'status'='stale_ignored' and current_revision=job.revision then code:='RECEIVER_CONFLICT';
    else
      result_status:=case when jsonb_array_length(ack->'unmatched')+jsonb_array_length(ack->'invalid')>0 then 'partial' else 'delivered' end;
      update public.score_sync_outbox set status=result_status,result_summary=ack,delivered_at=now(),last_error_code=null,lease_token=null,lease_until=null where event_id=job.event_id;
      if current_revision=job.revision then
        update public.exam_publications set last_sync_at=now(),last_error_code=null,
          state=case when job.action='withdraw_exam' then 'withdrawn' else 'active' end,
          withdrawn_at=case when job.action='withdraw_exam' then now() else withdrawn_at end
          where source_workspace_id=job.source_workspace_id and source_exam_id=job.source_exam_id and local_connection_id=job.local_connection_id and revision=job.revision
            and not exists(select 1 from public.score_sync_outbox where source_workspace_id=job.source_workspace_id and source_exam_id=job.source_exam_id and revision=job.revision and status not in ('delivered','partial'));
      end if;
      update public.integration_connections set last_sync_at=now(),last_error_code=null where id=job.local_connection_id;
      insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
        values(job.source_workspace_id,actor,case when job.action='withdraw_exam' then 'withdraw_score_publication' else 'sync_score_publication' end,
          'integrations','score_sync_event',job.event_id,
          jsonb_build_object('revision',job.revision,'batch',job.batch_index,'status',result_status,'accepted',accepted_count,'unmatched',jsonb_array_length(ack->'unmatched'),'invalid',jsonb_array_length(ack->'invalid')),
          case when job.action='withdraw_exam' then 'ถอนคะแนนจาก MathQuest สำเร็จ' else 'ส่งคะแนนไป MathQuest สำเร็จ' end);
      return true;
    end if;
  end if;
  if code is null or code not in ('RECEIVER_UNAVAILABLE','CONNECTION_DENIED','RECEIVER_CONFLICT','RECEIVER_REJECTED','INVALID_ACK','INTEGRATION_SECRET_UNAVAILABLE','INVALID_EVENT','PUBLICATION_BLOCKED') then code:='PUBLICATION_BLOCKED'; end if;
  result_status:=case when input->>'retryable'='true' and job.attempt_count<8 then 'retry' when input->>'retryable'='true' then 'dead_letter' else 'blocked' end;
  update public.score_sync_outbox set status=result_status,last_error_code=code,lease_token=null,lease_until=null,
    next_attempt_at=now()+make_interval(secs=>least(greatest(coalesce((input->>'retry_seconds')::integer,30),1),3600)) where event_id=job.event_id;
  if current_revision=job.revision then update public.exam_publications set last_error_code=code where source_workspace_id=job.source_workspace_id and source_exam_id=job.source_exam_id and local_connection_id=job.local_connection_id and revision=job.revision; end if;
  if code='CONNECTION_DENIED' then update public.integration_connections set enabled=false,last_error_code=code where id=job.local_connection_id; end if;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message,severity)
    values(job.source_workspace_id,actor,'sync_score_publication_failed','integrations','score_sync_event',job.event_id,
      jsonb_build_object('revision',job.revision,'batch',job.batch_index,'status',result_status,'errorCode',code),
      'ส่งคะแนนไป MathQuest ไม่สำเร็จ','warning');
  return true;
end; $$;

create function public.mathquest_service_revoke(input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid; row public.integration_connections;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  -- Serialize against the confirmation trigger as well as explicit publication.
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into row from public.integration_connections where source_workspace_id=tenant and status<>'revoked' for update;
  if not found then return; end if;
  if exists(select 1 from public.exam_publications where local_connection_id=row.id and (state not in ('draft','withdrawn') or requested_generation>materialized_generation)) then raise exception 'PUBLICATION_WITHDRAW_REQUIRED'; end if;
  if input->>'finish' is distinct from 'true' then
    update public.integration_connections set enabled=false,revocation_pending=true,updated_at=now() where id=row.id;
    return;
  end if;
  if not row.revocation_pending then raise exception 'FORBIDDEN'; end if;
  update public.integration_connections set status='revoked',enabled=false,revocation_pending=false,updated_at=now() where id=row.id;
  update private.integration_secrets set pairing_secret=null,token_secret=null where connection_id=row.id;
  update public.score_sync_outbox set status='superseded',lease_token=null,lease_until=null where local_connection_id=row.id and status not in ('delivered','partial','superseded');
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,actor,'revoke_score_connection','integrations','integration_connection',row.id,'{"status":"revoked"}','ยกเลิกการเชื่อมต่อ MathQuest');
end; $$;

-- SQL-level gate runs before the old begin function can expose removable paths.
-- Retained publication/outbox tombstones have no FK cascade to the live exam.
create function private.mathquest_require_withdrawn(tenant uuid,target uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  if exists(select 1 from public.exam_publications where source_workspace_id=tenant and source_exam_id=target and
    (state not in ('draft','withdrawn') or requested_generation>materialized_generation))
    or exists(select 1 from public.score_sync_outbox where source_workspace_id=tenant and source_exam_id=target and status='sending') then raise exception 'PUBLICATION_WITHDRAW_REQUIRED'; end if;
end; $$;
alter function public.begin_exam_deletion(jsonb) rename to begin_exam_deletion_before_score_sync;
revoke all on function public.begin_exam_deletion_before_score_sync(jsonb) from public,anon,authenticated,service_role;
create function public.begin_exam_deletion(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform private.mathquest_require_withdrawn(tenant,target);
  return public.begin_exam_deletion_before_score_sync(input);
end; $$;
alter function public.finish_exam_deletion(jsonb) rename to finish_exam_deletion_before_score_sync;
revoke all on function public.finish_exam_deletion_before_score_sync(jsonb) from public,anon,authenticated,service_role;
create function public.finish_exam_deletion(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  select exam_id into target from public.exam_cleanup_jobs where school_id=tenant and id=(input->>'job_id')::uuid;
  perform private.mathquest_require_withdrawn(tenant,target);
  return public.finish_exam_deletion_before_score_sync(input);
end; $$;

-- Never leave the default PUBLIC EXECUTE on security-definer helpers.
do $$ declare fn record; begin
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname like 'mathquest_%') or (n.nspname='public' and p.proname like 'mathquest_service_%') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
  end loop;
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'mathquest_service_%' loop
    execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
end $$;
revoke all on function public.get_mathquest_status(jsonb),public.set_mathquest_mode(jsonb),public.command_mathquest_publication(jsonb),public.begin_exam_deletion(jsonb),public.finish_exam_deletion(jsonb) from public,anon;
grant execute on function public.get_mathquest_status(jsonb),public.set_mathquest_mode(jsonb),public.command_mathquest_publication(jsonb),public.begin_exam_deletion(jsonb),public.finish_exam_deletion(jsonb) to authenticated;
insert into private.app_installation(version) values('202610150010');
notify pgrst, 'reload schema';
commit;
