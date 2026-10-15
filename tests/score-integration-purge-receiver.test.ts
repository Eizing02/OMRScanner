import { createRequire } from "node:module";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { integrationFixture, teacherA } from "./score-integration-fixture";
import {
  scoreEventSchema,
  validateAcknowledgment,
} from "@/lib/integrations/mathquest/contract";

// Optional, read-only cross-project fixture. Never calls a deployed endpoint.
const receiverRoot = process.env.MATHQUEST_SOURCE_DIR;
type Remote = { id: string; destination_school_id: string; token: string };
type Reply = { status: number; body: Record<string, unknown> };
type Harness = {
  approve: (
    workspace: string,
  ) => Promise<{ request: Record<string, string>; connection: Remote }>;
  admin: (action: string, args?: Record<string, unknown>) => Promise<unknown>;
  reset: () => Promise<unknown>;
  call: (handler: unknown, body: unknown, token?: string) => Promise<Reply>;
  pairHandler: unknown;
  scoreHandler: unknown;
};
type Job = {
  event_id: string;
  lease_token: string;
  payload_text: string;
  payload_hash: string;
  revision: number;
};
it.skipIf(!receiverRoot)(
  "source 012 and real receiver 03 reconcile a purge with frozen retry and isolated missing proof",
  async () => {
    const require = createRequire(import.meta.url);
    const { harness } = require(
      path.join(receiverRoot!, "scripts/test-scansob-recovery.cjs"),
    ) as { harness: (db: PGlite) => Promise<Harness> };
    const receiver = new PGlite();
    const source = await integrationFixture();
    try {
      const h = await harness(receiver);
      await receiver.exec(
        "reset role; insert into public.students(id,name,grade,role,password) values('00123','Synthetic student','ม.1/1','STUDENT','fixture')",
      );
      let pairing = await h.approve(source.schoolA);
      await h.admin("configure", {
        enabled: true,
        student_view_enabled: false,
        accept_self_claim_risk: false,
      });
      const connect = () =>
        source.connect(source.schoolA, teacherA, {
          requestId: pairing.request.request_id,
          connectionId: pairing.connection.id,
          destinationSchoolId: pairing.connection.destination_school_id,
        });
      const localId = await connect();
      const scope = (exam: string) => ({
        school_id: source.schoolA,
        exam_id: exam,
      });
      const claim = (exam: string) =>
        source.svc<Job>("mathquest_service_claim", scope(exam));
      const finish = (job: Job, data: Record<string, unknown>) =>
        source.svc("mathquest_service_finish", {
          event_id: job.event_id,
          lease_token: job.lease_token,
          ...data,
        });
      const send = async (job: Job) => {
        const event = scoreEventSchema.parse(JSON.parse(job.payload_text));
        const reply = await h.call(
          h.scoreHandler,
          event,
          pairing.connection.token,
        );
        if (reply.status === 200) validateAcknowledgment(reply.body, event);
        return reply;
      };
      const exam = await source.exam();
      await source.confirm(exam.scanId);
      await source.command(exam.examId);
      const published = await claim(exam.examId),
        delivered = await send(published);
      expect(delivered.body.accepted).toBe(1);
      await finish(published, { ack: delivered.body });
      await source.rpc(teacherA, "set_mathquest_mode", {
        school_id: source.schoolA,
        mode: "manual",
        enabled: false,
        consent: true,
      });
      const recover = {
        school_id: source.schoolA,
        actor_id: teacherA,
        id: localId,
      };
      await source.svc("mathquest_service_recover", recover);
      const cancelled = await h.call(
        h.pairHandler,
        {
          schema_version: "1.0",
          action: "revoke",
          request_id: pairing.request.request_id,
          source_workspace_id: source.schoolA,
          connection_id: pairing.connection.id,
        },
        pairing.connection.token,
      );
      expect(cancelled.body.status).toBe("revoked");
      await source.svc("mathquest_service_recover", {
        ...recover,
        finish: true,
        ack: cancelled.body,
      });
      await h.reset();
      pairing = await h.approve(source.schoolA);
      await connect();
      await h.admin("configure", {
        enabled: true,
        student_view_enabled: false,
        accept_self_claim_risk: false,
      });
      const absent = await source.exam();
      await source.confirm(absent.scanId);
      await source.command(absent.examId);
      const closed = await claim(absent.examId);
      const denied = await send(closed);
      expect(denied).toMatchObject({
        status: 403,
        body: { error: "TERM_CLOSED" },
      });
      await finish(closed, { error_code: "TERM_CLOSED", retryable: false });
      await source.command(absent.examId, "withdraw");
      await source.command(exam.examId, "withdraw");
      const missingProof = await claim(absent.examId),
        valid = await claim(exam.examId);
      expect((await send(missingProof)).body.error).toBe("TERM_CLOSED");
      await finish(missingProof, {
        error_code: "TERM_CLOSED",
        retryable: false,
      });
      expect(
        await source.svc("mathquest_service_validate_lease", {
          event_id: valid.event_id,
          lease_token: valid.lease_token,
        }),
      ).toBe(true);
      const proof = await send(valid);
      expect(proof).toMatchObject({
        status: 200,
        body: { status: "processed", accepted: 0, unmatched: [], invalid: [] },
      });
      // Commit succeeded remotely, but its ACK was lost: exact event bytes retry.
      await finish(valid, {
        error_code: "RECEIVER_UNAVAILABLE",
        retryable: true,
        retry_seconds: 30,
      });
      await source.command(exam.examId, "retry");
      const retried = await claim(exam.examId);
      expect(retried.event_id).toBe(valid.event_id);
      expect(retried.payload_text).toBe(valid.payload_text);
      expect(retried.payload_hash).toBe(valid.payload_hash);
      const replay = await send(retried);
      expect(replay).toEqual(proof);
      await finish(retried, { ack: replay.body });
      expect(
        (
          await source.db.query<{ state: string }>(
            "select state from exam_publications where source_exam_id=$1",
            [exam.examId],
          )
        ).rows.every((p) => p.state === "withdrawn"),
      ).toBe(true);
      await expect(source.command(exam.examId)).rejects.toThrow("TERM_CLOSED");
      await expect(source.command(absent.examId, "retry")).rejects.toThrow(
        "WITHDRAWAL_PROOF_REQUIRED",
      );
      await expect(
        source.rpc(teacherA, "begin_exam_deletion", {
          ...scope(absent.examId),
          request_id: crypto.randomUUID(),
        }),
      ).rejects.toThrow("PUBLICATION_WITHDRAW_REQUIRED");
      expect(
        await source.rpc(teacherA, "begin_exam_deletion", {
          ...scope(exam.examId),
          confirmation: exam.config.title,
          request_id: crypto.randomUUID(),
        }),
      ).toBeTruthy();
      const open = await source.exam(0, undefined, 1, { term: 2 });
      await source.confirm(open.scanId);
      await source.command(open.examId);
      const next = await claim(open.examId),
        reply = await send(next);
      expect(reply.body.accepted).toBe(1);
      await finish(next, { ack: reply.body });
    } finally {
      await source.db.close();
      await receiver.close();
    }
  },
  60000,
);
