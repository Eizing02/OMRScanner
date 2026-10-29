-- Additive lifecycle for central directories only. Never delete teacher workspaces/history.
begin;
do $$ begin if not exists(select 1 from private.app_installation where version='202610280018') then raise exception 'INSTALL_018_FIRST'; end if; end $$;
alter table public.roster_directories add column deleted_at timestamptz,add column deleted_by uuid references auth.users(id),add column purge_after timestamptz;
alter table public.roster_directories add check((deleted_at is null and deleted_by is null and purge_after is null) or (deleted_at is not null and deleted_by is not null and purge_after is not null and purge_after=deleted_at+interval '14 days'));
create index directory_due_cleanup on public.roster_directories(purge_after) where deleted_at is not null;
create table private.directory_lifecycle_requests(request_id uuid primary key,directory_id uuid not null,actor_id uuid not null references auth.users(id),action text not null,result jsonb not null,created_at timestamptz not null default now());
revoke all on private.directory_lifecycle_requests from public,anon,authenticated,service_role;
create function private.can_read_directory_membership(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_approved() and (private.is_platform_owner() or exists(select 1 from public.roster_directory_access where directory_id=target and user_id=auth.uid() and active)); $$;
create or replace function private.can_read_directory(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_directory_membership(target) and exists(select 1 from public.roster_directories where id=target and deleted_at is null); $$;
create or replace function private.can_manage_directory(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_directory(target) and (private.is_platform_owner() or exists(select 1 from public.roster_directory_access where directory_id=target and user_id=auth.uid() and active and role='manager')); $$;
create function private.assert_directory_active(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare directory public.roster_directories;
begin
 if not private.can_read_directory_membership(target) then raise exception 'FORBIDDEN'; end if;
 select * into directory from public.roster_directories where id=target for update;
 if not found then raise exception 'DIRECTORY_NOT_FOUND'; end if;
 if directory.deleted_at is not null then raise exception 'DIRECTORY_TRASHED'; end if;
end; $$;
create function private.directory_cleanup_ready() returns boolean language plpgsql stable security definer set search_path='' as $$
declare ready boolean;
begin
 if to_regclass('cron.job') is null then return false; end if;
 execute 'select exists(select 1 from cron.job where jobname=$1 and active)' into ready using 'scansob-school-directory-trash';
 return ready;
end; $$;
create or replace function private.sync_directory_roster(tenant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare person public.roster_directory_students; row public.students; added integer:=0; changed integer:=0; conflicts jsonb:='[]'; n integer;
begin
  -- Called only by authenticated own-workspace commands, never by an owner
  -- inspecting another teacher. Synchronization is an explicit narrow grant.
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  perform 1 from public.roster_directories d where exists(select 1 from public.roster_subscriptions sub where sub.school_id=tenant and sub.directory_id=d.id)
    order by d.id for share;
  update public.students s set active=false where s.school_id=tenant and s.directory_student_id is not null and s.active
    and not exists(select 1 from public.roster_directory_students frozen_source join public.roster_directories root on root.id=frozen_source.directory_id
      where frozen_source.id=s.directory_student_id and root.deleted_at is not null and private.can_read_directory_membership(root.id)
      and exists(select 1 from public.roster_subscriptions sub where sub.school_id=tenant and sub.directory_id=root.id and sub.classroom_name=s.classroom_name and sub.active)
      and not exists(select 1 from public.roster_suppressions x where x.school_id=tenant and x.directory_student_id=frozen_source.id))
    and not exists(select 1 from public.roster_directory_students d where d.id=s.directory_student_id and d.active
      and private.can_read_directory(d.directory_id)
      and exists(select 1 from public.roster_subscriptions sub where sub.school_id=tenant and sub.directory_id=d.directory_id and sub.classroom_name=d.classroom_name and sub.active)
      and not exists(select 1 from public.roster_suppressions x where x.school_id=tenant and x.directory_student_id=d.id));
  get diagnostics changed=row_count;
  for person in select d.* from public.roster_directory_students d where d.active and private.can_read_directory(d.directory_id)
    and exists(select 1 from public.roster_subscriptions sub where sub.school_id=tenant and sub.directory_id=d.directory_id and sub.classroom_name=d.classroom_name and sub.active)
    and not exists(select 1 from public.roster_suppressions x where x.school_id=tenant and x.directory_student_id=d.id)
    order by d.directory_id,d.student_code loop
    select * into row from public.students where school_id=tenant and student_code=person.student_code for update;
    if row.id is not null and row.directory_student_id is distinct from person.id then
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('studentCode',person.student_code,'directoryStudentId',person.id)); continue;
    end if;
    if row.id is null then
      insert into public.students(school_id,student_code,prefix,first_name,last_name,classroom_name,number,directory_student_id,directory_revision)
        values(tenant,person.student_code,person.prefix,person.first_name,person.last_name,person.classroom_name,person.number,person.id,person.revision);
      added:=added+1;
    elsif not row.active or row.directory_revision<>person.revision then
      update public.students set prefix=person.prefix,first_name=person.first_name,last_name=person.last_name,classroom_name=person.classroom_name,
        number=person.number,active=true,directory_revision=person.revision where id=row.id;
      changed:=changed+1;
    end if;
  end loop;
  if added+changed>0 then
    insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
      values(tenant,auth.uid(),'sync_school_roster','students','workspace',tenant,jsonb_build_object('added',added,'updated',changed),'อัปเดตรายชื่อตามทะเบียนโรงเรียน โดยคงประวัติข้อสอบ');
  end if;
  return jsonb_build_object('added',added,'updated',changed,'conflicts',conflicts);
end; $$;
alter function public.manage_roster_directory(jsonb) set schema private;
alter function private.manage_roster_directory(jsonb) rename to manage_roster_directory_v015;
revoke all on function private.manage_roster_directory_v015(jsonb) from public,anon,authenticated,service_role;
create function public.manage_roster_directory(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid;
 begin
 if input->>'action'='create' then return private.manage_roster_directory_v015(input); end if;

 perform private.assert_directory_active(target);
 return private.manage_roster_directory_v015(input);
 end; $$;
 revoke all on function public.manage_roster_directory(jsonb) from public,anon,authenticated,service_role;
 grant execute on function public.manage_roster_directory(jsonb) to authenticated;
 alter function public.preview_directory_import(jsonb) set schema private;
alter function private.preview_directory_import(jsonb) rename to preview_directory_import_v015;
revoke all on function private.preview_directory_import_v015(jsonb) from public,anon,authenticated,service_role;
create function public.preview_directory_import(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid;
 begin
 if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));

 perform private.assert_directory_active(target);
 return private.preview_directory_import_v015(input);
 end; $$;
 revoke all on function public.preview_directory_import(jsonb) from public,anon,authenticated,service_role;
 grant execute on function public.preview_directory_import(jsonb) to authenticated;
 alter function public.apply_directory_import(jsonb) set schema private;
alter function private.apply_directory_import(jsonb) rename to apply_directory_import_v015;
revoke all on function private.apply_directory_import_v015(jsonb) from public,anon,authenticated,service_role;
create function public.apply_directory_import(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid;
 begin
 if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
 select (selection->>'directoryId')::uuid into target from private.roster_plans where id=(input->>'planId')::uuid and school_id=tenant and actor_id=auth.uid() and action='directory_import';
 if not found then raise exception 'PLAN_NOT_FOUND'; end if;
 perform private.assert_directory_active(target);
 return private.apply_directory_import_v015(input);
 end; $$;
 revoke all on function public.apply_directory_import(jsonb) from public,anon,authenticated,service_role;
 grant execute on function public.apply_directory_import(jsonb) to authenticated;
 alter function public.preview_directory_subscription(jsonb) set schema private;
alter function private.preview_directory_subscription(jsonb) rename to preview_directory_subscription_v015;
revoke all on function private.preview_directory_subscription_v015(jsonb) from public,anon,authenticated,service_role;
create function public.preview_directory_subscription(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid;
 begin
 if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));

 perform private.assert_directory_active(target);
 return private.preview_directory_subscription_v015(input);
 end; $$;
 revoke all on function public.preview_directory_subscription(jsonb) from public,anon,authenticated,service_role;
 grant execute on function public.preview_directory_subscription(jsonb) to authenticated;
 alter function public.subscribe_student_directory(jsonb) set schema private;
alter function private.subscribe_student_directory(jsonb) rename to subscribe_student_directory_v015;
revoke all on function private.subscribe_student_directory_v015(jsonb) from public,anon,authenticated,service_role;
create function public.subscribe_student_directory(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid;
 begin
 if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));

 perform private.assert_directory_active(target);
 return private.subscribe_student_directory_v015(input);
 end; $$;
 revoke all on function public.subscribe_student_directory(jsonb) from public,anon,authenticated,service_role;
 grant execute on function public.subscribe_student_directory(jsonb) to authenticated;
 alter function public.get_roster_directory(jsonb) set schema private;
alter function private.get_roster_directory(jsonb) rename to get_roster_directory_v015;
revoke all on function private.get_roster_directory_v015(jsonb) from public,anon,authenticated,service_role;
create function public.get_roster_directory(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 result:=private.get_roster_directory_v015(input);
 if coalesce(input->>'view','options')='options' then
  result:=result||jsonb_build_object('cleanupReady',private.directory_cleanup_ready(),'trash',case when private.is_platform_owner() then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'revision',revision,'deletedAt',deleted_at,'purgeAfter',purge_after,'canRestore',purge_after>now()) order by deleted_at desc) from public.roster_directories where deleted_at is not null),'[]') else '[]'::jsonb end);
 end if;
 return result;
end; $$;
revoke all on function public.get_roster_directory(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_roster_directory(jsonb) to authenticated;
create function public.manage_directory_lifecycle(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid;
 directory public.roster_directories; action text:=input->>'action'; receipt private.directory_lifecycle_requests; result jsonb;
begin
 if not private.is_platform_owner() or not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
 if action is null or action not in ('preview_trash','trash','restore') then raise exception 'INVALID_ROSTER_ACTION'; end if;
 perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
 if action<>'preview_trash' then
  if input->>'consent' is distinct from 'true' or input->>'requestId' is null then raise exception 'DIRECTORY_CONSENT_REQUIRED'; end if;
  select * into receipt from private.directory_lifecycle_requests where request_id=(input->>'requestId')::uuid;
  if found then
   if receipt.actor_id<>auth.uid() or receipt.directory_id<>target or receipt.action<>action then raise exception 'DIRECTORY_REQUEST_CONFLICT'; end if;
   return receipt.result;
  end if;
 end if;
 select * into directory from public.roster_directories where id=target for update;
 if not found then raise exception 'DIRECTORY_NOT_FOUND'; end if;
 if action='preview_trash' then
  if directory.deleted_at is not null then raise exception 'DIRECTORY_TRASHED'; end if;
  return jsonb_build_object('id',directory.id,'name',directory.name,'revision',directory.revision,'cleanupReady',private.directory_cleanup_ready(),
   'studentCount',(select count(*) from public.roster_directory_students where directory_id=target),
   'classroomCount',(select count(distinct classroom_name) from public.roster_directory_students where directory_id=target and active),
   'subscribedWorkspaces',(select count(distinct school_id) from public.roster_subscriptions where directory_id=target and active));
 end if;
 if directory.revision is distinct from (input->>'revision')::integer then raise exception 'STALE_DIRECTORY'; end if;
 if action='trash' then
  if not private.directory_cleanup_ready() then raise exception 'DIRECTORY_CLEANUP_NOT_READY'; end if;
  if directory.deleted_at is not null then raise exception 'DIRECTORY_TRASHED'; end if;
  if input->>'confirmationName' is distinct from directory.name then raise exception 'DIRECTORY_NAME_MISMATCH'; end if;
  update public.roster_directories set deleted_at=now(),deleted_by=auth.uid(),purge_after=now()+interval '14 days',revision=revision+1 where id=target returning * into directory;
 else
  if directory.deleted_at is null then raise exception 'STALE_DIRECTORY'; end if;
  if directory.purge_after<=now() then raise exception 'DIRECTORY_RESTORE_EXPIRED'; end if;
  update public.roster_directories set deleted_at=null,deleted_by=null,purge_after=null,revision=revision+1 where id=target returning * into directory;
 end if;
 result:=jsonb_build_object('id',directory.id,'revision',directory.revision,'purgeAfter',directory.purge_after,'action',action);
 insert into private.directory_lifecycle_requests values((input->>'requestId')::uuid,target,auth.uid(),action,result,now());
 insert into public.access_audit_logs(actor_user_id,action,resource_id,new_values,reason,display_message)
 values(auth.uid(),'school_directory_'||action,auth.uid(),jsonb_build_object('directoryId',target,'revision',directory.revision,'purgeAfter',directory.purge_after),
  'จัดการถังขยะทะเบียนโรงเรียน',case action when 'trash' then 'ย้ายทะเบียนโรงเรียนเข้าถังขยะ กู้คืนได้ภายใน 14 วัน' else 'กู้คืนทะเบียนโรงเรียน' end);
 return result;
end; $$;

create function private.purge_school_directories(batch_limit integer default 5) returns integer language plpgsql security definer set search_path='' as $$
declare candidate record; directory public.roster_directories; tenant uuid; locked boolean; purged integer:=0; detached integer;
begin
 if batch_limit is null or batch_limit not between 1 and 20 then raise exception 'INVALID_SELECTION'; end if;
 for candidate in select id from public.roster_directories where purge_after<=now() order by purge_after,id limit batch_limit loop
  locked:=true;
  -- Same workspace -> directory -> student order as synchronization. Try locks
  -- let a later hourly run retry busy workspaces without blocking teaching.
  for tenant in select distinct s.school_id from public.students s join public.roster_directory_students d on d.id=s.directory_student_id where d.directory_id=candidate.id order by s.school_id loop
   if not pg_try_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0)) then locked:=false; exit; end if;
  end loop;
  if not locked then continue; end if;
  select * into directory from public.roster_directories where id=candidate.id and purge_after<=now() for update skip locked;
  if not found then continue; end if;
  update public.students set directory_student_id=null,directory_revision=0
   where directory_student_id in(select id from public.roster_directory_students where directory_id=directory.id);
  get diagnostics detached=row_count;
  delete from public.roster_suppressions where directory_student_id in(select id from public.roster_directory_students where directory_id=directory.id);
  delete from public.roster_subscriptions where directory_id=directory.id;
  delete from public.roster_directory_access where directory_id=directory.id;
  delete from private.roster_plans where action='directory_import' and selection->>'directoryId'=directory.id::text;
  delete from private.directory_lifecycle_requests where directory_id=directory.id;
  delete from public.roster_directory_students where directory_id=directory.id;
  delete from public.roster_directories where id=directory.id;
  insert into public.access_audit_logs(actor_user_id,action,resource_id,new_values,reason,display_message)
   values(directory.deleted_by,'school_directory_purge',directory.deleted_by,jsonb_build_object('directoryId',directory.id,'detachedCopies',detached,'automated',true),
    'ตามคำสั่งเจ้าของหลังพ้นกำหนด 14 วัน','ลบทะเบียนโรงเรียนที่พ้นกำหนด โดยคงรายชื่อในพื้นที่ครูและประวัติข้อสอบ');
  purged:=purged+1;
 end loop;
 return purged;
end; $$;
revoke all on function private.can_read_directory_membership(uuid),private.assert_directory_active(uuid),private.directory_cleanup_ready(),private.purge_school_directories(integer),public.manage_directory_lifecycle(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.manage_directory_lifecycle(jsonb) to authenticated;
insert into private.app_installation(version) values('202610280019');
notify pgrst, 'reload schema';
commit;
