import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/supabase/api";
import type { SignedPairingAvailability } from "@/types/integration";
import { integrationRpc } from "./publisher";
import { receiverRequest, ReceiverError } from "./http";
import {
  receiverOrigin,
  signedPairingConfig,
  signedPairingCredentials,
  signedPairingIntakeEnabled,
} from "./config";
import {
  signedDraftSchema,
  signedPairHeaders,
  signedPrepareReplySchema,
  signedPrepareSchema,
  signedRequestSchema,
} from "./signed-pairing-contract";
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
  signed?: { receiver_origin: string; destination_school_id: string },
) {
  const value = parsePair(id, result);
  if (value.status === "pending_approval" && !signed) return;
  if (
    value.connection &&
    signed &&
    value.connection.destination_school_id !== signed.destination_school_id
  )
    throw new ReceiverError("PAIRING_DESTINATION_CHANGED", false);
  await integrationRpc(db, "mathquest_service_complete_pairing", {
    school_id: workspace,
    actor_id: actor,
    id,
    status: value.status,
    ...(signed
      ? {
          signed_origin: signed.receiver_origin,
          signed_destination: signed.destination_school_id,
        }
      : {}),
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
const draftBinding = (workspace: string, id: string) =>
  `scansob:mathquest:signed-draft:${workspace}:${id}`;
const wireBinding = (workspace: string, id: string) =>
  `scansob:mathquest:signed-wire:${workspace}:${id}`;
export function verifiedPairingEmail(user: User) {
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return undefined;
  const verified = user.identities?.some((identity) => {
    const data = identity.identity_data;
    return (
      identity.provider === "google" &&
      typeof data?.email === "string" &&
      data.email.trim().toLowerCase() === email &&
      (data.email_verified === true || data.email_verified === "true")
    );
  });
  if (!verified) return undefined;
  return email;
}
export async function signedPairingAvailability(
  workspace: string,
  user: User,
): Promise<SignedPairingAvailability> {
  const config = signedPairingConfig();
  const email = verifiedPairingEmail(user);
  if (!config) return "unavailable";
  if (!email) return "google_required";
  const id = crypto.randomUUID();
  try {
    const body = JSON.stringify(
      signedPrepareSchema.parse({
        schema_version: "1.0",
        action: "prepare_signed",
        request_id: id,
        source_workspace_id: workspace,
        destination_school_id: config.destination,
        sender_auth_id: user.id,
        sender_verified_email: email,
      }),
    );
    const result = signedPrepareReplySchema.safeParse(
      await receiverRequest("pair-scansob-workspace", body, undefined, {
        signedHeaders: signedPairHeaders(body, config.keyId, config.key),
      }),
    );
    if (
      result.success &&
      result.data.request_id === id &&
      result.data.destination_school_id === config.destination
    )
      return "ready";
  } catch (error) {
    if (
      error instanceof ReceiverError &&
      error.code === "SIGNED_PAIRING_DISABLED"
    )
      return "closed";
  }
  // A probe never creates a remote request or exposes the receiver's error body.
  return "unavailable";
}
export async function initiateSignedPairing(
  db: SupabaseClient,
  workspace: string,
  user: User,
  requestId: string,
  workspaceLabel: string,
  displayName?: string,
) {
  const config = signedPairingConfig();
  if (!config)
    throw new ReceiverError(
      signedPairingIntakeEnabled()
        ? "SIGNED_PAIRING_CONFIG_UNAVAILABLE"
        : "SIGNED_PAIRING_DISABLED",
      false,
      0,
      503,
    );
  const email = verifiedPairingEmail(user);
  if (!email)
    throw new ApiError(
      "SIGNED_PAIRING_GOOGLE_REQUIRED",
      "ใช้บัญชี Google ที่ยืนยันอีเมลแล้วเพื่อส่งคำขอ",
      403,
    );
  const id = requestId.toLowerCase();
  const name = displayName?.trim().slice(0, 120);
  const draft = signedDraftSchema.parse({
    schema_version: "1.0",
    request_id: id,
    source_workspace_id: workspace,
    destination_school_id: config.destination,
    sender_auth_id: user.id,
    sender_verified_email: email,
    workspace_label: workspaceLabel.trim().slice(0, 160),
    requested_at: new Date().toISOString(),
    ...(name ? { sender_display_name: name } : {}),
  });
  await integrationRpc(db, "mathquest_service_start_signed_pairing", {
    school_id: workspace,
    actor_id: user.id,
    request_id: id,
    destination_school_id: config.destination,
    destination_label: config.label,
    receiver_origin: receiverOrigin(),
    pairing_secret: sealSecret(
      randomBytes(32).toString("base64url"),
      pairingBinding(workspace, id),
    ),
    draft_secret: sealSecret(
      JSON.stringify(draft),
      draftBinding(workspace, id),
    ),
  });
  await refreshPairing(db, workspace, user.id, id, email);
}

async function signedSubmit(
  db: SupabaseClient,
  workspace: string,
  actor: string,
  id: string,
  secret: string,
  email: string | undefined,
  attempt: {
    stage: string;
    window_id: string | null;
    destination_school_id: string;
    receiver_origin: string;
    draft_secret: unknown;
    wire_secret: unknown;
  },
) {
  if (attempt.stage === "preparing")
    throw new ReceiverError("SIGNED_PREPARE_UNCERTAIN", false);
  if (attempt.stage === "prepare" && !signedPairingIntakeEnabled())
    throw new ReceiverError("SIGNED_PAIRING_DISABLED", false, 0, 503);
  // A frozen submission can already exist at the receiver. Retry its bytes even
  // when new intake is paused, using only the pinned destination and signer.
  const config = signedPairingCredentials();
  if (!config)
    throw new ReceiverError("SIGNED_PAIRING_CONFIG_UNAVAILABLE", false, 0, 503);
  if (
    config.destination !== attempt.destination_school_id ||
    receiverOrigin() !== attempt.receiver_origin
  )
    throw new ReceiverError("PAIRING_DESTINATION_CHANGED", false);
  const request = (body: string) =>
    receiverRequest("pair-scansob-workspace", body, undefined, {
      signedHeaders: signedPairHeaders(body, config.keyId, config.key),
      expectedOrigin: attempt.receiver_origin,
    });
  const scope = { school_id: workspace, actor_id: actor, id };
  if (attempt.stage === "prepare") {
    const draft = signedDraftSchema.parse(
      JSON.parse(openSecret(attempt.draft_secret, draftBinding(workspace, id))),
    );
    if (!email || email !== draft.sender_verified_email)
      throw new ApiError(
        "SIGNED_PAIRING_GOOGLE_REQUIRED",
        "อีเมลที่ยืนยันต่างจากคำขอเดิม กรุณายกเลิกแล้วขอเชื่อมใหม่",
        403,
      );
    const began = await integrationRpc(
      db,
      "mathquest_service_begin_signed_preparation",
      scope,
    );
    if (!began) throw new ReceiverError("SIGNED_PREPARE_UNCERTAIN", false);
    const prepare = JSON.stringify(
      signedPrepareSchema.parse({
        schema_version: draft.schema_version,
        action: "prepare_signed",
        request_id: draft.request_id,
        source_workspace_id: draft.source_workspace_id,
        destination_school_id: draft.destination_school_id,
        sender_auth_id: draft.sender_auth_id,
        sender_verified_email: draft.sender_verified_email,
      }),
    );
    const prepared = signedPrepareReplySchema.safeParse(await request(prepare));
    if (
      !prepared.success ||
      prepared.data.request_id !== id ||
      prepared.data.destination_school_id !== attempt.destination_school_id
    )
      throw new ReceiverError("INVALID_ACK", false);
    const body = JSON.stringify(
      signedRequestSchema.parse({
        ...draft,
        action: "request_signed",
        request_secret: secret,
        pairing_window_id: prepared.data.pairing_window_id,
      }),
    );
    attempt = await integrationRpc(
      db,
      "mathquest_service_freeze_signed_pairing",
      {
        ...scope,
        window_id: prepared.data.pairing_window_id,
        wire_secret: sealSecret(body, wireBinding(workspace, id)),
      },
    );
  }
  if (attempt.stage !== "submit" || !attempt.wire_secret)
    throw new ReceiverError("PAIRING_REQUEST_CHANGED", false);
  const body = openSecret(attempt.wire_secret, wireBinding(workspace, id));
  const wire = signedRequestSchema.parse(JSON.parse(body));
  if (
    wire.request_id !== id ||
    wire.source_workspace_id !== workspace ||
    wire.sender_auth_id !== actor ||
    wire.pairing_window_id !== attempt.window_id ||
    wire.destination_school_id !== config.destination
  )
    throw new ReceiverError("PAIRING_REQUEST_CHANGED", false);
  if (wire.sender_verified_email !== email)
    throw new ApiError(
      "SIGNED_PAIRING_GOOGLE_REQUIRED",
      "อีเมลที่ยืนยันต่างจากคำขอเดิม กรุณายกเลิกแล้วขอเชื่อมใหม่",
      403,
    );
  await completePair(db, workspace, actor, id, await request(body), attempt);
}
export async function refreshPairing(
  db: SupabaseClient,
  workspace: string,
  actor: string,
  expectedRequestId?: string,
  email?: string,
) {
  const row = await integrationRpc(db, "mathquest_service_credentials", {
    school_id: workspace,
    actor_id: actor,
    ...(expectedRequestId ? { expected_request_id: expectedRequestId } : {}),
  });
  if (row.status !== "pending_approval" || row.revocation_pending) return;
  const secret = openSecret(
    row.secrets.pairing_secret,
    pairingBinding(workspace, row.id),
  );
  if (row.signed_attempt && row.signed_attempt.stage !== "waiting")
    return signedSubmit(
      db,
      workspace,
      actor,
      row.id,
      secret,
      email,
      row.signed_attempt,
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
    undefined,
    { expectedOrigin: row.signed_attempt?.receiver_origin },
  );
  await completePair(
    db,
    workspace,
    actor,
    row.id,
    response,
    row.signed_attempt ?? undefined,
  );
}
export async function revokePairing(
  db: SupabaseClient,
  workspace: string,
  actor: string,
  expectedRequestId?: string,
) {
  const row = await integrationRpc(db, "mathquest_service_credentials", {
    school_id: workspace,
    actor_id: actor,
    ...(expectedRequestId ? { expected_request_id: expectedRequestId } : {}),
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
  // A validated terminal reply has already cleared the challenge. Closing its
  // local record frees the workspace for another request without a remote revoke.
  const terminal =
    row.status === "error" &&
    row.last_error_code === "CONNECTION_DENIED" &&
    !row.connection_id &&
    !token &&
    !challenge &&
    (!row.signed_attempt ||
      row.signed_attempt.stage === "rejected" ||
      row.signed_attempt.stage === "expired");
  if (!terminal) {
    if ((row.status === "active" || row.connection_id) && !token)
      throw new ReceiverError("INTEGRATION_SECRET_UNAVAILABLE", false);
    let connectionId = row.connection_id;
    if (!row.signed_attempt && !connectionId && !token && challenge) {
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
    await remoteRevoke(
      workspace,
      row.id,
      connectionId,
      token,
      challenge,
      row.signed_attempt?.receiver_origin,
    );
  }
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
  expectedOrigin?: string,
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
    { expectedOrigin },
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
  expectedRequestId?: string,
) {
  const row = await integrationRpc(db, "mathquest_service_credentials", {
    school_id: workspace,
    actor_id: actor,
    ...(expectedRequestId ? { expected_request_id: expectedRequestId } : {}),
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
  const ack = await remoteRevoke(
    workspace,
    row.id,
    row.connection_id,
    token,
    undefined,
    row.signed_attempt?.receiver_origin,
  );
  await integrationRpc(db, "mathquest_service_recover", {
    school_id: workspace,
    actor_id: actor,
    id: row.id,
    finish: true,
    ack,
  });
}
export function pairingFailure(error: unknown) {
  if (error instanceof ApiError && error.code === "RATE_LIMITED")
    return new ApiError(error.code, error.messageTh, error.status, 5);
  if (!(error instanceof ReceiverError)) return error;
  const message: Record<string, string> = {
    CONNECTION_DENIED: "ระบบเช็คชื่อไม่อนุญาตคำขอนี้ กรุณาสอบถามผู้ดูแลปลายทาง",
    SIGNED_PAIRING_DISABLED: "ระบบเช็คชื่อยังไม่เปิดรับคำขอ",
    SIGNED_PAIRING_CONFIG_UNAVAILABLE:
      "ตรวจความพร้อมของระบบเช็คชื่อไม่ได้ กรุณาติดต่อผู้ดูแลระบบ",
    SIGNED_PREPARE_UNCERTAIN:
      "ยังยืนยันรอบเปิดรับไม่ได้ กรุณายกเลิกคำขอนี้ก่อนส่งใหม่",
    PAIRING_WINDOW_CHANGED:
      "รอบเปิดรับเปลี่ยนแล้ว กรุณายกเลิกคำขอนี้ก่อนส่งใหม่",
    PAIRING_WORKSPACE_BUSY:
      "ระบบเช็คชื่อมีคำขอหรือการเชื่อมต่ออยู่แล้ว กรุณาตรวจที่ปลายทาง",
    PAIRING_REQUEST_CHANGED: "คำขอเปลี่ยนแล้ว กรุณาโหลดสถานะล่าสุด",
    PAIRING_REQUEST_CONFLICT:
      "คำขอไม่ตรงกับรายการที่ระบบเช็คชื่อรับไว้ กรุณาตรวจสถานะก่อน",
    PAIRING_DESTINATION_CHANGED: "ค่าปลายทางต่างจากคำขอเดิม กรุณาติดต่อผู้ดูแล",
    INTEGRATION_SECRET_UNAVAILABLE:
      "ข้อมูลเชื่อมต่อไม่พร้อม กรุณาติดต่อผู้ดูแลเพื่อกู้คืน",
    INVALID_ACK: "ระบบเช็คชื่อตอบรับไม่ตรงกับคำขอ กรุณาตรวจสถานะ",
  };
  const transient = error.retryable || error.status === 503;
  return new ApiError(
    error.code,
    message[error.code] ??
      "ติดต่อระบบเช็คชื่อไม่สำเร็จ กรุณาลองตรวจสถานะอีกครั้ง",
    error.status === 429 ? 429 : transient ? 503 : 409,
    error.retryAfter,
  );
}
