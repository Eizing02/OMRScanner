import { z } from "zod";
import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
import { publicationCommandSchema } from "@/types/integration";
import { requireIntegration } from "@/lib/integrations/mathquest/config";
import {
  integrationRpc,
  dispatchScores,
} from "@/lib/integrations/mathquest/publisher";
import { integrationOverview } from "@/lib/integrations/mathquest/overview";
export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
async function examId(params: Params["params"]) {
  const result = z.uuid().safeParse((await params).id);
  if (!result.success)
    throw new ApiError("INVALID_EXAM", "รหัสชุดสอบไม่ถูกต้อง", 422);
  return result.data;
}
export async function GET(_request: Request, route: Params) {
  try {
    const ctx = await context(),
      id = await examId(route.params);
    return json(
      await integrationOverview(ctx.db, ctx.schoolId, ctx.readOnly, id),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, route: Params) {
  try {
    const ctx = await context(true);
    requireIntegration();
    const id = await examId(route.params),
      input = publicationCommandSchema.safeParse(
        await requestBody(request, 4096),
      );
    if (!input.success)
      throw new ApiError(
        "INVALID_PUBLICATION",
        "ตรวจรายการและยืนยันการเผยแพร่",
        422,
      );
    await integrationRpc(ctx.db, "command_mathquest_publication", {
      school_id: ctx.schoolId,
      exam_id: id,
      request_id: input.data.requestId,
      action: input.data.action,
      consent: input.data.consent,
    });
    // Teacher-triggered retry is available even without a scheduler. Durable jobs
    // remain pending if dispatch/config/network fails; never report false delivery.
    try {
      await dispatchScores({ schoolId: ctx.schoolId, examId: id });
    } catch {
      /* The job is committed. GET/runner can recover without creating a new event. */
    }
    return json(
      await integrationOverview(ctx.db, ctx.schoolId, false, id),
      202,
    );
  } catch (error) {
    return failure(error);
  }
}
