import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  integrationFixture,
  teacherA,
  teacherB,
  owner,
} from "./score-integration-fixture";
let f: Awaited<ReturnType<typeof integrationFixture>>;
type Job = {
  event_id: string;
  lease_token: string;
  payload_text: string;
  payload_hash: string;
  action: string;
  revision: number;
};
beforeAll(async () => {
  f = await integrationFixture();
  await f.connect();
}, 60000);
afterAll(async () => {
  await f?.db.close();
});
const scope = (examId: string) => ({ school_id: f.schoolA, exam_id: examId });
const claim = (examId: string) =>
  f.svc<Job | null>("mathquest_service_claim", scope(examId));
const finish = (job: Job, data: Record<string, unknown>) =>
  f.svc<boolean>("mathquest_service_finish", {
    event_id: job.event_id,
    lease_token: job.lease_token,
    ...data,
  });
const ack = (job: Job, status = "processed", accepted = 0) => ({
  schema_version: "1.0",
  event_id: job.event_id,
  status,
  accepted,
  unmatched: [],
  invalid: [],
});
const status = (examId: string) =>
  f.rpc<{
    connection: { enabled: boolean };
    publication: {
      state: string;
      termClosed: boolean;
      canWithdraw: boolean;
      canRetryWithdrawal: boolean;
      withdrawalBlocked: boolean;
      lastError: string | null;
    };
  }>(teacherA, "get_mathquest_status", scope(examId));
async function closedExam(term = 1, year = 2569) {
  const exam = await f.exam(0, undefined, 1, { term, year });
  await f.confirm(exam.scanId);
  await f.command(exam.examId);
  return exam;
}
describe("012 safe historical withdrawals in closed terms", () => {
  it("grants no bypass through historical RPCs or private authorization helpers", async () => {
    for (const actor of [teacherA, teacherB, owner]) {
      for (const name of [
        "mathquest_service_finish_v011",
        "get_mathquest_status_v011",
        "command_mathquest_publication_v011",
      ])
        await expect(f.rpc(actor, name)).rejects.toThrow();
      await expect(
        f.asUser(actor, "select private.mathquest_can_withdraw($1,$2,$3)", [
          f.schoolA,
          crypto.randomUUID(),
          crypto.randomUUID(),
        ]),
      ).rejects.toThrow();
    }
    await expect(f.svc("mathquest_service_finish_v011")).rejects.toThrow();
  });
  it("blocks publication but permits explicitly consented withdrawal, frozen retry and processed ACK only", async () => {
    const exam = await closedExam();
    const publication = (await claim(exam.examId))!;
    await finish(publication, { error_code: "TERM_CLOSED", retryable: false });
    expect(await status(exam.examId)).toMatchObject({
      connection: { enabled: true },
      publication: { termClosed: true, canWithdraw: true },
    });
    for (const action of ["publish", "retry"])
      await expect(f.command(exam.examId, action)).rejects.toThrow(
        "TERM_CLOSED",
      );
    await expect(
      f.rpc(teacherA, "command_mathquest_publication", {
        ...scope(exam.examId),
        request_id: crypto.randomUUID(),
        action: "withdraw",
        consent: false,
      }),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      f.rpc(teacherB, "command_mathquest_publication", {
        ...scope(exam.examId),
        request_id: crypto.randomUUID(),
        action: "withdraw",
        consent: true,
      }),
    ).rejects.toThrow("FORBIDDEN");
    const request = crypto.randomUUID();
    const command = await f.command(exam.examId, "withdraw", request);
    expect(await f.command(exam.examId, "withdraw", request)).toEqual(command);
    const first = (await claim(exam.examId))!;
    expect(first.action).toBe("withdraw_exam");
    expect(
      await f.svc("mathquest_service_validate_lease", {
        event_id: first.event_id,
        lease_token: first.lease_token,
      }),
    ).toBe(true);
    await finish(first, {
      error_code: "RECEIVER_UNAVAILABLE",
      retryable: true,
      retry_seconds: 30,
    });
    expect((await status(exam.examId)).publication.canRetryWithdrawal).toBe(
      true,
    );
    await f.command(exam.examId, "retry");
    const retry = (await claim(exam.examId))!;
    expect(retry.event_id).toBe(first.event_id);
    expect(retry.payload_text).toBe(first.payload_text);
    expect(retry.payload_hash).toBe(first.payload_hash);
    expect(retry.lease_token).not.toBe(first.lease_token);
    expect(await finish(first, { ack: ack(first) })).toBe(false);
    await expect(
      finish(retry, { ack: { ...ack(retry), accepted: 1 } }),
    ).rejects.toThrow("INVALID_ACK");
    await finish(retry, { ack: ack(retry, "stale_ignored") });
    expect((await status(exam.examId)).publication).toMatchObject({
      state: "error",
      withdrawalBlocked: true,
      canRetryWithdrawal: false,
    });
    await expect(f.command(exam.examId, "retry")).rejects.toThrow(
      "WITHDRAWAL_PROOF_REQUIRED",
    );
    // A fresh owner confirmation may create a higher revision after operator reconciliation.
    await f.command(exam.examId, "withdraw");
    const newer = (await claim(exam.examId))!;
    expect(await finish(newer, { ack: ack(newer) })).toBe(true);
    expect((await status(exam.examId)).publication).toMatchObject({
      state: "withdrawn",
      termClosed: true,
      canWithdraw: false,
    });
    await expect(f.command(exam.examId)).rejects.toThrow("TERM_CLOSED");
  });
  it("does not cancel another withdrawal's active lease when an exam lacks purge evidence", async () => {
    const absent = await closedExam(1, 2570),
      valid = await closedExam(1, 2570);
    await finish((await claim(absent.examId))!, {
      error_code: "TERM_CLOSED",
      retryable: false,
    });
    // Known closed-term publication jobs are never selected, including fresh ones.
    expect(await claim(absent.examId)).toBeNull();
    for (const exam of [absent, valid])
      await f.command(exam.examId, "withdraw");
    const one = (await claim(absent.examId))!,
      two = (await claim(valid.examId))!;
    await finish(one, { error_code: "TERM_CLOSED", retryable: false });
    expect((await status(absent.examId)).publication).toMatchObject({
      state: "error",
      withdrawalBlocked: true,
      canRetryWithdrawal: false,
      lastError: "WITHDRAWAL_PROOF_REQUIRED",
    });
    await expect(f.command(absent.examId, "retry")).rejects.toThrow(
      "WITHDRAWAL_PROOF_REQUIRED",
    );
    expect(await claim(absent.examId)).toBeNull();
    expect(
      await f.svc("mathquest_service_validate_lease", {
        event_id: two.event_id,
        lease_token: two.lease_token,
      }),
    ).toBe(true);
    expect(await finish(two, { ack: ack(two) })).toBe(true);
    await expect(
      f.rpc(teacherA, "begin_exam_deletion", {
        ...scope(absent.examId),
        request_id: crypto.randomUUID(),
      }),
    ).rejects.toThrow("PUBLICATION_WITHDRAW_REQUIRED");
    const other = await closedExam(2);
    const open = (await claim(other.examId))!;
    expect(await finish(open, { ack: ack(open, "processed", 1) })).toBe(true);
    expect(await status(other.examId)).toMatchObject({
      connection: { enabled: true },
      publication: { termClosed: false },
    });
  });
  it("does not trust a forged outbox action and allows a real withdrawal while sending is paused", async () => {
    const forged = await closedExam(3, 2571);
    await f.db.query(
      "update score_sync_outbox set action='withdraw_exam' where source_exam_id=$1",
      [forged.examId],
    );
    expect(await claim(forged.examId)).toBeNull();
    expect((await status(forged.examId)).publication.canRetryWithdrawal).toBe(
      false,
    );
    await expect(f.command(forged.examId, "retry")).rejects.toThrow(
      "NO_WITHDRAWAL_TO_RETRY",
    );
    const legitimate = await closedExam(1, 2572);
    await f.command(legitimate.examId, "withdraw");
    await f.rpc(teacherA, "set_mathquest_mode", {
      school_id: f.schoolA,
      mode: "manual",
      enabled: false,
      consent: true,
    });
    const job = (await claim(legitimate.examId))!;
    expect(job.action).toBe("withdraw_exam");
    expect(await finish(job, { ack: ack(job) })).toBe(true);
  });
  it("upgrades installed 011 without reviving blocked work or changing frozen event bytes", async () => {
    const old = await integrationFixture(true, false);
    try {
      await old.connect();
      const exam = await old.exam();
      await old.confirm(exam.scanId);
      await old.command(exam.examId);
      const input = { school_id: old.schoolA, exam_id: exam.examId };
      const first = await old.svc<Job>("mathquest_service_claim", input);
      await old.svc("mathquest_service_finish", {
        event_id: first.event_id,
        lease_token: first.lease_token,
        error_code: "TERM_CLOSED",
        retryable: false,
      });
      await old.command(exam.examId, "withdraw");
      expect(await old.svc("mathquest_service_claim", input)).toBeNull();
      const before = (
        await old.db.query<Job & { status: string }>(
          "select * from score_sync_outbox where source_exam_id=$1 and action='withdraw_exam'",
          [exam.examId],
        )
      ).rows[0];
      expect(before.status).toBe("blocked");
      await old.db.exec(
        await readFile(
          "supabase/migrations/202610150012_closed_term_withdrawals.sql",
          "utf8",
        ),
      );
      expect(await old.svc("mathquest_service_claim", input)).toBeNull();
      await old.command(exam.examId, "retry");
      const retry = await old.svc<Job>("mathquest_service_claim", input);
      expect(retry.event_id).toBe(before.event_id);
      expect(retry.payload_text).toBe(before.payload_text);
      expect(retry.payload_hash).toBe(before.payload_hash);
      expect(retry.lease_token).toBeTruthy();
      expect(
        await old.svc("mathquest_service_finish", {
          event_id: retry.event_id,
          lease_token: retry.lease_token,
          ack: ack(retry),
        }),
      ).toBe(true);
      const markers = await old.db.query(
        "select version from private.app_installation where version in ('202610150011','202610150012')",
      );
      expect(markers.rows).toHaveLength(2);
    } finally {
      await old.db.close();
    }
  });
});
