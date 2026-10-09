import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000011";
const a = "10000000-0000-4000-8000-000000000012";
const b = "10000000-0000-4000-8000-000000000013";
const pending = "10000000-0000-4000-8000-000000000014";
const spoof = "10000000-0000-4000-8000-000000000015";
let sa: string, sb: string;
async function asUser(user: string, sql: string, values: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    return tx.query(sql, values);
  });
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid references auth.users(id),provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
  for (const file of ["202610080001_foundation.sql", "202610080002_adaptive_answer_sheets.sql", "202610080003_roster_school_logo.sql", "202610090004_accounts_storage.sql"])
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  for (const [id,email] of [[owner,"piyawatpiwsiri@gmail.com"],[a,"teacher-a@example.com"],[b,"teacher-b@example.com"],[pending,"pending@example.com"],[spoof,"spoof@example.com"]]) {
    await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[id,email]);
    if(id!==spoof) await db.query("insert into auth.identities values($1,'google',$2::jsonb)",[id,JSON.stringify({email,email_verified:true})]);
  }
},60000);
afterAll(async () => { await db.close(); });
describe("current Google approval and personal workspace PostgreSQL rules",()=>{
  it("does not turn the first arbitrary login into owner or provision pending workspaces",async()=>{
    const result = await asUser(pending,"select get_access_context() as access");
    expect(result.rows[0]).toMatchObject({access:{role:"teacher",status:"pending",schoolId:null}});
    await expect(asUser(pending,"select ensure_personal_workspace()")).rejects.toThrow("ACCESS_NOT_APPROVED");
    await expect(asUser(pending,"insert into schools(name_th,created_by) values('bypass',$1)",[pending])).rejects.toThrow();
    await expect(asUser(pending,"update user_access set status='approved',role='owner' where user_id=$1",[pending])).rejects.toThrow();
  });
  it("ignores fake client owner metadata and requires the configured verified Google identity",async()=>{
    await db.query("update auth.users set raw_user_meta_data=$2::jsonb where id=$1",[spoof,JSON.stringify({role:"owner",status:"approved",email:"piyawatpiwsiri@gmail.com"})]);
    expect((await asUser(spoof,"select get_access_context() as access")).rows[0]).toMatchObject({access:{role:"teacher",status:"pending"}});
    await db.query("update auth.users set email_confirmed_at=null where id=$1",[owner]);
    expect((await asUser(owner,"select get_access_context() as access")).rows[0]).toMatchObject({access:{role:"teacher",status:"pending"}});
    await db.query("update auth.users set email_confirmed_at=now() where id=$1",[owner]);
    await db.query("update auth.identities set identity_data=$2::jsonb where user_id=$1",[owner,JSON.stringify({email:"piyawatpiwsiri@gmail.com",email_verified:false})]);
    expect((await asUser(owner,"select get_access_context() as access")).rows[0]).toMatchObject({access:{role:"teacher",status:"pending"}});
    await db.query("update auth.identities set identity_data=$2::jsonb where user_id=$1",[owner,JSON.stringify({email:"different@gmail.com",email_verified:true})]);
    expect((await asUser(owner,"select get_access_context() as access")).rows[0]).toMatchObject({access:{role:"teacher",status:"pending"}});
    await db.query("update auth.identities set identity_data=$2::jsonb where user_id=$1",[owner,JSON.stringify({email:"piyawatpiwsiri@gmail.com",email_verified:true})]);
    const result=await asUser(owner,"select get_access_context() as access");
    expect(result.rows[0]).toMatchObject({access:{role:"owner",status:"approved"}});
    expect((await asUser(owner,"select get_access_context() as access")).rows[0]).toEqual(result.rows[0]);
    expect((await db.query("select * from access_audit_logs where action='claim_platform_owner'")).rows).toHaveLength(1);
  });
  it("only the owner can approve and keeps users' workspaces separate",async()=>{
    await expect(asUser(a,"select decide_user_access($1::jsonb)",[JSON.stringify({userId:a,status:"approved",reason:"self approval"})])).rejects.toThrow("FORBIDDEN");
    for(const id of [a,b]) await asUser(owner,"select decide_user_access($1::jsonb)",[JSON.stringify({userId:id,status:"approved",reason:"อนุมัติครูทดสอบ"})]);
    sa=((await asUser(a,"select get_access_context() as access")).rows[0] as {access:{schoolId:string}}).access.schoolId;
    sb=((await asUser(b,"select get_access_context() as access")).rows[0] as {access:{schoolId:string}}).access.schoolId;
    expect(sa).not.toBe(sb);
    const input={school_id:sa,filename:"test.csv",students:[{student_code:"02074",prefix:"เด็กชาย",first_name:"สมชาย",last_name:"ทดสอบ",classroom_name:"ม.1/2",number:null}]};
    await asUser(a,"select import_students($1::jsonb)",[JSON.stringify(input)]);
    expect((await asUser(a,"select student_code from students")).rows).toEqual([{student_code:"02074"}]);
    expect((await asUser(b,"select * from students")).rows).toEqual([]);
    expect((await asUser(pending,"select * from students")).rows).toEqual([]);
    expect((await asUser(owner,"select * from students")).rows).toHaveLength(1);
    expect((await asUser(pending,"select private.is_approved($1) as allowed",[a])).rows).toEqual([{allowed:false}]);
    expect((await asUser(a,"select private.is_approved() as allowed")).rows).toEqual([{allowed:true}]);
    await expect(asUser(owner,"select import_students($1::jsonb)",[JSON.stringify(input)])).rejects.toThrow("FORBIDDEN");
    await expect(asUser(b,"select import_students($1::jsonb)",[JSON.stringify(input)])).rejects.toThrow("FORBIDDEN");
  });
  it("accepts only classrooms present in the same user's actual roster, including direct RPCs",async()=>{
    const config={school_id:sa,title:"ข้อสอบทดสอบ",subject:"คณิตศาสตร์",classroom:"ม.1/2",examType:"เก็บคะแนน",questionCount:1,choiceCount:4,year:2569,term:1,passingPercent:50,answerKey:[{question:1,correct:"A",points:1}]};
    await expect(asUser(a,"select create_exam_draft($1::jsonb)",[JSON.stringify({...config,classroom:"ม.1/1"})])).rejects.toThrow("CLASSROOM_NOT_IN_ROSTER");
    await expect(asUser(b,"select create_exam_draft($1::jsonb)",[JSON.stringify({...config,school_id:sb})])).rejects.toThrow("CLASSROOM_NOT_IN_ROSTER");
    const created=await asUser(a,"select create_exam_draft($1::jsonb)",[JSON.stringify(config)]);
    expect(created.rows).toHaveLength(1);
    expect((await asUser(b,"select * from exams")).rows).toHaveLength(0);
    expect((await asUser(owner,"select * from exams where school_id=$1",[sa])).rows).toHaveLength(1);
    await expect(asUser(owner,"select create_exam_draft($1::jsonb)",[JSON.stringify(config)])).rejects.toThrow("FORBIDDEN");
  });
  it("settings remain personal and validate direct-RPC data without trusting metadata",async()=>{
    const settings={school_id:sa,school:"โรงเรียนทดสอบ",settings:{academicYear:2569,term:2,subjects:["คณิตศาสตร์","วิทยาศาสตร์"]}};
    await asUser(a,"select update_workspace_settings($1::jsonb)",[JSON.stringify(settings)]);
    expect((await asUser(a,"select name_th,settings from schools where id=$1",[sa])).rows[0]).toMatchObject({name_th:"โรงเรียนทดสอบ",settings:settings.settings});
    for(const user of [b,pending,owner]) await expect(asUser(user,"select update_workspace_settings($1::jsonb)",[JSON.stringify(settings)])).rejects.toThrow("FORBIDDEN");
    for(const invalid of [{...settings.settings,term:4},{...settings.settings,academicYear:2569.5},{...settings.settings,subjects:[""]},{...settings.settings,subjects:[42]}])
      await expect(asUser(a,"select update_workspace_settings($1::jsonb)",[JSON.stringify({...settings,settings:invalid})])).rejects.toThrow("INVALID_SETTINGS");
  });
  it("isolates original logo objects, protects the current logo, and queues only old files",async()=>{
    const first=`${sa}/30000000-0000-4000-8000-000000000001.png`;
    const second=`${sa}/30000000-0000-4000-8000-000000000002.png`;
    await asUser(a,"insert into storage.objects(bucket_id,name) values('school-logos',$1)",[first]);
    expect((await asUser(b,"select * from storage.objects")).rows).toHaveLength(0);
    expect((await asUser(owner,"select * from storage.objects")).rows).toHaveLength(1);
    await expect(asUser(b,"insert into storage.objects(bucket_id,name) values('school-logos',$1)",[second])).rejects.toThrow();
    let revision=((await asUser(a,"select logo_revision from schools where id=$1",[sa])).rows[0] as {logo_revision:string}).logo_revision;
    await asUser(a,"select update_school_logo($1::jsonb)",[JSON.stringify({school_id:sa,expected_revision:revision,object_path:first})]);
    expect((await asUser(a,"delete from storage.objects where name=$1 returning name",[first])).rows).toHaveLength(0);
    expect((await asUser(owner,"delete from storage.objects where name=$1 returning name",[first])).rows).toHaveLength(0);
    await asUser(a,"insert into storage.objects(bucket_id,name) values('school-logos',$1)",[second]);
    revision=((await asUser(a,"select logo_revision from schools where id=$1",[sa])).rows[0] as {logo_revision:string}).logo_revision;
    await asUser(a,"select update_school_logo($1::jsonb)",[JSON.stringify({school_id:sa,expected_revision:revision,object_path:second})]);
    expect((await asUser(a,"select object_path from logo_cleanup_jobs")).rows).toEqual([{object_path:first}]);
    const job=(await asUser(a,"select id from logo_cleanup_jobs")).rows[0] as {id:string};
    await expect(asUser(a,"select complete_logo_cleanup($1::jsonb)",[JSON.stringify({school_id:sa,job_id:job.id})])).rejects.toThrow("LOGO_CLEANUP_INCOMPLETE");
    const latest=((await asUser(a,"select logo_revision from schools where id=$1",[sa])).rows[0] as {logo_revision:string}).logo_revision;
    await expect(asUser(a,"select update_school_logo($1::jsonb)",[JSON.stringify({school_id:sa,expected_revision:latest,object_path:first})])).rejects.toThrow("INVALID_LOGO");
    await expect(asUser(a,"delete from logo_cleanup_jobs where id=$1",[job.id])).rejects.toThrow();
    await expect(asUser(a,"select queue_logo_cleanup($1::jsonb)",[JSON.stringify({school_id:sa,object_path:second})])).rejects.toThrow("INVALID_LOGO");
    expect((await asUser(a,"delete from storage.objects where name=$1 returning name",[first])).rows).toHaveLength(1);
    await asUser(a,"select complete_logo_cleanup($1::jsonb)",[JSON.stringify({school_id:sa,job_id:job.id})]);
    expect((await asUser(a,"select * from logo_cleanup_jobs")).rows).toHaveLength(0);
    await expect(asUser(a,"select update_school_logo($1::jsonb)",[JSON.stringify({school_id:sa,expected_revision:revision,object_path:first})])).rejects.toThrow("STALE_LOGO");
  });
  it("failed-upload orphan cleanup is durable, private, and never reactivated",async()=>{
    const path=`${sa}/30000000-0000-4000-8000-000000000099.jpg`;
    await asUser(a,"insert into storage.objects(bucket_id,name) values('school-logos',$1)",[path]);
    expect((await asUser(a,"delete from storage.objects where name=$1 returning name",[path])).rows).toHaveLength(0);
    await expect(asUser(b,"select queue_logo_cleanup($1::jsonb)",[JSON.stringify({school_id:sa,object_path:path})])).rejects.toThrow("FORBIDDEN");
    await asUser(a,"select queue_logo_cleanup($1::jsonb)",[JSON.stringify({school_id:sa,object_path:path})]);
    await asUser(a,"select queue_logo_cleanup($1::jsonb)",[JSON.stringify({school_id:sa,object_path:path})]);
    expect((await asUser(a,"select * from logo_cleanup_jobs")).rows).toHaveLength(1);
    expect((await asUser(b,"select * from logo_cleanup_jobs")).rows).toHaveLength(0);
    const revision=((await asUser(a,"select logo_revision from schools where id=$1",[sa])).rows[0] as {logo_revision:string}).logo_revision;
    await expect(asUser(a,"select update_school_logo($1::jsonb)",[JSON.stringify({school_id:sa,expected_revision:revision,object_path:path})])).rejects.toThrow("INVALID_LOGO");
    expect((await asUser(a,"delete from storage.objects where name=$1 returning name",[path])).rows).toHaveLength(1);
  });
  it("a suspension blocks access using the existing user ID, without waiting for a new JWT",async()=>{
    await asUser(owner,"select decide_user_access($1::jsonb)",[JSON.stringify({userId:a,status:"suspended",reason:"ระงับเพื่อทดสอบ"})]);
    expect((await asUser(a,"select * from students")).rows).toHaveLength(0);
    expect((await asUser(a,"select * from storage.objects")).rows).toHaveLength(0);
    await expect(asUser(a,"select ensure_personal_workspace()")).rejects.toThrow("ACCESS_NOT_APPROVED");
    await expect(asUser(owner,"select decide_user_access($1::jsonb)",[JSON.stringify({userId:owner,status:"suspended",reason:"self lockout"})])).rejects.toThrow("OWNER_PROTECTED");
    await asUser(owner,"select decide_user_access($1::jsonb)",[JSON.stringify({userId:a,status:"approved",reason:"เปิดกลับหลังทดสอบ"})]);
    expect((await asUser(a,"select get_access_context() as access")).rows[0]).toMatchObject({access:{schoolId:sa}});
  });
});
