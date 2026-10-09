-- Smart Answer Sheet: fresh installation, approved supplemental scope 9 October 2026.
-- GENERATED from migrations 001–007. Apply ONCE, not after individual migrations.
-- One transaction: no partial installation, no seeded student data, no service secrets.
begin;
do $install$
begin
  if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and c.relname in ('schools','students','exams','user_access','omr_templates','print_jobs'))
    then raise exception 'EXISTING_APP_SCHEMA: use only unapplied migrations, never rerun snapshot'; end if;
  if exists(select 1 from storage.buckets where id='school-logos')
    or exists(select 1 from pg_catalog.pg_policies where schemaname='storage' and tablename='objects')
    then raise exception 'EXISTING_STORAGE_POLICY: inspect bucket/policies before private-logo installation'; end if;
end;
$install$;

-- SOURCE: 202610080001_foundation.sql
-- Smart Answer Sheet: Phase 0–1. Apply once to a new Supabase project.
-- This file is transactional. No production student data or secrets are seeded.
create table public.schools (
  id uuid primary key default gen_random_uuid(), name_th text not null check(length(name_th) between 1 and 120),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.school_members (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), user_id uuid not null references auth.users(id),
  role text not null check(role in ('admin','teacher','reviewer')), status text not null default 'active' check(status in ('active','revoked')),
  created_at timestamptz not null default now(), unique(school_id,user_id)
);
create index school_members_user_idx on public.school_members(user_id,school_id,status);
create function public.has_school_role(tenant uuid, allowed text[] default array['admin','teacher','reviewer']) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.school_members where school_id=tenant and user_id=auth.uid() and status='active' and role=any(allowed));
$$;
revoke all on function public.has_school_role(uuid,text[]) from public;
grant execute on function public.has_school_role(uuid,text[]) to authenticated;
create function public.bootstrap_school_admin() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.school_members(school_id,user_id,role) values(new.id,new.created_by,'admin'); return new; end; $$;
revoke all on function public.bootstrap_school_admin() from public;
create trigger bootstrap_school_admin after insert on public.schools for each row execute function public.bootstrap_school_admin();
create table public.students (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), student_code varchar(5) not null check(student_code ~ '^[0-9]{5}$'),
  first_name text not null check(length(first_name) between 1 and 80), last_name text not null check(length(last_name) between 1 and 80),
  classroom_name text not null check(length(classroom_name) between 1 and 30), number integer check(number between 1 and 100),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(school_id,student_code), unique(school_id,id)
);
create index students_school_class_idx on public.students(school_id,classroom_name);
create table public.student_imports (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), uploaded_by uuid not null references auth.users(id),
  filename text not null, success_count integer not null check(success_count>0), created_at timestamptz not null default now()
);
create table public.exams (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), title text not null check(length(title) between 3 and 120),
  created_by uuid not null references auth.users(id), archived boolean not null default false, created_at timestamptz not null default now(), unique(school_id,id)
);
create index exams_school_created_idx on public.exams(school_id,created_at desc);
create table public.exam_access (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), exam_id uuid not null, user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(), foreign key(school_id,exam_id) references public.exams(school_id,id), unique(exam_id,user_id)
);
create function public.can_read_exam(target uuid, tenant uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_school_role(tenant) and exists(select 1 from public.exams e where e.id=target and e.school_id=tenant and
    (e.created_by=auth.uid() or public.has_school_role(tenant,array['admin']) or exists(select 1 from public.exam_access a where a.exam_id=e.id and a.school_id=tenant and a.user_id=auth.uid())));
$$;
revoke all on function public.can_read_exam(uuid,uuid) from public;
grant execute on function public.can_read_exam(uuid,uuid) to authenticated;
create table public.exam_versions (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), exam_id uuid not null,
  version_no integer not null check(version_no>0), set_code text not null default 'A' check(set_code in ('A','B')),
  config_json jsonb not null, published_at timestamptz, content_hash text, created_at timestamptz not null default now(),
  foreign key(school_id,exam_id) references public.exams(school_id,id), unique(exam_id,set_code,version_no), unique(school_id,id)
);
create table public.answer_keys (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), exam_version_id uuid not null,
  question_number integer not null check(question_number between 1 and 20), correct_option text not null check(correct_option in ('A','B','C','D')),
  points numeric not null check(points between 0 and 100), created_at timestamptz not null default now(),
  foreign key(school_id,exam_version_id) references public.exam_versions(school_id,id), unique(exam_version_id,question_number)
);
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), actor_user_id uuid not null references auth.users(id),
  action text not null, module_name text not null, resource_type text not null, resource_id uuid not null,
  old_values jsonb, new_values jsonb, reason text, display_message text not null, severity text not null default 'info' check(severity in ('info','warning','error')),
  created_at timestamptz not null default now()
);
create index audit_school_time_idx on public.audit_logs(school_id,created_at desc);
create function public.prevent_published_mutation() returns trigger language plpgsql set search_path=public as $$
begin if old.published_at is not null then raise exception 'PUBLISHED_VERSION_IMMUTABLE'; end if; if tg_op='DELETE' then return old; end if; return new; end; $$;
create trigger immutable_exam_version before update or delete on public.exam_versions for each row execute function public.prevent_published_mutation();
create function public.prevent_published_key_mutation() returns trigger language plpgsql set search_path=public as $$
declare target uuid;
begin if tg_op='INSERT' then target:=new.exam_version_id; else target:=old.exam_version_id; end if;
  perform 1 from public.exam_versions where id=target and published_at is not null;
  if found then raise exception 'PUBLISHED_KEY_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and new.exam_version_id<>old.exam_version_id then raise exception 'KEY_VERSION_IMMUTABLE'; end if; return new;
end; $$;
create trigger immutable_answer_key before insert or update or delete on public.answer_keys for each row execute function public.prevent_published_key_mutation();
-- Direct writes to scoring/version/audit tables are not granted. Use transactional RPC.
alter table public.schools enable row level security;
alter table public.school_members enable row level security;
alter table public.students enable row level security;
alter table public.student_imports enable row level security;
alter table public.exams enable row level security;
alter table public.exam_access enable row level security;
alter table public.exam_versions enable row level security;
alter table public.answer_keys enable row level security;
alter table public.audit_logs enable row level security;
create policy school_read on public.schools for select to authenticated using(public.has_school_role(id));
create policy school_create on public.schools for insert to authenticated with check(created_by=auth.uid());
create policy membership_read on public.school_members for select to authenticated using(user_id=auth.uid() or public.has_school_role(school_id,array['admin']));
create policy student_read on public.students for select to authenticated using(public.has_school_role(school_id,array['admin','teacher']));
create policy import_read on public.student_imports for select to authenticated using(public.has_school_role(school_id,array['admin','teacher']));
create policy exam_read on public.exams for select to authenticated using(public.can_read_exam(id,school_id));
create policy access_read on public.exam_access for select to authenticated using(public.can_read_exam(exam_id,school_id));
create policy version_read on public.exam_versions for select to authenticated using(public.can_read_exam(exam_id,school_id));
create policy key_read on public.answer_keys for select to authenticated using(exists(select 1 from public.exam_versions v where v.id=exam_version_id and public.can_read_exam(v.exam_id,v.school_id)));
create policy audit_read on public.audit_logs for select to authenticated using(public.has_school_role(school_id,array['admin']) or (actor_user_id=auth.uid() and public.has_school_role(school_id)));
revoke all on public.schools, public.school_members, public.students, public.student_imports, public.exams, public.exam_access, public.exam_versions, public.answer_keys, public.audit_logs from anon, authenticated;
grant select on public.schools, public.school_members, public.students, public.student_imports, public.exams, public.exam_access, public.exam_versions, public.answer_keys, public.audit_logs to authenticated;
grant insert on public.schools to authenticated;
create function public.import_students(input jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant uuid := (input->>'school_id')::uuid; actor uuid := auth.uid(); row_data jsonb; result jsonb := '[]'; new_row public.students; batch uuid := gen_random_uuid();
begin
  if actor is null or not public.has_school_role(tenant,array['admin','teacher']) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(input->'students') is distinct from 'array' then raise exception 'INVALID_IMPORT'; end if;
  if jsonb_array_length(input->'students') not between 1 and 2000 then raise exception 'INVALID_IMPORT'; end if;
  if input->>'filename' is null or length(input->>'filename') not between 1 and 200 then raise exception 'INVALID_FILENAME'; end if;
  for row_data in select value from jsonb_array_elements(input->'students') loop
    if jsonb_typeof(row_data->'student_code') is distinct from 'string' then raise exception 'INVALID_STUDENT_CODE'; end if;
    if jsonb_typeof(row_data->'first_name') is distinct from 'string' or jsonb_typeof(row_data->'last_name') is distinct from 'string' or jsonb_typeof(row_data->'classroom_name') is distinct from 'string' then raise exception 'INVALID_STUDENT_FIELDS'; end if;
    insert into public.students(school_id,student_code,first_name,last_name,classroom_name,number)
      values(tenant,row_data->>'student_code',btrim(row_data->>'first_name'),btrim(row_data->>'last_name'),btrim(row_data->>'classroom_name'),(row_data->>'number')::integer) returning * into new_row;
    result := result || jsonb_build_array(to_jsonb(new_row)-'school_id');
  end loop;
  insert into public.student_imports(id,school_id,uploaded_by,filename,success_count) values(batch,tenant,actor,input->>'filename',jsonb_array_length(result));
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,actor,'import_students','students','student_import',batch,jsonb_build_object('count',jsonb_array_length(result)),'นำเข้ารายชื่อนักเรียน');
  return result;
end; $$;
create function public.create_exam_draft(input jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant uuid := (input->>'school_id')::uuid; actor uuid := auth.uid(); created public.exams; version_id uuid := gen_random_uuid(); key_data jsonb; position integer := 0;
begin
  if actor is null or not public.has_school_role(tenant,array['admin','teacher']) then raise exception 'FORBIDDEN'; end if;
  if not (input ?& array['title','subject','classroom','examType','questionCount','choiceCount','year','term','passingPercent','answerKey'])
    or exists(select 1 from jsonb_each(input) where value='null'::jsonb) then raise exception 'INVALID_EXAM'; end if;
  if exists(select 1 from unnest(array['title','subject','classroom','examType']) field where jsonb_typeof(input->field) is distinct from 'string')
    or exists(select 1 from unnest(array['questionCount','choiceCount','year','term','passingPercent']) field where jsonb_typeof(input->field) is distinct from 'number') then raise exception 'INVALID_EXAM_TYPES'; end if;
  if (input->>'questionCount')::integer<>20 or (input->>'choiceCount')::integer<>4 or jsonb_typeof(input->'answerKey') is distinct from 'array' then raise exception 'INVALID_EXAM'; end if;
  if jsonb_array_length(input->'answerKey')<>20 then raise exception 'INVALID_EXAM'; end if;
  if length(btrim(input->>'title')) not between 3 and 120 or length(btrim(input->>'subject')) not between 1 and 80 or length(btrim(input->>'classroom')) not between 1 and 30 or input->>'examType' not in ('เก็บคะแนน','ก่อนเรียน','หลังเรียน','กลางภาค','ปลายภาค')
    or (input->>'year')::integer not between 2500 and 2700 or (input->>'term')::integer not between 1 and 3 or (input->>'passingPercent')::numeric not between 0 and 100 then raise exception 'INVALID_EXAM'; end if;
  insert into public.exams(school_id,title,created_by) values(tenant,btrim(input->>'title'),actor) returning * into created;
  insert into public.exam_versions(id,school_id,exam_id,version_no,config_json) values(version_id,tenant,created.id,1,input-'school_id');
  for key_data in select value from jsonb_array_elements(input->'answerKey') loop
    position:=position+1; if not (key_data ?& array['question','correct','points']) or (key_data->>'question')::integer is distinct from position then raise exception 'INVALID_QUESTION_ORDER'; end if;
    if jsonb_typeof(key_data->'question') is distinct from 'number' or jsonb_typeof(key_data->'correct') is distinct from 'string' or jsonb_typeof(key_data->'points') is distinct from 'number' then raise exception 'INVALID_KEY_TYPES'; end if;
    insert into public.answer_keys(school_id,exam_version_id,question_number,correct_option,points) values(tenant,version_id,position,key_data->>'correct',(key_data->>'points')::numeric);
  end loop;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,actor,'create_exam','exams','exam',created.id,jsonb_build_object('version_no',1,'question_count',20),'สร้างชุดสอบแบบร่าง');
  return jsonb_build_object('id',created.id,'created_at',created.created_at);
end; $$;
revoke all on function public.import_students(jsonb), public.create_exam_draft(jsonb) from public, anon;
grant execute on function public.import_students(jsonb), public.create_exam_draft(jsonb) to authenticated;

-- SOURCE: 202610080002_adaptive_answer_sheets.sql
-- Extend the installed foundation without rewriting previously published versions.
-- Apply after 202610080001_foundation.sql. No school/student data is seeded.
alter table public.answer_keys drop constraint answer_keys_question_number_check;
alter table public.answer_keys add constraint answer_keys_question_number_check check(question_number between 1 and 60);
alter table public.answer_keys drop constraint answer_keys_correct_option_check;
alter table public.answer_keys add constraint answer_keys_correct_option_check check(correct_option in ('A','B','C','D','E'));
create or replace function public.validate_exam_config(input jsonb) returns void language plpgsql set search_path=public as $$
declare key_data jsonb; position integer := 0; question_count integer; choice_count integer;
begin
  if not (input ?& array['title','subject','classroom','examType','questionCount','choiceCount','year','term','passingPercent','answerKey'])
    or exists(select 1 from jsonb_each(input) where value='null'::jsonb) then raise exception 'INVALID_EXAM'; end if;
  if exists(select 1 from unnest(array['title','subject','classroom','examType']) field where jsonb_typeof(input->field) is distinct from 'string')
    or exists(select 1 from unnest(array['questionCount','choiceCount','year','term','passingPercent']) field where jsonb_typeof(input->field) is distinct from 'number') then raise exception 'INVALID_EXAM_TYPES'; end if;
  if exists(select 1 from unnest(array['questionCount','choiceCount','year','term']) field where (input->>field)::numeric <> trunc((input->>field)::numeric)) then raise exception 'INVALID_INTEGER'; end if;
  question_count := (input->>'questionCount')::integer; choice_count := (input->>'choiceCount')::integer;
  if question_count not between 1 and 60 or choice_count not in (4,5) or jsonb_typeof(input->'answerKey') is distinct from 'array' then raise exception 'INVALID_EXAM'; end if;
  if jsonb_array_length(input->'answerKey')<>question_count then raise exception 'INVALID_EXAM'; end if;
  if length(btrim(input->>'title')) not between 3 and 120 or length(btrim(input->>'subject')) not between 1 and 80 or length(btrim(input->>'classroom')) not between 1 and 30 or input->>'examType' not in ('เก็บคะแนน','ก่อนเรียน','หลังเรียน','กลางภาค','ปลายภาค')
    or (input->>'year')::integer not between 2500 and 2700 or (input->>'term')::integer not between 1 and 3 or (input->>'passingPercent')::numeric not between 0 and 100 then raise exception 'INVALID_EXAM'; end if;
  for key_data in select value from jsonb_array_elements(input->'answerKey') loop
    position := position+1;
    if not (key_data ?& array['question','correct','points'])
      or jsonb_typeof(key_data->'question') is distinct from 'number'
      or jsonb_typeof(key_data->'correct') is distinct from 'string'
      or jsonb_typeof(key_data->'points') is distinct from 'number' then raise exception 'INVALID_KEY_TYPES'; end if;
    if (key_data->>'question')::numeric is distinct from position::numeric then raise exception 'INVALID_QUESTION_ORDER'; end if;
    if key_data->>'correct' not in ('A','B','C','D','E') or (choice_count=4 and key_data->>'correct'='E')
      or (key_data->>'points')::numeric not between 0 and 100 then raise exception 'INVALID_KEY'; end if;
  end loop;
end; $$;
revoke all on function public.validate_exam_config(jsonb) from public, anon, authenticated;
create or replace function public.create_exam_draft(input jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant uuid := (input->>'school_id')::uuid; actor uuid := auth.uid(); created public.exams; version_id uuid := gen_random_uuid(); key_data jsonb;
begin
  if actor is null or not public.has_school_role(tenant,array['admin','teacher']) then raise exception 'FORBIDDEN'; end if;
  perform public.validate_exam_config(input);
  insert into public.exams(school_id,title,created_by) values(tenant,btrim(input->>'title'),actor) returning * into created;
  insert into public.exam_versions(id,school_id,exam_id,version_no,config_json) values(version_id,tenant,created.id,1,input-'school_id');
  for key_data in select value from jsonb_array_elements(input->'answerKey') loop
    insert into public.answer_keys(school_id,exam_version_id,question_number,correct_option,points)
      values(tenant,version_id,(key_data->>'question')::integer,key_data->>'correct',(key_data->>'points')::numeric);
  end loop;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,actor,'create_exam','exams','exam',created.id,jsonb_build_object('version_no',1,'question_count',(input->>'questionCount')::integer),'สร้างชุดสอบแบบร่าง');
  return jsonb_build_object('id',created.id,'created_at',created.created_at);
end; $$;
create or replace function public.create_exam_version(input jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare tenant uuid := (input->>'school_id')::uuid; actor uuid := auth.uid(); target uuid := (input->>'exam_id')::uuid;
  owner_id uuid; current_version integer; next_version integer; version_id uuid := gen_random_uuid(); key_data jsonb; created_at timestamptz := now();
begin
  if actor is null or not public.has_school_role(tenant,array['admin','teacher']) then raise exception 'FORBIDDEN'; end if;
  select created_by into owner_id from public.exams where id=target and school_id=tenant and not archived for update;
  if not found or (owner_id<>actor and not public.has_school_role(tenant,array['admin'])) then raise exception 'FORBIDDEN'; end if;
  perform public.validate_exam_config(input);
  select max(version_no) into current_version from public.exam_versions where exam_id=target and set_code='A';
  if jsonb_typeof(input->'expected_version') is distinct from 'number' or (input->>'expected_version')::numeric is distinct from current_version::numeric then raise exception 'STALE_EXAM_VERSION'; end if;
  next_version := current_version+1;
  insert into public.exam_versions(id,school_id,exam_id,version_no,config_json)
    values(version_id,tenant,target,next_version,input-array['school_id','exam_id','expected_version']);
  for key_data in select value from jsonb_array_elements(input->'answerKey') loop
    insert into public.answer_keys(school_id,exam_version_id,question_number,correct_option,points)
      values(tenant,version_id,(key_data->>'question')::integer,key_data->>'correct',(key_data->>'points')::numeric);
  end loop;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,old_values,new_values,reason,display_message)
    values(tenant,actor,'update_answer_key','exams','exam_version',version_id,jsonb_build_object('version_no',current_version),
      jsonb_build_object('version_no',next_version,'question_count',(input->>'questionCount')::integer,'choice_count',(input->>'choiceCount')::integer),
      'บันทึกโครงข้อสอบเป็นเวอร์ชันใหม่','บันทึกโครงข้อสอบและเฉลยเป็นเวอร์ชันใหม่');
  return jsonb_build_object('id',target,'version',next_version,'created_at',created_at);
end; $$;
revoke all on function public.create_exam_version(jsonb) from public, anon;
grant execute on function public.create_exam_version(jsonb) to authenticated;

-- SOURCE: 202610080003_roster_school_logo.sql
-- Three-column student roster and immutable school-logo references.
-- Apply AFTER migrations 001 and 002. No cloud uploads or secret values here.
alter table public.students add column prefix text not null default ''
  check(prefix in ('','เด็กชาย','เด็กหญิง','นาย','นางสาว','น.ส.','ด.ช.','ด.ญ.'));
alter table public.students add column full_name text generated always as
  (prefix || first_name || ' ' || last_name) stored;
alter table public.students add column grade_level text generated always as
  (case when classroom_name ~ '^ม\.[1-6](/[1-9][0-9]?)?$' then left(classroom_name,3) else null end) stored;
alter table public.students add column room integer generated always as
  (case when classroom_name ~ '^ม\.[1-6]/[1-9][0-9]?$' then split_part(classroom_name,'/',2)::integer else null end) stored;
create index students_school_grade_room_idx on public.students(school_id,grade_level,room,student_code);
-- Unrecognized historic classroom names are preserved, not guessed or discarded.
create or replace function public.import_students(input jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare tenant uuid := (input->>'school_id')::uuid; actor uuid := auth.uid(); row_data jsonb;
  result jsonb := '[]'; new_row public.students; batch uuid := gen_random_uuid();
begin
  if actor is null or not public.has_school_role(tenant,array['admin','teacher']) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(input->'students') is distinct from 'array' then raise exception 'INVALID_IMPORT'; end if;
  if jsonb_array_length(input->'students') not between 1 and 2000 then raise exception 'INVALID_IMPORT'; end if;
  if jsonb_typeof(input->'filename') is distinct from 'string' or length(input->>'filename') not between 1 and 200 then raise exception 'INVALID_FILENAME'; end if;
  for row_data in select value from jsonb_array_elements(input->'students') loop
    if jsonb_typeof(row_data->'student_code') is distinct from 'string' then raise exception 'INVALID_STUDENT_CODE'; end if;
    if jsonb_typeof(row_data->'first_name') is distinct from 'string' or jsonb_typeof(row_data->'last_name') is distinct from 'string'
      or jsonb_typeof(row_data->'classroom_name') is distinct from 'string' then raise exception 'INVALID_STUDENT_FIELDS'; end if;
    if row_data ? 'prefix' and (jsonb_typeof(row_data->'prefix') is distinct from 'string'
      or row_data->>'prefix' not in ('','เด็กชาย','เด็กหญิง','นาย','นางสาว','น.ส.','ด.ช.','ด.ญ.')) then raise exception 'INVALID_PREFIX'; end if;
    if row_data->>'classroom_name' !~ '^ม\.[1-6](/[1-9][0-9]?)?$' then raise exception 'INVALID_CLASSROOM'; end if;
    if row_data ? 'number' and row_data->'number'<>'null'::jsonb then
      if jsonb_typeof(row_data->'number') is distinct from 'number' then raise exception 'INVALID_NUMBER'; end if;
      if (row_data->>'number')::numeric <> trunc((row_data->>'number')::numeric) then raise exception 'INVALID_NUMBER'; end if;
    end if;
    insert into public.students(school_id,student_code,prefix,first_name,last_name,classroom_name,number)
      values(tenant,row_data->>'student_code',coalesce(row_data->>'prefix',''),btrim(row_data->>'first_name'),
        btrim(row_data->>'last_name'),row_data->>'classroom_name',(row_data->>'number')::integer) returning * into new_row;
    result := result || jsonb_build_array(to_jsonb(new_row)-'school_id');
  end loop;
  insert into public.student_imports(id,school_id,uploaded_by,filename,success_count)
    values(batch,tenant,actor,input->>'filename',jsonb_array_length(result));
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,actor,'import_students','students','student_import',batch,
      jsonb_build_object('count',jsonb_array_length(result)),'นำเข้ารายชื่อนักเรียน');
  return result;
end; $$;
revoke all on function public.import_students(jsonb) from public, anon;
grant execute on function public.import_students(jsonb) to authenticated;
alter table public.schools add column logo_image_url text default '/omr-assets/school-logo.png';
alter table public.schools add column logo_image_public_id text;
alter table public.schools add column logo_revision uuid not null default gen_random_uuid();
alter table public.schools add constraint school_logo_pair check (
  (logo_image_public_id is null and (logo_image_url is null or logo_image_url='/omr-assets/school-logo.png')) or
  (logo_image_public_id is not null and logo_image_url ~ '^https://res\.cloudinary\.com/[^/]+/image/upload/fl_original/v[0-9]+/'));
create or replace function public.update_school_logo(input jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare tenant uuid := (input->>'school_id')::uuid; actor uuid := auth.uid(); before_row public.schools; after_row public.schools;
begin
  if actor is null or not public.has_school_role(tenant,array['admin','teacher']) then raise exception 'FORBIDDEN'; end if;
  select * into before_row from public.schools where id=tenant for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if before_row.logo_revision is distinct from (input->>'expected_revision')::uuid then raise exception 'STALE_LOGO'; end if;
  if jsonb_typeof(input->'image_url') is distinct from 'string' or jsonb_typeof(input->'image_public_id') is distinct from 'string'
    or length(input->>'image_url')>1000 or input->>'image_public_id' !~ ('^school-logos/' || tenant::text || '/[a-f0-9-]+$')
    or input->>'image_url' !~ ('^https://res\.cloudinary\.com/[a-zA-Z0-9_-]+/image/upload/fl_original/v[0-9]+/' || (input->>'image_public_id') || '\.(png|jpg|jpeg)$')
    then raise exception 'INVALID_LOGO'; end if;
  update public.schools set logo_image_url=input->>'image_url', logo_image_public_id=input->>'image_public_id',
    logo_revision=gen_random_uuid() where id=tenant returning * into after_row;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,old_values,new_values,display_message)
    values(tenant,actor,'update_school_logo','schools','school',tenant,
      jsonb_build_object('image_url',before_row.logo_image_url,'image_public_id',before_row.logo_image_public_id),
      jsonb_build_object('image_url',after_row.logo_image_url,'image_public_id',after_row.logo_image_public_id),'เปลี่ยนโลโก้เริ่มต้นสำหรับแม่แบบใหม่');
  -- Old assets are retained: printed manifests may still reference them.
  return jsonb_build_object('school',after_row.name_th,'image_url',after_row.logo_image_url,
    'image_public_id',after_row.logo_image_public_id,'revision',after_row.logo_revision);
end; $$;
revoke all on function public.update_school_logo(jsonb) from public, anon;
grant execute on function public.update_school_logo(jsonb) to authenticated;

-- SOURCE: 202610090004_accounts_storage.sql
-- Google identity is not permission. Only the configured verified Google identity
-- can claim owner, once. All other users remain pending until explicitly approved.
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

-- SOURCE: 202610090005_print_registry.sql
-- Private saved layouts and immutable, version-bound print registrations.
alter table public.exam_versions add constraint exam_versions_workspace_exam_id unique(school_id,exam_id,id);
create table public.omr_layouts (
  school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null,
  layout_json jsonb not null, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
  primary key(exam_version_id),
  foreign key(school_id,exam_id,exam_version_id) references public.exam_versions(school_id,exam_id,id)
);
create table public.omr_templates (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null,
  layout_hash text not null check(layout_hash ~ '^[a-f0-9]{64}$'),
  set_token text not null check(set_token ~ '^SAS2:[a-f0-9]{64}$'), identity_json text not null,
  layout_json jsonb not null, omr_json jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(school_id,exam_id,exam_version_id) references public.exam_versions(school_id,exam_id,id),
  unique(school_id,layout_hash), unique(set_token), unique(school_id,exam_id,exam_version_id,id)
);
create table public.print_jobs (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null, template_id uuid not null,
  request_id uuid not null, selection_json jsonb not null, sheet_count integer not null check(sheet_count between 1 and 200),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(school_id,exam_id,exam_version_id,template_id) references public.omr_templates(school_id,exam_id,exam_version_id,id),
  unique(school_id,request_id), unique(school_id,exam_id,exam_version_id,template_id,id)
);
create table public.omr_sheets (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null, template_id uuid not null, print_job_id uuid not null,
  student_id uuid, student_code varchar(5) check(student_code ~ '^[0-9]{5}$'), full_name text, classroom_name text, number integer,
  page_number integer not null check(page_number>0), slot integer not null check(slot in (0,1)),
  sheet_code text not null default gen_random_uuid()::text, status text not null default 'generated' check(status in ('generated','scanned','reviewed','void')),
  created_at timestamptz not null default now(),
  foreign key(school_id,exam_id,exam_version_id,template_id,print_job_id) references public.print_jobs(school_id,exam_id,exam_version_id,template_id,id),
  foreign key(school_id,student_id) references public.students(school_id,id),
  check((student_id is null and student_code is null and full_name is null and classroom_name is null) or
    (student_id is not null and student_code is not null and full_name is not null and classroom_name is not null)),
  unique(print_job_id,page_number,slot), unique(school_id,id), unique(sheet_code)
);
create index omr_templates_exam_version_idx on public.omr_templates(school_id,exam_id,exam_version_id);
create index print_jobs_workspace_time_idx on public.print_jobs(school_id,created_at desc);
create index omr_sheets_exam_student_idx on public.omr_sheets(school_id,exam_id,student_id);
create function private.prevent_print_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'PRINT_REGISTRY_IMMUTABLE'; end; $$;
revoke all on function private.prevent_print_mutation() from public,anon,authenticated;
create trigger immutable_omr_template before update or delete on public.omr_templates for each row execute function private.prevent_print_mutation();
create trigger immutable_print_job before update or delete on public.print_jobs for each row execute function private.prevent_print_mutation();
-- Future scan/review RPCs may advance status, but printed identity is immutable.
create function private.protect_sheet_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or to_jsonb(new)-'status' is distinct from to_jsonb(old)-'status' then raise exception 'PRINT_REGISTRY_IMMUTABLE'; end if;
  return new;
end; $$;
revoke all on function private.protect_sheet_identity() from public,anon,authenticated;
create trigger immutable_sheet_identity before update or delete on public.omr_sheets for each row execute function private.protect_sheet_identity();
alter table public.omr_layouts enable row level security;
alter table public.omr_templates enable row level security;
alter table public.print_jobs enable row level security;
alter table public.omr_sheets enable row level security;
revoke all on public.omr_layouts,public.omr_templates,public.print_jobs,public.omr_sheets from public,anon,authenticated;
grant select on public.omr_layouts,public.omr_templates,public.print_jobs,public.omr_sheets to authenticated;
create policy layout_read on public.omr_layouts for select to authenticated using(private.can_read_workspace(school_id));
create policy template_read on public.omr_templates for select to authenticated using(private.can_read_workspace(school_id));
create policy print_job_read on public.print_jobs for select to authenticated using(private.can_read_workspace(school_id));
create policy sheet_read on public.omr_sheets for select to authenticated using(private.can_read_workspace(school_id));

-- Unicode Mark ranges mirror the browser's /\p{M}/ width rule. The wrapper
-- counts combining marks at zero advance and spaces at 0.32 em.
create function private.is_print_mark(cp integer) returns boolean language sql immutable set search_path='' as $$
  select cp between 768 and 879
    or cp between 1155 and 1161
    or cp between 1425 and 1469
    or cp=1471
    or cp between 1473 and 1474
    or cp between 1476 and 1477
    or cp=1479
    or cp between 1552 and 1562
    or cp between 1611 and 1631
    or cp=1648
    or cp between 1750 and 1756
    or cp between 1759 and 1764
    or cp between 1767 and 1768
    or cp between 1770 and 1773
    or cp=1809
    or cp between 1840 and 1866
    or cp between 1958 and 1968
    or cp between 2027 and 2035
    or cp=2045
    or cp between 2070 and 2073
    or cp between 2075 and 2083
    or cp between 2085 and 2087
    or cp between 2089 and 2093
    or cp between 2137 and 2139
    or cp between 2199 and 2207
    or cp between 2250 and 2273
    or cp between 2275 and 2307
    or cp between 2362 and 2364
    or cp between 2366 and 2383
    or cp between 2385 and 2391
    or cp between 2402 and 2403
    or cp between 2433 and 2435
    or cp=2492
    or cp between 2494 and 2500
    or cp between 2503 and 2504
    or cp between 2507 and 2509
    or cp=2519
    or cp between 2530 and 2531
    or cp=2558
    or cp between 2561 and 2563
    or cp=2620
    or cp between 2622 and 2626
    or cp between 2631 and 2632
    or cp between 2635 and 2637
    or cp=2641
    or cp between 2672 and 2673
    or cp=2677
    or cp between 2689 and 2691
    or cp=2748
    or cp between 2750 and 2757
    or cp between 2759 and 2761
    or cp between 2763 and 2765
    or cp between 2786 and 2787
    or cp between 2810 and 2815
    or cp between 2817 and 2819
    or cp=2876
    or cp between 2878 and 2884
    or cp between 2887 and 2888
    or cp between 2891 and 2893
    or cp between 2901 and 2903
    or cp between 2914 and 2915
    or cp=2946
    or cp between 3006 and 3010
    or cp between 3014 and 3016
    or cp between 3018 and 3021
    or cp=3031
    or cp between 3072 and 3076
    or cp=3132
    or cp between 3134 and 3140
    or cp between 3142 and 3144
    or cp between 3146 and 3149
    or cp between 3157 and 3158
    or cp between 3170 and 3171
    or cp between 3201 and 3203
    or cp=3260
    or cp between 3262 and 3268
    or cp between 3270 and 3272
    or cp between 3274 and 3277
    or cp between 3285 and 3286
    or cp between 3298 and 3299
    or cp=3315
    or cp between 3328 and 3331
    or cp between 3387 and 3388
    or cp between 3390 and 3396
    or cp between 3398 and 3400
    or cp between 3402 and 3405
    or cp=3415
    or cp between 3426 and 3427
    or cp between 3457 and 3459
    or cp=3530
    or cp between 3535 and 3540
    or cp=3542
    or cp between 3544 and 3551
    or cp between 3570 and 3571
    or cp=3633
    or cp between 3636 and 3642
    or cp between 3655 and 3662
    or cp=3761
    or cp between 3764 and 3772
    or cp between 3784 and 3790
    or cp between 3864 and 3865
    or cp=3893
    or cp=3895
    or cp=3897
    or cp between 3902 and 3903
    or cp between 3953 and 3972
    or cp between 3974 and 3975
    or cp between 3981 and 3991
    or cp between 3993 and 4028
    or cp=4038
    or cp between 4139 and 4158
    or cp between 4182 and 4185
    or cp between 4190 and 4192
    or cp between 4194 and 4196
    or cp between 4199 and 4205
    or cp between 4209 and 4212
    or cp between 4226 and 4237
    or cp=4239
    or cp between 4250 and 4253
    or cp between 4957 and 4959
    or cp between 5906 and 5909
    or cp between 5938 and 5940
    or cp between 5970 and 5971
    or cp between 6002 and 6003
    or cp between 6068 and 6099
    or cp=6109
    or cp between 6155 and 6157
    or cp=6159
    or cp between 6277 and 6278
    or cp=6313
    or cp between 6432 and 6443
    or cp between 6448 and 6459
    or cp between 6679 and 6683
    or cp between 6741 and 6750
    or cp between 6752 and 6780
    or cp=6783
    or cp between 6832 and 6862
    or cp between 6912 and 6916
    or cp between 6964 and 6980
    or cp between 7019 and 7027
    or cp between 7040 and 7042
    or cp between 7073 and 7085
    or cp between 7142 and 7155
    or cp between 7204 and 7223
    or cp between 7376 and 7378
    or cp between 7380 and 7400
    or cp=7405
    or cp=7412
    or cp between 7415 and 7417
    or cp between 7616 and 7679
    or cp between 8400 and 8432
    or cp between 11503 and 11505
    or cp=11647
    or cp between 11744 and 11775
    or cp between 12330 and 12335
    or cp between 12441 and 12442
    or cp between 42607 and 42610
    or cp between 42612 and 42621
    or cp between 42654 and 42655
    or cp between 42736 and 42737
    or cp=43010
    or cp=43014
    or cp=43019
    or cp between 43043 and 43047
    or cp=43052
    or cp between 43136 and 43137
    or cp between 43188 and 43205
    or cp between 43232 and 43249
    or cp=43263
    or cp between 43302 and 43309
    or cp between 43335 and 43347
    or cp between 43392 and 43395
    or cp between 43443 and 43456
    or cp=43493
    or cp between 43561 and 43574
    or cp=43587
    or cp between 43596 and 43597
    or cp between 43643 and 43645
    or cp=43696
    or cp between 43698 and 43700
    or cp between 43703 and 43704
    or cp between 43710 and 43711
    or cp=43713
    or cp between 43755 and 43759
    or cp between 43765 and 43766
    or cp between 44003 and 44010
    or cp between 44012 and 44013
    or cp=64286
    or cp between 65024 and 65039
    or cp between 65056 and 65071
    or cp=66045
    or cp=66272
    or cp between 66422 and 66426
    or cp between 68097 and 68099
    or cp between 68101 and 68102
    or cp between 68108 and 68111
    or cp between 68152 and 68154
    or cp=68159
    or cp between 68325 and 68326
    or cp between 68900 and 68903
    or cp between 68969 and 68973
    or cp between 69291 and 69292
    or cp between 69372 and 69375
    or cp between 69446 and 69456
    or cp between 69506 and 69509
    or cp between 69632 and 69634
    or cp between 69688 and 69702
    or cp=69744
    or cp between 69747 and 69748
    or cp between 69759 and 69762
    or cp between 69808 and 69818
    or cp=69826
    or cp between 69888 and 69890
    or cp between 69927 and 69940
    or cp between 69957 and 69958
    or cp=70003
    or cp between 70016 and 70018
    or cp between 70067 and 70080
    or cp between 70089 and 70092
    or cp between 70094 and 70095
    or cp between 70188 and 70199
    or cp=70206
    or cp=70209
    or cp between 70367 and 70378
    or cp between 70400 and 70403
    or cp between 70459 and 70460
    or cp between 70462 and 70468
    or cp between 70471 and 70472
    or cp between 70475 and 70477
    or cp=70487
    or cp between 70498 and 70499
    or cp between 70502 and 70508
    or cp between 70512 and 70516
    or cp between 70584 and 70592
    or cp=70594
    or cp=70597
    or cp between 70599 and 70602
    or cp between 70604 and 70608
    or cp=70610
    or cp between 70625 and 70626
    or cp between 70709 and 70726
    or cp=70750
    or cp between 70832 and 70851
    or cp between 71087 and 71093
    or cp between 71096 and 71104
    or cp between 71132 and 71133
    or cp between 71216 and 71232
    or cp between 71339 and 71351
    or cp between 71453 and 71467
    or cp between 71724 and 71738
    or cp between 71984 and 71989
    or cp between 71991 and 71992
    or cp between 71995 and 71998
    or cp=72000
    or cp between 72002 and 72003
    or cp between 72145 and 72151
    or cp between 72154 and 72160
    or cp=72164
    or cp between 72193 and 72202
    or cp between 72243 and 72249
    or cp between 72251 and 72254
    or cp=72263
    or cp between 72273 and 72283
    or cp between 72330 and 72345
    or cp between 72751 and 72758
    or cp between 72760 and 72767
    or cp between 72850 and 72871
    or cp between 72873 and 72886
    or cp between 73009 and 73014
    or cp=73018
    or cp between 73020 and 73021
    or cp between 73023 and 73029
    or cp=73031
    or cp between 73098 and 73102
    or cp between 73104 and 73105
    or cp between 73107 and 73111
    or cp between 73459 and 73462
    or cp between 73472 and 73473
    or cp=73475
    or cp between 73524 and 73530
    or cp between 73534 and 73538
    or cp=73562
    or cp=78912
    or cp between 78919 and 78933
    or cp between 90398 and 90415
    or cp between 92912 and 92916
    or cp between 92976 and 92982
    or cp=94031
    or cp between 94033 and 94087
    or cp between 94095 and 94098
    or cp=94180
    or cp between 94192 and 94193
    or cp between 113821 and 113822
    or cp between 118528 and 118573
    or cp between 118576 and 118598
    or cp between 119141 and 119145
    or cp between 119149 and 119154
    or cp between 119163 and 119170
    or cp between 119173 and 119179
    or cp between 119210 and 119213
    or cp between 119362 and 119364
    or cp between 121344 and 121398
    or cp between 121403 and 121452
    or cp=121461
    or cp=121476
    or cp between 121499 and 121503
    or cp between 121505 and 121519
    or cp between 122880 and 122886
    or cp between 122888 and 122904
    or cp between 122907 and 122913
    or cp between 122915 and 122916
    or cp between 122918 and 122922
    or cp=123023
    or cp between 123184 and 123190
    or cp=123566
    or cp between 123628 and 123631
    or cp between 124140 and 124143
    or cp between 124398 and 124399
    or cp between 125136 and 125142
    or cp between 125252 and 125258
    or cp between 917760 and 917999;
$$;
revoke all on function private.is_print_mark(integer) from public,anon,authenticated;
create function private.print_line_count(value text, width double precision, size double precision) returns integer
language plpgsql immutable set search_path='' as $$
declare i integer; character text; used double precision:=0; weight double precision; chars integer:=0; lines integer:=0;
begin
  for i in 1..length(value) loop
    character:=substr(value,i,1);
    weight:=case when private.is_print_mark(ascii(character)) then 0 when character=' ' then 0.32 else 1 end;
    if character=chr(10) or (used+size*weight>width and chars>0) then
      lines:=lines+1; used:=0; chars:=0;
      if character=chr(10) then continue; end if;
    end if;
    used:=used+size*weight; chars:=chars+1;
  end loop;
  if chars>0 or lines=0 then lines:=lines+1; end if;
  return lines;
end; $$;
revoke all on function private.print_line_count(text,double precision,double precision) from public,anon,authenticated;
create function private.validate_print_text_fit(layout jsonb) returns void language plpgsql immutable set search_path='' as $$
declare width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end;
begin
  if private.print_line_count(layout->>'school',width-72.5,3.3)>2
    or private.print_line_count(layout->>'title',width-72.5,3.3)>2
    or private.print_line_count('วิชา '||(layout->>'subject')||' · '||(layout->>'examType')||' · ชั้น '||(layout->>'classroom'),width-57,2.8)>2
    or private.print_line_count(layout->>'instructions',width-24,2.6)>2 then
    raise exception 'PRINT_TEXT_DOES_NOT_FIT';
  end if;
end; $$;
revoke all on function private.validate_print_text_fit(jsonb) from public,anon,authenticated;

create function private.validate_print_layout(tenant uuid, layout jsonb) returns public.exam_versions
language plpgsql security definer set search_path='' as $$
declare version_row public.exam_versions; config jsonb; field text; score numeric;
begin
  if jsonb_typeof(layout) is distinct from 'object' or not (layout ?& array['schemaVersion','school','title','subject','classroom','year','term','instructions','headerOffsetMm','logo','questionCount','choiceCount','paperMode','examId','examVersion','examType','totalScore','answerKeySignature'])
    or exists(select 1 from jsonb_object_keys(layout) k where k not in ('schemaVersion','school','title','subject','classroom','year','term','instructions','headerOffsetMm','logo','questionCount','choiceCount','paperMode','examId','examVersion','examType','totalScore','answerKeySignature'))
    then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  foreach field in array array['school','title','subject','classroom','instructions','paperMode','examId','examType','answerKeySignature'] loop
    if jsonb_typeof(layout->field) is distinct from 'string' then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  end loop;
  foreach field in array array['schemaVersion','year','term','headerOffsetMm','questionCount','choiceCount','examVersion','totalScore'] loop
    if jsonb_typeof(layout->field) is distinct from 'number' then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  end loop;
  if layout->'logo' is distinct from 'null'::jsonb or layout->>'schemaVersion'<>'1'
    or layout->>'paperMode' not in ('auto','full') or length(layout->>'school') not between 1 and 60
    or length(layout->>'instructions')>140 or (layout->>'headerOffsetMm')::numeric not between 0 and 5
    then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  select * into version_row from public.exam_versions where school_id=tenant and exam_id=(layout->>'examId')::uuid
    and version_no::numeric=(layout->>'examVersion')::numeric and set_code='A';
  if not found then raise exception 'EXAM_VERSION_NOT_FOUND'; end if;
  config:=version_row.config_json;
  foreach field in array array['title','subject','classroom','year','term','questionCount','choiceCount','examType'] loop
    if layout->field is distinct from config->field then raise exception 'PRINT_EXAM_MISMATCH'; end if;
  end loop;
  select sum(points) into score from public.answer_keys where school_id=tenant and exam_version_id=version_row.id;
  if (layout->>'totalScore')::numeric is distinct from score or (layout->>'answerKeySignature')::jsonb is distinct from config->'answerKey'
    then raise exception 'PRINT_KEY_MISMATCH'; end if;
  return version_row;
end; $$;
revoke all on function private.validate_print_layout(uuid,jsonb) from public,anon,authenticated;

-- Exact object shape plus a small numeric tolerance bridges JS / PostgreSQL
-- floating point serialization; it does not allow arbitrary coordinates.
create function private.print_json_matches(actual jsonb, expected jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item record;
begin
  if jsonb_typeof(actual) is distinct from jsonb_typeof(expected) then return false; end if;
  if jsonb_typeof(expected)='number' then return abs((actual #>> '{}')::numeric-(expected #>> '{}')::numeric)<0.0000001; end if;
  if jsonb_typeof(expected)='object' then
    if (select count(*) from jsonb_object_keys(actual))<>(select count(*) from jsonb_object_keys(expected)) then return false; end if;
    for item in select key,value from jsonb_each(expected) loop
      if not private.print_json_matches(actual->item.key,item.value) then return false; end if;
    end loop; return true;
  end if;
  if jsonb_typeof(expected)='array' then
    if jsonb_array_length(actual)<>jsonb_array_length(expected) then return false; end if;
    for item in select value,ordinality from jsonb_array_elements(expected) with ordinality loop
      if not private.print_json_matches(actual->(item.ordinality::integer-1),item.value) then return false; end if;
    end loop; return true;
  end if;
  return actual=expected;
end; $$;
revoke all on function private.print_json_matches(jsonb,jsonb) from public,anon,authenticated;
create function private.expected_print_geometry(layout jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end;
  factor double precision; questions integer:=(layout->>'questionCount')::integer; options integer:=(layout->>'choiceCount')::integer;
  columns integer; rows integer; column_width double precision; q integer; o integer; d integer; v integer;
  x double precision; y double precision; blocks jsonb; ids jsonb:='[]'; answers jsonb:='[]'; labels jsonb:='[]'; values_json jsonb;
begin
  columns:=ceil(questions/16.0); rows:=ceil(questions::numeric/columns); column_width:=(width-12-59)/columns; factor:=900/width;
  if columns>floor((width-12-59)/((options-1)*5.5+3.6+12)) then raise exception 'INVALID_PRINT_GEOMETRY'; end if;
  for d in 0..4 loop
    labels:=labels||jsonb_build_array('student_code_'||(d+1));
    for v in 0..9 loop ids:=ids||jsonb_build_array(jsonb_build_object('x',15+d*5.5,'y',82+v*5.5,'digit',d,'value',v)); end loop;
  end loop;
  blocks:=jsonb_build_object('student_code',jsonb_build_object('fieldType','QTYPE_INT','fieldLabels',labels,'origin',jsonb_build_array((15-1.8)*factor,(82-1.8)*factor),'bubblesGap',5.5*factor,'labelsGap',5.5*factor));
  values_json:=case when options=4 then '["A","B","C","D"]'::jsonb else '["A","B","C","D","E"]'::jsonb end;
  for q in 1..questions loop
    x:=66+floor((q-1)::numeric/rows)*column_width;
    y:=82+((q-1)%rows)*6+floor(((q-1)%rows)/5.0)*1.5;
    blocks:=blocks||jsonb_build_object('answer_'||q,jsonb_build_object('bubbleValues',values_json,'direction','horizontal','fieldLabels',jsonb_build_array('q'||q),'origin',jsonb_build_array((x-1.8)*factor,(y-1.8)*factor),'bubblesGap',5.5*factor,'labelsGap',6*factor));
    for o in 0..options-1 loop answers:=answers||jsonb_build_array(jsonb_build_object('question',q,'option',o,'x',x+o*5.5,'y',y)); end loop;
  end loop;
  return jsonb_build_object('schemaVersion',1,'geometryVersion',2,'pageDimensions',jsonb_build_array(900,round(210*factor)),
    'bubbleDimensions',jsonb_build_array(3.6*factor,3.6*factor),'preProcessors','[]'::jsonb,'customLabels','{}'::jsonb,'emptyValue','',
    'fieldBlocks',blocks,'centersMm',jsonb_build_object('id',ids,'answers',answers));
end; $$;
revoke all on function private.expected_print_geometry(jsonb) from public,anon,authenticated;

create function public.save_omr_layout(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; layout jsonb:=input->'layout'; version_row public.exam_versions;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  version_row:=private.validate_print_layout(tenant,layout);
  insert into public.omr_layouts(school_id,exam_id,exam_version_id,layout_json,updated_by)
    values(tenant,version_row.exam_id,version_row.id,layout,auth.uid())
    on conflict(exam_version_id) do update set layout_json=excluded.layout_json,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,auth.uid(),'save_omr_layout','omr','exam_version',version_row.id,layout,'บันทึกรูปแบบกระดาษคำตอบ');
  return layout;
end; $$;
revoke all on function public.save_omr_layout(jsonb) from public,anon;
grant execute on function public.save_omr_layout(jsonb) to authenticated;

create function public.register_omr_print(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; request_uuid uuid:=(input->>'request_id')::uuid;
  serialized text:=input->>'identity_json'; snapshot jsonb; layout jsonb; version_row public.exam_versions;
  template_row public.omr_templates; job_row public.print_jobs; hash text; selection jsonb; selected_ids uuid[]; student_row public.students;
  amount integer; per_page integer; i integer; item jsonb; output_sheets jsonb;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if serialized is null or length(serialized)>200000 then raise exception 'INVALID_PRINT_IDENTITY'; end if;
  snapshot:=serialized::jsonb; layout:=snapshot->'layout';
  version_row:=private.validate_print_layout(tenant,layout);
  perform private.validate_print_text_fit(layout);
  if (select count(*) from jsonb_object_keys(snapshot))<>2 or not private.print_json_matches(snapshot->'omr',private.expected_print_geometry(layout)) then raise exception 'INVALID_PRINT_GEOMETRY'; end if;
  hash:=encode(sha256(convert_to(serialized,'UTF8')),'hex');
  if input ? 'student_ids' then
    if input ? 'blank_count' or jsonb_typeof(input->'student_ids') is distinct from 'array' then raise exception 'INVALID_PRINT_SELECTION'; end if;
    select array_agg(value::uuid order by ordinality) into selected_ids from jsonb_array_elements_text(input->'student_ids') with ordinality;
    amount:=coalesce(cardinality(selected_ids),0);
    if amount<>(select count(distinct id) from unnest(selected_ids) id) then raise exception 'DUPLICATE_PRINT_STUDENT'; end if;
    selection:=jsonb_build_object('student_ids',input->'student_ids');
  else
    if jsonb_typeof(input->'blank_count') is distinct from 'number' or (input->>'blank_count')::numeric<>trunc((input->>'blank_count')::numeric) then raise exception 'INVALID_PRINT_SELECTION'; end if;
    amount:=(input->>'blank_count')::integer; selection:=jsonb_build_object('blank_count',amount);
  end if;
  if amount not between 1 and 200 then raise exception 'INVALID_PRINT_SELECTION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(tenant::text||request_uuid::text,0));
  select * into job_row from public.print_jobs where school_id=tenant and request_id=request_uuid;
  if found then
    select * into template_row from public.omr_templates where id=job_row.template_id;
    if job_row.selection_json is distinct from selection or template_row.layout_hash<>hash then raise exception 'PRINT_REQUEST_CONFLICT'; end if;
  else
    -- Freeze the exam key/version as soon as paper is registered. Later edits
    -- create a new version; they cannot alter the key used by existing papers.
    if selected_ids is not null and exists(select 1 from unnest(selected_ids) selected(id) left join public.students s on s.id=selected.id and s.school_id=tenant
      where s.id is null or s.classroom_name is distinct from layout->>'classroom') then raise exception 'PRINT_STUDENT_NOT_IN_CLASS'; end if;
    select * into version_row from public.exam_versions where id=version_row.id for update;
    if version_row.published_at is null then update public.exam_versions set published_at=now(),content_hash=hash where id=version_row.id; end if;
    insert into public.omr_templates(school_id,exam_id,exam_version_id,layout_hash,set_token,identity_json,layout_json,omr_json,created_by)
      values(tenant,version_row.exam_id,version_row.id,hash,'SAS2:'||hash,serialized,layout,snapshot->'omr',auth.uid())
      on conflict(school_id,layout_hash) do nothing;
    select * into template_row from public.omr_templates where school_id=tenant and layout_hash=hash;
    insert into public.print_jobs(school_id,exam_id,exam_version_id,template_id,request_id,selection_json,sheet_count,created_by)
      values(tenant,version_row.exam_id,version_row.id,template_row.id,request_uuid,selection,amount,auth.uid()) returning * into job_row;
    per_page:=case when layout->>'paperMode'='full' then 1 else 2 end;
    for i in 1..amount loop
      if selected_ids is not null then
        select * into student_row from public.students where id=selected_ids[i] and school_id=tenant for share;
        if not found or student_row.classroom_name is distinct from layout->>'classroom' then raise exception 'PRINT_STUDENT_NOT_IN_CLASS'; end if;
        if private.print_line_count('ชื่อ–สกุล '||coalesce(student_row.prefix,'')||student_row.first_name||' '||student_row.last_name,
          (case when per_page=1 then 297 else 148.5 end)-24,2.8)>2 then raise exception 'PRINT_STUDENT_NAME_FIT'; end if;
      else student_row:=null; end if;
      insert into public.omr_sheets(school_id,exam_id,exam_version_id,template_id,print_job_id,student_id,student_code,full_name,classroom_name,number,page_number,slot)
        values(tenant,version_row.exam_id,version_row.id,template_row.id,job_row.id,student_row.id,student_row.student_code,
          case when student_row.id is null then null else coalesce(student_row.prefix,'')||student_row.first_name||' '||student_row.last_name end,
          student_row.classroom_name,student_row.number,((i-1)/per_page)+1,(i-1)%per_page);
    end loop;
    insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
      values(tenant,auth.uid(),'generate_omr_sheet','omr','print_job',job_row.id,jsonb_build_object('template_id',template_row.id,'sheet_count',amount,'personalized',selected_ids is not null),
        'ลงทะเบียนชุดกระดาษคำตอบและแม่แบบแบบไม่เปลี่ยนย้อนหลัง');
  end if;
  select jsonb_agg(jsonb_build_object('instanceId',s.id,'studentId',s.student_id,'studentCode',s.student_code,'fullName',s.full_name,'classroom',s.classroom_name,'number',s.number,'page',s.page_number,'slot',s.slot) order by s.page_number,s.slot)
    into output_sheets from public.omr_sheets s where s.print_job_id=job_row.id;
  return jsonb_build_object('jobId',job_row.id,'templateUuid',template_row.id,'layoutHash',template_row.layout_hash,'setToken',template_row.set_token,
    'layout',template_row.layout_json,'omr',template_row.omr_json,'sheets',output_sheets);
end; $$;
revoke all on function public.register_omr_print(jsonb) from public,anon;
grant execute on function public.register_omr_print(jsonb) to authenticated;

create table private.app_installation (
  version text primary key, applied_at timestamptz not null default now()
);
insert into private.app_installation(version) values('202610090005');
revoke all on private.app_installation from public,anon,authenticated;
notify pgrst, 'reload schema';

-- SOURCE: 202610090006_scanning_review.sql
-- Apply once after 005. Additive: never replaces student/exam/print data.
create table public.scan_uploads (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  request_id uuid not null, payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  original_path text not null, processed_path text not null,
  status text not null default 'staging' check(status in ('staging','complete','failed')),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(school_id,request_id), unique(school_id,id)
);
create table public.scan_records (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, upload_id uuid not null,
  exam_id uuid not null, exam_version_id uuid not null, template_id uuid not null,
  student_id uuid, sheet_id uuid, raw_student_code varchar(5), id_observations jsonb not null,
  slot integer not null check(slot in (0,1)), paper text not null check(paper in ('single','a4')),
  image_url text not null, image_public_id text not null,
  scan_status text not null default 'pending_review' check(scan_status in ('pending_review','confirmed','rejected')),
  revision integer not null default 1, created_by uuid not null references auth.users(id),
  confirmed_by uuid references auth.users(id), confirmed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(school_id,upload_id) references public.scan_uploads(school_id,id),
  foreign key(school_id,exam_id,exam_version_id,template_id) references public.omr_templates(school_id,exam_id,exam_version_id,id),
  foreign key(school_id,student_id) references public.students(school_id,id),
  foreign key(school_id,sheet_id) references public.omr_sheets(school_id,id),
  unique(upload_id,slot), unique(school_id,id)
);
create table public.detected_answers (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, scan_id uuid not null,
  question_number integer not null check(question_number between 1 and 60),
  detected_answer text check(detected_answer in ('A','B','C','D','E')),
  detection_status text not null check(detection_status in ('valid','blank','multiple','ambiguous','unreadable')),
  fills jsonb not null, confidence numeric not null check(confidence between 0 and 1),
  corrected_answer text check(corrected_answer in ('A','B','C','D','E')),
  manually_corrected boolean not null default false, correction_reason text,
  corrected_by uuid references auth.users(id), corrected_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(school_id,scan_id) references public.scan_records(school_id,id), unique(scan_id,question_number)
);
create table public.exam_results (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, scan_id uuid not null unique,
  exam_id uuid not null, exam_version_id uuid not null, student_id uuid,
  score numeric not null default 0, max_score numeric not null default 0, percent numeric not null default 0,
  correct_count integer not null default 0, blank_count integer not null default 0,
  multiple_count integer not null default 0, uncertain_count integer not null default 0,
  passed boolean not null default false, status text not null default 'pending_review' check(status in ('pending_review','confirmed','rejected')),
  confirmed_by uuid references auth.users(id), confirmed_at timestamptz, updated_at timestamptz not null default now(),
  foreign key(school_id,scan_id) references public.scan_records(school_id,id),
  foreign key(school_id,exam_id,exam_version_id) references public.exam_versions(school_id,exam_id,id),
  foreign key(school_id,student_id) references public.students(school_id,id)
);
create unique index one_active_student_result on public.exam_results(school_id,exam_id,student_id) where student_id is not null and status<>'rejected';
create table public.answer_evaluations (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, scan_id uuid not null,
  question_number integer not null, effective_answer text, effective_state text not null,
  correct_answer text not null, awarded numeric not null, max_points numeric not null,
  foreign key(school_id,scan_id) references public.scan_records(school_id,id), unique(scan_id,question_number)
);
create table public.export_jobs (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  created_by uuid not null references auth.users(id), format text not null check(format in ('csv','xlsx','pdf')),
  scan_ids jsonb not null, created_at timestamptz not null default now()
);
create index scan_records_queue_idx on public.scan_records(school_id,scan_status,created_at desc);
create index scan_uploads_cleanup_idx on public.scan_uploads(school_id,status,created_at);
create index results_exam_idx on public.exam_results(school_id,exam_id,status);
do $$ declare name text; begin
  foreach name in array array['scan_uploads','scan_records','detected_answers','exam_results','answer_evaluations','export_jobs'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant select on public.%I to authenticated',name);
    execute format('create policy workspace_read on public.%I for select to authenticated using(private.can_read_workspace(school_id))',name);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('scan-images','scan-images',false,2000000,array['image/jpeg']) on conflict(id) do nothing;
create policy scan_image_read on storage.objects for select to authenticated using(bucket_id='scan-images'
  and exists(select 1 from public.scan_uploads u where (name=u.original_path or name=u.processed_path) and private.can_read_workspace(u.school_id)));
create policy scan_image_insert on storage.objects for insert to authenticated with check(bucket_id='scan-images'
  and exists(select 1 from public.scan_uploads u where (name=u.original_path or name=u.processed_path) and u.status='staging' and private.owns_workspace(u.school_id)));
create policy scan_image_cleanup on storage.objects for delete to authenticated using(bucket_id='scan-images'
  and exists(select 1 from public.scan_uploads u where (name=u.original_path or name=u.processed_path) and u.status in ('staging','failed') and private.owns_workspace(u.school_id)));

create function public.reserve_scan_upload(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; request_uuid uuid:=(input->>'request_id')::uuid; row public.scan_uploads; root text;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if input->>'payload_hash' is null or input->>'payload_hash' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_SCAN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(tenant::text||request_uuid::text,0));
  select * into row from public.scan_uploads where school_id=tenant and request_id=request_uuid for update;
  if found then
    if row.payload_hash<>input->>'payload_hash' then raise exception 'SCAN_REQUEST_CONFLICT'; end if;
    if row.status='failed' then update public.scan_uploads set status='staging' where id=row.id returning * into row; end if;
  else
    root:=tenant::text||'/'||request_uuid::text;
    insert into public.scan_uploads(school_id,request_id,payload_hash,original_path,processed_path,created_by)
      values(tenant,request_uuid,input->>'payload_hash',root||'/original.jpg',root||'/processed.jpg',auth.uid()) returning * into row;
  end if;
  return to_jsonb(row);
end; $$;

create function public.fail_scan_upload(input jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.owns_workspace((input->>'school_id')::uuid) then raise exception 'FORBIDDEN'; end if;
  update public.scan_uploads set status='failed' where school_id=(input->>'school_id')::uuid and id=(input->>'upload_id')::uuid and status='staging';
end; $$;

create function private.recalculate_scan(target uuid) returns void language plpgsql security definer set search_path='' as $$
declare row public.scan_records; config jsonb;
begin
  select * into row from public.scan_records where id=target for update;
  if row.scan_status<>'pending_review' then raise exception 'RESULT_LOCKED'; end if;
  select config_json into config from public.exam_versions where id=row.exam_version_id;
  insert into public.answer_evaluations(school_id,scan_id,question_number,effective_answer,effective_state,correct_answer,awarded,max_points)
    select row.school_id,row.id,k.question_number,
      case when d.manually_corrected then d.corrected_answer else d.detected_answer end,
      case when d.manually_corrected then case when d.corrected_answer is null then 'blank' else 'valid' end else d.detection_status end,
      k.correct_option,
      case when (d.manually_corrected or d.detection_status='valid') and (case when d.manually_corrected then d.corrected_answer else d.detected_answer end)=k.correct_option then k.points else 0 end,k.points
    from public.answer_keys k join public.detected_answers d on d.scan_id=row.id and d.question_number=k.question_number
    where k.exam_version_id=row.exam_version_id
    on conflict(scan_id,question_number) do update set effective_answer=excluded.effective_answer,effective_state=excluded.effective_state,awarded=excluded.awarded;
  update public.exam_results r set score=a.score,max_score=a.maximum,
    percent=case when a.maximum=0 then 0 else a.score/a.maximum*100 end,
    correct_count=a.correct,blank_count=a.blank,multiple_count=a.multiple,uncertain_count=a.uncertain,
    passed=case when a.maximum=0 then false else a.score/a.maximum*100 >= (config->>'passingPercent')::numeric end,updated_at=now()
    from (select coalesce(sum(awarded),0) score,coalesce(sum(max_points),0) maximum,
      count(*) filter(where effective_state='valid' and effective_answer=correct_answer) correct,
      count(*) filter(where effective_state='blank') blank,count(*) filter(where effective_state='multiple') multiple,
      count(*) filter(where effective_state in ('ambiguous','unreadable')) uncertain
      from public.answer_evaluations where scan_id=row.id) a where r.scan_id=row.id;
end; $$;
revoke all on function private.recalculate_scan(uuid) from public,anon,authenticated;

create function public.save_scan_batch(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; upload public.scan_uploads; item jsonb; answer jsonb; template public.omr_templates;
  version_row public.exam_versions; student public.students; existing public.exam_results; scan public.scan_records; sheet_uuid uuid;
  code text; choice text; state text; q integer; amount integer; output jsonb:='[]'; seen text[]:='{}'; record_key text;
  replacement boolean:=coalesce((input->>'replace_pending')::boolean,false);
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  select * into upload from public.scan_uploads where id=(input->>'upload_id')::uuid and school_id=tenant for update;
  if not found then raise exception 'SCAN_UPLOAD_NOT_FOUND'; end if;
  if upload.status='complete' then
    select jsonb_agg(jsonb_build_object('id',s.id,'studentCode',st.student_code,'name',coalesce(st.prefix,'')||st.first_name||' '||st.last_name,'score',r.score,'maxScore',r.max_score) order by s.slot)
      into output from public.scan_records s join public.exam_results r on r.scan_id=s.id left join public.students st on st.id=s.student_id where s.upload_id=upload.id;
    return output;
  end if;
  if upload.status<>'staging' or not exists(select 1 from storage.objects where bucket_id='scan-images' and name=upload.original_path)
    or not exists(select 1 from storage.objects where bucket_id='scan-images' and name=upload.processed_path) then raise exception 'SCAN_IMAGES_MISSING'; end if;
  if jsonb_typeof(input->'records') is distinct from 'array' or jsonb_array_length(input->'records') not between 1 and 2 then raise exception 'INVALID_SCAN'; end if;
  if input->>'paper' is null or input->>'paper' not in ('single','a4') then raise exception 'INVALID_SCAN'; end if;
  if replacement and length(trim(coalesce(input->>'reason','')))<3 then raise exception 'REASON_REQUIRED'; end if;
  -- Lock the workspace/exam before duplicate checks, including concurrent scans.
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  for item in select value from jsonb_array_elements(input->'records') loop
    select * into template from public.omr_templates where school_id=tenant and set_token=item->>'token';
    if not found then raise exception 'QR_NOT_REGISTERED'; end if;
    select * into version_row from public.exam_versions where id=template.exam_version_id;
    code:=item->>'student_code'; student:=null; sheet_uuid:=null;
    if item->>'slot' is null or item->>'slot' not in ('0','1') then raise exception 'INVALID_SCAN'; end if;
    if code is not null and code !~ '^[0-9]{5}$' then raise exception 'INVALID_STUDENT_CODE'; end if;
    record_key:=template.exam_id::text||':'||coalesce(code,'unknown-'||(item->>'slot'));
    if record_key=any(seen) then raise exception 'DUPLICATE_SCAN'; end if;
    seen:=array_append(seen,record_key);
    if code is not null then
      select * into student from public.students st where st.school_id=tenant and st.student_code=code
        and (st.classroom_name=version_row.config_json->>'classroom' or exists(select 1 from public.omr_sheets os where os.template_id=template.id and os.student_id=st.id and os.student_code=code));
    end if;
    if student.id is not null then
      select * into existing from public.exam_results where school_id=tenant and exam_id=template.exam_id and student_id=student.id and status<>'rejected' for update;
      if found then
        if existing.status='confirmed' then raise exception 'CONFIRMED_RESULT_EXISTS'; end if;
        if not replacement then raise exception 'DUPLICATE_SCAN'; end if;
        update public.scan_records set scan_status='rejected',revision=revision+1,updated_at=now() where id=existing.scan_id;
        update public.exam_results set status='rejected',updated_at=now() where id=existing.id;
        insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,reason,display_message,severity)
          values(tenant,auth.uid(),'duplicate_scan_detected','scan','scan_record',existing.scan_id,input->>'reason','แทนที่ผลสแกนที่ยังไม่ยืนยันโดยครูเลือกเอง','warning');
      end if;
      select id into sheet_uuid from public.omr_sheets where template_id=template.id and student_id=student.id and student_code=code order by created_at desc,id limit 1;
    end if;
    amount:=(version_row.config_json->>'questionCount')::integer;
    if jsonb_typeof(item->'answers') is distinct from 'array' or jsonb_array_length(item->'answers')<>amount
      or (select count(distinct (a->>'question')::integer) from jsonb_array_elements(item->'answers') a)<>amount
      or jsonb_typeof(item->'digits') is distinct from 'array' or jsonb_array_length(item->'digits')<>5 then raise exception 'INVALID_OBSERVATIONS'; end if;
    if exists(select 1 from jsonb_array_elements(item->'digits') d where d->>'digit' is null or d->>'digit' not in ('0','1','2','3','4')
      or d->>'state' is null or d->>'state' not in ('valid','blank','multiple','ambiguous','unreadable')
      or (d->>'state'='valid' and (d->>'value' is null or d->>'value' !~ '^[0-9]$'))
      or (d->>'state'<>'valid' and d->>'value' is not null)
      or jsonb_typeof(d->'fills') is distinct from 'array' or jsonb_array_length(d->'fills')<>10
      or exists(select 1 from jsonb_array_elements(d->'fills') f where jsonb_typeof(f)<>'number' or (f#>>'{}')::numeric not between 0 and 100))
      or (select count(distinct d->>'digit') from jsonb_array_elements(item->'digits') d)<>5 then raise exception 'INVALID_OBSERVATIONS'; end if;
    if code is distinct from (select case when bool_and(d->>'state'='valid') then string_agg(d->>'value','' order by (d->>'digit')::integer) else null end from jsonb_array_elements(item->'digits') d)
      then raise exception 'INVALID_OBSERVATIONS'; end if;
    insert into public.scan_records(school_id,upload_id,exam_id,exam_version_id,template_id,student_id,sheet_id,raw_student_code,id_observations,slot,paper,image_url,image_public_id,created_by)
      values(tenant,upload.id,template.exam_id,template.exam_version_id,template.id,student.id,sheet_uuid,code,item->'digits',(item->>'slot')::integer,input->>'paper',upload.original_path,upload.processed_path,auth.uid()) returning * into scan;
    for answer in select value from jsonb_array_elements(item->'answers') loop
      q:=(answer->>'question')::integer; choice:=answer->>'choice'; state:=answer->>'state';
      if q is null or answer->>'question' !~ '^[0-9]+$' or q not between 1 and amount or state is null or state not in ('valid','blank','multiple','ambiguous','unreadable')
        or (choice is not null and choice not in ('A','B','C','D','E'))
        or (choice='E' and version_row.config_json->>'choiceCount'='4') or (state='valid' and choice is null)
        or jsonb_typeof(answer->'fills') is distinct from 'array' or jsonb_array_length(answer->'fills')<>(version_row.config_json->>'choiceCount')::integer
        or exists(select 1 from jsonb_array_elements(answer->'fills') f where jsonb_typeof(f)<>'number' or (f#>>'{}')::numeric not between 0 and 100)
        then raise exception 'INVALID_OBSERVATIONS'; end if;
      insert into public.detected_answers(school_id,scan_id,question_number,detected_answer,detection_status,fills,confidence)
        values(tenant,scan.id,q,choice,state,answer->'fills',(answer->>'confidence')::numeric);
    end loop;
    insert into public.exam_results(school_id,scan_id,exam_id,exam_version_id,student_id) values(tenant,scan.id,scan.exam_id,scan.exam_version_id,student.id);
    perform private.recalculate_scan(scan.id);
    update public.omr_sheets set status='scanned' where id=sheet_uuid and status='generated';
    insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
      values(tenant,auth.uid(),'upload_scan','scan','scan_record',scan.id,jsonb_build_object('template',template.id,'raw_student_code',code,'slot',scan.slot),'บันทึกภาพสแกนในพื้นที่ส่วนตัว');
    insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
      values(tenant,auth.uid(),'auto_grade','grading','scan_record',scan.id,jsonb_build_object('status','pending_review'),'คำนวณคะแนนจากเฉลยเวอร์ชันที่พิมพ์ รอครูตรวจสอบ');
    select output||jsonb_build_array(jsonb_build_object('id',scan.id,'studentCode',student.student_code,'name',coalesce(student.prefix,'')||student.first_name||' '||student.last_name,'score',r.score,'maxScore',r.max_score))
      into output from public.exam_results r where r.scan_id=scan.id;
  end loop;
  update public.scan_uploads set status='complete' where id=upload.id;
  return output;
end; $$;

create function public.review_scan(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; row public.scan_records; action text:=input->>'action'; reason text:=trim(coalesce(input->>'reason',''));
  before_value jsonb; student public.students; config jsonb; q integer; choice text; old_answer public.detected_answers;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into row from public.scan_records where id=(input->>'scanId')::uuid and school_id=tenant for update;
  if not found then raise exception 'SCAN_NOT_FOUND'; end if;
  if input->>'revision' is null or row.revision<>(input->>'revision')::integer then raise exception 'STALE_REVIEW'; end if;
  if row.scan_status<>'pending_review' then raise exception 'RESULT_LOCKED'; end if;
  if action<>'confirm' and length(reason)<3 then raise exception 'REASON_REQUIRED'; end if;
  select config_json into config from public.exam_versions where id=row.exam_version_id;
  before_value:=to_jsonb(row);
  if action='correct' then
    q:=(input->>'question')::integer; choice:=input->>'choice';
    if q is null or input->>'question' !~ '^[0-9]+$' or q not between 1 and (config->>'questionCount')::integer or (choice is not null and choice not in ('A','B','C','D','E')) or (choice='E' and config->>'choiceCount'='4')
      or not (input ? 'choice') then raise exception 'INVALID_CORRECTION'; end if;
    select * into old_answer from public.detected_answers where scan_id=row.id and question_number=q;
    if not found then raise exception 'INVALID_CORRECTION'; end if;
    update public.detected_answers set corrected_answer=choice,manually_corrected=true,correction_reason=reason,corrected_by=auth.uid(),corrected_at=now() where id=old_answer.id;
    before_value:=to_jsonb(old_answer);
    perform private.recalculate_scan(row.id);
  elsif action='identify' then
    if input->>'studentCode' is null or input->>'studentCode' !~ '^[0-9]{5}$' then raise exception 'INVALID_STUDENT_CODE'; end if;
    select * into student from public.students st where st.school_id=tenant and st.student_code=input->>'studentCode'
      and (st.classroom_name=config->>'classroom' or exists(select 1 from public.omr_sheets os where os.template_id=row.template_id and os.student_id=st.id));
    if not found then raise exception 'STUDENT_NOT_IN_EXAM'; end if;
    if exists(select 1 from public.exam_results where school_id=tenant and exam_id=row.exam_id and student_id=student.id and status<>'rejected' and scan_id<>row.id) then raise exception 'DUPLICATE_SCAN'; end if;
    update public.scan_records set student_id=student.id,sheet_id=(select id from public.omr_sheets where template_id=row.template_id and student_id=student.id order by created_at desc,id limit 1) where id=row.id;
    update public.exam_results set student_id=student.id where scan_id=row.id;
  elsif action='confirm' then
    if row.student_id is null then raise exception 'IDENTITY_REQUIRED'; end if;
    perform private.recalculate_scan(row.id);
    if (select count(*) from public.answer_evaluations where scan_id=row.id)<>(config->>'questionCount')::integer
      or exists(select 1 from public.answer_evaluations where scan_id=row.id and effective_state in ('ambiguous','unreadable')) then raise exception 'UNRESOLVED_ANSWERS'; end if;
    update public.exam_results set status='confirmed',confirmed_by=auth.uid(),confirmed_at=now() where scan_id=row.id;
    update public.scan_records set scan_status='confirmed',confirmed_by=auth.uid(),confirmed_at=now() where id=row.id;
    update public.omr_sheets set status='reviewed' where id=row.sheet_id;
  elsif action='reject' then
    update public.exam_results set status='rejected',updated_at=now() where scan_id=row.id;
    update public.scan_records set scan_status='rejected' where id=row.id;
  else raise exception 'INVALID_REVIEW_ACTION'; end if;
  update public.scan_records set revision=revision+1,updated_at=now() where id=row.id returning * into row;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,old_values,new_values,reason,display_message)
    values(tenant,auth.uid(),case action when 'correct' then 'manual_correct_answer' when 'identify' then 'manual_correct_student' when 'confirm' then 'confirm_result' else 'reject_scan' end,
      'review','scan_record',row.id,before_value,input,nullif(reason,''),case action when 'correct' then 'แก้คำตอบและคำนวณคะแนนใหม่' when 'identify' then 'ตรวจและระบุตัวนักเรียน' when 'confirm' then 'ครูยืนยันคะแนน' else 'ครูปฏิเสธภาพสแกน' end);
  return to_jsonb(row);
end; $$;

create function public.get_scan_reviews(tenant uuid, exam_filter uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.can_read_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(item order by created_at desc) from (
    select s.created_at,jsonb_build_object('id',s.id,'examId',s.exam_id,'examVersion',v.version_no,
      'studentCode',coalesce(st.student_code,''),'name',case when st.id is null then 'ยังไม่ระบุนักเรียน' else coalesce(st.prefix,'')||st.first_name||' '||st.last_name end,
      'classroom',coalesce(st.classroom_name,v.config_json->>'classroom'),'number',st.number,
      'reason',case when st.id is null then 'ตรวจรหัสนักเรียน' when r.uncertain_count>0 then 'มีคำตอบที่ต้องตรวจ' else 'รอยืนยันคะแนน' end,
      'status',case s.scan_status when 'confirmed' then 'verified' when 'rejected' then 'voided' else 'needs_review' end,
      'revision',s.revision,'templateId',s.template_id,'originalPath',s.image_url,'processedPath',s.image_public_id,'slot',s.slot,'paper',s.paper,'idObservations',s.id_observations,
      'rawAnswers',coalesce((select jsonb_agg(jsonb_build_object('question',d.question_number,'choice',d.detected_answer,'state',d.detection_status,'fills',d.fills,'confidence',d.confidence) order by d.question_number) from public.detected_answers d where d.scan_id=s.id),'[]'::jsonb),
      'corrections',coalesce((select jsonb_object_agg(d.question_number::text,d.corrected_answer) from public.detected_answers d where d.scan_id=s.id and d.manually_corrected),'{}'::jsonb),
      'resolved',coalesce((select jsonb_agg(d.question_number order by d.question_number) from public.detected_answers d where d.scan_id=s.id and d.manually_corrected),'[]'::jsonb),
      'audit',coalesce((select jsonb_agg(jsonb_build_object('at',a.created_at,'reason',a.reason,'question',(a.new_values->>'question')::integer,
        'before',case when a.old_values->>'manually_corrected'='true' then a.old_values->>'corrected_answer' else a.old_values->>'detected_answer' end,'after',a.new_values->>'choice') order by a.created_at) from public.audit_logs a where a.resource_id=s.id and a.action='manual_correct_answer'),'[]'::jsonb)) item
    from public.scan_records s join public.exam_versions v on v.id=s.exam_version_id join public.exam_results r on r.scan_id=s.id
      left join public.students st on st.id=s.student_id where s.school_id=tenant and (exam_filter is null or s.exam_id=exam_filter) order by s.created_at desc
  ) review_rows),'[]'::jsonb);
end; $$;

create function public.register_score_export(input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; job uuid; export_format text:=input->>'format'; scan_text text;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if export_format is null or export_format not in ('csv','xlsx','pdf') or jsonb_typeof(input->'scan_ids') is distinct from 'array' or jsonb_array_length(input->'scan_ids') not between 1 and 500 then raise exception 'INVALID_EXPORT'; end if;
  for scan_text in select jsonb_array_elements_text(input->'scan_ids') loop
    if not exists(select 1 from public.exam_results where school_id=tenant and scan_id=scan_text::uuid and status='confirmed') then raise exception 'UNCONFIRMED_EXPORT'; end if;
  end loop;
  insert into public.export_jobs(school_id,created_by,format,scan_ids) values(tenant,auth.uid(),export_format,input->'scan_ids') returning id into job;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,auth.uid(),case when export_format='pdf' then 'export_pdf' else 'export_excel' end,'export','export_job',job,input,'ส่งออกคะแนนที่ครูยืนยันแล้ว');
  return job;
end; $$;

-- A separate transaction records a refused duplicate; an exception in save_scan_batch
-- rolls back its own audit inserts. This function cannot modify or delete a result.
create function public.record_duplicate_scan(input jsonb) returns void language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; upload public.scan_uploads;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  select * into upload from public.scan_uploads where id=(input->>'upload_id')::uuid and school_id=tenant;
  if not found or input->>'code' not in ('DUPLICATE_SCAN','CONFIRMED_RESULT_EXISTS') then raise exception 'INVALID_SCAN'; end if;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message,severity)
    values(tenant,auth.uid(),'duplicate_scan_detected','scan','scan_upload',upload.id,jsonb_build_object('code',input->>'code'),'หยุดผลสแกนซ้ำ ไม่เขียนทับคะแนนเดิม','warning');
end; $$;
revoke all on function public.reserve_scan_upload(jsonb),public.fail_scan_upload(jsonb),public.save_scan_batch(jsonb),public.review_scan(jsonb),public.get_scan_reviews(uuid,uuid),public.register_score_export(jsonb),public.record_duplicate_scan(jsonb) from public,anon;
grant execute on function public.reserve_scan_upload(jsonb),public.fail_scan_upload(jsonb),public.save_scan_batch(jsonb),public.review_scan(jsonb),public.get_scan_reviews(uuid,uuid),public.register_score_export(jsonb),public.record_duplicate_scan(jsonb) to authenticated;
create table if not exists private.app_installation(version text primary key,applied_at timestamptz not null default now());
revoke all on private.app_installation from public,anon,authenticated;
insert into private.app_installation(version) values('202610090005') on conflict do nothing;
insert into private.app_installation(version) values('202610090006');
notify pgrst, 'reload schema';


-- SOURCE: 202610090007_compact_print.sql
-- New layouts only. Registered older templates keep geometry version 2.
alter function private.validate_print_layout(uuid,jsonb) rename to validate_print_layout_v2;
create function private.validate_print_layout(tenant uuid, layout jsonb) returns public.exam_versions
language plpgsql security definer set search_path='' as $$
begin
  if layout ? 'printStyle' and (jsonb_typeof(layout->'printStyle') is distinct from 'string' or layout->>'printStyle' not in ('classic','compact')) then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  return private.validate_print_layout_v2(tenant,layout-'printStyle');
end; $$;
alter function private.validate_print_text_fit(jsonb) rename to validate_print_text_fit_v2;
create function private.validate_print_text_fit(layout jsonb) returns void language plpgsql immutable set search_path='' as $$
declare width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end;
begin
  if coalesce(layout->>'printStyle','classic')='classic' then perform private.validate_print_text_fit_v2(layout); return; end if;
  if private.print_line_count(layout->>'school',width-75.5,3.8)>2
    or private.print_line_count(layout->>'title',width-75.5,3.3)>2
    or private.print_line_count('วิชา '||(layout->>'subject')||' · '||(layout->>'examType')||' · ชั้น '||(layout->>'classroom'),width-57,2.8)>2
    or private.print_line_count(layout->>'instructions',width-24,2.6)>2 then raise exception 'PRINT_TEXT_DOES_NOT_FIT'; end if;
end; $$;
alter function private.expected_print_geometry(jsonb) rename to expected_print_geometry_v2;
create function private.expected_print_geometry(layout jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare geometry jsonb; answers jsonb:='[]'; blocks jsonb; b jsonb; q integer; row_no integer;
  rows integer; columns integer; step_y double precision; y double precision;
  width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end; factor double precision;
begin
  geometry:=private.expected_print_geometry_v2(layout);
  if coalesce(layout->>'printStyle','classic')='classic' then return geometry; end if;
  columns:=ceil((layout->>'questionCount')::integer/16.0); rows:=ceil((layout->>'questionCount')::numeric/columns);
  step_y:=case when rows<=1 then 6 else least(8.5,(183-1.8-82-floor((rows-1)/5.0)*1.5)/(rows-1)) end;
  factor:=900/width; blocks:=geometry->'fieldBlocks';
  for b in select value from jsonb_array_elements(geometry->'centersMm'->'answers') loop
    q:=(b->>'question')::integer; row_no:=(q-1)%rows; y:=82+row_no*step_y+floor(row_no/5.0)*1.5;
    answers:=answers||jsonb_build_array(jsonb_set(b,'{y}',to_jsonb(y)));
    blocks:=jsonb_set(blocks,array['answer_'||q,'origin','1'],to_jsonb((y-1.8)*factor));
    blocks:=jsonb_set(blocks,array['answer_'||q,'labelsGap'],to_jsonb(step_y*factor));
  end loop;
  geometry:=jsonb_set(geometry,'{geometryVersion}','3');
  geometry:=jsonb_set(geometry,'{centersMm,answers}',answers);
  return jsonb_set(geometry,'{fieldBlocks}',blocks);
end; $$;
revoke all on function private.validate_print_layout(uuid,jsonb),private.validate_print_text_fit(jsonb),private.expected_print_geometry(jsonb) from public,anon,authenticated;
insert into private.app_installation(version) values('202610090007');
notify pgrst, 'reload schema';

commit;
