import { createHmac } from "node:crypto";
import { z } from "zod";

const uuid = z.uuid().refine((value) => value === value.toLowerCase());
const identity = {
  schema_version: z.literal("1.0"),
  request_id: uuid,
  source_workspace_id: uuid,
  destination_school_id: uuid,
  sender_auth_id: uuid,
  sender_verified_email: z
    .string()
    .max(254)
    .regex(/^[^@\s\p{Cc}]+@[^@\s\p{Cc}]+\.[^@\s\p{Cc}]+$/u),
};
export const signedDraftSchema = z.strictObject({
  ...identity,
  workspace_label: z.string().min(1).max(160),
  requested_at: z.iso.datetime(),
  sender_display_name: z.string().min(1).max(120).optional(),
});
export const signedPrepareReplySchema = z.strictObject({
  schema_version: z.literal("1.0"),
  action: z.literal("prepare_signed"),
  request_id: uuid,
  destination_school_id: uuid,
  pairing_window_id: uuid,
});
export const signedPrepareSchema = z.strictObject({
  ...identity,
  action: z.literal("prepare_signed"),
});
export const signedRequestSchema = signedDraftSchema.extend({
  action: z.literal("request_signed"),
  request_secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  pairing_window_id: uuid,
});

export function signedPairHeaders(
  body: string,
  keyId: string,
  key: Buffer,
  time = Date.now(),
) {
  const timestamp = String(Math.floor(time / 1000));
  const signature = createHmac("sha256", key)
    .update(
      `mq-scansob-pair-v1\nPOST\n/functions/v1/pair-scansob-workspace\n${keyId}\n${timestamp}\n`,
      "utf8",
    )
    .update(body, "utf8")
    .digest("base64url");
  return {
    "X-ScanSob-Key-Id": keyId,
    "X-ScanSob-Timestamp": timestamp,
    "X-ScanSob-Signature": signature,
  };
}
