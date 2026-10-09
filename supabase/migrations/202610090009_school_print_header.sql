-- A new print style; never rewrite registered classic/compact templates.
begin;
create or replace function private.validate_print_layout(tenant uuid, layout jsonb) returns public.exam_versions
language plpgsql security definer set search_path='' as $$
begin
  if layout ? 'printStyle' and (jsonb_typeof(layout->'printStyle') is distinct from 'string' or layout->>'printStyle' not in ('classic','compact','school')) then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  return private.validate_print_layout_v2(tenant,layout-'printStyle');
end; $$;
alter function private.validate_print_text_fit(jsonb) rename to validate_print_text_fit_v3;
create function private.validate_print_text_fit(layout jsonb) returns void language plpgsql immutable set search_path='' as $$
declare width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end; school_text text:=layout->>'school';
begin
  if coalesce(layout->>'printStyle','classic')<>'school' then perform private.validate_print_text_fit_v3(layout); return; end if;
  if school_text like 'โรงเรียน%' and btrim(substr(school_text,length('โรงเรียน')+1))<>'' then school_text:='โรงเรียน'||chr(10)||btrim(substr(school_text,length('โรงเรียน')+1)); end if;
  if private.print_line_count(school_text,width-79.5,4.1)>2
    or private.print_line_count(layout->>'title',width-79.5,3.3)>2
    or private.print_line_count('วิชา …'||(layout->>'subject')||'… · …'||(layout->>'examType')||'…',width-57,2.8)>2
    or private.print_line_count(layout->>'instructions',width-24,2.6)>2 then raise exception 'PRINT_TEXT_DOES_NOT_FIT'; end if;
end; $$;
alter function private.expected_print_geometry(jsonb) rename to expected_print_geometry_v3;
create function private.expected_print_geometry(layout jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare geometry jsonb;
begin
  geometry:=private.expected_print_geometry_v3(layout);
  if coalesce(layout->>'printStyle','classic')='school' then geometry:=jsonb_set(geometry,'{geometryVersion}','4'); end if;
  return geometry;
end; $$;
revoke all on function private.validate_print_layout(uuid,jsonb),private.validate_print_text_fit(jsonb),private.expected_print_geometry(jsonb),private.validate_print_text_fit_v3(jsonb),private.expected_print_geometry_v3(jsonb) from public,anon,authenticated;
insert into private.app_installation(version) values('202610090009');
notify pgrst, 'reload schema';
commit;
