import { context, failure, json, requestBody, ApiError } from "@/lib/supabase/api";
import { readBranding } from "@/lib/supabase/school-logo";
import { updateWorkspaceSchema } from "@/types/school";
export async function GET() {
  try { const { db, schoolId, readOnly } = await context(); return json(await readBranding(db, schoolId, readOnly)); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = updateWorkspaceSchema.safeParse(await requestBody(request));
    if (!parsed.success) throw new ApiError("INVALID_SETTINGS", "กรุณาตรวจชื่อโรงเรียน ปีการศึกษา ภาคเรียน และรายวิชา", 422);
    const result = await db.rpc("update_workspace_settings", { input: { school_id: schoolId, ...parsed.data } });
    if (result.error) throw new ApiError("SETTINGS_SAVE_FAILED", "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่", 409);
    return json(await readBranding(db, schoolId));
  } catch (error) { return failure(error); }
}
