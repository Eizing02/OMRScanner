-- Three-column student roster and immutable school-logo references.
-- Apply AFTER migrations 001 and 002. No cloud uploads or secret values here.
begin;
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
commit;
