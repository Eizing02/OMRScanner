-- Apply once after 014. Explicit school grants; no general workspace sharing.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202610280014') then raise exception 'INSTALL_014_FIRST'; end if;
end $$;
create table public.roster_directories (
  id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 120),
  academic_year integer not null check(academic_year between 2500 and 2700),term integer not null check(term between 1 and 3),
  revision integer not null default 1,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table public.roster_directory_access (
  directory_id uuid not null references public.roster_directories(id),user_id uuid not null references auth.users(id),
  role text not null check(role in ('manager','teacher')),active boolean not null default true,
  granted_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),primary key(directory_id,user_id)
);
create table public.roster_directory_students (
  id uuid primary key default gen_random_uuid(),directory_id uuid not null references public.roster_directories(id),
  student_code varchar(5) not null check(student_code ~ '^[0-9]{5}$'),prefix text not null default '',first_name text not null,last_name text not null,
  classroom_name text not null check(classroom_name ~ '^ม\.[1-6](/[1-9][0-9]?)?$'),number integer check(number between 1 and 100),
  active boolean not null default true,revision integer not null default 1,updated_at timestamptz not null default now(),
  unique(directory_id,student_code),unique(directory_id,id)
);
create index directory_class_code on public.roster_directory_students(directory_id,active,classroom_name,student_code);
alter table public.students add foreign key(directory_student_id) references public.roster_directory_students(id);
create table public.roster_subscriptions (
  school_id uuid not null references public.schools(id),directory_id uuid not null references public.roster_directories(id),
  classroom_name text not null,active boolean not null default true,created_at timestamptz not null default now(),primary key(school_id,directory_id,classroom_name)
);
create table public.roster_suppressions (
  school_id uuid not null references public.schools(id),directory_student_id uuid not null references public.roster_directory_students(id),
  reason text not null,created_at timestamptz not null default now(),primary key(school_id,directory_student_id)
);

create function private.can_read_directory(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.is_approved() and (private.is_platform_owner() or exists(select 1 from public.roster_directory_access where directory_id=target and user_id=auth.uid() and active));
$$;
create function private.can_manage_directory(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.is_approved() and (private.is_platform_owner() or exists(select 1 from public.roster_directory_access where directory_id=target and user_id=auth.uid() and active and role='manager'));
$$;
alter table public.roster_directories enable row level security;
alter table public.roster_directory_access enable row level security;
alter table public.roster_directory_students enable row level security;
alter table public.roster_subscriptions enable row level security;
alter table public.roster_suppressions enable row level security;
revoke all on public.roster_directories,public.roster_directory_access,public.roster_directory_students,public.roster_subscriptions,public.roster_suppressions from public,anon,authenticated,service_role;
grant select on public.roster_directories,public.roster_directory_access,public.roster_directory_students,public.roster_subscriptions,public.roster_suppressions to authenticated;
create policy directory_read on public.roster_directories for select to authenticated using(private.can_read_directory(id));
create policy directory_people_read on public.roster_directory_students for select to authenticated using(private.can_read_directory(directory_id));
create policy directory_grant_read on public.roster_directory_access for select to authenticated using(private.can_manage_directory(directory_id) or (user_id=auth.uid() and private.can_read_directory(directory_id)));
create policy directory_subscription_read on public.roster_subscriptions for select to authenticated using(private.can_read_workspace(school_id));
create policy directory_suppression_read on public.roster_suppressions for select to authenticated using(private.can_read_workspace(school_id));

create function private.sync_directory_roster(tenant uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare person public.roster_directory_students; row public.students; added integer:=0; changed integer:=0; conflicts jsonb:='[]'; n integer;
begin
  -- Called only by authenticated own-workspace commands, never by an owner
  -- inspecting another teacher. Synchronization is an explicit narrow grant.
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  perform 1 from public.roster_directories d where exists(select 1 from public.roster_subscriptions sub where sub.school_id=tenant and sub.directory_id=d.id)
    order by d.id for share;
  update public.students s set active=false where s.school_id=tenant and s.directory_student_id is not null and s.active
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
create function public.sync_student_directory(input jsonb) returns jsonb language sql security definer set search_path='' as $$
  select private.sync_directory_roster((input->>'school_id')::uuid);
$$;

create or replace function private.roster_after_selection(tenant uuid,kind text,filters jsonb,ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  if kind='archive' then
    insert into public.roster_suppressions(school_id,directory_student_id,reason)
      select tenant,directory_student_id,'removed_by_teacher' from public.students where school_id=tenant and id=any(ids) and directory_student_id is not null
      on conflict(school_id,directory_student_id) do update set reason=excluded.reason;
    if filters->>'allMatching'='true' and coalesce(filters->>'query','')='' then
      update public.roster_subscriptions set active=false where school_id=tenant
        and (nullif(filters->>'classroom','') is null or classroom_name=filters->>'classroom')
        and (nullif(filters->>'grade','') is null or split_part(classroom_name,'/',1)=filters->>'grade');
    end if;
  else
    if exists(select 1 from public.students s join public.roster_directory_students d on d.id=s.directory_student_id
      where s.school_id=tenant and s.id=any(ids) and (not private.can_read_directory(d.directory_id) or not d.active
        or not exists(select 1 from public.roster_subscriptions sub where sub.school_id=tenant and sub.directory_id=d.directory_id and sub.classroom_name=d.classroom_name and sub.active))) then raise exception 'SELECT_DIRECTORY_CLASS'; end if;
    delete from public.roster_suppressions where school_id=tenant and directory_student_id in(select directory_student_id from public.students where school_id=tenant and id=any(ids));
    perform private.sync_directory_roster(tenant);
  end if;
end; $$;

create function public.get_roster_directory(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid; mode text:=coalesce(input->>'view','options');
  page_no integer:=coalesce((input->>'page')::integer,0); page_size integer:=coalesce((input->>'limit')::integer,50); rows jsonb; amount integer; search text:=coalesce(input->>'query','');
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if mode='options' then
    return jsonb_build_object('canCreate',private.is_platform_owner(),'directories',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('canManage',private.can_manage_directory(d.id),
      'classrooms',coalesce((select jsonb_agg(jsonb_build_object('name',c.classroom_name,'count',c.amount) order by c.classroom_name) from
        (select classroom_name,count(*) amount from public.roster_directory_students where directory_id=d.id and active group by classroom_name
         union all select sub.classroom_name,0 from public.roster_subscriptions sub where sub.school_id=tenant and sub.directory_id=d.id and sub.active
           and not exists(select 1 from public.roster_directory_students st where st.directory_id=d.id and st.classroom_name=sub.classroom_name and st.active)) c),'[]'::jsonb),
      'selectedClasses',coalesce((select jsonb_agg(classroom_name order by classroom_name) from public.roster_subscriptions where school_id=tenant and directory_id=d.id and active),'[]'::jsonb)) order by d.name)
      from public.roster_directories d where private.can_read_directory(d.id)),'[]'::jsonb),
      'accounts',case when private.is_platform_owner() then coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'email',email,'name',display_name) order by email) from public.user_access where status='approved'),'[]'::jsonb) else '[]'::jsonb end);
  end if;
  if not private.can_read_directory(target) then raise exception 'FORBIDDEN'; end if;
  if page_no not between 0 and 20000 or page_size not between 1 and 2000 or length(search)>100 then raise exception 'INVALID_ROSTER_QUERY'; end if;
  select count(*) into amount from public.roster_directory_students d where directory_id=target and d.active=(coalesce(input->>'status','active')='active')
    and (nullif(input->>'classroom','') is null or d.classroom_name=input->>'classroom')
    and (search='' or position(lower(search) in lower(d.student_code||' '||d.prefix||d.first_name||' '||d.last_name))>0);
  select coalesce(jsonb_agg(to_jsonb(d) order by d.classroom_name,d.student_code),'[]') into rows from
    (select * from public.roster_directory_students d where directory_id=target and d.active=(coalesce(input->>'status','active')='active')
      and (nullif(input->>'classroom','') is null or d.classroom_name=input->>'classroom')
      and (search='' or position(lower(search) in lower(d.student_code||' '||d.prefix||d.first_name||' '||d.last_name))>0)
      order by d.classroom_name,d.student_code limit page_size offset page_no*page_size) d;
  return jsonb_build_object('students',rows,'total',amount,'page',page_no,'limit',page_size,
    'members',case when private.can_manage_directory(target) then coalesce((select jsonb_agg(jsonb_build_object('userId',a.user_id,'role',a.role,'active',a.active,'email',u.email,'name',u.display_name))
      from public.roster_directory_access a join public.user_access u on u.user_id=a.user_id where a.directory_id=target),'[]'::jsonb) else '[]'::jsonb end);
end; $$;

create function public.manage_roster_directory(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid:=(input->>'directoryId')::uuid; kind text:=input->>'action'; directory public.roster_directories; account uuid:=(input->>'userId')::uuid;
begin
  if kind='create' then
    if not private.is_platform_owner() then raise exception 'FORBIDDEN'; end if;
    insert into public.roster_directories(name,academic_year,term,created_by) values(btrim(input->>'name'),(input->>'year')::integer,(input->>'term')::integer,auth.uid()) returning * into directory;
    insert into public.roster_directory_access values(directory.id,auth.uid(),'manager',true,auth.uid(),now());
    return to_jsonb(directory);
  end if;
  if not private.can_manage_directory(target) then raise exception 'FORBIDDEN'; end if;
  select * into directory from public.roster_directories where id=target for update;
  if directory.revision is distinct from (input->>'revision')::integer then raise exception 'STALE_DIRECTORY'; end if;
  if kind='grant' or kind='revoke' then
    -- School membership is an explicit owner assignment, never a school-name or
    -- email-domain inference. Managers cannot enroll unrelated accounts.
    if not private.is_platform_owner() or not exists(select 1 from public.user_access where user_id=account and status='approved') then raise exception 'FORBIDDEN'; end if;
    if account=directory.created_by and kind='revoke' then raise exception 'FORBIDDEN'; end if;
    insert into public.roster_directory_access values(target,account,coalesce(input->>'role','teacher'),kind='grant',auth.uid(),now())
      on conflict(directory_id,user_id) do update set role=excluded.role,active=excluded.active,granted_by=auth.uid(),updated_at=now();
  elsif kind='period' then
    update public.roster_directories set academic_year=(input->>'year')::integer,term=(input->>'term')::integer where id=target;
  elsif kind in ('archive','restore') then
    update public.roster_directory_students set active=(kind='restore'),revision=revision+1,updated_at=now() where directory_id=target and id=(input->>'studentId')::uuid;
    if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  else raise exception 'INVALID_ROSTER_ACTION'; end if;
  update public.roster_directories set revision=revision+1 where id=target returning * into directory;
  insert into public.access_audit_logs(actor_user_id,action,resource_id,old_values,new_values,reason,display_message)
    values(auth.uid(),'school_directory_'||kind,coalesce(account,auth.uid()),null,jsonb_build_object('directoryId',target,'revision',directory.revision),
      'จัดการทะเบียนกลางและสิทธิ์โรงเรียน','จัดการทะเบียนกลางและสิทธิ์โรงเรียน');
  return to_jsonb(directory);
end; $$;

alter table private.roster_plans drop constraint roster_plans_action_check;
alter table private.roster_plans add check(action in ('import','archive','restore','directory_import'));
create function public.preview_directory_import(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid; directory public.roster_directories;
  people jsonb:=input->'students'; p jsonb; row public.roster_directory_students; proposed jsonb; before_value jsonb; entries jsonb:='[]'; plan private.roster_plans;
begin
  if not private.owns_workspace(tenant) or not private.can_manage_directory(target) then raise exception 'FORBIDDEN'; end if;
  select * into directory from public.roster_directories where id=target;
  if input->>'fromWorkspace'='true' then
    select coalesce(jsonb_agg(private.roster_person(s) order by s.student_code),'[]') into people from public.students s where school_id=tenant and active;
  end if;
  if jsonb_typeof(people) is distinct from 'array' or jsonb_array_length(people) not between 1 and 2000 then raise exception 'INVALID_IMPORT'; end if;
  if (select count(distinct s->>'student_code') from jsonb_array_elements(people) s)<>jsonb_array_length(people) then raise exception 'DUPLICATE_CODE'; end if;
  for p in select value from jsonb_array_elements(people) loop
    perform private.validate_roster_person(p);
    select * into row from public.roster_directory_students where directory_id=target and student_code=p->>'student_code';
    if p ? 'expectedRevision' and coalesce(row.revision,0)<>(p->>'expectedRevision')::integer then raise exception 'STALE_DIRECTORY'; end if;
    proposed:=jsonb_build_object('student_code',p->>'student_code','prefix',coalesce(p->>'prefix',''),'first_name',btrim(p->>'first_name'),
      'last_name',btrim(p->>'last_name'),'classroom_name',p->>'classroom_name','number',case when coalesce((p->>'numberProvided')::boolean,true) or row.id is null then p->'number' else to_jsonb(row.number) end);
    before_value:=case when row.id is null then null else jsonb_build_object('student_code',row.student_code,'prefix',row.prefix,'first_name',row.first_name,'last_name',row.last_name,'classroom_name',row.classroom_name,'number',row.number) end;
    entries:=entries||jsonb_build_array(jsonb_build_object('status',case when row.id is null then 'add' when not row.active then 'restore' when proposed=before_value then 'unchanged' else 'update' end,
      'before',before_value,'after',proposed,'studentId',row.id,'revision',coalesce(row.revision,0)));
  end loop;
  insert into private.roster_plans(school_id,actor_id,action,filename,selection,rows) values(tenant,auth.uid(),'directory_import',left(coalesce(input->>'filename','รายชื่อในพื้นที่ของฉัน'),200),
    jsonb_build_object('directoryId',target,'revision',directory.revision),entries) returning * into plan;
  return jsonb_build_object('planId',plan.id,'rows',entries,'expiresAt',plan.expires_at);
end; $$;
create function public.apply_directory_import(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; plan private.roster_plans; target uuid; directory public.roster_directories; entry jsonb; p jsonb; receipt jsonb;
begin
  if not private.owns_workspace(tenant) or input->>'consent' is distinct from 'true' then raise exception 'FORBIDDEN'; end if;
  select * into plan from private.roster_plans where id=(input->>'planId')::uuid and school_id=tenant and actor_id=auth.uid() and action='directory_import' for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  target:=(plan.selection->>'directoryId')::uuid;
  if not private.can_manage_directory(target) then raise exception 'FORBIDDEN'; end if;
  if plan.result is not null then return plan.result; end if;
  if plan.expires_at<now() then raise exception 'PLAN_EXPIRED'; end if;
  select * into directory from public.roster_directories where id=target for update;
  if directory.revision<>(plan.selection->>'revision')::integer then raise exception 'STALE_DIRECTORY'; end if;
  for entry in select value from jsonb_array_elements(plan.rows) loop
    if entry->>'status'='unchanged' then continue; end if;
    p:=entry->'after';
    insert into public.roster_directory_students(directory_id,student_code,prefix,first_name,last_name,classroom_name,number)
      values(target,p->>'student_code',p->>'prefix',p->>'first_name',p->>'last_name',p->>'classroom_name',(p->>'number')::integer)
      on conflict(directory_id,student_code) do update set prefix=excluded.prefix,first_name=excluded.first_name,last_name=excluded.last_name,
        classroom_name=excluded.classroom_name,number=excluded.number,active=true,revision=public.roster_directory_students.revision+1,updated_at=now();
  end loop;
  update public.roster_directories set revision=revision+1 where id=target;
  receipt:=jsonb_build_object('count',jsonb_array_length(plan.rows));
  update private.roster_plans set result=receipt where id=plan.id;
  insert into public.access_audit_logs(actor_user_id,action,resource_id,old_values,new_values,reason,display_message)
    values(auth.uid(),'import_school_roster',auth.uid(),null,jsonb_build_object('directoryId',target,'count',jsonb_array_length(plan.rows)),plan.filename,'นำเข้าและอัปเดตทะเบียนนักเรียนโรงเรียน');
  return receipt;
end; $$;

create function public.preview_directory_subscription(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid; classes text[]; result jsonb;
begin
  if not private.owns_workspace(tenant) or not private.can_read_directory(target) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(input->'classrooms') is distinct from 'array' then raise exception 'INVALID_SELECTION'; end if;
  select coalesce(array_agg(distinct value),'{}'::text[]) into classes from jsonb_array_elements_text(input->'classrooms');
  if cardinality(classes)>100 then raise exception 'INVALID_SELECTION'; end if;
  select jsonb_build_object('revision',(select revision from public.roster_directories where id=target),
    'total',count(*),'added',count(*) filter(where s.id is null and x.directory_student_id is null),
    'excluded',count(*) filter(where x.directory_student_id is not null),
    'conflicts',coalesce(jsonb_agg(jsonb_build_object('studentCode',d.student_code,'before',private.roster_person(s),
      'after',jsonb_build_object('student_code',d.student_code,'prefix',d.prefix,'first_name',d.first_name,'last_name',d.last_name,'classroom_name',d.classroom_name,'number',d.number),
      'canAdopt',s.directory_student_id is null)) filter(where s.id is not null and s.directory_student_id is distinct from d.id),'[]'::jsonb)) into result
    from public.roster_directory_students d left join public.students s on s.school_id=tenant and s.student_code=d.student_code
      left join public.roster_suppressions x on x.school_id=tenant and x.directory_student_id=d.id
    where d.directory_id=target and d.active and d.classroom_name=any(classes);
  return result;
end; $$;

create function public.subscribe_student_directory(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'directoryId')::uuid; directory public.roster_directories; class_name text;
  person public.roster_directory_students; adopts text[]; classes text[];
begin
  if not private.owns_workspace(tenant) or not private.can_read_directory(target) or input->>'consent' is distinct from 'true' then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into directory from public.roster_directories where id=target for share;
  if directory.revision is distinct from (input->>'revision')::integer then raise exception 'STALE_DIRECTORY'; end if;
  if jsonb_typeof(input->'classrooms') is distinct from 'array' then raise exception 'INVALID_SELECTION'; end if;
  select coalesce(array_agg(distinct value),'{}'::text[]) into classes from jsonb_array_elements_text(input->'classrooms');
  if cardinality(classes)>100 then raise exception 'INVALID_SELECTION'; end if;
  -- An already subscribed room may be temporarily empty between cohorts.
  -- Keep it visible so teachers can retain or explicitly stop that subscription.
  if exists(select 1 from unnest(classes) c where not exists(select 1 from public.roster_directory_students where directory_id=target and classroom_name=c and active)
    and not exists(select 1 from public.roster_subscriptions where school_id=tenant and directory_id=target and classroom_name=c and active)) then raise exception 'INVALID_CLASSROOM'; end if;
  update public.roster_subscriptions set active=false where school_id=tenant and directory_id=target and not(classroom_name=any(classes));
  foreach class_name in array classes loop
    insert into public.roster_subscriptions values(tenant,target,class_name,true,now()) on conflict(school_id,directory_id,classroom_name) do update set active=true;
  end loop;
  if input->>'includeExcluded'='true' then
    delete from public.roster_suppressions where school_id=tenant and directory_student_id in(select id from public.roster_directory_students where directory_id=target and classroom_name=any(classes));
  end if;
  if input ? 'adoptCodes' then
    if jsonb_typeof(input->'adoptCodes') is distinct from 'array' or jsonb_array_length(input->'adoptCodes')>2000 then raise exception 'INVALID_SELECTION'; end if;
    select array_agg(value) into adopts from jsonb_array_elements_text(input->'adoptCodes');
    for person in select * from public.roster_directory_students where directory_id=target and active and classroom_name=any(classes) and student_code=any(adopts) loop
      update public.students set directory_student_id=person.id,directory_revision=0 where school_id=tenant and student_code=person.student_code and directory_student_id is null;
      delete from public.roster_suppressions where school_id=tenant and directory_student_id=person.id;
    end loop;
  end if;
  return private.sync_directory_roster(tenant);
end; $$;
create function public.detach_student_directory(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; row public.students;
begin
  if not private.owns_workspace(tenant) or input->>'consent' is distinct from 'true' then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into row from public.students where school_id=tenant and id=(input->>'id')::uuid for update;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  if row.revision is distinct from (input->>'revision')::integer then raise exception 'STALE_ROSTER'; end if;
  if row.directory_student_id is not null then
    insert into public.roster_suppressions values(tenant,row.directory_student_id,'detached_by_teacher',now()) on conflict(school_id,directory_student_id) do update set reason=excluded.reason;
    update public.students set directory_student_id=null,directory_revision=0 where id=row.id returning * into row;
    perform private.roster_audit(tenant,'detach_school_roster',row.id,null,private.roster_person(row),'แยกรายชื่อมาจัดการเอง ไม่อัปเดตตามทะเบียนกลาง');
  end if;
  return to_jsonb(row);
end; $$;

revoke all on function private.can_read_directory(uuid),private.can_manage_directory(uuid),private.sync_directory_roster(uuid),private.roster_after_selection(uuid,text,jsonb,uuid[]) from public,anon,authenticated,service_role;
grant execute on function private.can_read_directory(uuid),private.can_manage_directory(uuid) to authenticated;
revoke all on function public.sync_student_directory(jsonb),public.get_roster_directory(jsonb),public.manage_roster_directory(jsonb),public.preview_directory_import(jsonb),public.apply_directory_import(jsonb),public.preview_directory_subscription(jsonb),public.subscribe_student_directory(jsonb),public.detach_student_directory(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.sync_student_directory(jsonb),public.get_roster_directory(jsonb),public.manage_roster_directory(jsonb),public.preview_directory_import(jsonb),public.apply_directory_import(jsonb),public.preview_directory_subscription(jsonb),public.subscribe_student_directory(jsonb),public.detach_student_directory(jsonb) to authenticated;
insert into private.app_installation(version) values('202610280015');
notify pgrst,'reload schema';
commit;
