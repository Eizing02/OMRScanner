-- Apply ONCE after 007. Does not delete any exam, score, student or stored file.
-- Only a subsequent explicit owner-of-workspace request can purge an exam.
begin;

alter table public.exams add column deleting boolean not null default false;
alter table public.scan_uploads add column exam_id uuid;
alter table public.scan_uploads add constraint scan_upload_exam_fk foreign key(school_id,exam_id) references public.exams(school_id,id);
alter table public.scan_uploads alter column original_path drop not null;
alter table public.scan_records alter column image_url drop not null;
-- Successful historical uploads are already single-exam batches. Do not guess
-- the exam of an unattached old staging upload or delete it during installation.
do $$ begin
  if exists(select 1 from public.scan_records group by upload_id having count(distinct exam_id)>1) then
    raise exception 'MIXED_EXAM_UPLOAD: inspect before applying retention';
  end if;
end $$;
update public.scan_uploads u set exam_id=s.exam_id from
  (select distinct upload_id,exam_id from public.scan_records) s where s.upload_id=u.id;
create index scan_upload_exam_idx on public.scan_uploads(school_id,exam_id);

create table public.exam_cleanup_jobs (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  exam_id uuid not null unique, title text not null, paths jsonb not null,
  counts jsonb not null, status text not null default 'pending' check(status in ('pending','complete')),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), completed_at timestamptz
);
alter table public.exam_cleanup_jobs enable row level security;
revoke all on public.exam_cleanup_jobs from public,anon,authenticated;
grant select on public.exam_cleanup_jobs to authenticated;
create policy cleanup_job_read on public.exam_cleanup_jobs for select to authenticated using(private.can_read_workspace(school_id));

create function private.require_active_exam(tenant uuid,target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare row public.exams;
begin
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into row from public.exams where school_id=tenant and id=target for share;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  if row.deleting then raise exception 'EXAM_DELETING'; end if;
end; $$;
revoke all on function private.require_active_exam(uuid,uuid) from public,anon,authenticated;

-- Central write gate also protects existing print/version/review RPCs. No
-- updates to legacy RPC callers and no weakening of read isolation are needed.
create function private.guard_exam_work() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if tg_table_name='answer_keys' then
    select exam_id into target from public.exam_versions where id=new.exam_version_id;
  else target:=new.exam_id; end if;
  if target is not null then perform private.require_active_exam(new.school_id,target); end if;
  return new;
end; $$;
revoke all on function private.guard_exam_work() from public,anon,authenticated;
do $$ declare name text; begin
  foreach name in array array['exam_versions','answer_keys','omr_layouts','omr_templates','print_jobs','omr_sheets','scan_uploads','scan_records','exam_results','exam_access'] loop
    execute format('create trigger active_exam_work before insert or update on public.%I for each row execute function private.guard_exam_work()',name);
  end loop;
end $$;

create or replace function public.reserve_scan_upload(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid;
  request_uuid uuid:=(input->>'request_id')::uuid; row public.scan_uploads; root text;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if target is null or request_uuid is null or input->>'payload_hash' is null or input->>'payload_hash' !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_SCAN'; end if;
  perform private.require_active_exam(tenant,target);
  perform pg_advisory_xact_lock(hashtextextended(tenant::text||request_uuid::text,0));
  select * into row from public.scan_uploads where school_id=tenant and request_id=request_uuid for update;
  if found then
    if row.payload_hash<>input->>'payload_hash' or row.exam_id is distinct from target then raise exception 'SCAN_REQUEST_CONFLICT'; end if;
    if row.status='failed' then update public.scan_uploads set status='staging' where id=row.id returning * into row; end if;
  else
    root:=tenant::text||'/'||request_uuid::text;
    insert into public.scan_uploads(school_id,exam_id,request_id,payload_hash,original_path,processed_path,created_by)
      values(tenant,target,request_uuid,input->>'payload_hash',null,root||'/processed.jpg',auth.uid()) returning * into row;
  end if;
  return to_jsonb(row);
end; $$;

-- An original can be retired only when its complete upload still has the
-- processed evidence file. The finish step waits for the Storage API removal.
create function public.retire_scan_original(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; row public.scan_uploads; target uuid; path text;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select upload_id into target from public.scan_records where school_id=tenant and id=(input->>'scan_id')::uuid;
  select * into row from public.scan_uploads where school_id=tenant and id=target for update;
  if not found then raise exception 'SCAN_NOT_FOUND'; end if;
  if row.original_path is null then return jsonb_build_object('path',null); end if;
  if row.original_path=row.processed_path then raise exception 'INVALID_IMAGE_PATH'; end if;
  perform private.require_active_exam(tenant,row.exam_id);
  if row.status<>'complete' or not exists(select 1 from storage.objects where bucket_id='scan-images' and name=row.processed_path) then raise exception 'SCAN_IMAGES_MISSING'; end if;
  path:=row.original_path;
  if coalesce((input->>'finish')::boolean,false) then
    if exists(select 1 from storage.objects where bucket_id='scan-images' and name=path) then raise exception 'ORIGINAL_CLEANUP_PENDING'; end if;
    update public.scan_records set image_url=null where upload_id=row.id and school_id=tenant;
    update public.scan_uploads set original_path=null where id=row.id;
    insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
      values(tenant,auth.uid(),'retire_scan_original','scan','scan_upload',row.id,jsonb_build_object('processed_retained',true),'ลบภาพต้นฉบับ เก็บภาพที่ใช้ตรวจและคะแนนเดิม');
  end if;
  return jsonb_build_object('path',path);
end; $$;

create function public.preview_exam_deletion(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid; row public.exams;
begin
  if not private.can_read_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  select * into row from public.exams where school_id=tenant and id=target;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  return jsonb_build_object('id',row.id,'title',row.title,'deleting',row.deleting,
    'scans',(select count(*) from public.scan_records where school_id=tenant and exam_id=target),
    'confirmed',(select count(*) from public.exam_results where school_id=tenant and exam_id=target and status='confirmed'),
    'sheets',(select count(*) from public.omr_sheets where school_id=tenant and exam_id=target),
    'images',(select count(distinct path) from public.scan_uploads u cross join lateral (values(u.original_path),(u.processed_path)) p(path) where u.school_id=tenant and u.exam_id=target and path is not null));
end; $$;

create function public.set_exam_archived(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; entry text; row public.exams; desired boolean:=(input->>'archived')::boolean;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if desired is null or jsonb_typeof(input->'ids') is distinct from 'array' or jsonb_array_length(input->'ids') not between 1 and 100 then raise exception 'INVALID_EXAM'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  for entry in select distinct jsonb_array_elements_text(input->'ids') order by 1 loop
    select * into row from public.exams where school_id=tenant and id=entry::uuid for update;
    if not found then raise exception 'EXAM_NOT_FOUND'; end if;
    if row.deleting then raise exception 'EXAM_DELETING'; end if;
    update public.exams set archived=desired where id=row.id;
    insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,old_values,new_values,display_message)
      values(tenant,auth.uid(),case when desired then 'archive_exam' else 'restore_exam' end,'exams','exam',row.id,jsonb_build_object('archived',row.archived),jsonb_build_object('archived',desired),case when desired then 'จัดเก็บชุดสอบโดยไม่ลบคะแนน' else 'นำชุดสอบกลับมาใช้งาน' end);
  end loop;
  return jsonb_build_object('archived',desired);
end; $$;

create function public.begin_exam_deletion(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; target uuid:=(input->>'exam_id')::uuid; row public.exams; job public.exam_cleanup_jobs; snapshot jsonb; paths jsonb;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into job from public.exam_cleanup_jobs where school_id=tenant and exam_id=target for update;
  if found then
    if input->>'confirmation' is distinct from job.title then raise exception 'DELETE_CONFIRMATION_REQUIRED'; end if;
    return to_jsonb(job)||jsonb_build_object('paths',coalesce((select jsonb_agg(value) from jsonb_array_elements(job.paths) where exists(select 1 from storage.objects o where o.bucket_id='scan-images' and o.name=value#>>'{}')),'[]'::jsonb));
  end if;
  select * into row from public.exams where school_id=tenant and id=target for update;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  if input->>'confirmation' is distinct from row.title then raise exception 'DELETE_CONFIRMATION_REQUIRED'; end if;
  if exists(select 1 from public.scan_records s where s.exam_id<>target and s.upload_id in(select id from public.scan_uploads where school_id=tenant and exam_id=target)) then raise exception 'MIXED_EXAM_UPLOAD'; end if;
  snapshot:=public.preview_exam_deletion(input);
  select coalesce(jsonb_agg(distinct path),'[]'::jsonb) into paths from public.scan_uploads u
    cross join lateral (values(u.original_path),(u.processed_path)) p(path) where u.school_id=tenant and u.exam_id=target and path is not null;
  if exists(select 1 from jsonb_array_elements_text(paths) p where p not like tenant::text||'/%') then raise exception 'INVALID_IMAGE_PATH'; end if;
  insert into public.exam_cleanup_jobs(school_id,exam_id,title,paths,counts,created_by)
    values(tenant,target,row.title,paths,snapshot,auth.uid()) returning * into job;
  update public.exams set deleting=true where id=target;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,old_values,new_values,display_message,severity)
    values(tenant,auth.uid(),'begin_delete_exam','exams','exam',target,snapshot,jsonb_build_object('cleanup_job',job.id),'เริ่มลบชุดสอบและภาพ หยุดการแก้ไขและสแกนเพิ่ม','warning');
  return to_jsonb(job)||jsonb_build_object('paths',coalesce((select jsonb_agg(value) from jsonb_array_elements(job.paths) where exists(select 1 from storage.objects o where o.bucket_id='scan-images' and o.name=value#>>'{}')),'[]'::jsonb));
end; $$;

-- DELETE-only, transaction-scoped escape hatch. The caller cannot change keys
-- or template identity, and unremoved blobs keep the immutable guards active.
create function private.can_purge_exam(tenant uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.owns_workspace(tenant) and current_setting('app.purge_exam',true)=target::text
    and exists(select 1 from public.exam_cleanup_jobs j where j.school_id=tenant and j.exam_id=target and j.status='pending'
      and not exists(select 1 from storage.objects o where o.bucket_id='scan-images' and o.name in(select jsonb_array_elements_text(j.paths))));
$$;
revoke all on function private.can_purge_exam(uuid,uuid) from public,anon,authenticated;
create or replace function public.prevent_published_mutation() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and private.can_purge_exam(old.school_id,old.exam_id) then return old; end if;
  if old.published_at is not null then raise exception 'PUBLISHED_VERSION_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end; $$;
create or replace function public.prevent_published_key_mutation() returns trigger language plpgsql set search_path='' as $$
declare target uuid; version public.exam_versions;
begin
  if tg_op='INSERT' then target:=new.exam_version_id; else target:=old.exam_version_id; end if;
  select * into version from public.exam_versions where id=target;
  if tg_op='DELETE' and private.can_purge_exam(version.school_id,version.exam_id) then return old; end if;
  if version.published_at is not null then raise exception 'PUBLISHED_KEY_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' and new.exam_version_id<>old.exam_version_id then raise exception 'KEY_VERSION_IMMUTABLE'; end if; return new;
end; $$;
create or replace function private.prevent_print_mutation() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and private.can_purge_exam(old.school_id,old.exam_id) then return old; end if;
  raise exception 'PRINT_REGISTRY_IMMUTABLE';
end; $$;
create or replace function private.protect_sheet_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    if private.can_purge_exam(old.school_id,old.exam_id) then return old; end if;
    raise exception 'PRINT_REGISTRY_IMMUTABLE';
  end if;
  if to_jsonb(new)-'status' is distinct from to_jsonb(old)-'status' then raise exception 'PRINT_REGISTRY_IMMUTABLE'; end if;
  return new;
end; $$;

create function public.finish_exam_deletion(input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; job public.exam_cleanup_jobs; target uuid; target_scans jsonb; resources uuid[];
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into job from public.exam_cleanup_jobs where school_id=tenant and id=(input->>'job_id')::uuid for update;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  if job.status='complete' then return jsonb_build_object('deleted',true); end if;
  target:=job.exam_id;
  perform set_config('app.purge_exam',target::text,true);
  if not private.can_purge_exam(tenant,target) then raise exception 'EXAM_CLEANUP_PENDING'; end if;
  -- Refuse to remove an image shared with another exam even if corrupt legacy
  -- metadata or an out-of-band import introduced that association.
  if exists(select 1 from public.scan_records s where s.school_id=tenant and s.exam_id<>target and s.upload_id in(select id from public.scan_uploads where school_id=tenant and exam_id=target)) then raise exception 'MIXED_EXAM_UPLOAD'; end if;
  select coalesce(jsonb_agg(id::text),'[]'::jsonb) into target_scans from public.scan_records where school_id=tenant and exam_id=target;
  select array_agg(id) into resources from (
    select target id union select id from public.scan_records where school_id=tenant and exam_id=target
    union select id from public.scan_uploads where school_id=tenant and exam_id=target
    union select id from public.print_jobs where school_id=tenant and exam_id=target
    union select id from public.omr_sheets where school_id=tenant and exam_id=target
    union select id from public.omr_templates where school_id=tenant and exam_id=target
    union select id from public.exam_versions where school_id=tenant and exam_id=target
    union select id from public.export_jobs where school_id=tenant and scan_ids ?| array(select jsonb_array_elements_text(target_scans))
  ) related;
  update public.export_jobs e set scan_ids=(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(e.scan_ids) where not (target_scans ? (value#>>'{}'))) where e.school_id=tenant and e.scan_ids ?| array(select jsonb_array_elements_text(target_scans));
  delete from public.export_jobs where school_id=tenant and scan_ids='[]'::jsonb;
  delete from public.answer_evaluations where school_id=tenant and scan_id in(select id from public.scan_records where exam_id=target and school_id=tenant);
  delete from public.detected_answers where school_id=tenant and scan_id in(select id from public.scan_records where exam_id=target and school_id=tenant);
  delete from public.exam_results where school_id=tenant and exam_id=target;
  delete from public.scan_records where school_id=tenant and exam_id=target;
  delete from public.scan_uploads where school_id=tenant and exam_id=target;
  delete from public.omr_sheets where school_id=tenant and exam_id=target;
  delete from public.print_jobs where school_id=tenant and exam_id=target;
  delete from public.omr_templates where school_id=tenant and exam_id=target;
  delete from public.omr_layouts where school_id=tenant and exam_id=target;
  delete from public.answer_keys where school_id=tenant and exam_version_id in(select id from public.exam_versions where school_id=tenant and exam_id=target);
  delete from public.exam_versions where school_id=tenant and exam_id=target;
  delete from public.exam_access where school_id=tenant and exam_id=target;
  delete from public.exams where school_id=tenant and id=target;
  -- Preserve a minimal deletion audit; remove answer-level/personal snapshots.
  delete from public.audit_logs where school_id=tenant and resource_id=any(resources) and action<>'begin_delete_exam';
  update public.exam_cleanup_jobs set status='complete',completed_at=now(),paths='[]'::jsonb where id=job.id;
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message,severity)
    values(tenant,auth.uid(),'delete_exam','exams','exam',target,job.counts,'ลบชุดสอบ คะแนน และภาพที่เกี่ยวข้องแล้ว ไม่ลบรายชื่อนักเรียน','warning');
  perform set_config('app.purge_exam','',true);
  return jsonb_build_object('deleted',true);
end; $$;

create function private.can_upload_scan(path text) returns boolean language plpgsql security definer set search_path='' as $$
declare row public.scan_uploads;
begin
  select * into row from public.scan_uploads where status='staging' and (path=original_path or path=processed_path);
  if not found or not private.owns_workspace(row.school_id) or row.exam_id is null then return false; end if;
  perform private.require_active_exam(row.school_id,row.exam_id);
  return true;
end; $$;
revoke all on function private.can_upload_scan(text) from public,anon;
grant execute on function private.can_upload_scan(text) to authenticated;
drop policy scan_image_insert on storage.objects;
create policy scan_image_insert on storage.objects for insert to authenticated with check(bucket_id='scan-images' and private.can_upload_scan(name));
drop policy scan_image_cleanup on storage.objects;
-- Security-definer predicate avoids recursive RLS on storage.objects while
-- independently validating ownership. Never grants a general file delete.
create function private.can_delete_scan(path text) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.scan_uploads u where private.owns_workspace(u.school_id) and
    ((u.status in ('staging','failed') and (path=u.original_path or path=u.processed_path))
      or (u.status='complete' and path=u.original_path and path<>u.processed_path and exists(select 1 from storage.objects p where p.bucket_id='scan-images' and p.name=u.processed_path))))
    or exists(select 1 from public.exam_cleanup_jobs j where private.owns_workspace(j.school_id) and j.status='pending' and j.paths ? path);
$$;
revoke all on function private.can_delete_scan(text) from public,anon;
grant execute on function private.can_delete_scan(text) to authenticated;
create policy scan_image_cleanup on storage.objects for delete to authenticated using(bucket_id='scan-images' and private.can_delete_scan(name));

revoke all on function public.retire_scan_original(jsonb),public.preview_exam_deletion(jsonb),public.set_exam_archived(jsonb),public.begin_exam_deletion(jsonb),public.finish_exam_deletion(jsonb) from public,anon;
grant execute on function public.retire_scan_original(jsonb),public.preview_exam_deletion(jsonb),public.set_exam_archived(jsonb),public.begin_exam_deletion(jsonb),public.finish_exam_deletion(jsonb) to authenticated;

create or replace function public.save_scan_batch(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; upload public.scan_uploads; item jsonb; answer jsonb; template public.omr_templates;
  version_row public.exam_versions; student public.students; existing public.exam_results; scan public.scan_records; sheet_uuid uuid;
  code text; choice text; state text; q integer; amount integer; output jsonb:='[]'; seen text[]:='{}'; record_key text;
  replacement boolean:=coalesce((input->>'replace_pending')::boolean,false);
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  select * into upload from public.scan_uploads where id=(input->>'upload_id')::uuid and school_id=tenant for update;
  if not found then raise exception 'SCAN_UPLOAD_NOT_FOUND'; end if;
  if upload.status='complete' then
    select jsonb_agg(jsonb_build_object('id',s.id,'studentCode',st.student_code,'name',coalesce(st.prefix,'')||st.first_name||' '||st.last_name,'score',r.score,'maxScore',r.max_score) order by s.slot)
      into output from public.scan_records s join public.exam_results r on r.scan_id=s.id left join public.students st on st.id=s.student_id where s.upload_id=upload.id;
    return output;
  end if;
  if upload.status<>'staging' or (upload.original_path is not null and not exists(select 1 from storage.objects where bucket_id='scan-images' and name=upload.original_path))
    or not exists(select 1 from storage.objects where bucket_id='scan-images' and name=upload.processed_path) then raise exception 'SCAN_IMAGES_MISSING'; end if;
  if jsonb_typeof(input->'records') is distinct from 'array' or jsonb_array_length(input->'records') not between 1 and 2 then raise exception 'INVALID_SCAN'; end if;
  if input->>'paper' is null or input->>'paper' not in ('single','a4') then raise exception 'INVALID_SCAN'; end if;
  if replacement and length(trim(coalesce(input->>'reason','')))<3 then raise exception 'REASON_REQUIRED'; end if;
  -- Lock the workspace/exam before duplicate checks, including concurrent scans.
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  for item in select value from jsonb_array_elements(input->'records') loop
    select * into template from public.omr_templates where school_id=tenant and set_token=item->>'token';
    if not found then raise exception 'QR_NOT_REGISTERED'; end if;
    if upload.exam_id is distinct from template.exam_id then raise exception 'QR_MISMATCH'; end if;
    perform private.require_active_exam(tenant,template.exam_id);
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

insert into private.app_installation(version) values('202610090008');
notify pgrst, 'reload schema';
commit;
