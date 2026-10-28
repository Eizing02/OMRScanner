import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  owner,
  integrationFixture,
  teacherA,
  teacherB,
  pendingTeacher,
} from "./score-integration-fixture";
import { rosterFixture } from "./student-roster-fixture";
const person = {
  student_code: "00123",
  prefix: "นาย",
  first_name: "นักเรียน",
  last_name: "จำลอง",
  classroom_name: "ม.4",
  number: null,
};
type Plan = { planId: string; rows: { status: string; studentId: string }[] };

describe("student history and management", { timeout: 30000 }, () => {
  it("protects detached records, stale central forms and partial class removals", async () => {
    const f = await rosterFixture(true);
    try {
      const directory = await f.rpc<{ id: string; revision: number }>(
        owner,
        "manage_roster_directory",
        { action: "create", name: "โรงเรียนจำลอง", year: 2569, term: 1 },
      );
      const ownerSchool = (
        await f.rpc<{ schoolId: string }>(owner, "get_access_context")
      ).schoolId;
      await f.rpc(owner, "manage_roster_directory", {
        action: "grant",
        directoryId: directory.id,
        userId: teacherA,
        revision: 1,
      });
      const preview = await f.rpc<Plan>(owner, "preview_directory_import", {
        school_id: ownerSchool,
        directoryId: directory.id,
        filename: "synthetic.csv",
        students: ["02000", "02001"].map((student_code) => ({
          ...person,
          student_code,
        })),
      });
      await expect(
        f.rpc(owner, "apply_student_plan", {
          school_id: ownerSchool,
          planId: preview.planId,
          consent: true,
        }),
      ).rejects.toThrow("PLAN_NOT_FOUND");
      await f.rpc(owner, "apply_directory_import", {
        school_id: ownerSchool,
        planId: preview.planId,
        consent: true,
      });
      await f.rpc(teacherA, "subscribe_student_directory", {
        school_id: f.schoolA,
        directoryId: directory.id,
        classrooms: ["ม.4"],
        revision: 3,
        consent: true,
      });
      const rows = (
        await f.db.query<{ id: string; revision: number }>(
          "select id,revision from public.students where school_id=$1 and student_code in ('02000','02001') order by student_code",
          [f.schoolA],
        )
      ).rows;
      const remove = await f.rpc<Plan>(teacherA, "preview_student_selection", {
        school_id: f.schoolA,
        action: "archive",
        allMatching: true,
        excludedIds: [rows[0].id],
        filters: { classroom: "ม.4" },
      });
      await f.rpc(teacherA, "apply_student_plan", {
        school_id: f.schoolA,
        planId: remove.planId,
        consent: true,
      });
      expect(
        (
          await f.db.query<{ active: boolean }>(
            "select active from public.roster_subscriptions where school_id=$1",
            [f.schoolA],
          )
        ).rows[0].active,
      ).toBe(true);
      await f.rpc(teacherA, "detach_student_directory", {
        school_id: f.schoolA,
        id: rows[0].id,
        revision: rows[0].revision,
        consent: true,
      });
      const detached = (
        await f.db.query<{ revision: number }>(
          "select revision from public.students where id=$1",
          [rows[0].id],
        )
      ).rows[0];
      await f.rpc(teacherA, "manage_student", {
        school_id: f.schoolA,
        action: "update",
        id: rows[0].id,
        revision: detached.revision,
        student: {
          ...person,
          student_code: "02000",
          first_name: "ชื่อส่วนตัว",
        },
      });
      await expect(
        f.rpc(owner, "preview_directory_import", {
          school_id: ownerSchool,
          directoryId: directory.id,
          filename: "stale-form",
          students: [{ ...person, student_code: "02000", expectedRevision: 0 }],
        }),
      ).rejects.toThrow("STALE_DIRECTORY");
      const next = await f.rpc<Plan>(owner, "preview_directory_import", {
        school_id: ownerSchool,
        directoryId: directory.id,
        filename: "current.csv",
        students: ["02000", "02001", "02002"].map((student_code) => ({
          ...person,
          student_code,
          first_name: "ข้อมูลกลางใหม่",
        })),
      });
      await f.rpc(owner, "apply_directory_import", {
        school_id: ownerSchool,
        planId: next.planId,
        consent: true,
      });
      await f.rpc(teacherA, "sync_student_directory", { school_id: f.schoolA });
      expect(
        (
          await f.db.query<{
            first_name: string;
            directory_student_id: string | null;
          }>(
            "select first_name,directory_student_id from public.students where id=$1",
            [rows[0].id],
          )
        ).rows[0],
      ).toEqual({ first_name: "ชื่อส่วนตัว", directory_student_id: null });
      const page = await f.rpc<{
        students: { student_code: string }[];
        total: number;
      }>(teacherA, "get_student_roster", {
        school_id: f.schoolA,
        classroom: "ม.4",
        limit: 1,
        export: true,
      });
      expect(page.total).toBe(2);
      expect(page.students.map((s) => s.student_code)).toEqual([
        "02000",
        "02002",
      ]);
      const promoted = await f.rpc<Plan>(owner, "preview_directory_import", {
        school_id: ownerSchool,
        directoryId: directory.id,
        filename: "empty-room.csv",
        students: ["02000", "02001", "02002"].map((student_code) => ({
          ...person,
          student_code,
          classroom_name: "ม.5",
        })),
      });
      await f.rpc(owner, "apply_directory_import", {
        school_id: ownerSchool,
        planId: promoted.planId,
        consent: true,
      });
      const options = await f.rpc<{
        directories: {
          revision: number;
          classrooms: { name: string; count: number }[];
        }[];
      }>(teacherA, "get_roster_directory", {
        school_id: f.schoolA,
        view: "options",
      });
      expect(options.directories[0].classrooms).toContainEqual({
        name: "ม.4",
        count: 0,
      });
      const subscription = {
        school_id: f.schoolA,
        directoryId: directory.id,
        revision: options.directories[0].revision,
        consent: true,
      };
      await f.rpc(teacherA, "subscribe_student_directory", {
        ...subscription,
        classrooms: ["ม.4"],
      });
      await f.rpc(teacherA, "subscribe_student_directory", {
        ...subscription,
        classrooms: [],
      });
      expect(
        (
          await f.db.query<{ active: boolean }>(
            "select active from public.roster_subscriptions where school_id=$1",
            [f.schoolA],
          )
        ).rows[0].active,
      ).toBe(false);
    } finally {
      await f.db.close();
    }
  });
  it("upgrades existing printed history without guessing a renamed current identity", async () => {
    const f = await integrationFixture();
    try {
      const old = await f.exam();
      await f.confirm(old.scanId);
      const student = (
        await f.db.query<{ id: string }>(
          "select id from public.students where school_id=$1 and student_code='00123'",
          [f.schoolA],
        )
      ).rows[0];
      await f.db.query(
        "update public.students set prefix='นาย',first_name='เปลี่ยนชื่อ',classroom_name='ม.4' where id=$1",
        [student.id],
      );
      for (const file of [
        "202610280013_student_history.sql",
        "202610280014_student_management.sql",
      ])
        await f.db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
      const stored = (
        await f.db.query<{ identity_json: string }>(
          "select identity_json from public.omr_templates where id=$1",
          [old.template],
        )
      ).rows[0];
      const print = await f.rpc<{
        sheets: { fullName: string; classroom: string }[];
      }>(teacherA, "register_omr_print", {
        school_id: f.schoolA,
        request_id: crypto.randomUUID(),
        identity_json: stored.identity_json,
        student_ids: [student.id],
      });
      expect(print.sheets[0]).toMatchObject({
        fullName: "เด็กชายนักเรียน จำลอง",
        classroom: "ม.1/1",
      });
      const reviews = (
        await f.asUser<{ data: { name: string; classroom: string }[] }>(
          teacherA,
          "select public.get_scan_reviews($1) data",
          [f.schoolA],
        )
      ).rows[0].data;
      expect(reviews[0]).toMatchObject({
        name: "เด็กชายนักเรียน จำลอง",
        classroom: "ม.1/1",
      });
    } finally {
      await f.db.close();
    }
  });
  it("reads bounded summaries and one selected evidence record without truncating totals", async () => {
    const f = await rosterFixture(true);
    try {
      await f.db.exec(
        await readFile(
          "supabase/migrations/202610280016_scoped_workspace_reads.sql",
          "utf8",
        ),
      );
      const old = await f.exam();
      await f.confirm(old.scanId);
      const scope = { school_id: f.schoolA };
      const summary = await f.rpc(teacherA, "get_workspace_read_model", {
        ...scope,
        view: "summary",
      });
      expect(summary).toMatchObject({
        activeCount: 2,
        reviewCount: 0,
        exams: [{ scanned: 1, students: 2 }],
      });
      const queue = await f.rpc<{ items: unknown[]; total: number }>(
        teacherA,
        "get_workspace_read_model",
        { ...scope, view: "queue", status: "verified", limit: 1 },
      );
      expect(queue.total).toBe(1);
      expect(queue.items).toHaveLength(1);
      expect(JSON.stringify(queue)).not.toContain("rawAnswers");
      expect(
        await f.rpc(teacherA, "get_workspace_read_model", {
          ...scope,
          view: "detail",
          id: old.scanId,
        }),
      ).toMatchObject({ review: { studentCode: "00123", status: "verified" } });
      const print = await f.rpc<{ students: unknown[] }>(
        teacherA,
        "get_workspace_read_model",
        { ...scope, view: "exam_roster", examId: old.examId },
      );
      expect(print.students).toHaveLength(2);
      await expect(
        f.rpc(teacherB, "get_workspace_read_model", {
          ...scope,
          view: "detail",
          id: old.scanId,
        }),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        f.rpc(teacherA, "apply_student_plan", {
          ...scope,
          planId: crypto.randomUUID(),
          consent: false,
        }),
      ).rejects.toThrow("FORBIDDEN");
    } finally {
      await f.db.close();
    }
  });
  it("shares only approved school grants, follows classes and respects removals/manual records", async () => {
    const f = await rosterFixture(true);
    try {
      const directory = await f.rpc<{ id: string; revision: number }>(
        owner,
        "manage_roster_directory",
        { action: "create", name: "โรงเรียนจำลอง", year: 2569, term: 1 },
      );
      let revision = directory.revision;
      const target = { directoryId: directory.id };
      await f.rpc(owner, "manage_roster_directory", {
        ...target,
        action: "grant",
        userId: teacherA,
        revision: revision++,
      });
      await expect(
        f.rpc(owner, "manage_roster_directory", {
          ...target,
          action: "grant",
          userId: pendingTeacher,
          revision,
        }),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        f.rpc(teacherB, "get_roster_directory", {
          ...target,
          school_id: f.schoolB,
          view: "students",
        }),
      ).rejects.toThrow("FORBIDDEN");
      const ownerSchool = (
        await f.rpc<{ schoolId: string }>(owner, "get_access_context")
      ).schoolId;
      const plan = await f.rpc<Plan>(owner, "preview_directory_import", {
        ...target,
        school_id: ownerSchool,
        filename: "synthetic.xlsx",
        students: [person, { ...person, student_code: "02000" }],
      });
      await f.rpc(owner, "apply_directory_import", {
        school_id: ownerSchool,
        planId: plan.planId,
        consent: true,
      });
      revision++;
      const subscribe = {
        ...target,
        school_id: f.schoolA,
        classrooms: ["ม.4"],
        revision,
        consent: true,
      };
      expect(
        await f.rpc(teacherA, "subscribe_student_directory", subscribe),
      ).toMatchObject({ added: 1, conflicts: [{ studentCode: "00123" }] });
      expect(
        (
          await f.db.query<{ prefix: string }>(
            "select prefix from public.students where school_id=$1 and student_code='00123'",
            [f.schoolA],
          )
        ).rows[0].prefix,
      ).toBe("เด็กชาย");
      await f.rpc(teacherA, "subscribe_student_directory", {
        ...subscribe,
        adoptCodes: ["00123"],
      });
      const linked = (
        await f.db.query<{ id: string; revision: number }>(
          "select id,revision from public.students where school_id=$1 and student_code='02000'",
          [f.schoolA],
        )
      ).rows[0];
      await expect(
        f.rpc(teacherA, "manage_student", {
          school_id: f.schoolA,
          action: "update",
          id: linked.id,
          revision: linked.revision,
          student: { ...person, student_code: "02000" },
        }),
      ).rejects.toThrow("DIRECTORY_MANAGED");
      const remove = await f.rpc<Plan>(teacherA, "preview_student_selection", {
        school_id: f.schoolA,
        action: "archive",
        ids: [linked.id],
      });
      await f.rpc(teacherA, "apply_student_plan", {
        school_id: f.schoolA,
        planId: remove.planId,
        consent: true,
      });
      await f.rpc(teacherA, "sync_student_directory", { school_id: f.schoolA });
      expect(
        (
          await f.db.query<{ active: boolean }>(
            "select active from public.students where id=$1",
            [linked.id],
          )
        ).rows[0].active,
      ).toBe(false);
      const change = await f.rpc<Plan>(owner, "preview_directory_import", {
        ...target,
        school_id: ownerSchool,
        filename: "promotion.csv",
        students: [
          { ...person, classroom_name: "ม.5" },
          { ...person, student_code: "03000" },
        ],
      });
      await f.rpc(owner, "apply_directory_import", {
        school_id: ownerSchool,
        planId: change.planId,
        consent: true,
      });
      await f.rpc(teacherA, "sync_student_directory", { school_id: f.schoolA });
      const active = await f.rpc<{ students: { student_code: string }[] }>(
        teacherA,
        "get_student_roster",
        { school_id: f.schoolA },
      );
      expect(active.students.map((s) => s.student_code)).toEqual([
        "00124",
        "03000",
      ]);
      await f.rpc(owner, "manage_roster_directory", {
        ...target,
        action: "revoke",
        userId: teacherA,
        revision: revision + 1,
      });
      await f.rpc(teacherA, "sync_student_directory", { school_id: f.schoolA });
      expect(
        await f.rpc(teacherA, "get_student_roster", { school_id: f.schoolA }),
      ).toMatchObject({ total: 1 });
      await expect(
        f.rpc(owner, "sync_student_directory", { school_id: f.schoolA }),
      ).rejects.toThrow("FORBIDDEN");
    } finally {
      await f.db.close();
    }
  });
  it("keeps identity, historical print/review/export and confirmed marks after promotion", async () => {
    const f = await rosterFixture();
    try {
      const old = await f.exam();
      await f.confirm(old.scanId);
      await f.connect();
      const publicationRequest = crypto.randomUUID();
      const publication = await f.command(
        old.examId,
        "publish",
        publicationRequest,
      );
      const eventBefore = (
        await f.db.query<{ payload_text: string }>(
          "select payload_text from public.score_sync_outbox where source_exam_id=$1",
          [old.examId],
        )
      ).rows[0].payload_text;
      const before = (
        await f.db.query<{ id: string; revision: number }>(
          "select id,revision from public.students where school_id=$1 and student_code='00123'",
          [f.schoolA],
        )
      ).rows[0];
      await f.rpc(teacherA, "manage_student", {
        school_id: f.schoolA,
        action: "update",
        id: before.id,
        revision: before.revision,
        student: person,
      });
      const after = (
        await f.db.query<{ id: string; classroom_name: string }>(
          "select id,classroom_name from public.students where id=$1",
          [before.id],
        )
      ).rows[0];
      expect(after).toEqual({ id: before.id, classroom_name: "ม.4" });
      const reviews = (
        await f.asUser<{
          reviews: { name: string; classroom: string; status: string }[];
        }>(teacherA, "select public.get_scan_reviews($1) reviews", [f.schoolA])
      ).rows[0].reviews;
      expect(reviews[0]).toMatchObject({
        name: "เด็กชายนักเรียน จำลอง",
        classroom: "ม.1/1",
        status: "verified",
      });
      expect(
        (
          await f.db.query<{ score: string }>(
            "select score from public.exam_results where scan_id=$1",
            [old.scanId],
          )
        ).rows[0].score,
      ).toBe("20");
      const archived = await f.rpc<Plan>(
        teacherA,
        "preview_student_selection",
        { school_id: f.schoolA, action: "archive", ids: [before.id] },
      );
      await f.rpc(teacherA, "apply_student_plan", {
        school_id: f.schoolA,
        planId: archived.planId,
        consent: true,
      });
      expect(
        (
          await f.db.query(
            "select 1 from public.exam_results where scan_id=$1",
            [old.scanId],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await f.db.query<{ eligible: boolean }>(
            "select private.student_in_exam($1,(select exam_version_id from public.scan_records where id=$2),$3) eligible",
            [f.schoolA, old.scanId, before.id],
          )
        ).rows[0].eligible,
      ).toBe(true);
      expect(
        await f.command(old.examId, "publish", publicationRequest),
      ).toEqual(publication);
      expect(
        (
          await f.db.query<{ payload_text: string }>(
            "select payload_text from public.score_sync_outbox where source_exam_id=$1",
            [old.examId],
          )
        ).rows[0].payload_text,
      ).toBe(eventBefore);
    } finally {
      await f.db.close();
    }
  });

  it("previews exact-code upserts, applies atomically/idempotently and refuses stale plans", async () => {
    const f = await rosterFixture();
    try {
      const input = {
        school_id: f.schoolA,
        filename: "synthetic.xlsx",
        students: [person, { ...person, student_code: "02000" }],
      };
      const preview = await f.rpc<Plan>(
        teacherA,
        "preview_student_import",
        input,
      );
      expect(preview.rows.map((r) => r.status)).toEqual(["update", "add"]);
      const apply = {
        school_id: f.schoolA,
        planId: preview.planId,
        consent: true,
      };
      const result = await f.rpc(teacherA, "apply_student_plan", apply);
      expect(result).toMatchObject({ added: 1, updated: 1 });
      expect(await f.rpc(teacherA, "apply_student_plan", apply)).toEqual(
        result,
      );
      const second = await f.rpc<Plan>(
        teacherA,
        "preview_student_import",
        input,
      );
      expect(second.rows.every((r) => r.status === "unchanged")).toBe(true);
      await f.db.query(
        "update public.students set last_name='เปลี่ยนแล้ว' where school_id=$1 and student_code='02000'",
        [f.schoolA],
      );
      await expect(
        f.rpc(teacherA, "apply_student_plan", {
          school_id: f.schoolA,
          planId: second.planId,
          consent: true,
        }),
      ).rejects.toThrow("STALE_ROSTER");
      await expect(
        f.rpc(teacherA, "preview_student_import", {
          ...input,
          students: [person, person],
        }),
      ).rejects.toThrow("DUPLICATE_CODE");
      await expect(
        f.rpc(teacherB, "apply_student_plan", apply),
      ).rejects.toThrow("FORBIDDEN");
      expect(
        (
          await f.db.query(
            "select 1 from public.students where school_id=$1 and student_code='00124'",
            [f.schoolA],
          )
        ).rows,
      ).toHaveLength(1);
    } finally {
      await f.db.close();
    }
  });

  it("archives/restores exact selections and pages complete counts without crossing tenants", async () => {
    const f = await rosterFixture();
    try {
      const page = await f.rpc<{ total: number; students: { id: string }[] }>(
        teacherA,
        "get_student_roster",
        { school_id: f.schoolA, limit: 1 },
      );
      expect(page.total).toBe(2);
      expect(page.students).toHaveLength(1);
      const preview = await f.rpc<Plan>(teacherA, "preview_student_selection", {
        school_id: f.schoolA,
        action: "archive",
        allMatching: true,
        filters: { classroom: "ม.1/1" },
      });
      expect(preview.rows).toHaveLength(2);
      await f.rpc(teacherA, "apply_student_plan", {
        school_id: f.schoolA,
        planId: preview.planId,
        consent: true,
      });
      expect(
        await f.rpc(teacherA, "get_student_roster", { school_id: f.schoolA }),
      ).toMatchObject({ total: 0, activeCount: 0 });
      const restore = await f.rpc<Plan>(teacherA, "preview_student_selection", {
        school_id: f.schoolA,
        action: "restore",
        ids: [page.students[0].id],
      });
      await f.rpc(teacherA, "apply_student_plan", {
        school_id: f.schoolA,
        planId: restore.planId,
        consent: true,
      });
      expect(
        await f.rpc(teacherA, "get_student_roster", { school_id: f.schoolA }),
      ).toMatchObject({ total: 1 });
      await expect(
        f.rpc(teacherB, "get_student_roster", { school_id: f.schoolA }),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        f.asUser(teacherA, "select * from private.roster_plans"),
      ).rejects.toThrow("permission denied");
    } finally {
      await f.db.close();
    }
  });
});
