-- Apply once after 012. Preserve historical identity before enabling roster edits.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202610150012') then raise exception 'INSTALL_012_FIRST'; end if;
end $$;

alter table public.students add column active boolean not null default true;
alter table public.students add column revision integer not null default 1 check(revision>0);
create index students_active_class_code on public.students(school_id,active,classroom_name,student_code,id);

create table public.exam_roster_versions (
  school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null,
  frozen_at timestamptz not null default now(), provenance text not null,
  primary key(school_id,exam_version_id),
  foreign key(school_id,exam_id,exam_version_id) references public.exam_versions(school_id,exam_id,id) on delete cascade
);
create table public.exam_student_roster (
  school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null, student_id uuid not null,
  student_code varchar(5) not null check(student_code ~ '^[0-9]{5}$'), prefix text not null,
  first_name text not null,last_name text not null,classroom_name text not null,number integer,
  provenance text not null,created_at timestamptz not null default now(),
  primary key(school_id,exam_version_id,student_id),
  foreign key(school_id,exam_version_id) references public.exam_roster_versions(school_id,exam_version_id) on delete cascade,
  foreign key(school_id,student_id) references public.students(school_id,id)
);
create index exam_roster_code on public.exam_student_roster(school_id,exam_version_id,student_code);
alter table public.exam_roster_versions enable row level security;
alter table public.exam_student_roster enable row level security;
revoke all on public.exam_roster_versions,public.exam_student_roster from public,anon,authenticated;
grant select on public.exam_roster_versions,public.exam_student_roster to authenticated;
create policy roster_version_read on public.exam_roster_versions for select to authenticated using(private.can_read_workspace(school_id));
create policy exam_roster_read on public.exam_student_roster for select to authenticated using(private.can_read_workspace(school_id));

create function private.freeze_exam_roster(tenant uuid,target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.exam_versions;
begin
  select * into v from public.exam_versions where school_id=tenant and id=target for update;
  if not found then raise exception 'EXAM_NOT_FOUND'; end if;
  if exists(select 1 from public.exam_roster_versions where school_id=tenant and exam_version_id=target) then return; end if;
  insert into public.exam_roster_versions values(tenant,v.exam_id,target,now(),'first_print');
  insert into public.exam_student_roster(school_id,exam_id,exam_version_id,student_id,student_code,prefix,first_name,last_name,classroom_name,number,provenance)
    select tenant,v.exam_id,target,id,student_code,prefix,first_name,last_name,classroom_name,number,'first_print'
    from public.students where school_id=tenant and active and classroom_name=v.config_json->>'classroom';
end; $$;
create function private.student_in_exam(tenant uuid,target uuid,person uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.exam_student_roster where school_id=tenant and exam_version_id=target and student_id=person);
$$;

-- Backfill only with available evidence; never claim to reconstruct lost history.
insert into public.exam_roster_versions(school_id,exam_id,exam_version_id,provenance)
  select v.school_id,v.exam_id,v.id,'legacy_backfill' from public.exam_versions v
  where v.published_at is not null or exists(select 1 from public.scan_records s where s.exam_version_id=v.id);
insert into public.exam_student_roster(school_id,exam_id,exam_version_id,student_id,student_code,prefix,first_name,last_name,classroom_name,number,provenance)
  select v.school_id,v.exam_id,v.exam_version_id,s.id,s.student_code,s.prefix,s.first_name,s.last_name,s.classroom_name,s.number,'current_roster_at_upgrade'
  from public.exam_roster_versions v join public.exam_versions e on e.id=v.exam_version_id
  join public.students s on s.school_id=v.school_id and (s.classroom_name=e.config_json->>'classroom'
    or exists(select 1 from public.omr_sheets os where os.exam_version_id=v.exam_version_id and os.student_id=s.id)
    or exists(select 1 from public.scan_records sr where sr.exam_version_id=v.exam_version_id and sr.student_id=s.id));

-- Prefer the earliest registered paper when it exists. Prefix parsing only
-- separates the already stored print name; it does not invent a historic name.
with printed as (
  select distinct on(school_id,exam_version_id,student_id) school_id,exam_version_id,student_id,full_name,classroom_name,number
  from public.omr_sheets where student_id is not null order by school_id,exam_version_id,student_id,created_at,id
), titled as (
  select p.*,coalesce((select title from unnest(array['เด็กชาย','เด็กหญิง','นางสาว','นาย','น.ส.','ด.ช.','ด.ญ.']) title where left(p.full_name,length(title))=title limit 1),'') title from printed p
), named as (
  select p.*,btrim(substring(full_name from length(title)+1)) bare from titled p
)
update public.exam_student_roster r set prefix=p.title,first_name=split_part(p.bare,' ',1),
  last_name=btrim(substring(p.bare from length(split_part(p.bare,' ',1))+1)),classroom_name=p.classroom_name,number=p.number,provenance='registered_print_backfill'
  from named p where r.school_id=p.school_id and r.exam_version_id=p.exam_version_id and r.student_id=p.student_id;

alter table public.scan_records add column student_identity jsonb;
create function private.capture_student_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare identity jsonb;
begin
  if tg_op='UPDATE' and new.student_id is not distinct from old.student_id then
    new.student_identity:=old.student_identity; return new;
  end if;
  if new.student_id is null then new.student_identity:=null; return new; end if;
  select jsonb_build_object('studentCode',student_code,'name',full_name,'classroom',classroom_name,'number',number,'provenance','registered_print')
    into identity from public.omr_sheets where id=new.sheet_id and school_id=new.school_id and student_id=new.student_id;
  if identity is null then
    select jsonb_build_object('studentCode',student_code,'name',prefix||first_name||' '||last_name,'classroom',classroom_name,'number',number,'provenance',provenance)
      into identity from public.exam_student_roster where school_id=new.school_id and exam_version_id=new.exam_version_id and student_id=new.student_id;
  end if;
  if identity is null then raise exception 'STUDENT_NOT_IN_EXAM'; end if;
  new.student_identity:=identity; return new;
end; $$;
update public.scan_records s set student_identity=coalesce(
  (select jsonb_build_object('studentCode',o.student_code,'name',o.full_name,'classroom',o.classroom_name,'number',o.number,'provenance','registered_print') from public.omr_sheets o where o.id=s.sheet_id and o.student_id=s.student_id),
  (select jsonb_build_object('studentCode',r.student_code,'name',r.prefix||r.first_name||' '||r.last_name,'classroom',r.classroom_name,'number',r.number,'provenance',r.provenance) from public.exam_student_roster r where r.school_id=s.school_id and r.exam_version_id=s.exam_version_id and r.student_id=s.student_id))
  where s.student_id is not null;
create trigger capture_student_identity before insert or update on public.scan_records for each row execute function private.capture_student_identity();

-- Public review/export compatibility: same DTO, historical identity instead of
-- the current student join. This does not touch marks, grades or confirmations.
alter function public.get_scan_reviews(uuid,uuid) rename to get_scan_reviews_v012;
revoke all on function public.get_scan_reviews_v012(uuid,uuid) from public,anon,authenticated,service_role;
create function public.get_scan_reviews(tenant uuid,exam_filter uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(item.value||coalesce(s.student_identity-'provenance','{}'::jsonb) order by item.ordinality),'[]'::jsonb)
  from jsonb_array_elements(public.get_scan_reviews_v012(tenant,exam_filter)) with ordinality item(value,ordinality)
  join public.scan_records s on s.id=(item.value->>'id')::uuid and s.school_id=tenant;
$$;
revoke all on function private.freeze_exam_roster(uuid,uuid),private.student_in_exam(uuid,uuid,uuid),private.capture_student_identity() from public,anon,authenticated,service_role;
revoke all on function public.get_scan_reviews(uuid,uuid) from public,anon;
grant execute on function public.get_scan_reviews(uuid,uuid) to authenticated;

-- Print, save and identify definitions below retain their old checks and exact
-- wire/geometry contracts; only roster eligibility/printed identity is changed.

create or replace function public.register_omr_print(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  perform private.freeze_exam_roster(tenant,version_row.id);
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
    -- Explicit additional personalized printing can enroll an active new student;
    -- an existing snapshot is never overwritten by current roster edits.
    if selected_ids is not null then
      insert into public.exam_student_roster(school_id,exam_id,exam_version_id,student_id,student_code,prefix,first_name,last_name,classroom_name,number,provenance)
        select tenant,version_row.exam_id,version_row.id,s.id,s.student_code,s.prefix,s.first_name,s.last_name,s.classroom_name,s.number,'explicit_print'
        from public.students s where s.school_id=tenant and s.id=any(selected_ids) and s.active and s.classroom_name=layout->>'classroom'
        on conflict(school_id,exam_version_id,student_id) do nothing;
    end if;
    -- Freeze the exam key/version as soon as paper is registered. Later edits
    -- create a new version; they cannot alter the key used by existing papers.
    if selected_ids is not null and exists(select 1 from unnest(selected_ids) selected(id) left join public.students s on s.id=selected.id and s.school_id=tenant
      where s.id is null or not private.student_in_exam(tenant,version_row.id,s.id)) then raise exception 'PRINT_STUDENT_NOT_IN_CLASS'; end if;
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
        if not found or not private.student_in_exam(tenant,version_row.id,student_row.id) then raise exception 'PRINT_STUDENT_NOT_IN_CLASS'; end if;
        select r.prefix,r.first_name,r.last_name,r.classroom_name,r.number into student_row.prefix,student_row.first_name,student_row.last_name,student_row.classroom_name,student_row.number
          from public.exam_student_roster r where r.school_id=tenant and r.exam_version_id=version_row.id and r.student_id=student_row.id;
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


create or replace function public.review_scan(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
      and private.student_in_exam(tenant,row.exam_version_id,st.id);
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
    select jsonb_agg(jsonb_build_object('id',s.id,'studentCode',st.student_code,'name',s.student_identity->>'name','score',r.score,'maxScore',r.max_score) order by s.slot)
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
        and private.student_in_exam(tenant,template.exam_version_id,st.id);
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
    select output||jsonb_build_array(jsonb_build_object('id',scan.id,'studentCode',student.student_code,'name',scan.student_identity->>'name','score',r.score,'maxScore',r.max_score))
      into output from public.exam_results r where r.scan_id=scan.id;
  end loop;
  update public.scan_uploads set status='complete' where id=upload.id;
  return output;
end; $$;


insert into private.app_installation(version) values('202610280013');
notify pgrst,'reload schema';
commit;
