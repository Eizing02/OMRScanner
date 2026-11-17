-- ScanSob only. Apply after 023. Runtime flags default to disabled.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202611170023') then
    raise exception 'INSTALL_023_FIRST';
  end if;
end $$;

create table private.mathquest_signed_attempts (
  local_id uuid primary key references public.integration_connections(id) on delete cascade,
  destination_school_id uuid not null,
  receiver_origin text not null check(receiver_origin ~ '^https://[a-z0-9]{20,40}[.]supabase[.]co$'),
  stage text not null default 'prepare' check(stage in ('prepare','preparing','submit','waiting','active','rejected','expired','cancelled')),
  draft_secret jsonb,
  wire_secret jsonb,
  window_id uuid
);
alter table private.mathquest_signed_attempts enable row level security;
revoke all on private.mathquest_signed_attempts from public,anon,authenticated,service_role;

alter function public.mathquest_service_start_pairing(jsonb) rename to mathquest_service_start_pairing_v023;
create function public.mathquest_service_start_pairing(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('integration:'||tenant::text,0));
  if exists(select 1 from private.mathquest_signed_attempts where local_id=(input->>'request_id')::uuid) then
    raise exception 'PAIRING_REQUEST_CHANGED';
  end if;
  return public.mathquest_service_start_pairing_v023(input);
end; $$;

create function public.mathquest_service_start_signed_pairing(input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid;
  req uuid:=(input->>'request_id')::uuid; destination uuid:=(input->>'destination_school_id')::uuid;
  origin text:=input->>'receiver_origin'; attempt private.mathquest_signed_attempts; conn public.integration_connections;
begin
  if not private.mathquest_owner_active(tenant,actor) or req is null or destination is null
    or not coalesce(origin ~ '^https://[a-z0-9]{20,40}[.]supabase[.]co$',false)
    or not coalesce(length(input->>'destination_label') between 1 and 120,false)
    or jsonb_typeof(input->'draft_secret') is distinct from 'object'
    or jsonb_typeof(input->'pairing_secret') is distinct from 'object' then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('integration:'||tenant::text,0));
  select * into conn from public.integration_connections where id=req for update;
  if found then
    select * into attempt from private.mathquest_signed_attempts where local_id=req;
    if conn.source_workspace_id<>tenant or conn.created_by<>actor or attempt.local_id is null
      or conn.status='revoked' then raise exception 'PAIRING_REQUEST_CHANGED'; end if;
    if attempt.destination_school_id<>destination or attempt.receiver_origin<>origin then
      raise exception 'PAIRING_DESTINATION_CHANGED';
    end if;
    return;
  end if;
  perform public.mathquest_service_start_pairing_v023(input);
  update public.integration_connections set destination_label=input->>'destination_label' where id=req;
  insert into private.mathquest_signed_attempts(local_id,destination_school_id,receiver_origin,draft_secret)
    values(req,destination,origin,input->'draft_secret');
end; $$;

alter function public.mathquest_service_credentials(jsonb) rename to mathquest_service_credentials_v023;
create function public.mathquest_service_credentials(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid;
  expected uuid:=(input->>'expected_request_id')::uuid; conn public.integration_connections; attempt private.mathquest_signed_attempts;
  result jsonb;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  select * into conn from public.integration_connections where source_workspace_id=tenant and status<>'revoked' for update;
  if not found then raise exception 'CONNECTION_NOT_ACTIVE'; end if;
  select * into attempt from private.mathquest_signed_attempts where local_id=conn.id;
  if (expected is not null and expected<>conn.id) or (expected is null and attempt.local_id is not null) then
    raise exception 'PAIRING_REQUEST_CHANGED';
  end if;
  result:=public.mathquest_service_credentials_v023(input);
  return result||jsonb_build_object('signed_attempt',case when attempt.local_id is not null then to_jsonb(attempt) end);
end; $$;

create function public.mathquest_service_begin_signed_preparation(input jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid;
  req uuid:=(input->>'id')::uuid; conn public.integration_connections;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  select * into conn from public.integration_connections where id=req and source_workspace_id=tenant for update;
  if not found or conn.status<>'pending_approval' or conn.revocation_pending then raise exception 'PAIRING_REQUEST_CHANGED'; end if;
  update private.mathquest_signed_attempts set stage='preparing' where local_id=req and stage='prepare';
  return found;
end; $$;

create function public.mathquest_service_freeze_signed_pairing(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid;
  req uuid:=(input->>'id')::uuid; paired_window uuid:=(input->>'window_id')::uuid;
  conn public.integration_connections; attempt private.mathquest_signed_attempts;
begin
  if not private.mathquest_owner_active(tenant,actor) or paired_window is null
    or jsonb_typeof(input->'wire_secret') is distinct from 'object' then raise exception 'FORBIDDEN'; end if;
  select * into conn from public.integration_connections where id=req and source_workspace_id=tenant for update;
  if not found or conn.status<>'pending_approval' or conn.revocation_pending then raise exception 'PAIRING_REQUEST_CHANGED'; end if;
  select * into attempt from private.mathquest_signed_attempts where local_id=req for update;
  if not found then raise exception 'PAIRING_REQUEST_CHANGED'; end if;
  if attempt.stage='preparing' then
    update private.mathquest_signed_attempts set stage='submit',window_id=paired_window,wire_secret=input->'wire_secret',draft_secret=null
      where local_id=req returning * into attempt;
  end if;
  -- A concurrent prepare cannot substitute a newly issued window or body.
  return to_jsonb(attempt);
end; $$;

alter function public.mathquest_service_complete_pairing(jsonb) rename to mathquest_service_complete_pairing_v023;
create function public.mathquest_service_complete_pairing(input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; actor uuid:=(input->>'actor_id')::uuid;
  req uuid:=(input->>'id')::uuid; remote_status text:=input->>'status';
  conn public.integration_connections; attempt private.mathquest_signed_attempts;
begin
  if not private.mathquest_owner_active(tenant,actor) then raise exception 'FORBIDDEN'; end if;
  -- Preserve the established order for operations that affect publication.
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into conn from public.integration_connections where id=req and source_workspace_id=tenant for update;
  if not found then raise exception 'PAIRING_REQUEST_CHANGED'; end if;
  select * into attempt from private.mathquest_signed_attempts where local_id=req for update;
  if not found then
    perform public.mathquest_service_complete_pairing_v023(input);
    return;
  end if;
  if conn.revocation_pending or conn.status<>'pending_approval' or attempt.stage not in ('submit','waiting')
    or input->>'signed_origin' is distinct from attempt.receiver_origin
    or (input->>'signed_destination')::uuid is distinct from attempt.destination_school_id then raise exception 'PAIRING_REQUEST_CHANGED'; end if;
  if remote_status='active' and (input->>'destination_school_id')::uuid is distinct from attempt.destination_school_id then
    raise exception 'PAIRING_DESTINATION_CHANGED';
  end if;
  if remote_status='pending_approval' then
    update private.mathquest_signed_attempts set stage='waiting',wire_secret=null where local_id=req;
  elsif remote_status in ('active','rejected','expired') then
    perform public.mathquest_service_complete_pairing_v023(input);
    update private.mathquest_signed_attempts set stage=remote_status,wire_secret=null,draft_secret=null where local_id=req;
  else
    raise exception 'INVALID_ACK';
  end if;
end; $$;

create function private.clear_mathquest_signed_attempt() returns trigger language plpgsql set search_path='' as $$
begin
  update private.mathquest_signed_attempts set stage='cancelled',wire_secret=null,draft_secret=null where local_id=new.id;
  return new;
end; $$;
create trigger clear_mathquest_signed_attempt after update of status on public.integration_connections
  for each row when (new.status='revoked' and old.status is distinct from new.status)
  execute function private.clear_mathquest_signed_attempt();

alter function public.get_mathquest_status(jsonb) rename to get_mathquest_status_v023;
create function public.get_mathquest_status(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; attempt private.mathquest_signed_attempts;
begin
  result:=public.get_mathquest_status_v023(input);
  select * into attempt from private.mathquest_signed_attempts where local_id=(result->'connection'->>'id')::uuid;
  if found then
    result:=jsonb_set(result,'{connection,signedStage}',to_jsonb(attempt.stage));
    result:=jsonb_set(result,'{connection,requestedAt}',to_jsonb(
      (select created_at from public.integration_connections where id=attempt.local_id)));
  end if;
  return result;
end; $$;

alter function public.mathquest_service_claim(jsonb) rename to mathquest_service_claim_v023;
create function public.mathquest_service_claim(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job jsonb; pinned text;
begin
  job:=public.mathquest_service_claim_v023(input);
  if job is null then return null; end if;
  select receiver_origin into pinned from private.mathquest_signed_attempts where local_id=(job->>'local_connection_id')::uuid;
  return job||jsonb_build_object('receiver_origin',pinned);
end; $$;

revoke all on function public.mathquest_service_start_pairing_v023(jsonb),public.mathquest_service_credentials_v023(jsonb),
  public.mathquest_service_complete_pairing_v023(jsonb),public.get_mathquest_status_v023(jsonb),public.mathquest_service_claim_v023(jsonb),
  public.mathquest_service_start_pairing(jsonb),public.mathquest_service_start_signed_pairing(jsonb),public.mathquest_service_credentials(jsonb),
  public.mathquest_service_begin_signed_preparation(jsonb),
  public.mathquest_service_freeze_signed_pairing(jsonb),public.mathquest_service_complete_pairing(jsonb),public.get_mathquest_status(jsonb),
  public.mathquest_service_claim(jsonb),private.clear_mathquest_signed_attempt() from public,anon,authenticated,service_role;
grant execute on function public.get_mathquest_status(jsonb) to authenticated;
grant execute on function public.mathquest_service_start_pairing(jsonb),public.mathquest_service_start_signed_pairing(jsonb),
  public.mathquest_service_credentials(jsonb),public.mathquest_service_begin_signed_preparation(jsonb),public.mathquest_service_freeze_signed_pairing(jsonb),
  public.mathquest_service_complete_pairing(jsonb),public.mathquest_service_claim(jsonb) to service_role;
insert into private.app_installation(version) values('202611170024');
notify pgrst,'reload schema';
commit;
