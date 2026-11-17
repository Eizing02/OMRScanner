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
  initiateSignedPairing,
  signedPairingAvailability,
  verifiedPairingEmail,
  refreshPairing,
  revokePairing,
  recoverPairing,
  pairingFailure,
} from "@/lib/integrations/mathquest/pairing";
import { integrationOverview } from "@/lib/integrations/mathquest/overview";
export const runtime = "nodejs";
async function settingsOverview(ctx: Awaited<ReturnType<typeof context>>) {
  const overview = await integrationOverview(
    ctx.db,
    ctx.schoolId,
    ctx.readOnly,
  );
  if (
    overview.signedPairing &&
    (!overview.connection || overview.connection.status === "revoked")
  )
    return {
      ...overview,
      signedPairing: {
        ...overview.signedPairing,
        availability: await signedPairingAvailability(ctx.schoolId, ctx.user),
      },
    };
  return overview;
}
export async function GET() {
  try {
    const ctx = await context();
    return json(await settingsOverview(ctx));
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
        "คำขออนุมัติไม่ถูกต้อง กรุณาโหลดหน้าตั้งค่าแล้วลองใหม่",
        422,
      );
    const school = await ctx.db
      .from("schools")
      .select("name_th")
      .eq("id", ctx.schoolId)
      .single();
    if (school.error)
      throw new ApiError("READ_FAILED", "โหลดพื้นที่ทำงานไม่สำเร็จ", 503);
    await initiateSignedPairing(
      integrationServiceClient(),
      ctx.schoolId,
      ctx.user,
      input.data.requestId,
      school.data.name_th,
      ctx.access.displayName,
    );
    return json(await settingsOverview(ctx), 202);
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
        await refreshPairing(
          db,
          ctx.schoolId,
          ctx.user.id,
          input.data.expectedRequestId,
          verifiedPairingEmail(ctx.user),
        );
      else if (input.data.action === "recover")
        await recoverPairing(
          db,
          ctx.schoolId,
          ctx.user.id,
          input.data.expectedRequestId,
        );
      else
        await revokePairing(
          db,
          ctx.schoolId,
          ctx.user.id,
          input.data.expectedRequestId,
        );
    }
    return json(await settingsOverview(ctx));
  } catch (error) {
    return failure(pairingFailure(error));
  }
}
