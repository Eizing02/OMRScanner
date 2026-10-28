import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createSetIdentity } from "@/lib/omr/qr";
import { defaultLayout as currentLayout } from "@/lib/omr/generate-template";
const defaultLayout = {
  ...currentLayout,
  printStyle: "school" as const,
  instructions:
    "ตรวจข้อมูลนักเรียน ใช้ดินสอ 2B ฝนคำตอบให้เต็มวง เพียงหนึ่งคำตอบต่อข้อ",
};
const db = new PGlite();
const owner = "20000000-0000-4000-8000-000000000011",
  teacher = "20000000-0000-4000-8000-000000000012",
  other = "20000000-0000-4000-8000-000000000013";
let school: string,
  otherSchool: string,
  studentId: string,
  secondStudentId: string;
async function asUser(user: string, sql: string, values: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    return tx.query(sql, values);
  });
}
async function rpc<T = Record<string, unknown>>(
  user: string,
  name: string,
  input: unknown,
): Promise<T> {
  return (
    (
      await asUser(user, `select public.${name}($1::jsonb) as result`, [
        JSON.stringify(input),
      ])
    ).rows[0] as { result: T }
  ).result;
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid references auth.users(id),provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
  for (const file of [
    "202610080001_foundation.sql",
    "202610080002_adaptive_answer_sheets.sql",
    "202610080003_roster_school_logo.sql",
    "202610090004_accounts_storage.sql",
    "202610090005_print_registry.sql",
    "202610090006_scanning_review.sql",
    "202610090007_compact_print.sql",
    "202610090008_exam_lifecycle_retention.sql",
    "202610090009_school_print_header.sql",
  ])
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  for (const [id, email] of [
    [owner, "piyawatpiwsiri@gmail.com"],
    [teacher, "teacher@example.com"],
    [other, "other@example.com"],
  ]) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [id, email],
    );
    await db.query(
      "insert into auth.identities values($1,'google',$2::jsonb)",
      [id, JSON.stringify({ email, email_verified: true })],
    );
  }
  await asUser(owner, "select get_access_context()");
  for (const id of [teacher, other])
    await rpc(owner, "decide_user_access", {
      userId: id,
      status: "approved",
      reason: "อนุมัติทดสอบ",
    });
  school = (
    (await asUser(teacher, "select get_access_context() as result"))
      .rows[0] as { result: { schoolId: string } }
  ).result.schoolId;
  otherSchool = (
    (await asUser(other, "select get_access_context() as result")).rows[0] as {
      result: { schoolId: string };
    }
  ).result.schoolId;
  const imported = await rpc<{ id: string }[]>(teacher, "import_students", {
    school_id: school,
    filename: "test.csv",
    students: [
      {
        student_code: "02074",
        prefix: "เด็กชาย",
        first_name: "สมชาย",
        last_name: "ทดสอบ",
        classroom_name: "ม.1/2",
        number: null,
      },
      {
        student_code: "00005",
        prefix: "เด็กหญิง",
        first_name: "ตัวอย่าง",
        last_name: "ทดสอบ",
        classroom_name: "ม.1/2",
        number: null,
      },
    ],
  });
  studentId = imported[0].id;
  secondStudentId = imported[1].id;
}, 60000);
afterAll(async () => {
  await db.close();
});
const title = "ชุดสอบทดสอบการลบ";
async function examFixture(twoUp = false) {
  const answerKey = Array.from({ length: 20 }, (_, i) => ({
    question: i + 1,
    correct: "A",
    points: 1,
  }));
  const exam = await rpc<{ id: string }>(teacher, "create_exam_draft", {
    school_id: school,
    title,
    subject: "คณิตศาสตร์",
    classroom: "ม.1/2",
    examType: "เก็บคะแนน",
    questionCount: 20,
    choiceCount: 4,
    year: 2569,
    term: 1,
    passingPercent: 50,
    answerKey,
  });
  const identity = await createSetIdentity({
    ...defaultLayout,
    school: "พื้นที่ส่วนตัว",
    examId: exam.id,
    title,
    classroom: "ม.1/2",
    answerKeySignature: JSON.stringify(answerKey),
  });
  const print = await rpc<{ jobId: string; templateUuid: string }>(
    teacher,
    "register_omr_print",
    {
      school_id: school,
      request_id: crypto.randomUUID(),
      identity_json: JSON.stringify(identity.snapshot),
      student_ids: twoUp ? [studentId, secondStudentId] : [studentId],
    },
  );
  const upload = await rpc<{
    id: string;
    original_path: string | null;
    processed_path: string;
  }>(teacher, "reserve_scan_upload", {
    school_id: school,
    exam_id: exam.id,
    request_id: crypto.randomUUID(),
    payload_hash: "b".repeat(64),
  });
  await asUser(
    teacher,
    "insert into storage.objects(bucket_id,name) values('scan-images',$1)",
    [upload.processed_path],
  );
  const scans = await rpc<{ id: string; score: number }[]>(
    teacher,
    "save_scan_batch",
    {
      school_id: school,
      upload_id: upload.id,
      paper: twoUp ? "a4" : "single",
      records: (twoUp ? ["02074", "00005"] : ["02074"]).map((code, slot) => ({
        token: identity.token,
        slot,
        student_code: code,
        digits: Array.from(code, (v, digit) => ({
          digit,
          value: Number(v),
          state: "valid",
          fills: Array.from({ length: 10 }, (_, i) =>
            i === Number(v) ? 100 : 0,
          ),
        })),
        answers: Array.from({ length: 20 }, (_, i) => ({
          question: i + 1,
          choice: "A",
          state: "valid",
          fills: [90, 0, 0, 0],
          confidence: 1,
        })),
      })),
    },
  );
  return { exam, print, upload, scans, identity };
}
describe("008: workspace-scoped exam lifecycle and processed-only retention", () => {
  it("purges both two-up scores sharing one image without touching another exam", async () => {
    const kept = await examFixture(),
      deleted = await examFixture(true);
    expect(deleted.scans).toHaveLength(2);
    expect(deleted.scans.map((s) => s.score)).toEqual([20, 20]);
    const job = await rpc<{
      id: string;
      paths: string[];
      counts: { scans: number; images: number };
    }>(teacher, "begin_exam_deletion", {
      school_id: school,
      exam_id: deleted.exam.id,
      confirmation: title,
    });
    expect(job.paths).toEqual([deleted.upload.processed_path]);
    expect(job.counts.scans).toBe(2);
    await asUser(teacher, "delete from storage.objects where name=$1", [
      deleted.upload.processed_path,
    ]);
    await rpc(teacher, "finish_exam_deletion", {
      school_id: school,
      job_id: job.id,
    });
    expect(
      (
        await db.query("select id from exam_results where exam_id=$1", [
          deleted.exam.id,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query("select score from exam_results where exam_id=$1", [
          kept.exam.id,
        ])
      ).rows,
    ).toEqual([{ score: "20" }]);
    expect(
      (
        await db.query("select name from storage.objects where name=$1", [
          kept.upload.processed_path,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("saves only processed evidence, grades 20, and retires absent originals idempotently", async () => {
    const f = await examFixture();
    expect(f.upload.original_path).toBeNull();
    expect(f.scans[0].score).toBe(20);
    expect(
      (
        await db.query("select image_url from scan_records where id=$1", [
          f.scans[0].id,
        ])
      ).rows,
    ).toEqual([{ image_url: null }]);
    expect(
      await rpc(teacher, "retire_scan_original", {
        school_id: school,
        scan_id: f.scans[0].id,
      }),
    ).toEqual({ path: null });
  });
  it("archives/restores persistently without deleting grades, blocks other teacher and read-only owner", async () => {
    const f = await examFixture();
    const input = { school_id: school, ids: [f.exam.id], archived: true };
    await expect(rpc(other, "set_exam_archived", input)).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(rpc(owner, "set_exam_archived", input)).rejects.toThrow(
      "FORBIDDEN",
    );
    await rpc(teacher, "set_exam_archived", input);
    expect(
      (await db.query("select archived from exams where id=$1", [f.exam.id]))
        .rows,
    ).toEqual([{ archived: true }]);
    await rpc(teacher, "set_exam_archived", { ...input, archived: false });
    expect(
      (
        await db.query("select score from exam_results where scan_id=$1", [
          f.scans[0].id,
        ])
      ).rows,
    ).toEqual([{ score: "20" }]);
  });
  it("keeps immutable print/key guards in force even with a forged purge setting", async () => {
    const f = await examFixture();
    await db.query("select set_config('app.purge_exam',$1,false)", [f.exam.id]);
    await expect(
      db.query("delete from omr_templates where id=$1", [f.print.templateUuid]),
    ).rejects.toThrow("PRINT_REGISTRY_IMMUTABLE");
    await expect(
      db.query(
        "update answer_keys set correct_option='B' where exam_version_id in(select id from exam_versions where exam_id=$1)",
        [f.exam.id],
      ),
    ).rejects.toThrow("PUBLISHED_KEY_IMMUTABLE");
  });
  it("requires exact title, freezes new work, resumes cleanup, then purges confirmed scores and evidence", async () => {
    const f = await examFixture();
    await rpc(teacher, "review_scan", {
      school_id: school,
      scanId: f.scans[0].id,
      revision: 1,
      action: "confirm",
    });
    const input = {
      school_id: school,
      exam_id: f.exam.id,
      confirmation: title,
    };
    await expect(rpc(other, "begin_exam_deletion", input)).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      rpc(teacher, "begin_exam_deletion", { ...input, confirmation: "wrong" }),
    ).rejects.toThrow("DELETE_CONFIRMATION_REQUIRED");
    const job = await rpc<{
      id: string;
      paths: string[];
      counts: { confirmed: number };
    }>(teacher, "begin_exam_deletion", input);
    expect(job.paths).toEqual([f.upload.processed_path]);
    expect(job.counts.confirmed).toBe(1);
    await expect(
      rpc(teacher, "reserve_scan_upload", {
        school_id: school,
        exam_id: f.exam.id,
        request_id: crypto.randomUUID(),
        payload_hash: "c".repeat(64),
      }),
    ).rejects.toThrow("EXAM_DELETING");
    await expect(
      rpc(teacher, "set_exam_archived", {
        school_id: school,
        ids: [f.exam.id],
        archived: false,
      }),
    ).rejects.toThrow("EXAM_DELETING");
    await expect(
      rpc(teacher, "finish_exam_deletion", {
        school_id: school,
        job_id: job.id,
      }),
    ).rejects.toThrow("EXAM_CLEANUP_PENDING");
    await asUser(other, "delete from storage.objects where name=$1", [
      f.upload.processed_path,
    ]);
    expect(
      (
        await db.query(
          "select count(*)::int as count from storage.objects where name=$1",
          [f.upload.processed_path],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    // Test fixture deletion simulates Storage API metadata removal; product
    // code always uses storage.remove, never SQL DELETE storage.objects.
    await asUser(teacher, "delete from storage.objects where name=$1", [
      f.upload.processed_path,
    ]);
    expect(
      (await rpc<{ paths: string[] }>(teacher, "begin_exam_deletion", input))
        .paths,
    ).toEqual([]);
    expect(
      await rpc(teacher, "finish_exam_deletion", {
        school_id: school,
        job_id: job.id,
      }),
    ).toEqual({ deleted: true });
    expect(
      await rpc(teacher, "finish_exam_deletion", {
        school_id: school,
        job_id: job.id,
      }),
    ).toEqual({ deleted: true });
    for (const table of [
      "exams",
      "exam_versions",
      "omr_templates",
      "print_jobs",
      "omr_sheets",
      "scan_records",
      "exam_results",
      "scan_uploads",
    ])
      expect(
        (
          await db.query(
            `select count(*)::int as count from ${table} where ${table === "exams" ? "id" : "exam_id"}=$1`,
            [f.exam.id],
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    expect(
      (
        await db.query(
          "select count(*)::int as count from students where id=$1",
          [studentId],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (
        await db.query(
          "select action from audit_logs where resource_id=$1 order by action",
          [f.exam.id],
        )
      ).rows,
    ).toEqual([{ action: "begin_delete_exam" }, { action: "delete_exam" }]);
    expect(
      (
        await asUser(
          other,
          "select * from exam_cleanup_jobs where school_id=$1",
          [school],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (await db.query("select id from schools where id=$1", [otherSchool]))
        .rows,
    ).toHaveLength(1);
  });
  it("does not retire a legacy original before processed proof exists, then removes only the original", async () => {
    const f = await examFixture(),
      original = `${school}/${crypto.randomUUID()}/original.jpg`;
    await db.query("update scan_uploads set original_path=$1 where id=$2", [
      original,
      f.upload.id,
    ]);
    await db.query("update scan_records set image_url=$1 where upload_id=$2", [
      original,
      f.upload.id,
    ]);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('scan-images',$1)",
      [original],
    );
    const input = { school_id: school, scan_id: f.scans[0].id };
    await db.query("delete from storage.objects where name=$1", [
      f.upload.processed_path,
    ]);
    await expect(rpc(teacher, "retire_scan_original", input)).rejects.toThrow(
      "SCAN_IMAGES_MISSING",
    );
    await asUser(teacher, "delete from storage.objects where name=$1", [
      original,
    ]);
    expect(
      (
        await db.query("select name from storage.objects where name=$1", [
          original,
        ])
      ).rows,
    ).toHaveLength(1);
    await db.query(
      "insert into storage.objects(bucket_id,name) values('scan-images',$1)",
      [f.upload.processed_path],
    );
    expect(await rpc(teacher, "retire_scan_original", input)).toEqual({
      path: original,
    });
    await expect(
      rpc(teacher, "retire_scan_original", { ...input, finish: true }),
    ).rejects.toThrow("ORIGINAL_CLEANUP_PENDING");
    await asUser(teacher, "delete from storage.objects where name=$1", [
      f.upload.processed_path,
    ]);
    expect(
      (
        await db.query("select name from storage.objects where name=$1", [
          f.upload.processed_path,
        ])
      ).rows,
    ).toHaveLength(1);
    await asUser(teacher, "delete from storage.objects where name=$1", [
      original,
    ]);
    await rpc(teacher, "retire_scan_original", { ...input, finish: true });
    expect(
      (
        await db.query("select image_url from scan_records where id=$1", [
          f.scans[0].id,
        ])
      ).rows,
    ).toEqual([{ image_url: null }]);
    expect(
      (
        await db.query("select score from exam_results where scan_id=$1", [
          f.scans[0].id,
        ])
      ).rows,
    ).toEqual([{ score: "20" }]);
  });
});
