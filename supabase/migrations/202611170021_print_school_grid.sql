-- Apply after 020. Geometry 6 is additive; the previous validators remain available.
begin;
do $$ begin
  if not exists(select 1 from private.app_installation where version='202610280020') then
    raise exception 'INSTALL_020_FIRST';
  end if;
end $$;

alter function private.validate_print_layout(uuid,jsonb) rename to validate_print_layout_v5;
create function private.validate_print_layout(tenant uuid,layout jsonb) returns public.exam_versions
language plpgsql security definer set search_path='' as $$
begin
  if layout->>'printStyle'='school-grid' then
    return private.validate_print_layout_v5(tenant,layout-'printStyle');
  end if;
  return private.validate_print_layout_v5(tenant,layout);
end; $$;

alter function private.validate_print_text_fit(jsonb) rename to validate_print_text_fit_v5;
create function private.validate_print_text_fit(layout jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end;
begin
  if layout->>'printStyle' is distinct from 'school-grid' then
    perform private.validate_print_text_fit_v5(layout);
    return;
  end if;
  if private.print_v5_width(regexp_replace(layout->>'school','[[:space:]]*\n[[:space:]]*',' ','g'),3.1,true)>width-74
    or private.print_v5_width(layout->>'title',4.45,true)>2*(width-74)
    or private.print_v5_width(layout->>'subject',3,true)>2*(width-110)
    or private.print_v5_width(layout->>'examType',3,true)>2*(width-110)
    or private.print_v5_width(layout->>'instructions',2.4,true)>width-23 then
    raise exception 'PRINT_TEXT_DOES_NOT_FIT';
  end if;
end; $$;

alter function private.expected_print_geometry(jsonb) rename to expected_print_geometry_v5;
create function private.expected_print_geometry(layout jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare
  width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end;
  questions integer:=(layout->>'questionCount')::integer;
  options integer:=(layout->>'choiceCount')::integer;
  factor double precision:=900/width;
  answer_gap double precision:=case when width=148.5 then 5.5 else 9.5 end;
  columns integer;
  rows integer;
  column_width double precision;
  first_x double precision;
  d integer; v integer; q integer; o integer;
  x double precision; y double precision;
  ids jsonb:='[]'; answers jsonb:='[]'; labels jsonb:='[]';
  blocks jsonb; values_json jsonb;
begin
  if layout->>'printStyle' is distinct from 'school-grid' then
    return private.expected_print_geometry_v5(layout);
  end if;
  if questions is null or questions not between 1 and 60 or options is null or options not in (4,5)
    or (width=148.5 and questions>48) then
    raise exception 'INVALID_PRINT_GEOMETRY';
  end if;
  columns:=(questions+15)/16;
  rows:=(questions+columns-1)/columns;
  column_width:=least((width-23)/columns,case when width=148.5 then 64 else 68.5 end);
  first_x:=(width-column_width*columns)/2+(column_width+8.7-(options-1)*answer_gap)/2;
  for d in 0..4 loop
    labels:=labels||jsonb_build_array('student_code_'||(d+1));
    for v in 0..9 loop
      ids:=ids||jsonb_build_array(jsonb_build_object('x',14.8+d*6.6,'y',44.8+v*5.5,'digit',d,'value',v));
    end loop;
  end loop;
  blocks:=jsonb_build_object('student_code',jsonb_build_object(
    'fieldType','QTYPE_INT','fieldLabels',labels,
    'origin',jsonb_build_array((14.8-1.8)*factor,(44.8-1.8)*factor),
    'bubblesGap',5.5*factor,'labelsGap',6.6*factor
  ));
  values_json:=case when options=4 then '["A","B","C","D"]'::jsonb else '["A","B","C","D","E"]'::jsonb end;
  for q in 1..questions loop
    x:=first_x+((q-1)/rows)*column_width;
    y:=120+((q-1)%rows)*5;
    blocks:=blocks||jsonb_build_object('answer_'||q,jsonb_build_object(
      'bubbleValues',values_json,'direction','horizontal','fieldLabels',jsonb_build_array('q'||q),
      'origin',jsonb_build_array((x-1.8)*factor,(y-1.8)*factor),
      'bubblesGap',answer_gap*factor,'labelsGap',5*factor
    ));
    for o in 0..options-1 loop
      answers:=answers||jsonb_build_array(jsonb_build_object('question',q,'option',o,'x',x+o*answer_gap,'y',y));
    end loop;
  end loop;
  return jsonb_build_object('schemaVersion',1,'geometryVersion',6,'pageDimensions',jsonb_build_array(900,round(210*factor)),
    'bubbleDimensions',jsonb_build_array(3.6*factor,3.6*factor),'preProcessors','[]'::jsonb,
    'customLabels','{}'::jsonb,'emptyValue','','fieldBlocks',blocks,'centersMm',jsonb_build_object('id',ids,'answers',answers));
end; $$;

revoke all on function private.validate_print_layout(uuid,jsonb),private.validate_print_layout_v5(uuid,jsonb),
  private.validate_print_text_fit(jsonb),private.validate_print_text_fit_v5(jsonb),
  private.expected_print_geometry(jsonb),private.expected_print_geometry_v5(jsonb)
  from public,anon,authenticated,service_role;
insert into private.app_installation(version) values('202611170021');
notify pgrst,'reload schema';
commit;
