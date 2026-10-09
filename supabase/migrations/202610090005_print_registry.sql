-- Private saved layouts and immutable, version-bound print registrations.
begin;
alter table public.exam_versions add constraint exam_versions_workspace_exam_id unique(school_id,exam_id,id);
create table public.omr_layouts (
  school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null,
  layout_json jsonb not null, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
  primary key(exam_version_id),
  foreign key(school_id,exam_id,exam_version_id) references public.exam_versions(school_id,exam_id,id)
);
create table public.omr_templates (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null,
  layout_hash text not null check(layout_hash ~ '^[a-f0-9]{64}$'),
  set_token text not null check(set_token ~ '^SAS2:[a-f0-9]{64}$'), identity_json text not null,
  layout_json jsonb not null, omr_json jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(school_id,exam_id,exam_version_id) references public.exam_versions(school_id,exam_id,id),
  unique(school_id,layout_hash), unique(set_token), unique(school_id,exam_id,exam_version_id,id)
);
create table public.print_jobs (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null, template_id uuid not null,
  request_id uuid not null, selection_json jsonb not null, sheet_count integer not null check(sheet_count between 1 and 200),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(school_id,exam_id,exam_version_id,template_id) references public.omr_templates(school_id,exam_id,exam_version_id,id),
  unique(school_id,request_id), unique(school_id,exam_id,exam_version_id,template_id,id)
);
create table public.omr_sheets (
  id uuid primary key default gen_random_uuid(), school_id uuid not null, exam_id uuid not null, exam_version_id uuid not null, template_id uuid not null, print_job_id uuid not null,
  student_id uuid, student_code varchar(5) check(student_code ~ '^[0-9]{5}$'), full_name text, classroom_name text, number integer,
  page_number integer not null check(page_number>0), slot integer not null check(slot in (0,1)),
  sheet_code text not null default gen_random_uuid()::text, status text not null default 'generated' check(status in ('generated','scanned','reviewed','void')),
  created_at timestamptz not null default now(),
  foreign key(school_id,exam_id,exam_version_id,template_id,print_job_id) references public.print_jobs(school_id,exam_id,exam_version_id,template_id,id),
  foreign key(school_id,student_id) references public.students(school_id,id),
  check((student_id is null and student_code is null and full_name is null and classroom_name is null) or
    (student_id is not null and student_code is not null and full_name is not null and classroom_name is not null)),
  unique(print_job_id,page_number,slot), unique(school_id,id), unique(sheet_code)
);
create index omr_templates_exam_version_idx on public.omr_templates(school_id,exam_id,exam_version_id);
create index print_jobs_workspace_time_idx on public.print_jobs(school_id,created_at desc);
create index omr_sheets_exam_student_idx on public.omr_sheets(school_id,exam_id,student_id);
create function private.prevent_print_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'PRINT_REGISTRY_IMMUTABLE'; end; $$;
revoke all on function private.prevent_print_mutation() from public,anon,authenticated;
create trigger immutable_omr_template before update or delete on public.omr_templates for each row execute function private.prevent_print_mutation();
create trigger immutable_print_job before update or delete on public.print_jobs for each row execute function private.prevent_print_mutation();
-- Future scan/review RPCs may advance status, but printed identity is immutable.
create function private.protect_sheet_identity() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or to_jsonb(new)-'status' is distinct from to_jsonb(old)-'status' then raise exception 'PRINT_REGISTRY_IMMUTABLE'; end if;
  return new;
end; $$;
revoke all on function private.protect_sheet_identity() from public,anon,authenticated;
create trigger immutable_sheet_identity before update or delete on public.omr_sheets for each row execute function private.protect_sheet_identity();
alter table public.omr_layouts enable row level security;
alter table public.omr_templates enable row level security;
alter table public.print_jobs enable row level security;
alter table public.omr_sheets enable row level security;
revoke all on public.omr_layouts,public.omr_templates,public.print_jobs,public.omr_sheets from public,anon,authenticated;
grant select on public.omr_layouts,public.omr_templates,public.print_jobs,public.omr_sheets to authenticated;
create policy layout_read on public.omr_layouts for select to authenticated using(private.can_read_workspace(school_id));
create policy template_read on public.omr_templates for select to authenticated using(private.can_read_workspace(school_id));
create policy print_job_read on public.print_jobs for select to authenticated using(private.can_read_workspace(school_id));
create policy sheet_read on public.omr_sheets for select to authenticated using(private.can_read_workspace(school_id));

-- Unicode Mark ranges mirror the browser's /\p{M}/ width rule. The wrapper
-- counts combining marks at zero advance and spaces at 0.32 em.
create function private.is_print_mark(cp integer) returns boolean language sql immutable set search_path='' as $$
  select cp between 768 and 879
    or cp between 1155 and 1161
    or cp between 1425 and 1469
    or cp=1471
    or cp between 1473 and 1474
    or cp between 1476 and 1477
    or cp=1479
    or cp between 1552 and 1562
    or cp between 1611 and 1631
    or cp=1648
    or cp between 1750 and 1756
    or cp between 1759 and 1764
    or cp between 1767 and 1768
    or cp between 1770 and 1773
    or cp=1809
    or cp between 1840 and 1866
    or cp between 1958 and 1968
    or cp between 2027 and 2035
    or cp=2045
    or cp between 2070 and 2073
    or cp between 2075 and 2083
    or cp between 2085 and 2087
    or cp between 2089 and 2093
    or cp between 2137 and 2139
    or cp between 2199 and 2207
    or cp between 2250 and 2273
    or cp between 2275 and 2307
    or cp between 2362 and 2364
    or cp between 2366 and 2383
    or cp between 2385 and 2391
    or cp between 2402 and 2403
    or cp between 2433 and 2435
    or cp=2492
    or cp between 2494 and 2500
    or cp between 2503 and 2504
    or cp between 2507 and 2509
    or cp=2519
    or cp between 2530 and 2531
    or cp=2558
    or cp between 2561 and 2563
    or cp=2620
    or cp between 2622 and 2626
    or cp between 2631 and 2632
    or cp between 2635 and 2637
    or cp=2641
    or cp between 2672 and 2673
    or cp=2677
    or cp between 2689 and 2691
    or cp=2748
    or cp between 2750 and 2757
    or cp between 2759 and 2761
    or cp between 2763 and 2765
    or cp between 2786 and 2787
    or cp between 2810 and 2815
    or cp between 2817 and 2819
    or cp=2876
    or cp between 2878 and 2884
    or cp between 2887 and 2888
    or cp between 2891 and 2893
    or cp between 2901 and 2903
    or cp between 2914 and 2915
    or cp=2946
    or cp between 3006 and 3010
    or cp between 3014 and 3016
    or cp between 3018 and 3021
    or cp=3031
    or cp between 3072 and 3076
    or cp=3132
    or cp between 3134 and 3140
    or cp between 3142 and 3144
    or cp between 3146 and 3149
    or cp between 3157 and 3158
    or cp between 3170 and 3171
    or cp between 3201 and 3203
    or cp=3260
    or cp between 3262 and 3268
    or cp between 3270 and 3272
    or cp between 3274 and 3277
    or cp between 3285 and 3286
    or cp between 3298 and 3299
    or cp=3315
    or cp between 3328 and 3331
    or cp between 3387 and 3388
    or cp between 3390 and 3396
    or cp between 3398 and 3400
    or cp between 3402 and 3405
    or cp=3415
    or cp between 3426 and 3427
    or cp between 3457 and 3459
    or cp=3530
    or cp between 3535 and 3540
    or cp=3542
    or cp between 3544 and 3551
    or cp between 3570 and 3571
    or cp=3633
    or cp between 3636 and 3642
    or cp between 3655 and 3662
    or cp=3761
    or cp between 3764 and 3772
    or cp between 3784 and 3790
    or cp between 3864 and 3865
    or cp=3893
    or cp=3895
    or cp=3897
    or cp between 3902 and 3903
    or cp between 3953 and 3972
    or cp between 3974 and 3975
    or cp between 3981 and 3991
    or cp between 3993 and 4028
    or cp=4038
    or cp between 4139 and 4158
    or cp between 4182 and 4185
    or cp between 4190 and 4192
    or cp between 4194 and 4196
    or cp between 4199 and 4205
    or cp between 4209 and 4212
    or cp between 4226 and 4237
    or cp=4239
    or cp between 4250 and 4253
    or cp between 4957 and 4959
    or cp between 5906 and 5909
    or cp between 5938 and 5940
    or cp between 5970 and 5971
    or cp between 6002 and 6003
    or cp between 6068 and 6099
    or cp=6109
    or cp between 6155 and 6157
    or cp=6159
    or cp between 6277 and 6278
    or cp=6313
    or cp between 6432 and 6443
    or cp between 6448 and 6459
    or cp between 6679 and 6683
    or cp between 6741 and 6750
    or cp between 6752 and 6780
    or cp=6783
    or cp between 6832 and 6862
    or cp between 6912 and 6916
    or cp between 6964 and 6980
    or cp between 7019 and 7027
    or cp between 7040 and 7042
    or cp between 7073 and 7085
    or cp between 7142 and 7155
    or cp between 7204 and 7223
    or cp between 7376 and 7378
    or cp between 7380 and 7400
    or cp=7405
    or cp=7412
    or cp between 7415 and 7417
    or cp between 7616 and 7679
    or cp between 8400 and 8432
    or cp between 11503 and 11505
    or cp=11647
    or cp between 11744 and 11775
    or cp between 12330 and 12335
    or cp between 12441 and 12442
    or cp between 42607 and 42610
    or cp between 42612 and 42621
    or cp between 42654 and 42655
    or cp between 42736 and 42737
    or cp=43010
    or cp=43014
    or cp=43019
    or cp between 43043 and 43047
    or cp=43052
    or cp between 43136 and 43137
    or cp between 43188 and 43205
    or cp between 43232 and 43249
    or cp=43263
    or cp between 43302 and 43309
    or cp between 43335 and 43347
    or cp between 43392 and 43395
    or cp between 43443 and 43456
    or cp=43493
    or cp between 43561 and 43574
    or cp=43587
    or cp between 43596 and 43597
    or cp between 43643 and 43645
    or cp=43696
    or cp between 43698 and 43700
    or cp between 43703 and 43704
    or cp between 43710 and 43711
    or cp=43713
    or cp between 43755 and 43759
    or cp between 43765 and 43766
    or cp between 44003 and 44010
    or cp between 44012 and 44013
    or cp=64286
    or cp between 65024 and 65039
    or cp between 65056 and 65071
    or cp=66045
    or cp=66272
    or cp between 66422 and 66426
    or cp between 68097 and 68099
    or cp between 68101 and 68102
    or cp between 68108 and 68111
    or cp between 68152 and 68154
    or cp=68159
    or cp between 68325 and 68326
    or cp between 68900 and 68903
    or cp between 68969 and 68973
    or cp between 69291 and 69292
    or cp between 69372 and 69375
    or cp between 69446 and 69456
    or cp between 69506 and 69509
    or cp between 69632 and 69634
    or cp between 69688 and 69702
    or cp=69744
    or cp between 69747 and 69748
    or cp between 69759 and 69762
    or cp between 69808 and 69818
    or cp=69826
    or cp between 69888 and 69890
    or cp between 69927 and 69940
    or cp between 69957 and 69958
    or cp=70003
    or cp between 70016 and 70018
    or cp between 70067 and 70080
    or cp between 70089 and 70092
    or cp between 70094 and 70095
    or cp between 70188 and 70199
    or cp=70206
    or cp=70209
    or cp between 70367 and 70378
    or cp between 70400 and 70403
    or cp between 70459 and 70460
    or cp between 70462 and 70468
    or cp between 70471 and 70472
    or cp between 70475 and 70477
    or cp=70487
    or cp between 70498 and 70499
    or cp between 70502 and 70508
    or cp between 70512 and 70516
    or cp between 70584 and 70592
    or cp=70594
    or cp=70597
    or cp between 70599 and 70602
    or cp between 70604 and 70608
    or cp=70610
    or cp between 70625 and 70626
    or cp between 70709 and 70726
    or cp=70750
    or cp between 70832 and 70851
    or cp between 71087 and 71093
    or cp between 71096 and 71104
    or cp between 71132 and 71133
    or cp between 71216 and 71232
    or cp between 71339 and 71351
    or cp between 71453 and 71467
    or cp between 71724 and 71738
    or cp between 71984 and 71989
    or cp between 71991 and 71992
    or cp between 71995 and 71998
    or cp=72000
    or cp between 72002 and 72003
    or cp between 72145 and 72151
    or cp between 72154 and 72160
    or cp=72164
    or cp between 72193 and 72202
    or cp between 72243 and 72249
    or cp between 72251 and 72254
    or cp=72263
    or cp between 72273 and 72283
    or cp between 72330 and 72345
    or cp between 72751 and 72758
    or cp between 72760 and 72767
    or cp between 72850 and 72871
    or cp between 72873 and 72886
    or cp between 73009 and 73014
    or cp=73018
    or cp between 73020 and 73021
    or cp between 73023 and 73029
    or cp=73031
    or cp between 73098 and 73102
    or cp between 73104 and 73105
    or cp between 73107 and 73111
    or cp between 73459 and 73462
    or cp between 73472 and 73473
    or cp=73475
    or cp between 73524 and 73530
    or cp between 73534 and 73538
    or cp=73562
    or cp=78912
    or cp between 78919 and 78933
    or cp between 90398 and 90415
    or cp between 92912 and 92916
    or cp between 92976 and 92982
    or cp=94031
    or cp between 94033 and 94087
    or cp between 94095 and 94098
    or cp=94180
    or cp between 94192 and 94193
    or cp between 113821 and 113822
    or cp between 118528 and 118573
    or cp between 118576 and 118598
    or cp between 119141 and 119145
    or cp between 119149 and 119154
    or cp between 119163 and 119170
    or cp between 119173 and 119179
    or cp between 119210 and 119213
    or cp between 119362 and 119364
    or cp between 121344 and 121398
    or cp between 121403 and 121452
    or cp=121461
    or cp=121476
    or cp between 121499 and 121503
    or cp between 121505 and 121519
    or cp between 122880 and 122886
    or cp between 122888 and 122904
    or cp between 122907 and 122913
    or cp between 122915 and 122916
    or cp between 122918 and 122922
    or cp=123023
    or cp between 123184 and 123190
    or cp=123566
    or cp between 123628 and 123631
    or cp between 124140 and 124143
    or cp between 124398 and 124399
    or cp between 125136 and 125142
    or cp between 125252 and 125258
    or cp between 917760 and 917999;
$$;
revoke all on function private.is_print_mark(integer) from public,anon,authenticated;
create function private.print_line_count(value text, width double precision, size double precision) returns integer
language plpgsql immutable set search_path='' as $$
declare i integer; character text; used double precision:=0; weight double precision; chars integer:=0; lines integer:=0;
begin
  for i in 1..length(value) loop
    character:=substr(value,i,1);
    weight:=case when private.is_print_mark(ascii(character)) then 0 when character=' ' then 0.32 else 1 end;
    if character=chr(10) or (used+size*weight>width and chars>0) then
      lines:=lines+1; used:=0; chars:=0;
      if character=chr(10) then continue; end if;
    end if;
    used:=used+size*weight; chars:=chars+1;
  end loop;
  if chars>0 or lines=0 then lines:=lines+1; end if;
  return lines;
end; $$;
revoke all on function private.print_line_count(text,double precision,double precision) from public,anon,authenticated;
create function private.validate_print_text_fit(layout jsonb) returns void language plpgsql immutable set search_path='' as $$
declare width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end;
begin
  if private.print_line_count(layout->>'school',width-72.5,3.3)>2
    or private.print_line_count(layout->>'title',width-72.5,3.3)>2
    or private.print_line_count('วิชา '||(layout->>'subject')||' · '||(layout->>'examType')||' · ชั้น '||(layout->>'classroom'),width-57,2.8)>2
    or private.print_line_count(layout->>'instructions',width-24,2.6)>2 then
    raise exception 'PRINT_TEXT_DOES_NOT_FIT';
  end if;
end; $$;
revoke all on function private.validate_print_text_fit(jsonb) from public,anon,authenticated;

create function private.validate_print_layout(tenant uuid, layout jsonb) returns public.exam_versions
language plpgsql security definer set search_path='' as $$
declare version_row public.exam_versions; config jsonb; field text; score numeric;
begin
  if jsonb_typeof(layout) is distinct from 'object' or not (layout ?& array['schemaVersion','school','title','subject','classroom','year','term','instructions','headerOffsetMm','logo','questionCount','choiceCount','paperMode','examId','examVersion','examType','totalScore','answerKeySignature'])
    or exists(select 1 from jsonb_object_keys(layout) k where k not in ('schemaVersion','school','title','subject','classroom','year','term','instructions','headerOffsetMm','logo','questionCount','choiceCount','paperMode','examId','examVersion','examType','totalScore','answerKeySignature'))
    then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  foreach field in array array['school','title','subject','classroom','instructions','paperMode','examId','examType','answerKeySignature'] loop
    if jsonb_typeof(layout->field) is distinct from 'string' then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  end loop;
  foreach field in array array['schemaVersion','year','term','headerOffsetMm','questionCount','choiceCount','examVersion','totalScore'] loop
    if jsonb_typeof(layout->field) is distinct from 'number' then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  end loop;
  if layout->'logo' is distinct from 'null'::jsonb or layout->>'schemaVersion'<>'1'
    or layout->>'paperMode' not in ('auto','full') or length(layout->>'school') not between 1 and 60
    or length(layout->>'instructions')>140 or (layout->>'headerOffsetMm')::numeric not between 0 and 5
    then raise exception 'INVALID_PRINT_LAYOUT'; end if;
  select * into version_row from public.exam_versions where school_id=tenant and exam_id=(layout->>'examId')::uuid
    and version_no::numeric=(layout->>'examVersion')::numeric and set_code='A';
  if not found then raise exception 'EXAM_VERSION_NOT_FOUND'; end if;
  config:=version_row.config_json;
  foreach field in array array['title','subject','classroom','year','term','questionCount','choiceCount','examType'] loop
    if layout->field is distinct from config->field then raise exception 'PRINT_EXAM_MISMATCH'; end if;
  end loop;
  select sum(points) into score from public.answer_keys where school_id=tenant and exam_version_id=version_row.id;
  if (layout->>'totalScore')::numeric is distinct from score or (layout->>'answerKeySignature')::jsonb is distinct from config->'answerKey'
    then raise exception 'PRINT_KEY_MISMATCH'; end if;
  return version_row;
end; $$;
revoke all on function private.validate_print_layout(uuid,jsonb) from public,anon,authenticated;

-- Exact object shape plus a small numeric tolerance bridges JS / PostgreSQL
-- floating point serialization; it does not allow arbitrary coordinates.
create function private.print_json_matches(actual jsonb, expected jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item record;
begin
  if jsonb_typeof(actual) is distinct from jsonb_typeof(expected) then return false; end if;
  if jsonb_typeof(expected)='number' then return abs((actual #>> '{}')::numeric-(expected #>> '{}')::numeric)<0.0000001; end if;
  if jsonb_typeof(expected)='object' then
    if (select count(*) from jsonb_object_keys(actual))<>(select count(*) from jsonb_object_keys(expected)) then return false; end if;
    for item in select key,value from jsonb_each(expected) loop
      if not private.print_json_matches(actual->item.key,item.value) then return false; end if;
    end loop; return true;
  end if;
  if jsonb_typeof(expected)='array' then
    if jsonb_array_length(actual)<>jsonb_array_length(expected) then return false; end if;
    for item in select value,ordinality from jsonb_array_elements(expected) with ordinality loop
      if not private.print_json_matches(actual->(item.ordinality::integer-1),item.value) then return false; end if;
    end loop; return true;
  end if;
  return actual=expected;
end; $$;
revoke all on function private.print_json_matches(jsonb,jsonb) from public,anon,authenticated;
create function private.expected_print_geometry(layout jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare width double precision:=case when layout->>'paperMode'='full' then 297 else 148.5 end;
  factor double precision; questions integer:=(layout->>'questionCount')::integer; options integer:=(layout->>'choiceCount')::integer;
  columns integer; rows integer; column_width double precision; q integer; o integer; d integer; v integer;
  x double precision; y double precision; blocks jsonb; ids jsonb:='[]'; answers jsonb:='[]'; labels jsonb:='[]'; values_json jsonb;
begin
  columns:=ceil(questions/16.0); rows:=ceil(questions::numeric/columns); column_width:=(width-12-59)/columns; factor:=900/width;
  if columns>floor((width-12-59)/((options-1)*5.5+3.6+12)) then raise exception 'INVALID_PRINT_GEOMETRY'; end if;
  for d in 0..4 loop
    labels:=labels||jsonb_build_array('student_code_'||(d+1));
    for v in 0..9 loop ids:=ids||jsonb_build_array(jsonb_build_object('x',15+d*5.5,'y',82+v*5.5,'digit',d,'value',v)); end loop;
  end loop;
  blocks:=jsonb_build_object('student_code',jsonb_build_object('fieldType','QTYPE_INT','fieldLabels',labels,'origin',jsonb_build_array((15-1.8)*factor,(82-1.8)*factor),'bubblesGap',5.5*factor,'labelsGap',5.5*factor));
  values_json:=case when options=4 then '["A","B","C","D"]'::jsonb else '["A","B","C","D","E"]'::jsonb end;
  for q in 1..questions loop
    x:=66+floor((q-1)::numeric/rows)*column_width;
    y:=82+((q-1)%rows)*6+floor(((q-1)%rows)/5.0)*1.5;
    blocks:=blocks||jsonb_build_object('answer_'||q,jsonb_build_object('bubbleValues',values_json,'direction','horizontal','fieldLabels',jsonb_build_array('q'||q),'origin',jsonb_build_array((x-1.8)*factor,(y-1.8)*factor),'bubblesGap',5.5*factor,'labelsGap',6*factor));
    for o in 0..options-1 loop answers:=answers||jsonb_build_array(jsonb_build_object('question',q,'option',o,'x',x+o*5.5,'y',y)); end loop;
  end loop;
  return jsonb_build_object('schemaVersion',1,'geometryVersion',2,'pageDimensions',jsonb_build_array(900,round(210*factor)),
    'bubbleDimensions',jsonb_build_array(3.6*factor,3.6*factor),'preProcessors','[]'::jsonb,'customLabels','{}'::jsonb,'emptyValue','',
    'fieldBlocks',blocks,'centersMm',jsonb_build_object('id',ids,'answers',answers));
end; $$;
revoke all on function private.expected_print_geometry(jsonb) from public,anon,authenticated;

create function public.save_omr_layout(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare tenant uuid:=(input->>'school_id')::uuid; layout jsonb:=input->'layout'; version_row public.exam_versions;
begin
  if not private.owns_workspace(tenant) then raise exception 'FORBIDDEN'; end if;
  version_row:=private.validate_print_layout(tenant,layout);
  insert into public.omr_layouts(school_id,exam_id,exam_version_id,layout_json,updated_by)
    values(tenant,version_row.exam_id,version_row.id,layout,auth.uid())
    on conflict(exam_version_id) do update set layout_json=excluded.layout_json,updated_by=excluded.updated_by,updated_at=now();
  insert into public.audit_logs(school_id,actor_user_id,action,module_name,resource_type,resource_id,new_values,display_message)
    values(tenant,auth.uid(),'save_omr_layout','omr','exam_version',version_row.id,layout,'บันทึกรูปแบบกระดาษคำตอบ');
  return layout;
end; $$;
revoke all on function public.save_omr_layout(jsonb) from public,anon;
grant execute on function public.save_omr_layout(jsonb) to authenticated;

create function public.register_omr_print(input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
    -- Freeze the exam key/version as soon as paper is registered. Later edits
    -- create a new version; they cannot alter the key used by existing papers.
    if selected_ids is not null and exists(select 1 from unnest(selected_ids) selected(id) left join public.students s on s.id=selected.id and s.school_id=tenant
      where s.id is null or s.classroom_name is distinct from layout->>'classroom') then raise exception 'PRINT_STUDENT_NOT_IN_CLASS'; end if;
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
        if not found or student_row.classroom_name is distinct from layout->>'classroom' then raise exception 'PRINT_STUDENT_NOT_IN_CLASS'; end if;
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
revoke all on function public.register_omr_print(jsonb) from public,anon;
grant execute on function public.register_omr_print(jsonb) to authenticated;
commit;
