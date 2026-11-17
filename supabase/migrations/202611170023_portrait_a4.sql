-- Apply after 022. Geometry 7 adds portrait A4; printed geometry 2–6 is immutable.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202611170022') then
    raise exception 'INSTALL_022_FIRST';
  end if;
end $$;

alter function private.validate_print_layout(uuid,jsonb) rename to validate_print_layout_v6;
create function private.validate_print_layout(tenant uuid,layout jsonb) returns public.exam_versions
language plpgsql security definer set search_path='' as $$
begin
  if layout->>'printStyle'='school-grid-portrait' then
    layout:=jsonb_set(layout,'{printStyle}','"school-grid"');
  end if;
  return private.validate_print_layout_v6(tenant,layout);
end; $$;

alter function private.validate_print_text_fit(jsonb) rename to validate_print_text_fit_v6;
create function private.validate_print_text_fit(layout jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
  if layout->>'printStyle' is distinct from 'school-grid-portrait' then
    perform private.validate_print_text_fit_v6(layout);
    return;
  end if;
  if layout->>'paperMode' is distinct from 'full' then
    perform private.validate_print_text_fit_v6(jsonb_set(layout,'{printStyle}','"school-grid"'));
    return;
  end if;
  if private.print_v5_width(regexp_replace(layout->>'school','[[:space:]]*\n[[:space:]]*',' ','g'),3.1,true)>136
    or private.print_v5_width(layout->>'title',4.45,true)>272
    or private.print_v5_width(layout->>'subject',3,true)>200
    or private.print_v5_width(layout->>'examType',3,true)>200
    or private.print_v5_width(layout->>'instructions',2.4,true)>187 then
    raise exception 'PRINT_TEXT_DOES_NOT_FIT';
  end if;
end; $$;

alter function private.expected_print_geometry(jsonb) rename to expected_print_geometry_v6;
create function private.expected_print_geometry(layout jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
  width constant double precision:=210;
  height constant double precision:=297;
  factor constant double precision:=900/width;
  inherited jsonb; blocks jsonb; answers jsonb:='[]'; values_json jsonb;
  questions integer; options integer; columns integer; rows integer;
  column_width double precision; first_x double precision;
  q integer; o integer; x double precision; y double precision;
begin
  if layout->>'printStyle' is distinct from 'school-grid-portrait' then
    return private.expected_print_geometry_v6(layout);
  end if;
  inherited:=private.expected_print_geometry_v6(jsonb_set(layout,'{printStyle}','"school-grid"'));
  if layout->>'paperMode' is distinct from 'full' then return inherited; end if;
  questions:=(layout->>'questionCount')::integer;
  options:=(layout->>'choiceCount')::integer;
  columns:=(questions+19)/20;
  rows:=(questions+columns-1)/columns;
  column_width:=least((width-23)/columns,68.5);
  first_x:=(width-column_width*columns)/2+(column_width+8.7-(options-1)*9.5)/2;
  blocks:=jsonb_build_object('student_code', (inherited->'fieldBlocks'->'student_code')||jsonb_build_object(
    'origin',jsonb_build_array((14.8-1.8)*factor,(44.8-1.8)*factor),
    'bubblesGap',5.5*factor,'labelsGap',6.6*factor));
  values_json:=case when options=4 then '["A","B","C","D"]'::jsonb else '["A","B","C","D","E"]'::jsonb end;
  for q in 1..questions loop
    x:=first_x+((q-1)/rows)*column_width;
    y:=120+((q-1)%rows)*7.5;
    blocks:=blocks||jsonb_build_object('answer_'||q,jsonb_build_object(
      'bubbleValues',values_json,'direction','horizontal','fieldLabels',jsonb_build_array('q'||q),
      'origin',jsonb_build_array((x-1.8)*factor,(y-1.8)*factor),
      'bubblesGap',9.5*factor,'labelsGap',7.5*factor));
    for o in 0..options-1 loop
      answers:=answers||jsonb_build_array(jsonb_build_object('question',q,'option',o,'x',x+o*9.5,'y',y));
    end loop;
  end loop;
  return inherited||jsonb_build_object('geometryVersion',7,'pageDimensions',jsonb_build_array(900,round(height*factor)),
    'bubbleDimensions',jsonb_build_array(3.6*factor,3.6*factor),'fieldBlocks',blocks,
    'centersMm',jsonb_build_object('id',inherited->'centersMm'->'id','answers',answers));
end; $$;

revoke all on function private.validate_print_layout(uuid,jsonb),private.validate_print_layout_v6(uuid,jsonb),
  private.validate_print_text_fit(jsonb),private.validate_print_text_fit_v6(jsonb),
  private.expected_print_geometry(jsonb),private.expected_print_geometry_v6(jsonb)
  from public,anon,authenticated,service_role;
insert into private.app_installation(version) values('202611170023');
notify pgrst,'reload schema';
commit;
