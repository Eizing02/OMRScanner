import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/supabase/api";
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
      "ยังไม่เปิดการเชื่อมต่อ MathQuest",
      503,
    );
  if (network && !flags.receiverReady)
    throw new ApiError(
      "RECEIVER_NOT_READY",
      "MathQuest ยังไม่พร้อมรับคะแนน กรุณาลองภายหลัง",
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
