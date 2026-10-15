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
function parsePair(id: string, result: unknown) {
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
  return value;
}
async function completePair(
  db: SupabaseClient,
  workspace: string,
  actor: string,
  id: string,
  result: unknown,
) {
  const value = parsePair(id, result);
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
    id: row.id,
    finish: false,
  });
  let token = row.secrets.token_secret
    ? openSecret(row.secrets.token_secret, tokenBinding(workspace, row.id))
    : undefined;
  const challenge = row.secrets.pairing_secret
    ? openSecret(row.secrets.pairing_secret, pairingBinding(workspace, row.id))
    : undefined;
  if ((row.status === "active" || row.connection_id) && !token)
    throw new ReceiverError("INTEGRATION_SECRET_UNAVAILABLE", false);
  let connectionId = row.connection_id;
  if (!connectionId && !token && challenge) {
    // A remote approval can commit before its token reaches ScanSob. Recover
    // that token in memory; never activate the locally frozen request.
    const value = parsePair(
      row.id,
      await receiverRequest(
        "pair-scansob-workspace",
        JSON.stringify({
          schema_version: "1.0",
          action: "status",
          request_id: row.id,
          source_workspace_id: workspace,
          request_secret: challenge,
        }),
      ),
    );
    if (value.connection) {
      token = value.connection.token;
      connectionId = value.connection.id;
    }
  }
  if (!token && !challenge)
    throw new ReceiverError("INTEGRATION_SECRET_UNAVAILABLE", false);
  await remoteRevoke(workspace, row.id, connectionId, token, challenge);
  await integrationRpc(db, "mathquest_service_revoke", {
    school_id: workspace,
    actor_id: actor,
    id: row.id,
    finish: true,
  });
}
async function remoteRevoke(
  workspace: string,
  id: string,
  connectionId: string | null,
  token?: string,
  challenge?: string,
) {
  const response = await receiverRequest(
    "pair-scansob-workspace",
    JSON.stringify({
      schema_version: "1.0",
      action: "revoke",
      request_id: id,
      source_workspace_id: workspace,
      ...(connectionId ? { connection_id: connectionId } : {}),
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
  if (!ack.success || ack.data.request_id !== id)
    throw new ReceiverError("INVALID_ACK", false);
  return ack.data;
}
export async function recoverPairing(
  db: SupabaseClient,
  workspace: string,
  actor: string,
) {
  const row = await integrationRpc(db, "mathquest_service_credentials", {
    school_id: workspace,
    actor_id: actor,
  });
  const token = openSecret(
    row.secrets.token_secret,
    tokenBinding(workspace, row.id),
  );
  await integrationRpc(db, "mathquest_service_recover", {
    school_id: workspace,
    actor_id: actor,
    id: row.id,
    finish: false,
  });
  const ack = await remoteRevoke(workspace, row.id, row.connection_id, token);
  await integrationRpc(db, "mathquest_service_recover", {
    school_id: workspace,
    actor_id: actor,
    id: row.id,
    finish: true,
    ack,
  });
}
export function pairingFailure(error: unknown) {
  if (error instanceof ReceiverError)
    return new ApiError(
      error.code,
      error.code === "CONNECTION_DENIED"
        ? "MathQuest ไม่อนุญาตคำขอนี้ กรุณาตรวจรหัสหรือสอบถามผู้ดูแลปลายทาง"
        : error.code === "INTEGRATION_SECRET_UNAVAILABLE"
          ? "ข้อมูลเชื่อมต่อไม่พร้อม กรุณาติดต่อผู้ดูแลเพื่อกู้คืน"
          : "ติดต่อ MathQuest ไม่สำเร็จ กรุณาลองตรวจสถานะอีกครั้ง",
      error.retryable ? 503 : 409,
    );
  return error;
}
