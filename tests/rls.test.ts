import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { demoExams } from "@/lib/demo";
const db = new PGlite();
const a = "10000000-0000-4000-8000-000000000001",
  b = "10000000-0000-4000-8000-000000000002",
  reviewer = "10000000-0000-4000-8000-000000000003",
  colleague = "10000000-0000-4000-8000-000000000004";
const sa = "20000000-0000-4000-8000-000000000001",
  sb = "20000000-0000-4000-8000-000000000002";
async function asUser(user: string, sql: string, values: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    return tx.query(sql, values);
  });
}
beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
  );
  await db.exec(
    await readFile("supabase/migrations/202610080001_foundation.sql", "utf8"),
  );
  await db.exec(
    await readFile(
      "supabase/migrations/202610080002_adaptive_answer_sheets.sql",
      "utf8",
    ),
  );
  for (const user of [a, b, reviewer, colleague])
    await db.query("insert into auth.users(id) values($1)", [user]);
  await asUser(
    a,
    "insert into schools(id,name_th,created_by) values($1,'โรงเรียน ก',$2)",
    [sa, a],
  );
  await asUser(
    b,
    "insert into schools(id,name_th,created_by) values($1,'โรงเรียน ข',$2)",
    [sb, b],
  );
  await db.query(
    "insert into school_members(school_id,user_id,role) values($1,$2,'reviewer'),($1,$3,'teacher')",
    [sa, reviewer, colleague],
  );
}, 60000);
afterAll(async () => {
  await db.close();
});
describe("actual PostgreSQL RLS/RPC (local auth stub)", () => {
  it("only exposes one's school and rejects forged ownership", async () => {
    expect((await asUser(a, "select id from schools")).rows).toEqual([
      { id: sa },
    ]);
    expect((await asUser(b, "select id from schools")).rows).toEqual([
      { id: sb },
    ]);
    await expect(
      asUser(b, "insert into schools(name_th,created_by) values('ปลอม',$1)", [
        a,
      ]),
    ).rejects.toThrow();
  });
  it("imports exact string codes atomically and audits counts only", async () => {
    const row = {
      student_code: "02074",
      first_name: "ทดสอบ",
      last_name: "ตัวอย่าง",
      classroom_name: "ม.1/2",
      number: 1,
    };
    const data = { school_id: sa, filename: "class.csv", students: [row] };
    await asUser(a, "select import_students($1::jsonb)", [
      JSON.stringify(data),
    ]);
    expect((await asUser(a, "select student_code from students")).rows).toEqual(
      [{ student_code: "02074" }],
    );
    expect((await asUser(b, "select * from students")).rows).toEqual([]);
    expect((await asUser(reviewer, "select * from students")).rows).toEqual([]);
    await expect(
      asUser(b, "select import_students($1::jsonb)", [JSON.stringify(data)]),
    ).rejects.toThrow();
    await expect(
      asUser(a, "select import_students($1::jsonb)", [
        JSON.stringify({
          ...data,
          students: [{ ...row, student_code: "00001" }, row],
        }),
      ]),
    ).rejects.toThrow();
    expect(
      (await asUser(a, "select count(*)::int as n from students")).rows,
    ).toEqual([{ n: 1 }]);
    await expect(
      asUser(a, "select import_students($1::jsonb)", [
        JSON.stringify({ ...data, students: [{ ...row, student_code: 2074 }] }),
      ]),
    ).rejects.toThrow();
    await expect(
      asUser(a, "select import_students($1::jsonb)", [
        JSON.stringify({ school_id: sa, filename: "missing.csv" }),
      ]),
    ).rejects.toThrow();
  });
  it("creates keys in one transaction, scopes exams, blocks incomplete RPC input", async () => {
    const data = { ...demoExams[0], school_id: sa };
    const result = await asUser(
      a,
      "select create_exam_draft($1::jsonb) as created",
      [JSON.stringify(data)],
    );
    const created = (result.rows[0] as { created: { id: string } }).created;
    expect((await asUser(a, "select * from answer_keys")).rows).toHaveLength(
      20,
    );
    expect((await asUser(b, "select * from exams")).rows).toHaveLength(0);
    expect((await asUser(colleague, "select * from exams")).rows).toHaveLength(
      0,
    );
    await db.query(
      "insert into exam_access(school_id,exam_id,user_id) values($1,$2,$3)",
      [sa, created.id, colleague],
    );
    expect((await asUser(colleague, "select * from exams")).rows).toHaveLength(
      1,
    );
    await expect(
      asUser(a, "select create_exam_draft($1::jsonb)", [
        JSON.stringify({ school_id: sa, title: "missing" }),
      ]),
    ).rejects.toThrow();
    await expect(
      asUser(reviewer, "select create_exam_draft($1::jsonb)", [
        JSON.stringify(data),
      ]),
    ).rejects.toThrow();
  });
  it("accepts 60 five-choice keys, rejects invalid counts/options, and preserves old versions", async () => {
    const data = {
      ...demoExams[0],
      school_id: sa,
      questionCount: 60,
      choiceCount: 5,
      answerKey: Array.from({ length: 60 }, (_, i) => ({
        question: i + 1,
        correct: "E",
        points: 2,
      })),
    };
    const result = await asUser(
      a,
      "select create_exam_draft($1::jsonb) as created",
      [JSON.stringify(data)],
    );
    const id = (result.rows[0] as { created: { id: string } }).created.id;
    const old = (
      await asUser(a, "select * from exam_versions where exam_id=$1", [id])
    ).rows;
    await db.query(
      "update exam_versions set published_at=now() where exam_id=$1",
      [id],
    );
    const update = {
      ...data,
      exam_id: id,
      expected_version: 1,
      questionCount: 10,
      choiceCount: 4,
      answerKey: Array.from({ length: 10 }, (_, i) => ({
        question: i + 1,
        correct: "A",
        points: 1,
      })),
    };
    await asUser(a, "select create_exam_version($1::jsonb)", [
      JSON.stringify(update),
    ]);
    const versions = (
      await asUser(
        a,
        "select version_no,config_json from exam_versions where exam_id=$1 order by version_no",
        [id],
      )
    ).rows as { version_no: number; config_json: unknown }[];
    expect(versions.map((v) => v.version_no)).toEqual([1, 2]);
    expect(versions[0].config_json).toEqual(
      (old[0] as { config_json: unknown }).config_json,
    );
    expect(
      (
        await asUser(
          a,
          "select a.* from answer_keys a join exam_versions v on a.exam_version_id=v.id where v.exam_id=$1 and v.version_no=1",
          [id],
        )
      ).rows,
    ).toHaveLength(60);
    await expect(
      asUser(a, "select create_exam_version($1::jsonb)", [
        JSON.stringify(update),
      ]),
    ).rejects.toThrow("STALE_EXAM_VERSION");
    await expect(
      asUser(b, "select create_exam_version($1::jsonb)", [
        JSON.stringify({ ...update, expected_version: 2 }),
      ]),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asUser(colleague, "select create_exam_version($1::jsonb)", [
        JSON.stringify({ ...update, expected_version: 2 }),
      ]),
    ).rejects.toThrow("FORBIDDEN");
    for (const patch of [
      { questionCount: 61 },
      { questionCount: 59 },
      { questionCount: 59.5 },
      { choiceCount: 4 },
      { choiceCount: 6 },
      { answerKey: null },
    ])
      await expect(
        asUser(a, "select create_exam_draft($1::jsonb)", [
          JSON.stringify({ ...data, ...patch }),
        ]),
      ).rejects.toThrow();
    const audits = (
      await asUser(
        a,
        "select action from audit_logs where action='update_answer_key'",
      )
    ).rows;
    expect(audits).toHaveLength(1);
  });
  it("blocks direct writes and published-version/key mutations", async () => {
    await expect(
      asUser(a, "update answer_keys set correct_option='D'"),
    ).rejects.toThrow();
    await db.exec(
      "update exam_versions set published_at=now() where published_at is null",
    );
    await expect(
      db.exec("update exam_versions set config_json='{}'"),
    ).rejects.toThrow("PUBLISHED_VERSION_IMMUTABLE");
    await expect(db.exec("update answer_keys set points=2")).rejects.toThrow(
      "PUBLISHED_KEY_IMMUTABLE",
    );
  });
});
