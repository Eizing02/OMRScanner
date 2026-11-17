import { createRequire } from "node:module";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import {
  initiateSignedPairing,
  refreshPairing,
  revokePairing,
} from "@/lib/integrations/mathquest/pairing";
import { dispatchScores } from "@/lib/integrations/mathquest/publisher";
import { integrationOverviewSchema } from "@/types/integration";
import { teacherA, teacherB } from "./score-integration-fixture";
import { signedPairingFixture } from "./student-roster-fixture";

vi.mock("server-only", () => ({}));

const receiverRoot = process.env.MATHQUEST_SOURCE_DIR;
const origin = "https://abcdefghijklmnopqrst.supabase.co";
type ReceiverArgs = Record<string, unknown>;
type Handler = (request: Request) => Promise<Response>;

function googleUser(id: string, email: string): User {
  const now = new Date().toISOString();
  return {
    id,
    email,
    email_confirmed_at: now,
    created_at: now,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    identities: [
      {
        id,
        user_id: id,
        identity_id: id,
        provider: "google",
        identity_data: { email, email_verified: true },
      },
    ],
  };
}

// Both project databases and the transport are disposable. No deployed API is called.
it.skipIf(!receiverRoot)(
  "recovers signed approval during a pause and matches score receipts across both projects",
  async () => {
    const require = createRequire(import.meta.url);
    const { setup, read } = require(
      path.join(receiverRoot!, "scripts/test-scansob.cjs"),
    ) as {
      setup: (
        db: PGlite,
      ) => Promise<{ teacher: string; actor: (id: string) => Promise<void> }>;
      read: (file: string) => string;
    };
    const { createScanSobHandler } = require(
      path.join(receiverRoot!, "supabase/functions/_shared/scansob-http.mjs"),
    ) as {
      createScanSobHandler: (kind: string, options: ReceiverArgs) => Handler;
    };
    const source = await signedPairingFixture();
    const receiver = new PGlite();
    try {
      const receiverIdentity = await setup(receiver);
      await receiver.exec("reset role");
      for (const file of [
        "20261116_01_scansob_code_free_pairing.sql",
        "20261117_01_scansob_publication_receipts.sql",
        "20261117_02_scansob_review_each_request.sql",
      ])
        await receiver.exec(read(file));
      await receiver.query(
        "insert into public.students(id,name,grade,role,password) values($1,$2,$3,'STUDENT','fixture')",
        ["00123", "นักเรียนจำลอง", "ม.1/1"],
      );
      async function receiverRpc<T>(name: string, args: ReceiverArgs = {}) {
        const params = Object.keys(args)
          .map((key, index) => `${key}=>$${index + 1}`)
          .join(",");
        const { rows } = await receiver.query<{ result: T }>(
          `select public.${name}(${params}) result`,
          Object.values(args),
        );
        return rows[0].result;
      }
      await receiverIdentity.actor(receiverIdentity.teacher);
      const session = await receiverRpc<string>("mq_open_teacher_session");
      async function admin<T>(
        rpc: string,
        action: string,
        args: ReceiverArgs = {},
      ) {
        await receiverIdentity.actor(receiverIdentity.teacher);
        return receiverRpc<T>(rpc, {
          p_teacher_token: session,
          p_action: action,
          p_args: args,
        });
      }
      const inbox = "mq_scansob_pairing_inbox";
      const role = "mq_scansob_admin";
      const policy = await admin<{ school_id: string; revision: string }>(
        inbox,
        "policy",
      );
      const opened = await admin<{ revision: string; emails: string[] }>(
        inbox,
        "configure",
        {
          policy: "review_each_request",
          enabled: true,
          revision: policy.revision,
        },
      );
      expect(opened.emails).toEqual([]);
      await admin(role, "configure", {
        enabled: true,
        student_view_enabled: false,
      });
      const signingKey = Buffer.alloc(32, 1).toString("base64url");
      for (const [name, value] of Object.entries({
        SCORE_INTEGRATION_ENABLED: "true",
        MATHQUEST_RECEIVER_VERIFIED: "true",
        MATHQUEST_RECEIVER_ORIGIN: origin,
        MATHQUEST_CODE_FREE_PAIRING_ENABLED: "true",
        MATHQUEST_CODE_FREE_PAIRING_RECEIVER_VERIFIED: "true",
        MATHQUEST_DESTINATION_SCHOOL_ID: policy.school_id,
        MATHQUEST_DESTINATION_LABEL: "โรงเรียนจำลอง",
        MATHQUEST_CODE_FREE_SIGNING_KEY_ID: "fixture",
        MATHQUEST_CODE_FREE_SIGNING_KEY: signingKey,
        SCORE_SYNC_ENCRYPTION_KEY_VERSION: "fixture",
        SCORE_SYNC_ENCRYPTION_KEYS: JSON.stringify({ fixture: "c".repeat(64) }),
      }))
        vi.stubEnv(name, value);
      const edgeRpc = async (name: string, args: ReceiverArgs) => {
        await receiver.exec("reset role; set role service_role");
        return receiverRpc(name, args);
      };
      const pair = createScanSobHandler("pair", {
        rpc: edgeRpc,
        pairingKey: "synthetic-delivery-key-for-local-qa",
        signingKey,
        signingKeyId: "fixture",
        signingSchoolId: policy.school_id,
      });
      const scores = createScanSobHandler("scores", { rpc: edgeRpc });
      const service = {
        async rpc(name: string, { input }: { input: ReceiverArgs }) {
          try {
            return { data: await source.svc(name, input), error: null };
          } catch (error) {
            return { data: null, error: { message: (error as Error).message } };
          }
        },
      } as unknown as SupabaseClient;
      const requestA = crypto.randomUUID();
      const requestB = crypto.randomUUID();
      const accountA = googleUser(teacherA, "teacher-a@example.test");
      const accountB = googleUser(teacherB, "teacher-b@example.test");
      const pairActions: string[] = [];
      const scoreBodies: string[] = [];
      let receivedFirstRequest = false;
      let firstRequestBody: string | undefined;
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        const request = new Request(url, init);
        const target = new URL(request.url);
        const body = String(init.body);
        const data = JSON.parse(body);
        if (target.origin !== origin) throw new Error("Unexpected test origin");
        if (target.pathname === "/functions/v1/ingest-scansob-results") {
          scoreBodies.push(body);
          const response = await scores(request);
          if (scoreBodies.length === 1 && response.ok)
            throw new Error("Lost score acknowledgment");
          return response;
        }
        if (target.pathname !== "/functions/v1/pair-scansob-workspace")
          throw new Error("Unexpected test endpoint");
        const response = await pair(request);
        if (data.request_id === requestA) {
          pairActions.push(data.action);
          if (data.action === "request_signed") {
            if (!firstRequestBody && response.ok) {
              receivedFirstRequest = true;
              firstRequestBody = body;
              throw new Error("Lost pairing acknowledgment");
            }
            expect(body === firstRequestBody).toBe(true);
          }
        }
        return response;
      });

      const localOverview = async (
        actor: string,
        schoolId: string,
        examId?: string,
      ) =>
        integrationOverviewSchema.parse({
          ...(await source.rpc(actor, "get_mathquest_status", {
            school_id: schoolId,
            ...(examId ? { exam_id: examId, preview: true } : {}),
          })),
          enabled: true,
          receiverReady: true,
          readOnly: false,
        });
      const refresh = async (id: string, schoolId: string, user: User) => {
        await source.db.query(
          "update public.integration_connections set last_checked_at=null where id=$1",
          [id],
        );
        await refreshPairing(service, schoolId, user.id, id, user.email);
      };
      await expect(
        initiateSignedPairing(
          service,
          source.schoolA,
          accountA,
          requestA,
          "ครูจำลอง A",
        ),
      ).rejects.toMatchObject({ code: "RECEIVER_UNAVAILABLE" });
      expect(receivedFirstRequest).toBe(true);
      expect(
        (await localOverview(teacherA, source.schoolA)).connection,
      ).toMatchObject({ signedStage: "submit" });
      await initiateSignedPairing(
        service,
        source.schoolB,
        accountB,
        requestB,
        "ครูจำลอง B",
      );
      expect((await admin<{ count: number }>(inbox, "inbox")).count).toBe(2);
      await expect(localOverview(teacherB, source.schoolA)).rejects.toThrow(
        "FORBIDDEN",
      );

      await admin(inbox, "configure", {
        enabled: false,
        revision: opened.revision,
      });
      vi.stubEnv("MATHQUEST_CODE_FREE_PAIRING_ENABLED", "false");
      await refresh(requestA, source.schoolA, accountA);
      expect(pairActions).toEqual([
        "prepare_signed",
        "request_signed",
        "request_signed",
      ]);
      expect((await admin<{ count: number }>(inbox, "inbox")).count).toBe(2);
      await admin(role, "approve", { request_id: requestA });
      await admin(role, "reject", { request_id: requestB });
      await refresh(requestA, source.schoolA, accountA);
      await refresh(requestB, source.schoolB, accountB);
      expect(
        (await localOverview(teacherA, source.schoolA)).connection,
      ).toMatchObject({ status: "active", mode: "manual" });
      expect(
        (await localOverview(teacherB, source.schoolB)).connection,
      ).toMatchObject({
        status: "error",
        signedStage: "rejected",
        enabled: false,
        connectionId: null,
      });

      const exam = await source.exam();
      const other = await source.exam(1, exam.examId);
      await source.confirm(exam.scanId);
      await source.confirm(other.scanId);
      const jobs = await source.db.query(
        "select event_id from public.score_sync_outbox where source_workspace_id=$1",
        [source.schoolA],
      );
      expect(jobs.rows).toHaveLength(0);
      const snapshot = await localOverview(
        teacherA,
        source.schoolA,
        exam.examId,
      );
      const scope = { school_id: source.schoolA, exam_id: exam.examId };
      const command = (action: string, extra: ReceiverArgs = {}) =>
        source.rpc(teacherA, "command_mathquest_publication", {
          ...scope,
          action,
          request_id: crypto.randomUUID(),
          consent: true,
          ...extra,
        });
      const dispatch = () =>
        dispatchScores(
          { schoolId: source.schoolA, examId: exam.examId },
          service,
        );
      await command("publish", {
        preview_fingerprint: snapshot.publication?.preview?.fingerprint,
      });
      expect(await dispatch()).toEqual({ attempted: 1 });
      await command("retry", { frozen_retry: true });
      expect(await dispatch()).toEqual({ attempted: 1 });
      expect(scoreBodies[0] === scoreBodies[1]).toBe(true);
      const published = await localOverview(
        teacherA,
        source.schoolA,
        exam.examId,
      );
      expect(published.publication).toMatchObject({
        revision: 1,
        delivered: 1,
        unmatched: ["00124"],
      });
      const receipt = async () => {
        await receiver.exec("reset role");
        const { rows } = await receiver.query<{ id: number }>(
          "select id from mathquest_private.scansob_exams where source_exam_id=$1",
          [exam.examId],
        );
        await receiverIdentity.actor(receiverIdentity.teacher);
        return receiverRpc("mq_scansob_publication_receipt", {
          p_teacher_token: session,
          p_exam_id: rows[0].id,
        });
      };
      expect(await receipt()).toMatchObject({
        revision: "1",
        accepted: 1,
        unmatched: 1,
        verified_batches: 1,
      });
      await command("withdraw");
      expect(await dispatch()).toEqual({ attempted: 1 });
      expect(
        (await localOverview(teacherA, source.schoolA, exam.examId))
          .publication,
      ).toMatchObject({ revision: 2, state: "withdrawn" });
      expect(await receipt()).toMatchObject({ revision: "2", withdrawn: true });

      await source.db.query(
        "update public.integration_connections set last_checked_at=null where id=$1",
        [requestA],
      );
      await revokePairing(service, source.schoolA, teacherA, requestA);
      expect(
        (await localOverview(teacherA, source.schoolA)).connection,
      ).toMatchObject({ status: "revoked" });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await Promise.all([source.db.close(), receiver.close()]);
    }
  },
  60000,
);
