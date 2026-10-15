import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
import {
  pairingInputSchema,
  connectionCommandSchema,
} from "@/types/integration";
import {
  integrationServiceClient,
  requireIntegration,
} from "@/lib/integrations/mathquest/config";
import { integrationRpc } from "@/lib/integrations/mathquest/publisher";
import {
  initiatePairing,
  refreshPairing,
  revokePairing,
  recoverPairing,
  pairingFailure,
} from "@/lib/integrations/mathquest/pairing";
import { integrationOverview } from "@/lib/integrations/mathquest/overview";
export const runtime = "nodejs";
export async function GET() {
  try {
    const ctx = await context();
    return json(await integrationOverview(ctx.db, ctx.schoolId, ctx.readOnly));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    const ctx = await context(true);
    requireIntegration(true);
    const input = pairingInputSchema.safeParse(
      await requestBody(request, 4096),
    );
    if (!input.success)
      throw new ApiError(
        "INVALID_PAIRING",
        "ตรวจรหัสเชื่อมต่อและยืนยันการส่งคะแนน",
        422,
      );
    const school = await ctx.db
      .from("schools")
      .select("name_th")
      .eq("id", ctx.schoolId)
      .single();
    if (school.error)
      throw new ApiError("READ_FAILED", "โหลดพื้นที่ทำงานไม่สำเร็จ", 503);
    await initiatePairing(
      integrationServiceClient(),
      ctx.schoolId,
      ctx.user.id,
      input.data.requestId,
      input.data.code,
      school.data.name_th,
    );
    return json(await integrationOverview(ctx.db, ctx.schoolId, false), 202);
  } catch (error) {
    return failure(pairingFailure(error));
  }
}
export async function PATCH(request: Request) {
  try {
    const ctx = await context(true);
    requireIntegration();
    const input = connectionCommandSchema.safeParse(
      await requestBody(request, 4096),
    );
    if (!input.success)
      throw new ApiError(
        "INVALID_INTEGRATION",
        "ตรวจการตั้งค่าการเชื่อมต่อ",
        422,
      );
    if (input.data.action === "mode")
      await integrationRpc(ctx.db, "set_mathquest_mode", {
        school_id: ctx.schoolId,
        ...input.data,
      });
    else {
      requireIntegration(true);
      const db = integrationServiceClient();
      if (input.data.action === "refresh")
        await refreshPairing(db, ctx.schoolId, ctx.user.id);
      else if (input.data.action === "recover")
        await recoverPairing(db, ctx.schoolId, ctx.user.id);
      else await revokePairing(db, ctx.schoolId, ctx.user.id);
    }
    return json(await integrationOverview(ctx.db, ctx.schoolId, false));
  } catch (error) {
    return failure(pairingFailure(error));
  }
}
