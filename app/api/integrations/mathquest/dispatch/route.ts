import { z } from "zod";
import { json, failure, requestBody, ApiError } from "@/lib/supabase/api";
import { requireIntegration } from "@/lib/integrations/mathquest/config";
import { equalSecret } from "@/lib/integrations/mathquest/security";
import { dispatchScores } from "@/lib/integrations/mathquest/publisher";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const key = process.env.SCORE_SYNC_RUNNER_SECRET ?? "";
    const supplied =
      request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (key.length < 32 || !supplied || !equalSecret(key, supplied))
      throw new ApiError("UNAUTHENTICATED", "ไม่มีสิทธิ์เรียกงานส่งคะแนน", 401);
    requireIntegration(true);
    const body = z.strictObject({}).safeParse(await requestBody(request, 128));
    if (!body.success)
      throw new ApiError("INVALID_RUNNER_REQUEST", "คำขอไม่ถูกต้อง", 422);
    return json(await dispatchScores());
  } catch (error) {
    return failure(error);
  }
}
