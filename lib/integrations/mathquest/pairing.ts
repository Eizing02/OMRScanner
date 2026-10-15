import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/supabase/api";
import { integrationRpc } from "./publisher";
import { receiverRequest, ReceiverError } from "./http";
import {
  sealSecret,
  openSecret,
  tokenBinding,
  pairingBinding,
} from "./security";
const remotePairSchema = z.strictObject({
  schema_version: z.literal("1.0"),
  request_id: z.uuid(),
  status: z.enum(["pending_approval", "active", "rejected", "expired"]),
  connection: z
    .strictObject({
      id: z.uuid(),
      destination_school_id: z.uuid(),
      destination_label: z.string().min(1).max(120),
      scope: z.literal("score:write"),
      token: z.string().regex(/^[A-Za-z0-9_-]{43,256}$/),
    })
    .optional(),
});
async function completePair(
  db: SupabaseClient,
  workspace: string,
  actor: string,
  id: string,
  result: unknown,
) {
  let value;
  try {
    value = remotePairSchema.parse(result);
  } catch {
    throw new ReceiverError("INVALID_ACK", false);
  }
  if (
    value.request_id !== id ||
    (value.status === "active") !== Boolean(value.connection)
  )
    throw new ReceiverError("INVALID_ACK", false);
  if (value.status === "pending_approval") return;
  await integrationRpc(db, "mathquest_service_complete_pairing", {
    school_id: workspace,
    actor_id: actor,
    id,
    status: value.status,
    ...(value.connection
      ? {
          connection_id: value.connection.id,
          destination_school_id: value.connection.destination_school_id,
          destination_label: value.connection.destination_label,
          scope: value.connection.scope,
          token_secret: sealSecret(
            value.connection.token,
            tokenBinding(workspace, id),
          ),
        }
      : {}),
  });
}
export async function initiatePairing(
  db: SupabaseClient,
  workspace: string,
  actor: string,
  requestId: string,
  code: string,
  workspaceLabel: string,
) {
  const started = await integrationRpc(db, "mathquest_service_start_pairing", {
    school_id: workspace,
    actor_id: actor,
    request_id: requestId,
    pairing_secret: sealSecret(
      randomBytes(32).toString("base64url"),
      pairingBinding(workspace, requestId),
    ),
  });
  const secret = openSecret(
    started.secret,
    pairingBinding(workspace, requestId),
  );
  const response = await receiverRequest(
    "pair-scansob-workspace",
    JSON.stringify({
      schema_version: "1.0",
      action: "request",
      request_id: requestId,
      source_workspace_id: workspace,
      workspace_label: workspaceLabel,
      request_secret: secret,
      pairing_code: code,
    }),
  );
  await completePair(db, workspace, actor, requestId, response);
}
export async function refreshPairing(
  db: SupabaseClient,
  workspace: string,
  actor: string,
) {
  const row = await integrationRpc(db, "mathquest_service_credentials", {
    school_id: workspace,
    actor_id: actor,
  });
  if (row.status !== "pending_approval") return;
  const secret = openSecret(
    row.secrets.pairing_secret,
    pairingBinding(workspace, row.id),
  );
  const response = await receiverRequest(
    "pair-scansob-workspace",
    JSON.stringify({
      schema_version: "1.0",
      action: "status",
      request_id: row.id,
      source_workspace_id: workspace,
      request_secret: secret,
    }),
  );
  await completePair(db, workspace, actor, row.id, response);
}
export async function revokePairing(
  db: SupabaseClient,
  workspace: string,
  actor: string,
) {
  const row = await integrationRpc(db, "mathquest_service_credentials", {
    school_id: workspace,
    actor_id: actor,
  });
  // The SQL preflight checks every publication, not only a UI-loaded page.
  await integrationRpc(db, "mathquest_service_revoke", {
    school_id: workspace,
    actor_id: actor,
    finish: false,
  });
  const token = row.secrets.token_secret
    ? openSecret(row.secrets.token_secret, tokenBinding(workspace, row.id))
    : undefined;
  const challenge = row.secrets.pairing_secret
    ? openSecret(row.secrets.pairing_secret, pairingBinding(workspace, row.id))
    : undefined;
  if ((row.status === "active" || row.connection_id) && !token)
    throw new ReceiverError("INTEGRATION_SECRET_UNAVAILABLE", false);
  if (token || challenge) {
    try {
      const response = await receiverRequest(
        "pair-scansob-workspace",
        JSON.stringify({
          schema_version: "1.0",
          action: "revoke",
          request_id: row.id,
          source_workspace_id: workspace,
          ...(row.connection_id ? { connection_id: row.connection_id } : {}),
          ...(challenge ? { request_secret: challenge } : {}),
        }),
        token,
      );
      const ack = z
        .strictObject({
          schema_version: z.literal("1.0"),
          request_id: z.uuid(),
          status: z.literal("revoked"),
        })
        .safeParse(response);
      if (!ack.success || ack.data.request_id !== row.id)
        throw new ReceiverError("INVALID_ACK", false);
    } catch (error) {
      // A never-active request has no score scope or bearer token. Its one-time
      // pairing code expires remotely, so local cancellation stays recoverable.
      if (
        row.status !== "pending_approval" ||
        token ||
        !(error instanceof ReceiverError)
      )
        throw error;
    }
  }
  await integrationRpc(db, "mathquest_service_revoke", {
    school_id: workspace,
    actor_id: actor,
    finish: true,
  });
}
export function pairingFailure(error: unknown) {
  if (error instanceof ReceiverError)
    return new ApiError(
      error.code,
      error.code === "CONNECTION_DENIED"
        ? "รหัสเชื่อมต่อไม่ถูกต้องหรือไม่ได้รับอนุมัติ"
        : "ติดต่อ MathQuest ไม่สำเร็จ กรุณาลองตรวจสถานะอีกครั้ง",
      error.retryable ? 503 : 409,
    );
  return error;
}
