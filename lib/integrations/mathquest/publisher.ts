import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ApiError } from "@/lib/supabase/api";
import { integrationServiceClient, requireIntegration } from "./config";
import {
  scoreEventSchema,
  validateAcknowledgment,
  MAX_EVENT_BYTES,
} from "./contract";
import { integrationDatabaseError } from "./errors";
import { receiverRequest, ReceiverError } from "./http";
import { openSecret, tokenBinding, payloadHash } from "./security";
export async function integrationRpc(
  db: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
) {
  const result = await db.rpc(name, { input });
  if (result.error) throw integrationDatabaseError(result.error.message);
  return result.data;
}
const jobSchema = z.object({
  event_id: z.uuid(),
  source_workspace_id: z.uuid(),
  local_connection_id: z.uuid(),
  lease_token: z.uuid(),
  payload_text: z.string(),
  payload_hash: z.string().regex(/^[a-f0-9]{64}$/),
  attempt_count: z.number().int().positive(),
  token_secret: z.unknown(),
});
export function retrySeconds(
  attempt: number,
  minimum = 0,
  random = Math.random,
) {
  const base = Math.min(30 * 2 ** Math.min(Math.max(attempt - 1, 0), 7), 3000);
  return Math.min(
    3600,
    Math.max(minimum, Math.ceil(base * (1 + random() * 0.2))),
  );
}
export async function dispatchScores(
  scope: { schoolId?: string; examId?: string } = {},
  suppliedDb?: SupabaseClient,
) {
  requireIntegration(true);
  const db = suppliedDb ?? integrationServiceClient();
  const filter = {
    ...(scope.schoolId ? { school_id: scope.schoolId } : {}),
    ...(scope.examId ? { exam_id: scope.examId } : {}),
  };
  await integrationRpc(db, "mathquest_service_materialize", filter);
  let attempted = 0;
  const start = Date.now();
  while (attempted < 5 && Date.now() - start < 12000) {
    const value = await integrationRpc(db, "mathquest_service_claim", filter);
    if (!value) break;
    const job = jobSchema.parse(value);
    const finish = { event_id: job.event_id, lease_token: job.lease_token };
    attempted++;
    try {
      if (
        Buffer.byteLength(job.payload_text, "utf8") > MAX_EVENT_BYTES ||
        payloadHash(job.payload_text) !== job.payload_hash
      )
        throw new ReceiverError("INVALID_EVENT", false);
      let event;
      try {
        event = scoreEventSchema.parse(JSON.parse(job.payload_text));
      } catch {
        throw new ReceiverError("INVALID_EVENT", false);
      }
      if (
        event.event_id !== job.event_id ||
        event.source_workspace_id !== job.source_workspace_id
      )
        throw new ReceiverError("INVALID_EVENT", false);
      const token = openSecret(
        job.token_secret,
        tokenBinding(job.source_workspace_id, job.local_connection_id),
      );
      if (!/^[A-Za-z0-9_-]{43,256}$/.test(token))
        throw new ReceiverError("INTEGRATION_SECRET_UNAVAILABLE", false);
      const valid = await integrationRpc(
        db,
        "mathquest_service_validate_lease",
        finish,
      );
      if (!valid) continue; // Lease recovery/revocation owns the next decision.
      const response = await receiverRequest(
        "ingest-scansob-results",
        job.payload_text,
        token,
      );
      let ack;
      try {
        ack = validateAcknowledgment(response, event);
      } catch {
        throw new ReceiverError("INVALID_ACK", false);
      }
      await integrationRpc(db, "mathquest_service_finish", { ...finish, ack });
    } catch (error) {
      const failure =
        error instanceof ReceiverError
          ? error
          : error instanceof ApiError &&
              error.code === "INTEGRATION_SECRET_UNAVAILABLE"
            ? new ReceiverError(error.code, false)
            : new ReceiverError("PUBLICATION_BLOCKED", false);
      await integrationRpc(db, "mathquest_service_finish", {
        ...finish,
        error_code: failure.code,
        retryable: failure.retryable,
        retry_seconds: retrySeconds(job.attempt_count, failure.retryAfter),
      });
    }
  }
  return { attempted };
}
