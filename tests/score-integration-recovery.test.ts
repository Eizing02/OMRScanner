import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  integrationFixture,
  teacherA,
  teacherB,
  owner,
} from "./score-integration-fixture";
let f: Awaited<ReturnType<typeof integrationFixture>>;
let connection: string;
type Job = { event_id: string; lease_token: string; payload_text: string };
beforeAll(async () => {
  f = await integrationFixture(true);
  connection = await f.connect();
}, 60000);
afterAll(async () => {
  await f?.db.close();
});
const scope = () => ({ school_id: f.schoolA, actor_id: teacherA });
async function status(examId: string) {
  return f.rpc<{
    connection: { enabled: boolean; recoveryPending: boolean };
    publication: {
      recoveryRequired: boolean;
      termClosed: boolean;
      state: string;
      lastError: string;
    };
  }>(teacherA, "get_mathquest_status", {
    school_id: f.schoolA,
    exam_id: examId,
  });
}
async function deliver(job: Job, accepted = 1) {
  return f.svc("mathquest_service_finish", {
    event_id: job.event_id,
    lease_token: job.lease_token,
    ack: {
      schema_version: "1.0",
      event_id: job.event_id,
      status: "processed",
      accepted,
      unmatched: [],
      invalid: [],
    },
  });
}
describe("011 additive connection recovery", () => {
  it("keeps service wrappers, historical entrypoints and closed-term writes private", async () => {
    for (const actor of [teacherA, teacherB, owner]) {
      await expect(
        f.rpc(actor, "mathquest_service_recover", scope()),
      ).rejects.toThrow();
      await expect(
        f.rpc(actor, "get_mathquest_status_v010", scope()),
      ).rejects.toThrow();
      await expect(
        f.asUser(
          actor,
          "insert into integration_closed_terms values($1,$2,2569,1,now())",
          [f.schoolA, crypto.randomUUID()],
        ),
      ).rejects.toThrow();
    }
    await expect(
      f.svc("mathquest_service_recover_v010", scope()),
    ).rejects.toThrow();
    await expect(
      f.svc("mathquest_service_recover", {
        ...scope(),
        actor_id: teacherB,
        id: connection,
      }),
    ).rejects.toThrow("FORBIDDEN");
    const pending = crypto.randomUUID(),
      challenge = {
        v: "fixture",
        nonce: "synthetic",
        tag: "synthetic",
        ciphertext: "not-a-real-secret",
      };
    await f.svc("mathquest_service_start_pairing", {
      school_id: f.schoolB,
      actor_id: teacherB,
      request_id: pending,
      pairing_secret: challenge,
    });
    await f.svc("mathquest_service_complete_pairing", {
      school_id: f.schoolB,
      actor_id: teacherB,
      id: pending,
      status: "expired",
    });
    expect(
      (
        await f.db.query<{ pairing_secret: unknown }>(
          "select pairing_secret from private.integration_secrets where connection_id=$1",
          [pending],
        )
      ).rows[0].pairing_secret,
    ).toEqual(challenge);
  });
  it("requires pause and verified remote ACK; retains scores and fences a late worker", async () => {
    const exam = await f.exam();
    await f.confirm(exam.scanId);
    await f.command(exam.examId);
    const job = await f.svc<Job>("mathquest_service_claim", {
      school_id: f.schoolA,
      exam_id: exam.examId,
    });
    const input = { ...scope(), id: connection };
    await expect(f.svc("mathquest_service_recover", input)).rejects.toThrow(
      "RECOVERY_PAUSE_REQUIRED",
    );
    await f.rpc(teacherA, "set_mathquest_mode", {
      school_id: f.schoolA,
      mode: "manual",
      enabled: false,
      consent: true,
    });
    await f.svc("mathquest_service_recover", input);
    expect((await status(exam.examId)).connection.recoveryPending).toBe(true);
    await expect(
      f.svc("mathquest_service_revoke", { ...input, finish: true }),
    ).rejects.toThrow("CONNECTION_NOT_ACTIVE");
    await expect(
      f.svc("mathquest_service_recover", {
        ...input,
        finish: true,
        ack: { status: "revoked" },
      }),
    ).rejects.toThrow("INVALID_ACK");
    await f.svc("mathquest_service_recover", {
      ...input,
      finish: true,
      ack: { schema_version: "1.0", request_id: connection, status: "revoked" },
    });
    expect(await deliver(job)).toBe(false);
    expect((await status(exam.examId)).publication).toMatchObject({
      state: "error",
      lastError: "REMOTE_REVOKED",
    });
    expect(
      (
        await f.db.query<{ status: string; score: number }>(
          "select status,score from exam_results where scan_id=$1",
          [exam.scanId],
        )
      ).rows[0],
    ).toMatchObject({ status: "confirmed", score: "20" });
    await expect(
      f.rpc(teacherA, "begin_exam_deletion", {
        school_id: f.schoolA,
        exam_id: exam.examId,
        request_id: crypto.randomUUID(),
      }),
    ).rejects.toThrow("PUBLICATION_WITHDRAW_REQUIRED");
    const pending = crypto.randomUUID();
    await f.svc("mathquest_service_start_pairing", {
      ...scope(),
      request_id: pending,
      pairing_secret: {
        v: "fixture",
        nonce: "synthetic",
        tag: "synthetic",
        ciphertext: "not-a-real-secret",
      },
    });
    await expect(
      f.svc("mathquest_service_complete_pairing", {
        ...scope(),
        id: pending,
        status: "active",
        connection_id: crypto.randomUUID(),
        destination_school_id: crypto.randomUUID(),
        destination_label: "โรงเรียนอื่น",
        scope: "score:write",
        token_secret: { v: "fixture" },
      }),
    ).rejects.toThrow("RECOVERY_DESTINATION_MISMATCH");
    await f.svc("mathquest_service_revoke", {
      ...scope(),
      id: pending,
      finish: false,
    });
    await f.svc("mathquest_service_revoke", {
      ...scope(),
      id: pending,
      finish: true,
    });
    connection = await f.connect();
    expect((await status(exam.examId)).publication.recoveryRequired).toBe(true);
    await expect(f.command(exam.examId)).rejects.toThrow(
      "PUBLICATION_RECOVERY_REQUIRED",
    );
    const withdrawn = await f.command(exam.examId, "withdraw");
    expect(withdrawn.revision).toBe(2);
    const withdrawal = await f.svc<Job>("mathquest_service_claim", {
      school_id: f.schoolA,
      exam_id: exam.examId,
    });
    expect(JSON.parse(withdrawal.payload_text).results).toEqual([]);
    expect(await deliver(withdrawal, 0)).toBe(true);
    expect(
      (
        await f.db.query<{ state: string }>(
          "select state from exam_publications where source_exam_id=$1",
          [exam.examId],
        )
      ).rows.every((p) => p.state === "withdrawn"),
    ).toBe(true);
    expect((await f.command(exam.examId)).revision).toBe(3);
  });
  it("isolates a closed term, honors idempotent commands, and keeps another term working", async () => {
    const closed = await f.exam(),
      sameTerm = await f.exam(),
      other = await f.exam(0, undefined, 1, { term: 2 });
    for (const exam of [closed, sameTerm, other]) await f.confirm(exam.scanId);
    const request = crypto.randomUUID();
    const prior = await f.command(closed.examId, "publish", request);
    await f.command(sameTerm.examId);
    await f.command(other.examId);
    const job = await f.svc<Job>("mathquest_service_claim", {
      school_id: f.schoolA,
      exam_id: closed.examId,
    });
    const fail = {
      event_id: job.event_id,
      lease_token: job.lease_token,
      error_code: "TERM_CLOSED",
      retryable: false,
    };
    expect(
      await f.svc("mathquest_service_finish", {
        ...fail,
        lease_token: crypto.randomUUID(),
      }),
    ).toBe(false);
    expect(await f.svc("mathquest_service_finish", fail)).toBe(true);
    expect(await f.svc("mathquest_service_finish", fail)).toBe(false);
    expect(await status(closed.examId)).toMatchObject({
      connection: { enabled: true },
      publication: { termClosed: true, lastError: "TERM_CLOSED" },
    });
    expect((await status(sameTerm.examId)).publication.termClosed).toBe(true);
    expect(await f.command(closed.examId, "publish", request)).toEqual(prior);
    for (const action of ["publish", "retry"])
      await expect(f.command(sameTerm.examId, action)).rejects.toThrow(
        "TERM_CLOSED",
      );
    expect(
      await f.svc("mathquest_service_claim", {
        school_id: f.schoolA,
        exam_id: sameTerm.examId,
      }),
    ).toBeNull();
    const next = await f.svc<Job>("mathquest_service_claim", {
      school_id: f.schoolA,
      exam_id: other.examId,
    });
    expect(await deliver(next)).toBe(true);
    expect((await status(other.examId)).publication.termClosed).toBe(false);
    expect(
      (await f.asUser(teacherB, "select * from integration_closed_terms")).rows,
    ).toHaveLength(0);
    expect(
      (await f.asUser(teacherA, "select * from integration_closed_terms")).rows,
    ).toHaveLength(1);
    await f.rpc(teacherA, "set_mathquest_mode", {
      school_id: f.schoolA,
      mode: "auto_after_confirm",
      enabled: true,
      consent: true,
    });
    const newer = await f.exam();
    await f.confirm(newer.scanId);
    expect(
      (
        await f.db.query(
          "select * from exam_publications where source_exam_id=$1",
          [newer.examId],
        )
      ).rows,
    ).toHaveLength(0);
    expect((await status(newer.examId)).publication.termClosed).toBe(true);
  });
  it("blocks auto requests after re-pair, including a pre-existing draft; closed terms survive recovery", async () => {
    const exam = await f.exam(0, undefined, 1, { term: 2 });
    await f.confirm(exam.scanId);
    await f.command(exam.examId);
    await f.rpc(teacherA, "set_mathquest_mode", {
      school_id: f.schoolA,
      mode: "manual",
      enabled: false,
      consent: true,
    });
    await f.svc("mathquest_service_recover", { ...scope(), id: connection });
    await f.svc("mathquest_service_recover", {
      ...scope(),
      id: connection,
      finish: true,
      ack: { schema_version: "1.0", request_id: connection, status: "revoked" },
    });
    connection = await f.connect();
    await f.rpc(teacherA, "set_mathquest_mode", {
      school_id: f.schoolA,
      mode: "auto_after_confirm",
      enabled: true,
      consent: true,
    });
    const additional = await f.exam(1, exam.examId, 1, { term: 2 });
    await f.confirm(additional.scanId);
    expect((await status(exam.examId)).publication.recoveryRequired).toBe(true);
    await f.db.query(
      "insert into exam_publications(source_workspace_id,source_exam_id,local_connection_id,requested_generation,requested_by,requested_at) values($1,$2,$3,1,$4,now()-interval '3 seconds')",
      [f.schoolA, exam.examId, connection, teacherA],
    );
    expect(
      await f.svc("mathquest_service_materialize", {
        school_id: f.schoolA,
        exam_id: exam.examId,
      }),
    ).toBe(0);
    await expect(f.command(exam.examId)).rejects.toThrow(
      "PUBLICATION_RECOVERY_REQUIRED",
    );
    expect((await status(exam.examId)).publication.recoveryRequired).toBe(true);
    await f.command(exam.examId, "withdraw");
    const withdrawal = await f.svc<Job>("mathquest_service_claim", {
      school_id: f.schoolA,
      exam_id: exam.examId,
    });
    expect(await deliver(withdrawal, 0)).toBe(true);
    const closed = await f.exam();
    await f.confirm(closed.scanId);
    expect((await status(closed.examId)).publication.termClosed).toBe(true);
    await expect(f.command(closed.examId)).rejects.toThrow("TERM_CLOSED");
  });
});
