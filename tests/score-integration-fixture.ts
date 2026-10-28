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
export const owner = "30000000-0000-4000-8000-000000000011";
export const teacherA = "30000000-0000-4000-8000-000000000012";
export const teacherB = "30000000-0000-4000-8000-000000000013";
export const pendingTeacher = "30000000-0000-4000-8000-000000000014";
const envelope = {
  v: "fixture",
  nonce: "synthetic",
  tag: "synthetic",
  ciphertext: "not-a-real-secret",
};
export async function integrationFixture(
  upgrade = true,
  closedTermWithdrawals = true,
) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid references auth.users(id),provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated,anon;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
  await db.exec(await readFile("supabase/schema.sql", "utf8"));
  const migration = await readFile(
    "supabase/migrations/202610150010_score_integrations.sql",
    "utf8",
  );
  await db.exec(migration);
  if (upgrade)
    await db.exec(
      await readFile(
        "supabase/migrations/202610150011_score_connection_recovery.sql",
        "utf8",
      ),
    );
  if (upgrade && closedTermWithdrawals)
    await db.exec(
      await readFile(
        "supabase/migrations/202610150012_closed_term_withdrawals.sql",
        "utf8",
      ),
    );
  const asUser = async <T = Record<string, unknown>>(
    user: string,
    sql: string,
    args: unknown[] = [],
  ) =>
    db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        user,
      ]);
      return tx.query<T>(sql, args);
    });
  const rpc = async <T = Record<string, unknown>>(
    user: string,
    name: string,
    input: unknown = {},
  ): Promise<T> => {
    if (name === "get_access_context")
      return (
        await asUser<{ result: T }>(
          user,
          "select public.get_access_context() result",
        )
      ).rows[0].result;
    return (
      await asUser<{ result: T }>(
        user,
        `select public.${name}($1::jsonb) result`,
        [JSON.stringify(input)],
      )
    ).rows[0].result;
  };
  const svc = async <T = Record<string, unknown>>(
    name: string,
    input: unknown = {},
  ): Promise<T> =>
    db.transaction(async (tx) => {
      await tx.exec("set local role service_role");
      return (
        await tx.query<{ result: T }>(
          `select public.${name}($1::jsonb) result`,
          [JSON.stringify(input)],
        )
      ).rows[0].result;
    });
  for (const [id, email] of [
    [owner, "piyawatpiwsiri@gmail.com"],
    [teacherA, "teacher-a@example.test"],
    [teacherB, "teacher-b@example.test"],
    [pendingTeacher, "pending@example.test"],
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
  await rpc(owner, "get_access_context");
  for (const id of [teacherA, teacherB])
    await rpc(owner, "decide_user_access", {
      userId: id,
      status: "approved",
      reason: "อนุมัติครูจำลอง",
    });
  const schoolA = (
    await rpc<{ schoolId: string }>(teacherA, "get_access_context")
  ).schoolId;
  const schoolB = (
    await rpc<{ schoolId: string }>(teacherB, "get_access_context")
  ).schoolId;
  const students = await rpc<{ id: string }[]>(teacherA, "import_students", {
    school_id: schoolA,
    filename: "synthetic.csv",
    students: ["00123", "00124"].map((student_code) => ({
      student_code,
      prefix: "เด็กชาย",
      first_name: "นักเรียน",
      last_name: "จำลอง",
      classroom_name: "ม.1/1",
      number: null,
    })),
  });
  const connect = async (
    workspace = schoolA,
    actor = teacherA,
    remote?: {
      connectionId: string;
      destinationSchoolId: string;
      requestId?: string;
    },
  ) => {
    const id = remote?.requestId ?? crypto.randomUUID();
    await svc("mathquest_service_start_pairing", {
      school_id: workspace,
      actor_id: actor,
      request_id: id,
      pairing_secret: envelope,
    });
    await svc("mathquest_service_complete_pairing", {
      school_id: workspace,
      actor_id: actor,
      id,
      status: "active",
      connection_id: remote?.connectionId ?? crypto.randomUUID(),
      destination_school_id:
        remote?.destinationSchoolId ?? "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      destination_label: "โรงเรียนทดสอบ",
      scope: "score:write",
      token_secret: envelope,
    });
    return id;
  };
  const exam = async (
    studentIndex = 0,
    targetExam?: string,
    version = 1,
    overrides: {
      title?: string;
      subject?: string;
      term?: number;
      year?: number;
    } = {},
  ) => {
    const config = {
      title: "แบบทดสอบจำลอง",
      subject: "คณิตศาสตร์",
      classroom: "ม.1/1",
      examType: "เก็บคะแนน",
      questionCount: 20,
      choiceCount: 4,
      year: 2569,
      term: 1,
      passingPercent: 50,
      answerKey: Array.from({ length: 20 }, (_, i) => ({
        question: i + 1,
        correct: "A",
        points: 1,
      })),
      ...overrides,
    };
    const examId =
      targetExam ??
      (
        await rpc<{ id: string }>(teacherA, "create_exam_draft", {
          ...config,
          school_id: schoolA,
        })
      ).id;
    const identity = await createSetIdentity({
      ...defaultLayout,
      school: "พื้นที่ส่วนตัว",
      examId,
      examVersion: version,
      title: config.title,
      subject: config.subject,
      classroom: config.classroom,
      term: config.term,
      year: config.year,
      answerKeySignature: JSON.stringify(config.answerKey),
    });
    const print = await rpc<{ templateUuid: string }>(
      teacherA,
      "register_omr_print",
      {
        school_id: schoolA,
        request_id: crypto.randomUUID(),
        identity_json: JSON.stringify(identity.snapshot),
        student_ids: [students[studentIndex].id],
      },
    );
    const upload = await rpc<{ id: string; processed_path: string }>(
      teacherA,
      "reserve_scan_upload",
      {
        school_id: schoolA,
        exam_id: examId,
        request_id: crypto.randomUUID(),
        payload_hash: "a".repeat(64),
      },
    );
    await asUser(
      teacherA,
      "insert into storage.objects(bucket_id,name) values('scan-images',$1)",
      [upload.processed_path],
    );
    const code = studentIndex === 0 ? "00123" : "00124";
    const scans = await rpc<{ id: string }[]>(teacherA, "save_scan_batch", {
      school_id: schoolA,
      upload_id: upload.id,
      paper: "single",
      records: [
        {
          token: identity.token,
          slot: 0,
          student_code: code,
          digits: [...code].map((value, digit) => ({
            digit,
            value,
            state: "valid",
            fills: Array.from({ length: 10 }, (_, n) =>
              n === Number(value) ? 90 : 0,
            ),
          })),
          answers: config.answerKey.map((k) => ({
            question: k.question,
            choice: "A",
            state: "valid",
            confidence: 1,
            fills: [90, 0, 0, 0],
          })),
        },
      ],
    });
    return {
      examId,
      scanId: scans[0].id,
      config,
      template: print.templateUuid,
    };
  };
  const confirm = (scanId: string) =>
    rpc(teacherA, "review_scan", {
      school_id: schoolA,
      scanId,
      revision: 1,
      action: "confirm",
    });
  const command = (
    examId: string,
    action = "publish",
    requestId = crypto.randomUUID(),
  ) =>
    rpc<{ revision: number; batches: number }>(
      teacherA,
      "command_mathquest_publication",
      {
        school_id: schoolA,
        exam_id: examId,
        action,
        request_id: requestId,
        consent: true,
      },
    );
  return {
    db,
    migration,
    asUser,
    rpc,
    svc,
    schoolA,
    schoolB,
    connect,
    exam,
    confirm,
    command,
  };
}
