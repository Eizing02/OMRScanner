-- Apply once after 005. Additive: never replaces student/exam/print data.
begin;
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
commit;
