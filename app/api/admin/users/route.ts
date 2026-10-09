import { ownerContext, requestBody, failure, json, ApiError } from "@/lib/supabase/api";
import { accessDecisionSchema } from "@/types/access";

export async function GET() {
  try {
    const { db } = await ownerContext();
    const [profiles, workspaces] = await Promise.all([
      db.from("user_access").select("user_id,email,display_name,role,status,created_at,reviewed_at").order("created_at", { ascending: false }).limit(1000),
      db.from("schools").select("id,created_by"),
    ]);
    if (profiles.error || workspaces.error)
      throw new ApiError("READ_FAILED", "โหลดบัญชีผู้ใช้ไม่สำเร็จ กรุณาลองใหม่", 500);
    return json(profiles.data.map((p) => ({
      userId: p.user_id, email: p.email, displayName: p.display_name,
      role: p.role, status: p.status, createdAt: p.created_at,
      reviewedAt: p.reviewed_at,
      schoolId: workspaces.data.find((s) => s.created_by === p.user_id)?.id ?? null,
    })));
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const { db } = await ownerContext();
    const parsed = accessDecisionSchema.safeParse(await requestBody(request));
    if (!parsed.success) throw new ApiError("INVALID_DECISION", "กรุณาเลือกบัญชี สถานะ และระบุเหตุผลอย่างน้อย 3 ตัวอักษร", 422);
    const { data, error } = await db.rpc("decide_user_access", { input: parsed.data });
    if (error) throw new ApiError("DECISION_FAILED", "เปลี่ยนสิทธิ์ไม่สำเร็จ ไม่อนุญาตให้เปลี่ยนสิทธิ์เจ้าของระบบ", 409);
    return json(data);
  } catch (error) { return failure(error); }
}
