-- ScanSob only. Apply after 024, before deploying Word export.
begin;
do $$ begin
  if not exists (select 1 from private.app_installation where version = '202611170024') then
    raise exception 'INSTALL_024_FIRST';
  end if;
end $$;

alter table public.export_jobs
  drop constraint export_jobs_format_check,
  add constraint export_jobs_format_check check (format in ('csv', 'xlsx', 'pdf', 'docx'));

create or replace function public.register_score_export(input jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  tenant uuid := (input->>'school_id')::uuid;
  job uuid;
  export_format text := input->>'format';
  scan_text text;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  if export_format is null or export_format not in ('csv', 'xlsx', 'pdf', 'docx')
    or jsonb_typeof(input->'scan_ids') is distinct from 'array' then
    raise exception 'INVALID_EXPORT';
  end if;
  if jsonb_array_length(input->'scan_ids') not between 1 and 500 then
    raise exception 'INVALID_EXPORT';
  end if;
  for scan_text in select jsonb_array_elements_text(input->'scan_ids') loop
    if not exists (
      select 1 from public.exam_results
        where school_id = tenant and scan_id = scan_text::uuid and status = 'confirmed'
    ) then
      raise exception 'UNCONFIRMED_EXPORT';
    end if;
  end loop;
  insert into public.export_jobs (school_id, created_by, format, scan_ids)
    values (tenant, auth.uid(), export_format, input->'scan_ids') returning id into job;
  insert into public.audit_logs (school_id, actor_user_id, action, module_name, resource_type, resource_id, new_values, display_message)
    values (tenant, auth.uid(), case export_format
      when 'docx' then 'export_word'
      when 'pdf' then 'export_pdf'
      else 'export_excel'
      end, 'export', 'export_job', job, input, 'ส่งออกคะแนนที่ครูยืนยันแล้ว');
  return job;
end; $$;

insert into private.app_installation (version) values ('202611180025') on conflict do nothing;
notify pgrst, 'reload schema';
commit;
