-- New layouts only. Registered older templates keep geometry version 2.
begin;
alter function private.validate_print_layout(uuid,jsonb) rename to validate_print_layout_v2;
create function private.validate_print_layout(tenant uuid, layout jsonb) returns public.exam_versions
language plpgsql security definer set search_path='' as $$
begin
  if layout ? 'printStyle' and (jsonb_typeof(layout->'printStyle') is distinct from 'string' or layout->>'printStyle' not in ('classic','compact')) then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  return private.validate_print_layout_v2(tenant,layout-'printStyle');
end; $$;
alter function private.validate_print_text_fit(jsonb) rename to validate_print_text_fit_v2;
create function private.validate_print_text_fit(layout jsonb) returns void language plpgsql immutable set search_path='' as $$
declare width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end;
begin
  if coalesce(layout->>'printStyle','classic')='classic' then perform private.validate_print_text_fit_v2(layout); return; end if;
  if private.print_line_count(layout->>'school',width-75.5,3.8)>2
    or private.print_line_count(layout->>'title',width-75.5,3.3)>2
    or private.print_line_count('วิชา '||(layout->>'subject')||' · '||(layout->>'examType')||' · ชั้น '||(layout->>'classroom'),width-57,2.8)>2
    or private.print_line_count(layout->>'instructions',width-24,2.6)>2 then raise exception 'PRINT_TEXT_DOES_NOT_FIT'; end if;
end; $$;
alter function private.expected_print_geometry(jsonb) rename to expected_print_geometry_v2;
create function private.expected_print_geometry(layout jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare geometry jsonb; answers jsonb:='[]'; blocks jsonb; b jsonb; q integer; row_no integer;
  rows integer; columns integer; step_y double precision; y double precision;
  width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end; factor double precision;
begin
  geometry:=private.expected_print_geometry_v2(layout);
  if coalesce(layout->>'printStyle','classic')='classic' then return geometry; end if;
  columns:=ceil((layout->>'questionCount')::integer/16.0); rows:=ceil((layout->>'questionCount')::numeric/columns);
  step_y:=case when rows<=1 then 6 else least(8.5,(183-1.8-82-floor((rows-1)/5.0)*1.5)/(rows-1)) end;
  factor:=900/width; blocks:=geometry->'fieldBlocks';
  for b in select value from jsonb_array_elements(geometry->'centersMm'->'answers') loop
    q:=(b->>'question')::integer; row_no:=(q-1)%rows; y:=82+row_no*step_y+floor(row_no/5.0)*1.5;
    answers:=answers||jsonb_build_array(jsonb_set(b,'{y}',to_jsonb(y)));
    blocks:=jsonb_set(blocks,array['answer_'||q,'origin','1'],to_jsonb((y-1.8)*factor));
    blocks:=jsonb_set(blocks,array['answer_'||q,'labelsGap'],to_jsonb(step_y*factor));
  end loop;
  geometry:=jsonb_set(geometry,'{geometryVersion}','3');
  geometry:=jsonb_set(geometry,'{centersMm,answers}',answers);
  return jsonb_set(geometry,'{fieldBlocks}',blocks);
end; $$;
revoke all on function private.validate_print_layout(uuid,jsonb),private.validate_print_text_fit(jsonb),private.expected_print_geometry(jsonb) from public,anon,authenticated;
insert into private.app_installation(version) values('202610090007');
notify pgrst, 'reload schema';
commit;
