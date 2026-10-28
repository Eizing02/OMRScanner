-- Apply after 017. Use the existing authoritative review RPC for each result.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202610280017') then raise exception 'INSTALL_017_FIRST'; end if;
end $$;
create function private.validate_confirmation_items(input jsonb) returns void language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(input->'items') is distinct from 'array' then raise exception 'INVALID_REVIEW'; end if;
  if jsonb_array_length(input->'items') not between 1 and 50 then raise exception 'INVALID_REVIEW'; end if;
  if exists(select 1 from jsonb_array_elements(input->'items') i where i->>'scanId' is null)
    or (select count(distinct i->>'scanId') from jsonb_array_elements(input->'items') i)<>jsonb_array_length(input->'items') then raise exception 'INVALID_REVIEW'; end if;
end; $$;
create function public.preview_scan_confirmation(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; entry jsonb; row public.scan_records; grade public.exam_results; expected integer; ready boolean; reason text; result jsonb:='[]';
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform private.validate_confirmation_items(input);
  for entry in select value from jsonb_array_elements(input->'items') loop
    select * into row from public.scan_records where school_id=tenant and id=(entry->>'scanId')::uuid;
    if not found then raise exception 'SCAN_NOT_FOUND'; end if;
    select * into grade from public.exam_results where scan_id=row.id and school_id=tenant;
    select (config_json->>'questionCount')::integer into expected from public.exam_versions where id=row.exam_version_id and school_id=tenant;
    ready:=row.scan_status='pending_review' and row.student_id is not null
      and (select count(*) from public.answer_evaluations where scan_id=row.id)=expected
      and not exists(select 1 from public.answer_evaluations where scan_id=row.id and effective_state in ('ambiguous','unreadable'));
    reason:=case when row.scan_status<>'pending_review' then 'รายการนี้สิ้นสุดแล้ว' when row.student_id is null then 'ตรวจรหัสนักเรียนก่อน' when not ready then 'ตรวจคำตอบให้ครบก่อน' else 'พร้อมยืนยัน' end;
    result:=result||jsonb_build_array(jsonb_build_object('scanId',row.id,'revision',row.revision,'name',coalesce(row.student_identity->>'name','ยังไม่ระบุนักเรียน'),'studentCode',coalesce(row.student_identity->>'studentCode',''),'ready',ready,'reason',reason,'score',grade.score,'maxScore',grade.max_score,'blankCount',grade.blank_count,'multipleCount',grade.multiple_count));
  end loop;
  return result;
end; $$;
create function public.confirm_scan_batch(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; entry jsonb; row public.scan_records; result jsonb:='[]'; failure text;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  perform private.validate_confirmation_items(input);
  -- Match review_scan's lock and lock order, including existing publication hooks.
  perform pg_advisory_xact_lock(hashtextextended('scan:'||tenant::text,0));
  for entry in select value from jsonb_array_elements(input->'items') loop
    begin
      if coalesce((entry->>'revision')::integer,0)<1 then raise exception 'STALE_REVIEW'; end if;
      select * into row from public.scan_records where school_id=tenant and id=(entry->>'scanId')::uuid for update;
      if not found then raise exception 'SCAN_NOT_FOUND'; end if;
      -- Safe retry after a lost response; never recalculate or republish twice.
      if not (row.scan_status='confirmed' and row.confirmed_by=auth.uid() and row.revision=(entry->>'revision')::integer+1) then
        perform public.review_scan(jsonb_build_object('school_id',tenant,'scanId',row.id,'revision',entry->'revision','action','confirm'));
      end if;
      result:=result||jsonb_build_array(jsonb_build_object('scanId',row.id,'confirmed',true));
    exception when others then
      get stacked diagnostics failure=message_text;
      result:=result||jsonb_build_array(jsonb_build_object('scanId',entry->>'scanId','confirmed',false,'reason',case when failure in ('STALE_REVIEW','RESULT_LOCKED','IDENTITY_REQUIRED','UNRESOLVED_ANSWERS','SCAN_NOT_FOUND','EXAM_DELETING','FORBIDDEN') then failure else 'REVIEW_FAILED' end));
    end;
  end loop;
  return result;
end; $$;
revoke all on function private.validate_confirmation_items(jsonb),public.preview_scan_confirmation(jsonb),public.confirm_scan_batch(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.preview_scan_confirmation(jsonb),public.confirm_scan_batch(jsonb) to authenticated;
insert into private.app_installation(version) values('202610280018');
notify pgrst, 'reload schema';
commit;
