import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createSetIdentity } from "@/lib/omr/qr";
import { defaultLayout } from "@/lib/omr/generate-template";
const db = new PGlite();
const owner = "20000000-0000-4000-8000-000000000011";
const teacher = "20000000-0000-4000-8000-000000000012";
const other = "20000000-0000-4000-8000-000000000013";
let school: string, otherSchool: string, examId: string;
let studentIds: string[];
let printInput: Record<string, unknown>;
let registered: {
  jobId: string;
  templateUuid: string;
  sheets: {
    instanceId: string;
    studentId: string;
    studentCode: string;
    page: number;
    slot: number;
  }[];
};
async function asUser(user: string, sql: string, values: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      user,
    ]);
    return tx.query(sql, values);
  });
}
const rpc = (user: string, name: string, input: unknown) =>
  asUser(user, `select public.${name}($1::jsonb) as result`, [
    JSON.stringify(input),
  ]);
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
    "202610090009_school_print_header.sql",
  ])
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  for (const [id, email] of [
    [owner, "piyawatpiwsiri@gmail.com"],
    [teacher, "print@example.com"],
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
  const imported = (
    await rpc(teacher, "import_students", {
      school_id: school,
      filename: "roster.csv",
      students: [
        {
          student_code: "02074",
          prefix: "เด็กชาย",
          first_name: "สมชาย",
          last_name: "คนแรก",
          classroom_name: "ม.1/2",
          number: null,
        },
        {
          student_code: "00005",
          prefix: "เด็กหญิง",
          first_name: "สมใจ",
          last_name: "คนที่สอง",
          classroom_name: "ม.1/2",
          number: null,
        },
      ],
    })
  ).rows[0] as { result: { id: string }[] };
  studentIds = imported.result.map((s) => s.id);
  const answerKey = Array.from({ length: 20 }, (_, i) => ({
    question: i + 1,
    correct: "A",
    points: 1,
  }));
  const exam = (
    await rpc(teacher, "create_exam_draft", {
      school_id: school,
      title: "ข้อสอบเก็บคะแนนชุด 1",
      subject: "คณิตศาสตร์",
      classroom: "ม.1/2",
      examType: "เก็บคะแนน",
      questionCount: 20,
      choiceCount: 4,
      year: 2569,
      term: 1,
      passingPercent: 50,
      answerKey,
    })
  ).rows[0] as { result: { id: string } };
  examId = exam.result.id;
  const identity = await createSetIdentity({
    ...defaultLayout,
    school: "พื้นที่ส่วนตัว",
    examId,
    title: "ข้อสอบเก็บคะแนนชุด 1",
    classroom: "ม.1/2",
    answerKeySignature: JSON.stringify(answerKey),
  });
  printInput = {
    school_id: school,
    request_id: crypto.randomUUID(),
    identity_json: JSON.stringify(identity.snapshot),
    student_ids: studentIds,
  };
}, 60000);
afterAll(async () => {
  await db.close();
});

describe("private Storage, scanning, grading and review", () => {
  let scanId: string, uploadId: string, input: Record<string, unknown>;
  const answers = (uncertain = false) =>
    Array.from({ length: 20 }, (_, i) => ({
      question: i + 1,
      choice: uncertain ? (i === 15 ? "B" : i >= 16 ? null : "A") : "A",
      state: uncertain
        ? i === 16
          ? "blank"
          : i === 17
            ? "multiple"
            : i >= 18
              ? "ambiguous"
              : "valid"
        : "valid",
      fills: [90, 0, 0, 0],
      confidence: 1,
    }));
  const digitsFor = (code: string | null) =>
    Array.from({ length: 5 }, (_, digit) => ({
      digit,
      value: code ? Number(code[digit]) : null,
      state: code ? "valid" : "blank",
      fills: Array.from({ length: 10 }, (_, v) =>
        code && v === Number(code[digit]) ? 100 : 0,
      ),
    }));
  const digits = digitsFor("02074");
  async function reserve() {
    const result = (
      await rpc(teacher, "reserve_scan_upload", {
        school_id: school,
        request_id: crypto.randomUUID(),
        payload_hash: "b".repeat(64),
      })
    ).rows[0] as {
      result: { id: string; original_path: string; processed_path: string };
    };
    for (const path of [
      result.result.original_path,
      result.result.processed_path,
    ])
      await asUser(
        teacher,
        "insert into storage.objects(bucket_id,name) values('scan-images',$1)",
        [path],
      );
    return result.result.id;
  }
  it("stores original observations and authoritative scores as pending; retry is idempotent", async () => {
    registered = (
      (await rpc(teacher, "register_omr_print", printInput)).rows[0] as {
        result: typeof registered;
      }
    ).result;
    await db.query(
      "update students set first_name='สมชาย',last_name='คนแรก',classroom_name='ม.1/2' where id=$1",
      [studentIds[0]],
    );
    uploadId = await reserve();
    const token = JSON.parse(printInput.identity_json as string);
    const identity = await createSetIdentity({ ...token.layout, logo: null });
    input = {
      school_id: school,
      upload_id: uploadId,
      paper: "single",
      records: [
        {
          token: identity.token,
          slot: 0,
          student_code: "02074",
          digits,
          answers: answers(true),
        },
      ],
    };
    const result = (await rpc(teacher, "save_scan_batch", input)).rows[0] as {
      result: { id: string; score: number }[];
    };
    scanId = result.result[0].id;
    expect(Number(result.result[0].score)).toBe(15);
    expect((await rpc(teacher, "save_scan_batch", input)).rows[0]).toEqual(
      result,
    );
    const scores = (
      await asUser(teacher, "select * from exam_results where scan_id=$1", [
        scanId,
      ])
    ).rows as { status: string; score: number; uncertain_count: number }[];
    expect(scores[0].status).toBe("pending_review");
    expect(Number(scores[0].uncertain_count)).toBe(2);
    expect(
      (
        await asUser(
          teacher,
          "select * from detected_answers where scan_id=$1",
          [scanId],
        )
      ).rows,
    ).toHaveLength(20);
    expect(
      (
        await asUser(
          teacher,
          "select * from answer_evaluations where scan_id=$1",
          [scanId],
        )
      ).rows,
    ).toHaveLength(20);
  });
  it("enforces workspace isolation, private image ownership and read-only owner inspection", async () => {
    expect(
      (await asUser(other, "select * from scan_records")).rows,
    ).toHaveLength(0);
    expect(
      (
        await asUser(
          other,
          "select * from storage.objects where bucket_id='scan-images'",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(owner, "select * from scan_records")).rows,
    ).toHaveLength(1);
    await expect(
      rpc(owner, "reserve_scan_upload", {
        school_id: school,
        request_id: crypto.randomUUID(),
        payload_hash: "c".repeat(64),
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      asUser(
        other,
        "insert into storage.objects(bucket_id,name) values('scan-images',$1)",
        [school + "/forged.jpg"],
      ),
    ).rejects.toThrow();
    await expect(
      asUser(teacher, "update exam_results set score=999"),
    ).rejects.toThrow();
    expect(
      (
        await asUser(owner, "select get_scan_reviews($1::uuid) as result", [
          school,
        ])
      ).rows[0],
    ).toBeTruthy();
    await expect(
      asUser(other, "select get_scan_reviews($1::uuid)", [school]),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("requires reasons, detects stale edits, recalculates and keeps raw observations unchanged", async () => {
    const base = { school_id: school, scanId, revision: 1 };
    await expect(
      rpc(teacher, "review_scan", { ...base, action: "confirm" }),
    ).rejects.toThrow("UNRESOLVED_ANSWERS");
    await expect(
      rpc(teacher, "review_scan", {
        ...base,
        action: "correct",
        question: 19,
        choice: "A",
        reason: "",
      }),
    ).rejects.toThrow("REASON_REQUIRED");
    await expect(
      rpc(teacher, "review_scan", {
        ...base,
        action: "correct",
        question: 19,
        choice: "E",
        reason: "ทดสอบ",
      }),
    ).rejects.toThrow("INVALID_CORRECTION");
    await rpc(teacher, "review_scan", {
      ...base,
      action: "correct",
      question: 19,
      choice: "A",
      reason: "ตรวจจากภาพแล้ว",
    });
    await expect(
      rpc(teacher, "review_scan", {
        ...base,
        action: "correct",
        question: 20,
        choice: null,
        reason: "ไม่มีรอยฝน",
      }),
    ).rejects.toThrow("STALE_REVIEW");
    await rpc(teacher, "review_scan", {
      ...base,
      revision: 2,
      action: "correct",
      question: 20,
      choice: null,
      reason: "ไม่มีรอยฝน",
    });
    const rows = (
      await asUser(
        teacher,
        "select * from detected_answers where scan_id=$1 and question_number=19",
        [scanId],
      )
    ).rows as {
      detection_status: string;
      manually_corrected: boolean;
      corrected_answer: string;
      correction_reason: string;
    }[];
    expect(rows[0].detection_status).toBe("ambiguous");
    expect(rows[0].corrected_answer).toBe("A");
    expect(rows[0].manually_corrected).toBe(true);
    expect(
      Number(
        (
          (
            await asUser(
              teacher,
              "select score from exam_results where scan_id=$1",
              [scanId],
            )
          ).rows[0] as { score: number }
        ).score,
      ),
    ).toBe(16);
    await expect(
      rpc(teacher, "register_score_export", {
        school_id: school,
        format: "pdf",
        scan_ids: [scanId],
      }),
    ).rejects.toThrow("UNCONFIRMED_EXPORT");
    await rpc(teacher, "review_scan", {
      ...base,
      revision: 3,
      action: "confirm",
    });
    expect(
      (
        (
          await asUser(
            teacher,
            "select scan_status from scan_records where id=$1",
            [scanId],
          )
        ).rows[0] as { scan_status: string }
      ).scan_status,
    ).toBe("confirmed");
    expect(
      (
        await asUser(
          teacher,
          "select * from omr_sheets where status='reviewed'",
        )
      ).rows.length,
    ).toBeGreaterThan(0);
    await expect(
      rpc(teacher, "review_scan", {
        ...base,
        revision: 4,
        action: "correct",
        question: 1,
        choice: "B",
        reason: "ทดสอบ",
      }),
    ).rejects.toThrow("RESULT_LOCKED");
    await rpc(teacher, "register_score_export", {
      school_id: school,
      format: "xlsx",
      scan_ids: [scanId],
    });
    const audit = (
      await asUser(
        teacher,
        "select action from audit_logs where resource_id=$1",
        [scanId],
      )
    ).rows as { action: string }[];
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "upload_scan",
        "auto_grade",
        "manual_correct_answer",
        "confirm_result",
      ]),
    );
  });
  it("never overwrites confirmed scores; pending replacement is explicit and atomic", async () => {
    const original = input.records as Record<string, unknown>[];
    await expect(
      rpc(teacher, "save_scan_batch", {
        ...input,
        upload_id: await reserve(),
        replace_pending: true,
        reason: "ถ่ายภาพใหม่",
      }),
    ).rejects.toThrow("CONFIRMED_RESULT_EXISTS");
    const pendingInput = {
      ...input,
      upload_id: await reserve(),
      records: [
        {
          ...original[0],
          student_code: "00005",
          digits: digitsFor("00005"),
          answers: answers(),
        },
      ],
    };
    const first = (await rpc(teacher, "save_scan_batch", pendingInput))
      .rows[0] as { result: { id: string }[] };
    const replacement = { ...pendingInput, upload_id: await reserve() };
    await expect(rpc(teacher, "save_scan_batch", replacement)).rejects.toThrow(
      "DUPLICATE_SCAN",
    );
    await expect(
      rpc(teacher, "save_scan_batch", {
        ...replacement,
        replace_pending: true,
        reason: "",
      }),
    ).rejects.toThrow("REASON_REQUIRED");
    await rpc(teacher, "save_scan_batch", {
      ...replacement,
      replace_pending: true,
      reason: "ถ่ายภาพใหม่ให้ชัด",
    });
    expect(
      (
        (
          await asUser(
            teacher,
            "select scan_status from scan_records where id=$1",
            [first.result[0].id],
          )
        ).rows[0] as { scan_status: string }
      ).scan_status,
    ).toBe("rejected");
    const count = (
      await asUser(
        teacher,
        "select * from exam_results where student_id=$1 and status<>'rejected'",
        [studentIds[1]],
      )
    ).rows;
    expect(count).toHaveLength(1);
    await expect(
      rpc(teacher, "save_scan_batch", {
        ...replacement,
        upload_id: await reserve(),
        replace_pending: true,
        reason: "ทดสอบ",
        paper: "a4",
        records: [
          {
            ...original[0],
            student_code: "00005",
            digits: digitsFor("00005"),
            slot: 0,
            answers: answers(),
          },
          {
            ...original[0],
            student_code: "00005",
            digits: digitsFor("00005"),
            slot: 1,
            answers: answers(),
          },
        ],
      }),
    ).rejects.toThrow("DUPLICATE_SCAN");
    expect(
      (
        await asUser(
          teacher,
          "select * from exam_results where student_id=$1 and status<>'rejected'",
          [studentIds[1]],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("holds unknown identity for review and prohibits deleting a saved private image", async () => {
    const original = (input.records as Record<string, unknown>[])[0];
    const result = (
      await rpc(teacher, "save_scan_batch", {
        ...input,
        upload_id: await reserve(),
        records: [
          {
            ...original,
            student_code: null,
            digits: digitsFor(null),
            answers: answers(),
          },
        ],
      })
    ).rows[0] as { result: { id: string }[] };
    await expect(
      rpc(teacher, "review_scan", {
        school_id: school,
        scanId: result.result[0].id,
        revision: 1,
        action: "confirm",
      }),
    ).rejects.toThrow("IDENTITY_REQUIRED");
    await expect(
      rpc(teacher, "review_scan", {
        school_id: school,
        scanId: result.result[0].id,
        revision: 1,
        action: "identify",
        studentCode: "02074",
        reason: "ตรวจชื่อจากภาพ",
      }),
    ).rejects.toThrow("DUPLICATE_SCAN");
    await rpc(teacher, "review_scan", {
      school_id: school,
      scanId: result.result[0].id,
      revision: 1,
      action: "reject",
      reason: "ระบุเจ้าของกระดาษไม่ได้",
    });
    const before = (
      await asUser(
        teacher,
        "select * from storage.objects where bucket_id='scan-images'",
      )
    ).rows.length;
    await asUser(
      teacher,
      "delete from storage.objects where name in (select original_path from scan_uploads where status='complete')",
    );
    expect(
      (
        await asUser(
          teacher,
          "select * from storage.objects where bucket_id='scan-images'",
        )
      ).rows.length,
    ).toBe(before);
  });
});
describe("immutable personal OMR print registry", () => {
  it("persists layouts privately and rejects altered authoritative exam metadata", async () => {
    const identity = JSON.parse(printInput.identity_json as string);
    await rpc(teacher, "save_omr_layout", {
      school_id: school,
      layout: identity.layout,
    });
    expect(
      (await asUser(teacher, "select * from omr_layouts")).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(other, "select * from omr_layouts")).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(owner, "select * from omr_layouts")).rows,
    ).toHaveLength(1);
    await expect(
      rpc(owner, "save_omr_layout", {
        school_id: school,
        layout: identity.layout,
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      rpc(teacher, "save_omr_layout", {
        school_id: school,
        layout: { ...identity.layout, questionCount: 21 },
      }),
    ).rejects.toThrow("PRINT_EXAM_MISMATCH");
    await expect(
      rpc(teacher, "save_omr_layout", {
        school_id: school,
        layout: { ...identity.layout, answerKeySignature: "[]" },
      }),
    ).rejects.toThrow("PRINT_KEY_MISMATCH");
  });
  it("registers different students with one set token and leading zero snapshots, idempotently", async () => {
    registered = (
      (await rpc(teacher, "register_omr_print", printInput)).rows[0] as {
        result: typeof registered;
      }
    ).result;
    expect(
      registered.sheets.map((s) => [s.studentCode, s.page, s.slot]),
    ).toEqual([
      ["02074", 1, 0],
      ["00005", 1, 1],
    ]);
    expect(registered.sheets.map((s) => s.studentId)).toEqual(studentIds);
    expect(new Set(registered.sheets.map((s) => s.instanceId)).size).toBe(2);
    const again = (
      (await rpc(teacher, "register_omr_print", printInput)).rows[0] as {
        result: typeof registered;
      }
    ).result;
    expect(again).toEqual(registered);
    expect(
      (await asUser(teacher, "select * from print_jobs")).rows,
    ).toHaveLength(1);
    expect(
      (await asUser(teacher, "select * from omr_templates")).rows,
    ).toHaveLength(1);
    expect(
      (
        await asUser(
          teacher,
          "select * from audit_logs where action='generate_omr_sheet'",
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      rpc(teacher, "register_omr_print", {
        ...printInput,
        student_ids: [studentIds[0]],
      }),
    ).rejects.toThrow("PRINT_REQUEST_CONFLICT");
  });
  it("denies cross-workspace writes and read isolation still allows owner inspection only", async () => {
    expect((await asUser(other, "select * from omr_sheets")).rows).toHaveLength(
      0,
    );
    expect((await asUser(owner, "select * from omr_sheets")).rows).toHaveLength(
      2,
    );
    await expect(rpc(owner, "register_omr_print", printInput)).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(rpc(other, "register_omr_print", printInput)).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      rpc(other, "register_omr_print", {
        ...printInput,
        school_id: otherSchool,
        request_id: crypto.randomUUID(),
      }),
    ).rejects.toThrow("EXAM_VERSION_NOT_FOUND");
    await expect(
      asUser(teacher, "insert into omr_sheets(school_id) values($1)", [school]),
    ).rejects.toThrow();
    await expect(
      asUser(teacher, "update omr_templates set layout_hash=layout_hash"),
    ).rejects.toThrow();
  });
  it("locks printed keys and rejects geometry forgery or duplicate students", async () => {
    await expect(
      db.query(
        "update exam_versions set config_json=config_json where exam_id=$1",
        [examId],
      ),
    ).rejects.toThrow("PUBLISHED_VERSION_IMMUTABLE");
    await expect(
      db.query("update omr_templates set omr_json='{}' where id=$1", [
        registered.templateUuid,
      ]),
    ).rejects.toThrow("PRINT_REGISTRY_IMMUTABLE");
    await expect(
      rpc(teacher, "register_omr_print", {
        ...printInput,
        request_id: crypto.randomUUID(),
        student_ids: [studentIds[0], studentIds[0]],
      }),
    ).rejects.toThrow("DUPLICATE_PRINT_STUDENT");
    const snapshot = JSON.parse(printInput.identity_json as string);
    snapshot.omr.centersMm.answers[0].x += 1;
    await expect(
      rpc(teacher, "register_omr_print", {
        ...printInput,
        request_id: crypto.randomUUID(),
        identity_json: JSON.stringify(snapshot),
      }),
    ).rejects.toThrow("INVALID_PRINT_GEOMETRY");
  });
  it("replays immutable names and classroom snapshots even after the live roster changes", async () => {
    await db.query(
      "update students set first_name='เปลี่ยนชื่อ',classroom_name='ม.2/1' where id=$1",
      [studentIds[0]],
    );
    const again = (
      (await rpc(teacher, "register_omr_print", printInput)).rows[0] as {
        result: typeof registered;
      }
    ).result;
    expect(again).toEqual(registered);
    await expect(
      rpc(teacher, "register_omr_print", {
        ...printInput,
        request_id: crypto.randomUUID(),
      }),
    ).rejects.toThrow("PRINT_STUDENT_NOT_IN_CLASS");
  });
  it("rejects a direct RPC half-page text-fit forgery and oversized personalized names", async () => {
    const snapshot = JSON.parse(printInput.identity_json as string);
    snapshot.layout.school = "ก".repeat(60);
    const geometry = await db.query(
      "select private.expected_print_geometry($1::jsonb) as result",
      [JSON.stringify(snapshot.layout)],
    );
    snapshot.omr = (geometry.rows[0] as { result: unknown }).result;
    await expect(
      rpc(teacher, "register_omr_print", {
        ...printInput,
        request_id: crypto.randomUUID(),
        identity_json: JSON.stringify(snapshot),
      }),
    ).rejects.toThrow("PRINT_TEXT_DOES_NOT_FIT");
    await db.query(
      "update students set first_name=$2,last_name=$3,classroom_name='ม.1/2' where id=$1",
      [studentIds[0], "ก".repeat(60), "ข".repeat(60)],
    );
    await expect(
      rpc(teacher, "register_omr_print", {
        ...printInput,
        request_id: crypto.randomUUID(),
      }),
    ).rejects.toThrow("PRINT_STUDENT_NAME_FIT");
    const thai = "ชี้แจงให้นักเรียนตรวจชื่อก่อนฝนคำตอบ";
    const counts = await db.query(
      "select private.print_line_count($1,76,3.3) as count",
      [thai],
    );
    const { wrapPrintText } = await import("@/lib/omr/generate-template");
    expect((counts.rows[0] as { count: number }).count).toBe(
      wrapPrintText(thai, 76, 3.3).length,
    );
  });
});
