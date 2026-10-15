import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { ApiError } from "@/lib/supabase/api";
const sealedSchema = z.strictObject({
  v: z.string().min(1).max(32),
  nonce: z.string(),
  tag: z.string(),
  ciphertext: z.string(),
});
export type SealedSecret = z.infer<typeof sealedSchema>;
function encryptionKeys() {
  let input: unknown;
  try {
    input = JSON.parse(process.env.SCORE_SYNC_ENCRYPTION_KEYS ?? "{}");
  } catch {
    throw new ApiError(
      "INTEGRATION_NOT_CONFIGURED",
      "ยังตั้งค่าการเชื่อมต่อไม่ครบ",
      503,
    );
  }
  const parsed = z
    .record(z.string(), z.string().regex(/^[a-f0-9]{64}$/i))
    .safeParse(input);
  if (!parsed.success)
    throw new ApiError(
      "INTEGRATION_NOT_CONFIGURED",
      "ยังตั้งค่าการเชื่อมต่อไม่ครบ",
      503,
    );
  return parsed.data;
}
export function sealSecret(secret: string, binding: string): SealedSecret {
  const v = process.env.SCORE_SYNC_ENCRYPTION_KEY_VERSION ?? "";
  const key = encryptionKeys()[v];
  if (!key)
    throw new ApiError(
      "INTEGRATION_NOT_CONFIGURED",
      "ยังตั้งค่าการเชื่อมต่อไม่ครบ",
      503,
    );
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), nonce);
  cipher.setAAD(Buffer.from(binding));
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return {
    v,
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}
export function openSecret(input: unknown, binding: string): string {
  try {
    const value = sealedSchema.parse(input),
      key = encryptionKeys()[value.v];
    if (!key) throw new Error("KEY_MISSING");
    const nonce = Buffer.from(value.nonce, "base64"),
      tag = Buffer.from(value.tag, "base64");
    if (nonce.length !== 12 || tag.length !== 16)
      throw new Error("INVALID_SECRET");
    const cipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      nonce,
    );
    cipher.setAAD(Buffer.from(binding));
    cipher.setAuthTag(tag);
    return Buffer.concat([
      cipher.update(Buffer.from(value.ciphertext, "base64")),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ApiError(
      "INTEGRATION_SECRET_UNAVAILABLE",
      "ตรวจสอบการเชื่อมต่อไม่สำเร็จ กรุณาเชื่อมใหม่",
      503,
    );
  }
}
export const tokenBinding = (workspace: string, localId: string) =>
  `scansob:mathquest:token:${workspace}:${localId}`;
export const pairingBinding = (workspace: string, localId: string) =>
  `scansob:mathquest:pairing:${workspace}:${localId}`;
export function equalSecret(a: string, b: string) {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
export function payloadHash(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
