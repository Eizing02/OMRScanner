-- Extend the installed foundation without rewriting previously published versions.
-- Apply after 202610080001_foundation.sql. No school/student data is seeded.
begin;
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
commit;
