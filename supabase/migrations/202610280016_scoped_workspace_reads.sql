-- Apply once after 015. Read models never make paginated rows authoritative totals.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202610280015') then raise exception 'INSTALL_015_FIRST'; end if;
end $$;
create index scan_records_workspace_order on public.scan_records(school_id,created_at desc,id);
create index exam_results_workspace_status on public.exam_results(school_id,exam_id,status);

create function private.scan_review_json(s public.scan_records,r public.exam_results,v public.exam_versions) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',s.id,'examId',s.exam_id,'examVersion',v.version_no,
    'studentCode',coalesce(s.student_identity->>'studentCode',''),'name',coalesce(s.student_identity->>'name','ยังไม่ระบุนักเรียน'),
    'classroom',coalesce(s.student_identity->>'classroom',v.config_json->>'classroom'),'number',s.student_identity->'number',
    'reason',case when s.student_id is null then 'ตรวจรหัสนักเรียน' when r.uncertain_count>0 then 'มีคำตอบที่ต้องตรวจ' else 'รอยืนยันคะแนน' end,
    'status',case s.scan_status when 'confirmed' then 'verified' when 'rejected' then 'voided' else 'needs_review' end,
    'revision',s.revision,'templateId',s.template_id,'originalPath',s.image_url,'processedPath',s.image_public_id,'slot',s.slot,'paper',s.paper,'idObservations',s.id_observations,
    'rawAnswers',coalesce((select jsonb_agg(jsonb_build_object('question',d.question_number,'choice',d.detected_answer,'state',d.detection_status,'fills',d.fills,'confidence',d.confidence) order by d.question_number) from public.detected_answers d where d.scan_id=s.id),'[]'::jsonb),
    'corrections',coalesce((select jsonb_object_agg(d.question_number::text,d.corrected_answer) from public.detected_answers d where d.scan_id=s.id and d.manually_corrected),'{}'::jsonb),
    'resolved',coalesce((select jsonb_agg(d.question_number order by d.question_number) from public.detected_answers d where d.scan_id=s.id and d.manually_corrected),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(jsonb_build_object('at',a.created_at,'reason',a.reason,'question',(a.new_values->>'question')::integer,
      'before',case when a.old_values->>'manually_corrected'='true' then a.old_values->>'corrected_answer' else a.old_values->>'detected_answer' end,'after',a.new_values->>'choice') order by a.created_at)
      from public.audit_logs a where a.school_id=s.school_id and a.resource_id=s.id and a.action='manual_correct_answer'),'[]'::jsonb));
$$;
create function public.get_workspace_read_model(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; wanted text:=input->>'view'; target uuid:=(input->>'examId')::uuid;
  requested_scan uuid:=(input->>'id')::uuid; page_no integer:=coalesce((input->>'page')::integer,0); page_size integer:=coalesce((input->>'limit')::integer,50);
  search text:=coalesce(input->>'query',''); state text:=coalesce(input->>'status','needs_review'); total integer; counts jsonb; rows jsonb;
  scan public.scan_records; result public.exam_results; version public.exam_versions; classes jsonb;
begin
  if not private.can_read_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if wanted not in ('summary','queue','detail','results','exam_roster') or page_no not between 0 and 20000 or page_size not between 1 and 2000 or length(search)>100 then raise exception 'INVALID_ROSTER_QUERY'; end if;
  if target is not null and not exists(select 1 from public.exams where school_id=tenant and id=target) then raise exception 'EXAM_NOT_FOUND'; end if;
  if wanted='summary' then
    select coalesce(jsonb_agg(jsonb_build_object('name',classroom_name,'count',amount) order by classroom_name),'[]') into classes
      from (select classroom_name,count(*) amount from public.students where school_id=tenant and active group by classroom_name) c;
    select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'scanned',(select count(*) from public.exam_results r where r.school_id=tenant and r.exam_id=e.id and r.status<>'rejected'),
      'reviewCount',(select count(*) from public.exam_results r where r.school_id=tenant and r.exam_id=e.id and r.status='pending_review'),
      'students',case when exists(select 1 from public.exam_roster_versions rv where rv.exam_version_id=v.id) then
        (select count(*) from public.exam_student_roster er where er.school_id=tenant and er.exam_version_id=v.id)
        else (select count(*) from public.students st where st.school_id=tenant and st.active and st.classroom_name=v.config_json->>'classroom') end)), '[]') into rows
      from public.exams e join lateral(select * from public.exam_versions where exam_id=e.id order by version_no desc limit 1) v on true where e.school_id=tenant;
    return jsonb_build_object('activeCount',(select count(*) from public.students where school_id=tenant and active),'classrooms',classes,
      'reviewCount',(select count(*) from public.exam_results where school_id=tenant and status='pending_review'),'exams',rows,
      'recentReviews',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'examId',s.exam_id,'studentCode',coalesce(s.student_identity->>'studentCode',''),
        'name',coalesce(s.student_identity->>'name','ยังไม่ระบุนักเรียน'),'classroom',coalesce(s.student_identity->>'classroom',''),
        'status','needs_review','reason',case when s.student_id is null then 'ตรวจรหัสนักเรียน' else 'รอยืนยันคะแนน' end))
        from (select * from public.scan_records where school_id=tenant and scan_status='pending_review' order by created_at desc,id limit 3) s),'[]'::jsonb));
  elsif wanted='detail' then
    select * into scan from public.scan_records where id=requested_scan and school_id=tenant;
    if not found then raise exception 'SCAN_NOT_FOUND'; end if;
    select * into result from public.exam_results where scan_id=scan.id;
    select * into version from public.exam_versions where id=scan.exam_version_id;
    return jsonb_build_object('review',private.scan_review_json(scan,result,version),'version',version.config_json||jsonb_build_object('id',version.exam_id,'version',version.version_no,'updatedAt',version.created_at,'stage',4,'scanned',0,'students',0,'reviewCount',0,'archived',false));
  elsif wanted='exam_roster' then
    select * into version from public.exam_versions where school_id=tenant and exam_id=target and (input->>'version' is null or version_no=(input->>'version')::integer) order by version_no desc limit 1;
    if not found then raise exception 'EXAM_NOT_FOUND'; end if;
    if exists(select 1 from public.exam_roster_versions where school_id=tenant and exam_version_id=version.id) then
      select coalesce(jsonb_agg(jsonb_build_object('id',r.student_id,'student_code',r.student_code,'prefix',r.prefix,'first_name',r.first_name,'last_name',r.last_name,
        'full_name',r.prefix||r.first_name||' '||r.last_name,'classroom_name',r.classroom_name,'number',r.number) order by r.student_code),'[]') into rows
        from public.exam_student_roster r where r.school_id=tenant and r.exam_version_id=version.id;
    else
      select coalesce(jsonb_agg(to_jsonb(s) order by s.student_code),'[]') into rows from public.students s where school_id=tenant and active and classroom_name=version.config_json->>'classroom';
    end if;
    return jsonb_build_object('students',rows,'total',jsonb_array_length(rows),'examVersion',version.version_no);
  end if;
  select jsonb_build_object('needs_review',count(*) filter(where scan_status='pending_review'),'verified',count(*) filter(where scan_status='confirmed'),'voided',count(*) filter(where scan_status='rejected'))
    into counts from public.scan_records where school_id=tenant and (target is null or exam_id=target);
  if wanted='queue' and state not in ('needs_review','verified','voided') then raise exception 'INVALID_ROSTER_QUERY'; end if;
  select count(*) into total from public.scan_records s where s.school_id=tenant and (target is null or s.exam_id=target)
    and (case s.scan_status when 'confirmed' then 'verified' when 'rejected' then 'voided' else 'needs_review' end=state or wanted='results' and state='all' and s.scan_status<>'rejected')
    and (search='' or position(lower(search) in lower(coalesce(s.student_identity->>'studentCode','')||' '||coalesce(s.student_identity->>'name','')))>0);
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'examId',s.exam_id,'examVersion',v.version_no,'studentCode',coalesce(s.student_identity->>'studentCode',''),
    'name',coalesce(s.student_identity->>'name','ยังไม่ระบุนักเรียน'),'classroom',coalesce(s.student_identity->>'classroom',v.config_json->>'classroom'),
    'number',s.student_identity->'number','status',case s.scan_status when 'confirmed' then 'verified' when 'rejected' then 'voided' else 'needs_review' end,
    'reason',case when s.student_id is null then 'ตรวจรหัสนักเรียน' when r.uncertain_count>0 then 'มีคำตอบที่ต้องตรวจ' else 'รอยืนยันคะแนน' end,
    'score',r.score,'maxScore',r.max_score,'percent',r.percent,'passed',r.passed) order by s.created_at desc,s.id),'[]') into rows
    from (select * from public.scan_records s where s.school_id=tenant and (target is null or s.exam_id=target)
      and (case s.scan_status when 'confirmed' then 'verified' when 'rejected' then 'voided' else 'needs_review' end=state or wanted='results' and state='all' and s.scan_status<>'rejected')
      and (search='' or position(lower(search) in lower(coalesce(s.student_identity->>'studentCode','')||' '||coalesce(s.student_identity->>'name','')))>0)
      order by s.created_at desc,s.id limit page_size offset page_no*page_size) s
    join public.exam_results r on r.scan_id=s.id join public.exam_versions v on v.id=s.exam_version_id;
  return jsonb_build_object('items',rows,'total',total,'counts',counts,'page',page_no,'limit',page_size);
end; $$;
revoke all on function private.scan_review_json(public.scan_records,public.exam_results,public.exam_versions) from public,anon,authenticated,service_role;
revoke all on function public.get_workspace_read_model(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_workspace_read_model(jsonb) to authenticated;
insert into private.app_installation(version) values('202610280016');
notify pgrst,'reload schema';
commit;
