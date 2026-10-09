-- Google identity is not permission. Only the configured verified Google identity
-- can claim owner, once. All other users remain pending until explicitly approved.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '', display_name text not null default '',
  role text not null default 'teacher' check(role in ('owner','teacher')),
  status text not null default 'pending' check(status in ('pending','approved','rejected','suspended')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz, review_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index user_access_status_created_idx on public.user_access(status,created_at);
create table private.owner_configuration (
  singleton boolean primary key default true check(singleton),
  email text not null, claimed_by uuid references auth.users(id), claimed_at timestamptz
);
insert into private.owner_configuration(singleton,email) values(true,'piyawatpiwsiri@gmail.com');
revoke all on private.owner_configuration from public,anon,authenticated;

create table public.access_audit_logs (
  id uuid primary key default gen_random_uuid(), actor_user_id uuid not null references auth.users(id),
  action text not null, module_name text not null default 'access', resource_type text not null default 'user',
  resource_id uuid not null references auth.users(id), old_values jsonb, new_values jsonb,
  reason text not null, display_message text not null, severity text not null default 'info',
  created_at timestamptz not null default now()
);
create index access_audit_actor_created_idx on public.access_audit_logs(actor_user_id,created_at desc);

create function private.sync_user_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.user_access(user_id,email,display_name)
    values(new.id,coalesce(new.email,''),left(coalesce(new.raw_user_meta_data->>'full_name',new.email,''),120))
    on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name,updated_at=now();
  return new;
end; $$;
revoke all on function private.sync_user_access() from public,anon,authenticated;
create trigger sync_user_access after insert or update of email,raw_user_meta_data on auth.users
  for each row execute function private.sync_user_access();
insert into public.user_access(user_id,email,display_name)
  select id,coalesce(email,''),left(coalesce(raw_user_meta_data->>'full_name',email,''),120) from auth.users;

create function private.is_approved(actor uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
  -- A callable helper must not become an oracle for another user's status.
  select actor is not null and actor=auth.uid()
    and exists(select 1 from public.user_access where user_id=actor and status='approved');
$$;
create function private.is_platform_owner() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_access where user_id=auth.uid() and role='owner' and status='approved');
$$;
create function private.owns_workspace(tenant uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.is_approved() and exists(select 1 from public.schools where id=tenant and created_by=auth.uid());
$$;
create function private.can_read_workspace(tenant uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.is_approved() and exists(select 1 from public.schools where id=tenant
    and (created_by=auth.uid() or private.is_platform_owner()));
$$;
revoke all on function private.is_approved(uuid), private.is_platform_owner(), private.owns_workspace(uuid), private.can_read_workspace(uuid) from public,anon;
grant execute on function private.is_approved(uuid), private.is_platform_owner(), private.owns_workspace(uuid), private.can_read_workspace(uuid) to authenticated;

-- Write permission stays personal even for the platform owner inspecting others.
create or replace function public.has_school_role(tenant uuid, allowed text[] default array['admin','teacher','reviewer'])
returns boolean language sql stable security definer set search_path='' as $$
  select private.owns_workspace(tenant) and exists(select 1 from public.school_members
    where school_id=tenant and user_id=auth.uid() and status='active' and role=any(allowed));
$$;
create or replace function public.can_read_exam(target uuid,tenant uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.can_read_workspace(tenant) and exists(select 1 from public.exams where id=target and school_id=tenant);
$$;

-- Do not silently merge pre-existing schools or memberships. Provisioning fails
-- with an explicit conflict if one user already owns more than one school.
revoke insert on public.schools from authenticated;
drop policy school_create on public.schools;
alter policy school_read on public.schools using(private.can_read_workspace(id));
alter policy student_read on public.students using(private.can_read_workspace(school_id));
alter policy import_read on public.student_imports using(private.can_read_workspace(school_id));
alter policy membership_read on public.school_members using(private.can_read_workspace(school_id));
alter policy audit_read on public.audit_logs using(private.can_read_workspace(school_id));
alter table public.user_access enable row level security;
alter table public.access_audit_logs enable row level security;
revoke all on public.user_access,public.access_audit_logs from public,anon,authenticated;
grant select on public.user_access,public.access_audit_logs to authenticated;
create policy own_access_status on public.user_access for select to authenticated
  using(user_id=auth.uid() or private.is_platform_owner());
create policy owner_access_audit on public.access_audit_logs for select to authenticated using(private.is_platform_owner());

create function public.ensure_personal_workspace() returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); tenant uuid; owned_count integer;
begin
  if not private.is_approved(actor) then raise exception 'ACCESS_NOT_APPROVED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  select count(*),(array_agg(id order by created_at))[1] into owned_count,tenant from public.schools where created_by=actor;
  if owned_count>1 then raise exception 'WORKSPACE_CONFLICT'; end if;
  if tenant is null then
    insert into public.schools(name_th,created_by,logo_image_url)
      values(case when private.is_platform_owner() then 'โรงเรียนกุงแก้ววิทยาคาร' else 'พื้นที่ส่วนตัว' end,actor,null)
      returning id into tenant;
  end if;
  return tenant;
end; $$;

create function public.get_access_context() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); entry public.user_access; config private.owner_configuration; tenant uuid;
begin
  if actor is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into config from private.owner_configuration where singleton for update;
  if config.claimed_by is null and exists(
    select 1 from auth.users u join auth.identities i on i.user_id=u.id
    where u.id=actor and lower(u.email)=lower(config.email) and u.email_confirmed_at is not null
      and i.provider='google' and lower(i.identity_data->>'email')=lower(config.email)
      and i.identity_data->>'email_verified'='true'
  ) then
    update public.user_access set role='owner',status='approved',reviewed_by=actor,reviewed_at=now(),
      review_reason='Configured verified Google owner',updated_at=now() where user_id=actor;
    update private.owner_configuration set claimed_by=actor,claimed_at=now() where singleton;
    insert into public.access_audit_logs(actor_user_id,action,resource_id,new_values,reason,display_message)
      values(actor,'claim_platform_owner',actor,'{"role":"owner","status":"approved"}',
        'Verified Google identity matches configured owner','ยืนยันบัญชีเจ้าของระบบ');
  end if;
  select * into entry from public.user_access where user_id=actor;
  if not found then raise exception 'ACCESS_PROFILE_MISSING'; end if;
  if entry.status='approved' then tenant := public.ensure_personal_workspace(); end if;
  return jsonb_build_object('userId',actor,'email',entry.email,'displayName',entry.display_name,
    'role',entry.role,'status',entry.status,'schoolId',tenant);
end; $$;

create function public.decide_user_access(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); target uuid := (input->>'userId')::uuid;
  next_status text := input->>'status'; why text := btrim(input->>'reason'); before_row public.user_access; after_row public.user_access;
begin
  if not private.is_platform_owner() then raise exception 'FORBIDDEN'; end if;
  if next_status is null or next_status not in ('approved','rejected','suspended') or why is null or length(why) not between 3 and 300 then raise exception 'INVALID_DECISION'; end if;
  select * into before_row from public.user_access where user_id=target for update;
  if not found or target=actor or before_row.role='owner' then raise exception 'OWNER_PROTECTED'; end if;
  update public.user_access set status=next_status,reviewed_by=actor,reviewed_at=now(),review_reason=why,updated_at=now()
    where user_id=target returning * into after_row;
  insert into public.access_audit_logs(actor_user_id,action,resource_id,old_values,new_values,reason,display_message)
    values(actor,'change_user_access',target,jsonb_build_object('status',before_row.status),
      jsonb_build_object('status',next_status),why,'เปลี่ยนสิทธิ์การเข้าใช้งาน');
  return jsonb_build_object('userId',target,'status',after_row.status);
end; $$;
revoke all on function public.get_access_context(), public.ensure_personal_workspace(), public.decide_user_access(jsonb) from public,anon;
grant execute on function public.get_access_context(), public.ensure_personal_workspace(), public.decide_user_access(jsonb) to authenticated;

alter table public.schools add column settings jsonb not null default '{"academicYear":2569,"term":1,"subjects":[]}';
alter table public.schools alter column logo_image_url set default null;
create function public.update_workspace_settings(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid := (input->>'school_id')::uuid; current_row public.schools;
begin
  if not public.has_school_role(tenant,array['admin','teacher']) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(input->'school') is distinct from 'string' or length(btrim(input->>'school')) not between 1 and 60
    or jsonb_typeof(input->'settings') is distinct from 'object'
    or jsonb_typeof(input->'settings'->'academicYear') is distinct from 'number'
    or (input->'settings'->>'academicYear')::numeric not between 2500 and 2700
    or (input->'settings'->>'academicYear')::numeric<>trunc((input->'settings'->>'academicYear')::numeric)
    or jsonb_typeof(input->'settings'->'term') is distinct from 'number'
    or (input->'settings'->>'term')::numeric not in (1,2,3)
    or jsonb_typeof(input->'settings'->'subjects') is distinct from 'array'
    or jsonb_array_length(input->'settings'->'subjects')>50
    or exists(select 1 from jsonb_array_elements(input->'settings'->'subjects') v
      where jsonb_typeof(v) is distinct from 'string' or length(btrim(v #>> '{}')) not between 1 and 80)
    then raise exception 'INVALID_SETTINGS'; end if;
  select * into current_row from public.schools where id=tenant for update;
  update public.schools set name_th=btrim(input->>'school'),settings=input->'settings' where id=tenant;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,old_values,new_values,display_message)
    values(tenant,auth.uid(),'update_workspace_settings','settings','school',tenant,
      jsonb_build_object('school',current_row.name_th,'settings',current_row.settings),
      input-'school_id','บันทึกการตั้งค่าพื้นที่ส่วนตัว');
  return input-'school_id';
end; $$;
revoke all on function public.update_workspace_settings(jsonb) from public,anon;
grant execute on function public.update_workspace_settings(jsonb) to authenticated;

-- A submitted classroom must exist in this user's roster, including direct RPC calls.
alter function public.validate_exam_config(jsonb) rename to validate_exam_structure;
-- Legacy RPCs already qualify their table/auth names. Keep the execution path
-- equally strict after upgrading, without trusting caller-created temp objects.
alter function public.validate_exam_structure(jsonb) set search_path='';
alter function public.import_students(jsonb) set search_path='';
alter function public.create_exam_draft(jsonb) set search_path='';
alter function public.create_exam_version(jsonb) set search_path='';
alter function public.bootstrap_school_admin() set search_path='';
alter function public.prevent_published_mutation() set search_path='';
alter function public.prevent_published_key_mutation() set search_path='';
create function public.validate_exam_config(input jsonb) returns void language plpgsql set search_path='' as $$
begin
  perform public.validate_exam_structure(input);
  if not exists(select 1 from public.students where school_id=(input->>'school_id')::uuid and classroom_name=input->>'classroom') then
    raise exception 'CLASSROOM_NOT_IN_ROSTER';
  end if;
end; $$;
revoke all on function public.validate_exam_config(jsonb) from public,anon,authenticated;

-- Private originals. No bucket-wide public access and no browser service-role key.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('school-logos','school-logos',false,5242880,array['image/png','image/jpeg']);
create policy school_logo_read on storage.objects for select to authenticated
  using(bucket_id='school-logos' and exists(select 1 from public.schools s
    where name like s.id::text || '/%' and private.can_read_workspace(s.id)));
create policy school_logo_insert on storage.objects for insert to authenticated
  with check(bucket_id='school-logos' and exists(select 1 from public.schools s
    where name like s.id::text || '/%' and private.owns_workspace(s.id)));

-- Preserve historical Cloudinary references but all new logos use an object path.
alter table public.schools drop constraint school_logo_pair;
alter table public.schools add constraint school_logo_pair check(
  (logo_image_public_id is null and (logo_image_url is null or logo_image_url='/omr-assets/school-logo.png')) or
  (logo_image_public_id is not null and logo_image_url is null) or
  (logo_image_public_id is not null and logo_image_url ~ '^https://res\.cloudinary\.com/[^/]+/image/upload/fl_original/v[0-9]+/'));
create table public.logo_cleanup_jobs (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  object_path text not null, created_at timestamptz not null default now(), unique(school_id,object_path)
);
alter table public.logo_cleanup_jobs enable row level security;
revoke all on public.logo_cleanup_jobs from public,anon,authenticated;
grant select on public.logo_cleanup_jobs to authenticated;
create policy logo_cleanup_read on public.logo_cleanup_jobs for select to authenticated using(private.owns_workspace(school_id));
-- Only queued, retired objects can be removed. Their queue records cannot be
-- discarded before deletion, so a cleanup candidate cannot become active again.
create policy school_logo_delete on storage.objects for delete to authenticated
  using(bucket_id='school-logos' and exists(select 1 from public.schools s
    join public.logo_cleanup_jobs j on j.school_id=s.id and j.object_path=name
    where name like s.id::text || '/%' and private.owns_workspace(s.id)
      and name is distinct from s.logo_image_public_id));

create or replace function public.update_school_logo(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid := (input->>'school_id')::uuid; actor uuid := auth.uid(); before_row public.schools; after_row public.schools;
  candidate_path text := input->>'object_path';
begin
  if not public.has_school_role(tenant,array['admin','teacher']) then raise exception 'FORBIDDEN'; end if;
  select * into before_row from public.schools where id=tenant for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if before_row.logo_revision is distinct from (input->>'expected_revision')::uuid then raise exception 'STALE_LOGO'; end if;
  if candidate_path is null or candidate_path !~ ('^' || tenant::text || '/[a-f0-9-]{36}\.(png|jpg)$')
    or not exists(select 1 from storage.objects where bucket_id='school-logos' and name=candidate_path)
    or exists(select 1 from public.logo_cleanup_jobs where school_id=tenant and object_path=candidate_path)
    then raise exception 'INVALID_LOGO'; end if;
  update public.schools set logo_image_url=null,logo_image_public_id=candidate_path,logo_revision=gen_random_uuid()
    where id=tenant returning * into after_row;
  if before_row.logo_image_public_id like tenant::text || '/%' and before_row.logo_image_public_id is distinct from candidate_path then
    insert into public.logo_cleanup_jobs(school_id,object_path) values(tenant,before_row.logo_image_public_id) on conflict do nothing;
  end if;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,old_values,new_values,display_message)
    values(tenant,actor,'update_school_logo','schools','school',tenant,
      jsonb_build_object('object_path',before_row.logo_image_public_id),jsonb_build_object('object_path',candidate_path),
      'เปลี่ยนโลโก้ปัจจุบันและเข้าคิวลบไฟล์เดิม');
  return jsonb_build_object('school',after_row.name_th,'image_public_id',candidate_path,'revision',after_row.logo_revision);
end; $$;

-- No legacy logo upload RPC or storage policy can grant cross-user write access.
revoke all on function public.update_school_logo(jsonb) from public,anon;
grant execute on function public.update_school_logo(jsonb) to authenticated;
create function public.queue_logo_cleanup(input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare tenant uuid := (input->>'school_id')::uuid; object_path text := input->>'object_path';
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  -- Serialize queueing with pointer changes. A queued object is never reusable.
  perform 1 from public.schools where id=tenant for update;
  if object_path is null or object_path !~ ('^' || tenant::text || '/[a-f0-9-]{36}\.(png|jpg)$')
    or exists(select 1 from public.schools where id=tenant and logo_image_public_id=object_path)
    then raise exception 'INVALID_LOGO'; end if;
  insert into public.logo_cleanup_jobs(school_id,object_path) values(tenant,object_path) on conflict do nothing;
end; $$;
revoke all on function public.queue_logo_cleanup(jsonb) from public,anon;
grant execute on function public.queue_logo_cleanup(jsonb) to authenticated;
create function public.complete_logo_cleanup(input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare tenant uuid := (input->>'school_id')::uuid; target uuid := (input->>'job_id')::uuid; candidate text;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  select object_path into candidate from public.logo_cleanup_jobs where id=target and school_id=tenant for update;
  if not found then return; end if;
  -- Storage API, never SQL, removes file bytes. Verify its metadata is absent
  -- before acknowledging the job; a silent RLS no-op remains retryable.
  if exists(select 1 from storage.objects where bucket_id='school-logos' and name=candidate) then
    raise exception 'LOGO_CLEANUP_INCOMPLETE';
  end if;
  delete from public.logo_cleanup_jobs where id=target and school_id=tenant;
end; $$;
revoke all on function public.complete_logo_cleanup(jsonb) from public,anon;
grant execute on function public.complete_logo_cleanup(jsonb) to authenticated;
commit;
