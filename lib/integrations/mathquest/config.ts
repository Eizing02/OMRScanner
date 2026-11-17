import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/supabase/api";
import { z } from "zod";
export function integrationFlags() {
  return {
    enabled: process.env.SCORE_INTEGRATION_ENABLED === "true",
    receiverReady: process.env.MATHQUEST_RECEIVER_VERIFIED === "true",
  };
}
export function requireIntegration(network = false) {
  const flags = integrationFlags();
  if (!flags.enabled)
    throw new ApiError(
      "INTEGRATION_DISABLED",
      "ยังไม่เปิดการเชื่อมต่อระบบเช็คชื่อ",
      503,
    );
  if (network && !flags.receiverReady)
    throw new ApiError(
      "RECEIVER_NOT_READY",
      "ระบบเช็คชื่อยังไม่พร้อมรับคะแนน กรุณาลองภายหลัง",
      503,
    );
}
export function receiverOrigin() {
  requireIntegration(true);
  try {
    const url = new URL(process.env.MATHQUEST_RECEIVER_ORIGIN ?? "");
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9]{20,40}\.supabase\.co$/.test(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new ApiError(
      "INTEGRATION_NOT_CONFIGURED",
      "ยังตั้งค่าปลายทางไม่ครบ",
      503,
    );
  }
}
export function signedPairingIntakeEnabled() {
  return (
    process.env.MATHQUEST_CODE_FREE_PAIRING_ENABLED === "true" &&
    process.env.MATHQUEST_CODE_FREE_PAIRING_RECEIVER_VERIFIED === "true"
  );
}
export function signedPairingCredentials() {
  const config = z
    .object({
      destination: z.uuid(),
      keyId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
      key: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    })
    .safeParse({
      destination: process.env.MATHQUEST_DESTINATION_SCHOOL_ID?.toLowerCase(),
      keyId: process.env.MATHQUEST_CODE_FREE_SIGNING_KEY_ID,
      key: process.env.MATHQUEST_CODE_FREE_SIGNING_KEY,
    });
  if (!config.success) return null;
  const key = Buffer.from(config.data.key, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== config.data.key)
    return null;
  return { ...config.data, key };
}
export function signedPairingConfig() {
  if (!signedPairingIntakeEnabled()) return null;
  const credentials = signedPairingCredentials();
  const label = process.env.MATHQUEST_DESTINATION_LABEL?.trim();
  if (!credentials || !label || label.length > 120) return null;
  return { ...credentials, label };
}
// Isolated integration-only credential. Never use the old/exposed service-role key.
// Teacher publication commands still use their session and RLS.
export function integrationServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SCORE_SYNC_SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new ApiError(
      "INTEGRATION_NOT_CONFIGURED",
      "ยังตั้งค่าการเชื่อมต่อไม่ครบ",
      503,
    );
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
