-- Apply once after 013. Transactional previews, stable identities, bounded reads.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202610280013') then raise exception 'INSTALL_013_FIRST'; end if;
end $$;
alter table public.students add column directory_student_id uuid;
alter table public.students add column directory_revision integer not null default 0;
create table private.roster_plans (
  id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),actor_id uuid not null references auth.users(id),
  action text not null check(action in ('import','archive','restore')),filename text,selection jsonb,
  rows jsonb not null,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '20 minutes',result jsonb
);
create index roster_plans_workspace on private.roster_plans(school_id,created_at);
revoke all on private.roster_plans from public,anon,authenticated,service_role;

create function private.student_revision() returns trigger language plpgsql set search_path='' as $$
begin
  if new.id<>old.id or new.school_id<>old.school_id or new.student_code<>old.student_code then raise exception 'STUDENT_IDENTITY_LOCKED'; end if;
  new.revision:=old.revision+1; new.updated_at:=now(); return new;
end; $$;
create trigger student_revision before update on public.students for each row execute function private.student_revision();
create function private.validate_roster_person(p jsonb) returns void language plpgsql set search_path='' as $$
begin
  if jsonb_typeof(p->'student_code') is distinct from 'string' or p->>'student_code' !~ '^[0-9]{5}$'
    or jsonb_typeof(p->'first_name') is distinct from 'string' or length(btrim(p->>'first_name')) not between 1 and 80
    or jsonb_typeof(p->'last_name') is distinct from 'string' or length(btrim(p->>'last_name')) not between 1 and 80
    or coalesce(p->>'prefix','') not in ('','เด็กชาย','เด็กหญิง','นาย','นางสาว','น.ส.','ด.ช.','ด.ญ.')
    or jsonb_typeof(p->'classroom_name') is distinct from 'string' or p->>'classroom_name' !~ '^ม\.[1-6](/[1-9][0-9]?)?$'
    or (p->'number' is not null and p->'number'<>'null'::jsonb and (jsonb_typeof(p->'number')<>'number' or (p->>'number') !~ '^[0-9]+$' or (p->>'number')::integer not between 1 and 100))
    then raise exception 'INVALID_STUDENT_FIELDS'; end if;
end; $$;
create function private.roster_person(s public.students) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('student_code',s.student_code,'prefix',s.prefix,'first_name',s.first_name,'last_name',s.last_name,'classroom_name',s.classroom_name,'number',s.number);
$$;
create function private.roster_audit(tenant uuid,kind text,target uuid,before_value jsonb,after_value jsonb,explanation text) returns void
language sql security definer set search_path='' as $$
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,old_values,new_values,reason,display_message)
    values(tenant,auth.uid(),kind,'students','student',target,before_value,after_value,explanation,explanation);
$$;
-- Installed by 015; these narrow hooks never grant general cross-workspace writes.
create function private.roster_after_selection(tenant uuid,kind text,filters jsonb,ids uuid[]) returns void language plpgsql set search_path='' as $$ begin return; end; $$;

create function public.get_student_roster(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; wanted text:=coalesce(input->>'status','active'); search text:=btrim(coalesce(input->>'query',''));
  classroom text:=nullif(input->>'classroom',''); grade text:=nullif(input->>'grade',''); page_no integer:=coalesce((input->>'page')::integer,0);
  page_size integer:=coalesce((input->>'limit')::integer,50); total integer; active_count integer; rows jsonb; classes jsonb;
begin
  if not private.can_read_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if page_no not between 0 and 20000 or page_size not between 1 and 2000 or length(search)>100 or wanted not in ('active','inactive','all') then raise exception 'INVALID_ROSTER_QUERY'; end if;
  select count(*) into active_count from public.students where school_id=tenant and active;
  select coalesce(jsonb_agg(jsonb_build_object('name',classroom_name,'count',amount) order by grade_num,room_num,classroom_name),'[]') into classes
    from (select classroom_name,count(*) amount,min(substring(grade_level from '[0-9]+')::integer) grade_num,min(coalesce(room,0)) room_num
      from public.students where school_id=tenant and (wanted='all' or active=(wanted='active')) group by classroom_name) c;
  select count(*) into total from public.students s where school_id=tenant and (wanted='all' or s.active=(wanted='active'))
    and (classroom is null or s.classroom_name=classroom) and (grade is null or s.grade_level=grade)
    and (search='' or position(lower(search) in lower(s.student_code||' '||s.full_name||' '||s.classroom_name))>0);
  select coalesce(jsonb_agg(to_jsonb(s) order by substring(s.grade_level from '[0-9]+')::integer,coalesce(s.room,0),s.student_code),'[]') into rows
    from (select id,student_code,prefix,first_name,last_name,full_name,classroom_name,grade_level,room,number,active,revision,directory_student_id,directory_revision
      from public.students s where school_id=tenant and (wanted='all' or s.active=(wanted='active'))
        and (classroom is null or s.classroom_name=classroom) and (grade is null or s.grade_level=grade)
        and (search='' or position(lower(search) in lower(s.student_code||' '||s.full_name||' '||s.classroom_name))>0)
      order by substring(s.grade_level from '[0-9]+')::integer,coalesce(s.room,0),s.student_code
      limit case when input->>'export'='true' then null else page_size end offset case when input->>'export'='true' then 0 else page_no*page_size end) s;
  return jsonb_build_object('students',rows,'total',total,'activeCount',active_count,'classrooms',classes,'page',page_no,'limit',page_size);
end; $$;

create function public.preview_student_import(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; p jsonb; row public.students; entries jsonb:='[]'; proposed jsonb; state text; plan private.roster_plans;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(input->'students') is distinct from 'array' or jsonb_array_length(input->'students') not between 1 and 2000
    or length(coalesce(input->>'filename','')) not between 1 and 200 then raise exception 'INVALID_IMPORT'; end if;
  if (select count(distinct s->>'student_code') from jsonb_array_elements(input->'students') s)<>jsonb_array_length(input->'students') then raise exception 'DUPLICATE_CODE'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  for p in select value from jsonb_array_elements(input->'students') loop
    perform private.validate_roster_person(p);
    select * into row from public.students where school_id=tenant and student_code=p->>'student_code';
    if p ? 'expectedRevision' and coalesce(row.revision,0)<>(p->>'expectedRevision')::integer then raise exception 'STALE_ROSTER'; end if;
    proposed:=jsonb_build_object('student_code',p->>'student_code','prefix',coalesce(p->>'prefix',''),'first_name',btrim(p->>'first_name'),
      'last_name',btrim(p->>'last_name'),'classroom_name',p->>'classroom_name','number',
      case when coalesce((p->>'numberProvided')::boolean,true) or row.id is null then p->'number' else to_jsonb(row.number) end);
    state:=case when row.id is null then 'add' when row.directory_student_id is not null and private.roster_person(row) is distinct from proposed then 'managed'
      when not row.active then 'restore' when private.roster_person(row)=proposed then 'unchanged' else 'update' end;
    entries:=entries||jsonb_build_array(jsonb_build_object('status',state,'before',case when row.id is null then null else private.roster_person(row) end,
      'after',proposed,'studentId',row.id,'revision',coalesce(row.revision,0)));
  end loop;
  -- Only expired, unapplied previews by this actor may be discarded.
  delete from private.roster_plans where school_id=tenant and actor_id=auth.uid() and expires_at<now() and result is null;
  insert into private.roster_plans(school_id,actor_id,action,filename,rows) values(tenant,auth.uid(),'import',input->>'filename',entries) returning * into plan;
  return jsonb_build_object('planId',plan.id,'rows',entries,'expiresAt',plan.expires_at);
end; $$;

create function public.preview_student_selection(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; kind text:=input->>'action'; filters jsonb:=coalesce(input->'filters','{}');
  selected uuid[]; excluded uuid[]:='{}'; entries jsonb; plan private.roster_plans; search text:=coalesce(filters->>'query','');
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if kind not in ('archive','restore') or length(search)>100 then raise exception 'INVALID_ROSTER_ACTION'; end if;
  if input ? 'ids' then
    if jsonb_typeof(input->'ids') is distinct from 'array' or jsonb_array_length(input->'ids') not between 1 and 2000 then raise exception 'INVALID_SELECTION'; end if;
    select array_agg(distinct value::uuid) into selected from jsonb_array_elements_text(input->'ids');
  elsif input->>'allMatching' is distinct from 'true' then raise exception 'INVALID_SELECTION'; end if;
  if input ? 'excludedIds' then
    if jsonb_typeof(input->'excludedIds') is distinct from 'array' or jsonb_array_length(input->'excludedIds')>2000 then raise exception 'INVALID_SELECTION'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into excluded from jsonb_array_elements_text(input->'excludedIds');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('studentId',s.id,'revision',s.revision,'before',private.roster_person(s)) order by s.student_code),'[]') into entries
    from public.students s where s.school_id=tenant and s.active=(kind='archive') and (selected is null or s.id=any(selected)) and not(s.id=any(excluded))
      and (selected is not null or ((nullif(filters->>'classroom','') is null or s.classroom_name=filters->>'classroom')
        and (nullif(filters->>'grade','') is null or s.grade_level=filters->>'grade')
        and (search='' or position(lower(search) in lower(s.student_code||' '||s.full_name||' '||s.classroom_name))>0)));
  if jsonb_array_length(entries)=0 or (selected is not null and jsonb_array_length(entries)<>cardinality(selected)) then raise exception 'STALE_ROSTER'; end if;
  insert into private.roster_plans(school_id,actor_id,action,selection,rows) values(tenant,auth.uid(),kind,filters||jsonb_build_object('allMatching',selected is null and cardinality(excluded)=0),entries) returning * into plan;
  return jsonb_build_object('planId',plan.id,'count',jsonb_array_length(entries),'rows',entries,'expiresAt',plan.expires_at);
end; $$;

create function public.apply_student_plan(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; plan private.roster_plans; entry jsonb; p jsonb; row public.students;
  added integer:=0; changed integer:=0; unchanged integer:=0; restored integer:=0; affected uuid[]:='{}'; receipt jsonb;
begin
  if not private.owns_workspace(tenant) or input->>'consent' is distinct from 'true' then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into plan from private.roster_plans where id=(input->>'planId')::uuid and school_id=tenant and actor_id=auth.uid() and action in ('import','archive','restore') for update;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if plan.result is not null then return plan.result; end if;
  if plan.expires_at<now() then raise exception 'PLAN_EXPIRED'; end if;
  if exists(select 1 from jsonb_array_elements(plan.rows) e where e->>'status'='managed') then raise exception 'DIRECTORY_MANAGED'; end if;
  for entry in select value from jsonb_array_elements(plan.rows) loop
    p:=coalesce(entry->'after',entry->'before');
    select * into row from public.students where school_id=tenant and student_code=p->>'student_code' for update;
    if coalesce(row.revision,0)<>(entry->>'revision')::integer or (entry->>'studentId' is not null and row.id is distinct from (entry->>'studentId')::uuid) then raise exception 'STALE_ROSTER'; end if;
    if plan.action='import' then
      if entry->>'status'='unchanged' then unchanged:=unchanged+1; continue; end if;
      if row.directory_student_id is not null then raise exception 'DIRECTORY_MANAGED'; end if;
      if row.id is null then
        insert into public.students(school_id,student_code,prefix,first_name,last_name,classroom_name,number)
          values(tenant,p->>'student_code',p->>'prefix',p->>'first_name',p->>'last_name',p->>'classroom_name',(p->>'number')::integer) returning * into row;
        added:=added+1;
      else
        if not row.active then restored:=restored+1; else changed:=changed+1; end if;
        update public.students set prefix=p->>'prefix',first_name=p->>'first_name',last_name=p->>'last_name',classroom_name=p->>'classroom_name',number=(p->>'number')::integer,active=true
          where id=row.id returning * into row;
      end if;
      perform private.roster_audit(tenant,'import_students',row.id,entry->'before',private.roster_person(row),'นำเข้าและอัปเดตรายชื่อนักเรียน');
    else
      update public.students set active=(plan.action='restore') where id=row.id returning * into row;
      perform private.roster_audit(tenant,case when plan.action='restore' then 'restore_student' else 'archive_student' end,row.id,entry->'before',jsonb_build_object('active',row.active),
        case when plan.action='restore' then 'คืนรายชื่อนักเรียน' else 'นำออกจากรายชื่อใช้งาน โดยคงประวัติข้อสอบ' end);
      changed:=changed+1;
    end if;
    affected:=array_append(affected,row.id);
  end loop;
  if plan.action<>'import' then perform private.roster_after_selection(tenant,plan.action,plan.selection,affected); end if;
  if plan.action='import' then
    insert into public.student_imports(school_id,uploaded_by,filename,success_count) values(tenant,auth.uid(),plan.filename,jsonb_array_length(plan.rows));
  end if;
  receipt:=jsonb_build_object('added',added,'updated',changed,'unchanged',unchanged,'restored',restored,'count',cardinality(affected));
  update private.roster_plans set result=receipt where id=plan.id;
  return receipt;
end; $$;

create function public.manage_student(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; p jsonb:=input->'student'; kind text:=input->>'action'; row public.students; before_value jsonb;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if kind not in ('create','update') then raise exception 'INVALID_ROSTER_ACTION'; end if;
  perform private.validate_roster_person(p);
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  if kind='create' then
    if exists(select 1 from public.students where school_id=tenant and student_code=p->>'student_code') then raise exception 'DUPLICATE_CODE'; end if;
    insert into public.students(school_id,student_code,prefix,first_name,last_name,classroom_name,number)
      values(tenant,p->>'student_code',coalesce(p->>'prefix',''),p->>'first_name',p->>'last_name',p->>'classroom_name',(p->>'number')::integer) returning * into row;
  else
    select * into row from public.students where school_id=tenant and id=(input->>'id')::uuid for update;
    if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
    if row.directory_student_id is not null then raise exception 'DIRECTORY_MANAGED'; end if;
    if row.revision is distinct from (input->>'revision')::integer then raise exception 'STALE_ROSTER'; end if;
    if row.student_code<>p->>'student_code' then raise exception 'STUDENT_IDENTITY_LOCKED'; end if;
    before_value:=private.roster_person(row);
    if before_value is not distinct from p then return to_jsonb(row); end if;
    update public.students set prefix=coalesce(p->>'prefix',''),first_name=p->>'first_name',last_name=p->>'last_name',classroom_name=p->>'classroom_name',number=(p->>'number')::integer
      where id=row.id returning * into row;
  end if;
  perform private.roster_audit(tenant,case when kind='create' then 'create_student' else 'update_student' end,row.id,before_value,private.roster_person(row),
    case when kind='create' then 'เพิ่มนักเรียนด้วยตนเอง' else 'แก้ไขข้อมูลนักเรียนปัจจุบัน โดยคงประวัติข้อสอบ' end);
  return to_jsonb(row);
end; $$;

revoke all on function private.student_revision(),private.validate_roster_person(jsonb),private.roster_person(public.students),private.roster_audit(uuid,text,uuid,jsonb,jsonb,text),private.roster_after_selection(uuid,text,jsonb,uuid[]) from public,anon,authenticated,service_role;
revoke all on function public.get_student_roster(jsonb),public.preview_student_import(jsonb),public.preview_student_selection(jsonb),public.apply_student_plan(jsonb),public.manage_student(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_student_roster(jsonb),public.preview_student_import(jsonb),public.preview_student_selection(jsonb),public.apply_student_plan(jsonb),public.manage_student(jsonb) to authenticated;
insert into private.app_installation(version) values('202610280014');
notify pgrst,'reload schema';
commit;
