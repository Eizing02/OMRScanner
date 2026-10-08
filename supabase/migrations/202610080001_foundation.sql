-- Smart Answer Sheet: Phase 0–1. Apply once to a new Supabase project.
-- This file is transactional. No production student data or secrets are seeded.
begin;
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
commit;
