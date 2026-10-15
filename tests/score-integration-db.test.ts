import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  integrationFixture,
  teacherA,
  teacherB,
  pendingTeacher,
  owner,
} from "./score-integration-fixture";
import { scoreEventSchema } from "@/lib/integrations/mathquest/contract";
let f: Awaited<ReturnType<typeof integrationFixture>>;
beforeAll(async () => {
  f = await integrationFixture();
}, 60000);
afterAll(async () => {
  await f?.db.close();
});
describe("optional MathQuest publication database", () => {
  it("installs additively, separates metadata from secrets, denies direct activation and payload access", async () => {
    await f.connect();
    for (const actor of [teacherA, teacherB, pendingTeacher, owner]) {
      await expect(
        f.asUser(actor, "select * from private.integration_secrets"),
      ).rejects.toThrow();
      await expect(f.rpc(actor, "mathquest_service_claim")).rejects.toThrow();
      await expect(
        f.asUser(actor, "update integration_connections set status='active'"),
      ).rejects.toThrow();
      await expect(
        f.asUser(actor, "select * from score_sync_outbox"),
      ).rejects.toThrow();
    }
    expect(
      (await f.asUser(teacherB, "select * from integration_connections")).rows,
    ).toHaveLength(0);
    expect(
      (await f.asUser(owner, "select * from integration_connections")).rows,
    ).toHaveLength(0);
    for (const actor of [teacherB, pendingTeacher, owner])
      await expect(
        f.rpc(actor, "get_mathquest_status", { school_id: f.schoolA }),
      ).rejects.toThrow("FORBIDDEN");
  });
  it("publishes only confirmed DB scores, preserves IDs and freezes retry bytes idempotently", async () => {
    const exam = await f.exam();
    await expect(f.command(exam.examId)).rejects.toThrow(
      "NO_CONFIRMED_RESULTS",
    );
    await f.confirm(exam.scanId);
    const request = crypto.randomUUID(),
      one = await f.command(exam.examId, "publish", request);
    expect(await f.command(exam.examId, "publish", request)).toEqual(one);
    await expect(f.command(exam.examId, "withdraw", request)).rejects.toThrow(
      "SYNC_REQUEST_CONFLICT",
    );
    const jobs = (
      await f.db.query<{ payload_text: string }>(
        "select payload_text from score_sync_outbox where source_exam_id=$1",
        [exam.examId],
      )
    ).rows;
    expect(jobs).toHaveLength(1);
    const event = scoreEventSchema.parse(JSON.parse(jobs[0].payload_text));
    expect(event.results[0]).toMatchObject({
      student_code: "00123",
      score: 20,
      max_score: 20,
      percent: 100,
    });
    expect(Object.keys(event.results[0]).sort()).toEqual(
      [
        "confirmed_at",
        "max_score",
        "passed",
        "percent",
        "score",
        "source_exam_version_id",
        "source_scan_id",
        "student_code",
      ].sort(),
    );
    await expect(
      f.rpc(teacherB, "command_mathquest_publication", {
        school_id: f.schoolA,
        exam_id: exam.examId,
        request_id: crypto.randomUUID(),
        action: "publish",
        consent: true,
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("leases jobs, fences stale workers and records partial unmatched without claiming full success", async () => {
    const exam = await f.exam();
    await f.confirm(exam.scanId);
    await f.command(exam.examId);
    const scope = { school_id: f.schoolA, exam_id: exam.examId };
    const first = await f.svc<{
      event_id: string;
      lease_token: string;
      payload_text: string;
    }>("mathquest_service_claim", scope);
    expect(await f.svc("mathquest_service_claim", scope)).toBeNull();
    await f.db.query(
      "update score_sync_outbox set lease_until=now()-interval '1 second' where event_id=$1",
      [first.event_id],
    );
    const second = await f.svc<typeof first>("mathquest_service_claim", scope);
    expect(second.payload_text).toBe(first.payload_text);
    expect(second.lease_token).not.toBe(first.lease_token);
    const ack = {
      schema_version: "1.0",
      event_id: first.event_id,
      status: "processed",
      accepted: 0,
      unmatched: [{ student_code: "00123", reason: "STUDENT_NOT_FOUND" }],
      invalid: [],
    };
    expect(
      await f.svc("mathquest_service_finish", {
        event_id: first.event_id,
        lease_token: first.lease_token,
        ack,
      }),
    ).toBe(false);
    expect(
      await f.svc("mathquest_service_finish", {
        event_id: second.event_id,
        lease_token: second.lease_token,
        ack,
      }),
    ).toBe(true);
    const status = await f.rpc<{
      publication: { unmatched: string[]; delivered: number };
    }>(teacherA, "get_mathquest_status", scope);
    expect(status.publication.unmatched).toEqual(["00123"]);
    expect(status.publication.delivered).toBe(0);
    const audit = (
      await f.db.query<{ action: string; new_values: { unmatched: number } }>(
        "select action,new_values from audit_logs where resource_id=$1",
        [first.event_id],
      )
    ).rows;
    expect(audit).toEqual([
      expect.objectContaining({
        action: "sync_score_publication",
        new_values: expect.objectContaining({ unmatched: 1 }),
      }),
    ]);
    const revision = await f.command(exam.examId, "retry");
    expect(revision.revision).toBe(2);
  });
  it("rejects malformed acknowledgments again at the service RPC boundary", async () => {
    const exam = await f.exam();
    await f.confirm(exam.scanId);
    await f.command(exam.examId);
    const job = await f.svc<{ event_id: string; lease_token: string }>(
      "mathquest_service_claim",
      { school_id: f.schoolA, exam_id: exam.examId },
    );
    for (const ack of [
      {
        schema_version: null,
        event_id: job.event_id,
        status: "processed",
        accepted: 1,
        unmatched: [],
        invalid: [],
      },
      {
        schema_version: "1.0",
        event_id: job.event_id,
        status: null,
        accepted: 1,
        unmatched: [],
        invalid: [],
      },
      {
        schema_version: "1.0",
        event_id: job.event_id,
        status: "processed",
        accepted: 0,
        unmatched: [{ student_code: "00123", reason: null }],
        invalid: [],
      },
      {
        schema_version: "1.0",
        event_id: job.event_id,
        status: "processed",
        accepted: 1,
        unmatched: [],
        invalid: [],
        leaked: "unexpected",
      },
      {
        schema_version: "1.0",
        event_id: job.event_id,
        status: "processed",
        accepted: 0,
        unmatched: [{ student_code: "99999", reason: "STUDENT_NOT_FOUND" }],
        invalid: [],
      },
      {
        schema_version: "1.0",
        event_id: job.event_id,
        status: "processed",
        accepted: 0,
        unmatched: [{ student_code: "00123", reason: "STUDENT_NOT_FOUND" }],
        invalid: [{ student_code: "00123", reason: "INVALID_SCORE" }],
      },
    ])
      await expect(
        f.svc("mathquest_service_finish", {
          event_id: job.event_id,
          lease_token: job.lease_token,
          ack,
        }),
      ).rejects.toThrow("INVALID_ACK");
    expect(
      (
        await f.db.query<{ status: string }>(
          "select status from score_sync_outbox where event_id=$1",
          [job.event_id],
        )
      ).rows[0].status,
    ).toBe("sending");
  });
  it("blocks source deletion before any evidence is exposed; withdraw ack preserves tombstones", async () => {
    const exam = await f.exam();
    await f.confirm(exam.scanId);
    await f.command(exam.examId);
    const deletion = {
      school_id: f.schoolA,
      exam_id: exam.examId,
      confirmation: exam.config.title,
    };
    await expect(
      f.rpc(teacherA, "begin_exam_deletion", deletion),
    ).rejects.toThrow("PUBLICATION_WITHDRAW_REQUIRED");
    await expect(
      f.rpc(teacherA, "begin_exam_deletion_before_score_sync", deletion),
    ).rejects.toThrow();
    await f.command(exam.examId, "withdraw");
    await expect(
      f.rpc(teacherA, "begin_exam_deletion", deletion),
    ).rejects.toThrow("PUBLICATION_WITHDRAW_REQUIRED");
    const job = await f.svc<{ event_id: string; lease_token: string }>(
      "mathquest_service_claim",
      { school_id: f.schoolA, exam_id: exam.examId },
    );
    await f.svc("mathquest_service_finish", {
      event_id: job.event_id,
      lease_token: job.lease_token,
      ack: {
        schema_version: "1.0",
        event_id: job.event_id,
        status: "processed",
        accepted: 0,
        unmatched: [],
        invalid: [],
      },
    });
    const plan = await f.rpc<{ id: string; paths: string[] }>(
      teacherA,
      "begin_exam_deletion",
      deletion,
    );
    await f.db.query("delete from storage.objects where name=any($1)", [
      plan.paths,
    ]);
    await f.rpc(teacherA, "finish_exam_deletion", {
      school_id: f.schoolA,
      job_id: plan.id,
    });
    expect(
      (
        await f.db.query("select * from exam_results where exam_id=$1", [
          exam.examId,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await f.db.query(
          "select * from score_sync_outbox where source_exam_id=$1",
          [exam.examId],
        )
      ).rows,
    ).toHaveLength(2);
    expect((await f.db.query("select * from students")).rows).toHaveLength(2);
  });
  it("auto mode queues future confirms transactionally, coalesces and does not resurrect withdrawals", async () => {
    const before = await f.exam();
    await f.confirm(before.scanId);
    await f.rpc(teacherA, "set_mathquest_mode", {
      school_id: f.schoolA,
      mode: "auto_after_confirm",
      enabled: true,
      consent: true,
    });
    expect(
      (
        await f.db.query(
          "select * from exam_publications where source_exam_id=$1",
          [before.examId],
        )
      ).rows,
    ).toHaveLength(0);
    const exam = await f.exam();
    await f.confirm(exam.scanId);
    expect(
      (
        await f.db.query(
          "select requested_generation from exam_publications where source_exam_id=$1",
          [exam.examId],
        )
      ).rows,
    ).toEqual([{ requested_generation: 1 }]);
    expect(
      (
        await f.db.query(
          "select * from score_sync_outbox where source_exam_id=$1",
          [exam.examId],
        )
      ).rows,
    ).toHaveLength(0);
    await f.db.query(
      "update exam_publications set requested_at=now()-interval '3 seconds' where source_exam_id=$1",
      [exam.examId],
    );
    expect(
      await f.svc("mathquest_service_materialize", { school_id: f.schoolA }),
    ).toBe(1);
    await f.command(exam.examId, "withdraw");
    const next = await f.exam(1, exam.examId);
    await f.confirm(next.scanId);
    const pub = (
      await f.db.query<{
        state: string;
        requested_generation: number;
        materialized_generation: number;
      }>(
        "select state,requested_generation,materialized_generation from exam_publications where source_exam_id=$1",
        [exam.examId],
      )
    ).rows[0];
    expect(pub.state).toBe("withdraw_pending");
    expect(pub.requested_generation).toBe(pub.materialized_generation);
    await f.rpc(teacherA, "set_mathquest_mode", {
      school_id: f.schoolA,
      mode: "manual",
      enabled: true,
      consent: true,
    });
  });
  it("suspension stops queued sends without relying on an old JWT", async () => {
    const exam = await f.exam();
    await f.confirm(exam.scanId);
    await f.command(exam.examId);
    await f.rpc(owner, "decide_user_access", {
      userId: teacherA,
      status: "suspended",
      reason: "ทดสอบระงับ",
    });
    expect(
      await f.svc("mathquest_service_claim", { school_id: f.schoolA }),
    ).toBeNull();
    await expect(
      f.rpc(teacherA, "get_mathquest_status", { school_id: f.schoolA }),
    ).rejects.toThrow("FORBIDDEN");
    await f.rpc(owner, "decide_user_access", {
      userId: teacherA,
      status: "approved",
      reason: "ทดสอบเปิดกลับ",
    });
  });
  it("blocks zero totals without altering confirmed results", async () => {
    const exam = await f.exam();
    await f.confirm(exam.scanId);
    await f.db.query(
      "update exam_results set max_score=0,score=0,percent=0 where scan_id=$1",
      [exam.scanId],
    );
    await expect(f.command(exam.examId)).rejects.toThrow("ZERO_MAX_SCORE");
    expect(
      (
        await f.db.query<{ status: string }>(
          "select status from exam_results where scan_id=$1",
          [exam.scanId],
        )
      ).rows[0].status,
    ).toBe("confirmed");
  });
  it("rejects publication when confirmed rows reference different exam metadata versions", async () => {
    const first = await f.exam();
    await f.confirm(first.scanId);
    const title = "ชื่อชุดสอบเวอร์ชันใหม่";
    await f.rpc(teacherA, "create_exam_version", {
      ...first.config,
      title,
      school_id: f.schoolA,
      exam_id: first.examId,
      expected_version: 1,
    });
    const second = await f.exam(1, first.examId, 2, { title });
    await f.confirm(second.scanId);
    await expect(f.command(first.examId)).rejects.toThrow(
      "MIXED_EXAM_METADATA",
    );
    expect(
      (
        await f.db.query(
          "select * from score_sync_outbox where source_exam_id=$1",
          [first.examId],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("requires consent at the direct RPC boundary, not just the browser", async () => {
    await expect(
      f.rpc(teacherA, "set_mathquest_mode", {
        school_id: f.schoolA,
        mode: "auto_after_confirm",
        enabled: true,
      }),
    ).rejects.toThrow("FORBIDDEN");
    const exam = await f.exam();
    await f.confirm(exam.scanId);
    await expect(
      f.rpc(teacherA, "command_mathquest_publication", {
        school_id: f.schoolA,
        exam_id: exam.examId,
        request_id: crypto.randomUUID(),
        action: "publish",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("connects two personal workspaces to the same destination but never lets either activate the other", async () => {
    await expect(
      f.svc("mathquest_service_start_pairing", {
        school_id: f.schoolA,
        actor_id: teacherB,
        request_id: crypto.randomUUID(),
      }),
    ).rejects.toThrow("FORBIDDEN");
    const local = await f.connect(f.schoolB, teacherB);
    const status = await f.rpc<{
      connection: { id: string; destinationSchoolId: string };
    }>(teacherB, "get_mathquest_status", { school_id: f.schoolB });
    expect(status.connection.id).toBe(local);
    expect(status.connection.destinationSchoolId).toBe(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    await f.svc("mathquest_service_revoke", {
      school_id: f.schoolB,
      actor_id: teacherB,
      finish: false,
    });
    await expect(
      f.rpc(teacherB, "set_mathquest_mode", {
        school_id: f.schoolB,
        mode: "auto_after_confirm",
        enabled: true,
        consent: true,
      }),
    ).rejects.toThrow("CONNECTION_NOT_ACTIVE");
    await f.svc("mathquest_service_revoke", {
      school_id: f.schoolB,
      actor_id: teacherB,
      finish: true,
    });
    await expect(
      f.svc("mathquest_service_revoke", {
        school_id: f.schoolA,
        actor_id: teacherA,
        finish: false,
      }),
    ).rejects.toThrow("PUBLICATION_WITHDRAW_REQUIRED");
  });
  it("splits 1,001 synthetic results into bounded additive batches with one revision", async () => {
    const exam = await f.exam();
    await f.confirm(exam.scanId);
    for (let start = 0; start < 1000; start += 500)
      await f.rpc(teacherA, "import_students", {
        school_id: f.schoolA,
        filename: "synthetic-bulk.csv",
        students: Array.from({ length: 500 }, (_, i) => ({
          student_code: String(20000 + start + i),
          prefix: "เด็กชาย",
          first_name: "นักเรียน",
          last_name: "จำลอง",
          classroom_name: "ม.1/1",
          number: null,
        })),
      });
    // Isolated DB load fixture only, not a claim about camera throughput.
    await f.db.query(
      `with rows as (
      select st.id student_id,st.student_code,gen_random_uuid() upload_id,gen_random_uuid() request_id,gen_random_uuid() scan_id
      from students st where st.school_id=$1 and st.student_code between '20000' and '20999'
    ), uploads as (
      insert into scan_uploads(id,school_id,exam_id,request_id,payload_hash,processed_path,status,created_by)
      select upload_id,$1,$2,request_id,repeat('b',64),$1::text||'/'||request_id::text||'/processed.jpg','complete',$3 from rows returning id,processed_path
    ), scans as (
      insert into scan_records(id,school_id,upload_id,exam_id,exam_version_id,template_id,student_id,raw_student_code,id_observations,slot,paper,image_public_id,scan_status,created_by,confirmed_by,confirmed_at)
      select r.scan_id,$1,u.id,$2,t.exam_version_id,t.id,r.student_id,r.student_code,'[]',0,'single',u.processed_path,'confirmed',$3,$3,now()
        from rows r join uploads u on u.id=r.upload_id cross join omr_templates t where t.id=$4 returning id,student_id,exam_version_id
    ) insert into exam_results(school_id,scan_id,exam_id,exam_version_id,student_id,score,max_score,percent,passed,status,confirmed_by,confirmed_at)
      select $1,id,$2,exam_version_id,student_id,18,20,90,true,'confirmed',$3,now() from scans`,
      [f.schoolA, exam.examId, teacherA, exam.template],
    );
    const published = await f.command(exam.examId);
    expect(published.batches).toBe(11);
    const jobs = (
      await f.db.query<{ payload_text: string }>(
        "select payload_text from score_sync_outbox where source_exam_id=$1 order by batch_index",
        [exam.examId],
      )
    ).rows.map((row) => scoreEventSchema.parse(JSON.parse(row.payload_text)));
    expect(new Set(jobs.map((job) => job.publication_revision)).size).toBe(1);
    expect(jobs.flatMap((job) => job.results)).toHaveLength(1001);
    expect(jobs.every((job) => job.results.length <= 100)).toBe(true);
  });
});
