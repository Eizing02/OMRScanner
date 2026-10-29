import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { rosterFixture } from "./student-roster-fixture";
import {
  owner,
  teacherA,
  teacherB,
  pendingTeacher,
} from "./score-integration-fixture";
let f: Awaited<ReturnType<typeof rosterFixture>>, ownerSchool: string;
beforeAll(async () => {
  f = await rosterFixture(true, true);
  for (const file of [
    "202610280017_print_v5.sql",
    "202610280018_batch_confirmation.sql",
    "202610280019_directory_lifecycle.sql",
  ])
    await f.db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  ownerSchool = (await f.rpc<{ schoolId: string }>(owner, "get_access_context"))
    .schoolId;
}, 60000);
afterAll(async () => {
  await f?.db.close();
});
const create = () =>
  f.rpc<{ id: string; revision: number }>(owner, "manage_roster_directory", {
    action: "create",
    name: "โรงเรียนจำลองถังขยะ",
    year: 2569,
    term: 1,
  });
const life = <T = Record<string, unknown>>(
  id: string,
  action: string,
  extra: object = {},
  actor = owner,
) =>
  f.rpc<T>(actor, "manage_directory_lifecycle", {
    school_id: actor === owner ? ownerSchool : f.schoolA,
    directoryId: id,
    action,
    ...extra,
  });
const consent = (revision: number) => ({
  revision,
  requestId: crypto.randomUUID(),
  consent: true,
  confirmationName: "โรงเรียนจำลองถังขยะ",
});
describe("school directory 14-day lifecycle", { timeout: 30000 }, () => {
  it("requires a configured scheduler and explicit owner confirmation", async () => {
    const d = await create();
    const preview = await life<{ cleanupReady: boolean }>(
      d.id,
      "preview_trash",
    );
    expect(preview.cleanupReady).toBe(false);
    await expect(life(d.id, "trash", consent(1))).rejects.toThrow(
      "DIRECTORY_CLEANUP_NOT_READY",
    );
    await f.db.exec(
      "create schema cron; create table cron.job(jobname text,active boolean); insert into cron.job values('scansob-school-directory-trash',true)",
    );
    await expect(
      life(d.id, "trash", { ...consent(1), confirmationName: "ผิดโรงเรียน" }),
    ).rejects.toThrow("DIRECTORY_NAME_MISMATCH");
    for (const actor of [teacherA, teacherB, pendingTeacher])
      await expect(life(d.id, "trash", consent(1), actor)).rejects.toThrow(
        "FORBIDDEN",
      );
    await expect(
      life(d.id, "trash", { ...consent(1), consent: false }),
    ).rejects.toThrow("DIRECTORY_CONSENT_REQUIRED");
    await expect(
      life(d.id, null as unknown as string, consent(1)),
    ).rejects.toThrow("INVALID_ROSTER_ACTION");
  });
  it("freezes linked copies, restores subscriptions, then purges only central data and safely retries", async () => {
    const old = await f.exam();
    await f.confirm(old.scanId);
    const before = (
      await f.db.query(
        "select student_identity from scan_records where id=$1",
        [old.scanId],
      )
    ).rows;
    const d = await create();
    await f.rpc(owner, "manage_roster_directory", {
      directoryId: d.id,
      revision: 1,
      action: "grant",
      userId: teacherA,
    });
    const plan = await f.rpc<{ planId: string }>(
      owner,
      "preview_directory_import",
      {
        school_id: ownerSchool,
        directoryId: d.id,
        filename: "test.csv",
        students: [
          {
            student_code: "00123",
            prefix: "เด็กชาย",
            first_name: "ชื่อกลาง",
            last_name: "ทดสอบ",
            classroom_name: "ม.1/1",
            number: null,
          },
        ],
      },
    );
    await f.rpc(owner, "apply_directory_import", {
      school_id: ownerSchool,
      planId: plan.planId,
      consent: true,
    });
    await f.rpc(teacherA, "subscribe_student_directory", {
      school_id: f.schoolA,
      directoryId: d.id,
      revision: 3,
      classrooms: ["ม.1/1"],
      adoptCodes: ["00123"],
      consent: true,
    });
    const preview = await life<{ revision: number; studentCount: number }>(
      d.id,
      "preview_trash",
    );
    expect(preview.studentCount).toBe(1);
    const command = consent(preview.revision);
    const trashed = await life<{ revision: number }>(d.id, "trash", command);
    expect(await life(d.id, "trash", command)).toEqual(trashed);
    await f.rpc(teacherA, "sync_student_directory", { school_id: f.schoolA });
    const copies = (
      await f.db.query<{
        active: boolean;
        first_name: string;
        directory_student_id: string | null;
      }>(
        "select active,first_name,directory_student_id from students where school_id=$1 and student_code='00123'",
        [f.schoolA],
      )
    ).rows;
    expect(copies[0]).toMatchObject({ active: true, first_name: "ชื่อกลาง" });
    const options = await f.rpc<{
      directories: { id: string }[];
      trash: { id: string }[];
    }>(owner, "get_roster_directory", {
      school_id: ownerSchool,
      view: "options",
    });
    expect(options.directories.some((r) => r.id === d.id)).toBe(false);
    expect(options.trash.some((r) => r.id === d.id)).toBe(true);
    expect(
      (
        await f.asUser(
          teacherA,
          "select id from roster_directory_students where directory_id=$1",
          [d.id],
        )
      ).rows,
    ).toEqual([]);
    const teacherOptions = await f.rpc<{ trash: unknown[] }>(
      teacherA,
      "get_roster_directory",
      { school_id: f.schoolA, view: "options" },
    );
    expect(teacherOptions.trash).toEqual([]);
    await expect(
      f.rpc(owner, "manage_roster_directory", {
        directoryId: d.id,
        revision: trashed.revision,
        action: "period",
        year: 2570,
        term: 1,
      }),
    ).rejects.toThrow("DIRECTORY_TRASHED");
    await expect(
      f.rpc(owner, "preview_directory_import", {
        school_id: ownerSchool,
        directoryId: d.id,
        students: [],
      }),
    ).rejects.toThrow("DIRECTORY_TRASHED");
    await expect(
      f.rpc(teacherA, "subscribe_student_directory", {
        school_id: f.schoolA,
        directoryId: d.id,
        revision: trashed.revision,
        classrooms: ["ม.1/1"],
        consent: true,
      }),
    ).rejects.toThrow("DIRECTORY_TRASHED");
    const restored = await life<{ revision: number }>(
      d.id,
      "restore",
      consent(trashed.revision),
    );
    await expect(
      life(d.id, "trash", consent(preview.revision)),
    ).rejects.toThrow("STALE_DIRECTORY");
    await f.rpc(teacherA, "sync_student_directory", { school_id: f.schoolA });
    expect(
      (
        await f.db.query(
          "select directory_student_id from students where school_id=$1 and student_code='00123'",
          [f.schoolA],
        )
      ).rows[0],
    ).toEqual({ directory_student_id: copies[0].directory_student_id });
    const again = await life<{ revision: number }>(
      d.id,
      "trash",
      consent(restored.revision),
    );
    await f.db.query(
      "update roster_directories set deleted_at=now()-interval '15 days',purge_after=now()-interval '1 day' where id=$1",
      [d.id],
    );
    await expect(
      life(d.id, "restore", consent(again.revision)),
    ).rejects.toThrow("DIRECTORY_RESTORE_EXPIRED");
    await expect(
      f.asUser(teacherA, "select private.purge_school_directories(5)"),
    ).rejects.toThrow();
    expect(
      (
        await f.db.query<{ count: number }>(
          "select private.purge_school_directories(5) count",
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await f.db.query<{ count: number }>(
          "select private.purge_school_directories(5) count",
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await f.db.query(
          "select active,directory_student_id from students where school_id=$1 and student_code='00123'",
          [f.schoolA],
        )
      ).rows[0],
    ).toEqual({ active: true, directory_student_id: null });
    expect(
      (
        await f.db.query(
          "select student_identity from scan_records where id=$1",
          [old.scanId],
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await f.db.query("select status from exam_results where scan_id=$1", [
          old.scanId,
        ])
      ).rows[0],
    ).toEqual({ status: "confirmed" });
    expect(
      (await f.db.query("select * from roster_directories where id=$1", [d.id]))
        .rows,
    ).toEqual([]);
    await expect(
      f.db.query("select private.purge_school_directories(null)"),
    ).rejects.toThrow("INVALID_SELECTION");
  });
  it("freezes the last local cohort even when a central promotion was not yet synchronized", async () => {
    const d = await create();
    await f.rpc(owner, "manage_roster_directory", {
      directoryId: d.id,
      revision: 1,
      action: "grant",
      userId: teacherA,
    });
    const person = {
      student_code: "00300",
      prefix: "เด็กชาย",
      first_name: "ก่อนเลื่อนชั้น",
      last_name: "ทดสอบ",
      classroom_name: "ม.1/1",
      number: null,
    };
    for (const [index, student] of [
      person,
      { ...person, first_name: "ชื่อใหม่", classroom_name: "ม.2/1" },
    ].entries()) {
      const plan = await f.rpc<{ planId: string }>(
        owner,
        "preview_directory_import",
        {
          school_id: ownerSchool,
          directoryId: d.id,
          filename: "promotion.csv",
          students: [student],
        },
      );
      await f.rpc(owner, "apply_directory_import", {
        school_id: ownerSchool,
        planId: plan.planId,
        consent: true,
      });
      if (index === 0)
        await f.rpc(teacherA, "subscribe_student_directory", {
          school_id: f.schoolA,
          directoryId: d.id,
          revision: 3,
          classrooms: ["ม.1/1"],
          consent: true,
        });
    }
    // The teacher has not opened their workspace since the central promotion.
    await f.db.exec(
      "create schema if not exists cron; create table if not exists cron.job(jobname text,active boolean)",
    );
    await f.db.exec(
      "insert into cron.job select 'scansob-school-directory-trash',true where not exists(select 1 from cron.job)",
    );
    const preview = await life<{ revision: number }>(d.id, "preview_trash");
    const trashed = await life<{ revision: number }>(
      d.id,
      "trash",
      consent(preview.revision),
    );
    await f.rpc(teacherA, "sync_student_directory", { school_id: f.schoolA });
    const local = () =>
      f.db.query<{ active: boolean; first_name: string; classroom_name: string }>(
        "select active,first_name,classroom_name from students where school_id=$1 and student_code='00300'",
        [f.schoolA],
      );
    expect((await local()).rows[0]).toEqual({
      active: true,
      first_name: "ก่อนเลื่อนชั้น",
      classroom_name: "ม.1/1",
    });
    await life(d.id, "restore", consent(trashed.revision));
    await f.rpc(teacherA, "sync_student_directory", { school_id: f.schoolA });
    expect((await local()).rows[0].active).toBe(false);
  });
});
