import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
import { layoutSchema, validateLayout } from "@/lib/omr/generate-template";
import { z } from "zod";

export async function GET() {
  try {
    const { db, schoolId } = await context();
    const result = await db
      .from("omr_layouts")
      .select("exam_id,layout_json")
      .eq("school_id", schoolId);
    if (result.error)
      throw new ApiError(
        "LAYOUT_SETUP_REQUIRED",
        "โหลดรูปแบบกระดาษไม่สำเร็จ กรุณาตรวจการติดตั้งฐานข้อมูลชุดพิมพ์",
        503,
      );
    return json(
      result.data.map((row) => ({
        examId: row.exam_id,
        examVersion: row.layout_json.examVersion,
        layout: row.layout_json,
      })),
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = z
      .object({ layout: layoutSchema })
      .safeParse(await requestBody(request));
    if (!parsed.success)
      throw new ApiError("INVALID_LAYOUT", "รูปแบบกระดาษคำตอบไม่ถูกต้อง", 422);
    const layout = { ...parsed.data.layout, logo: null };
    const errors = validateLayout(layout).errors;
    if (errors.length)
      throw new ApiError("INVALID_LAYOUT", errors.join(" · "), 422);
    const saved = await db.rpc("save_omr_layout", {
      input: { school_id: schoolId, layout },
    });
    if (saved.error)
      throw new ApiError(
        "LAYOUT_SAVE_FAILED",
        "บันทึกรูปแบบไม่สำเร็จ กรุณาโหลดชุดสอบล่าสุดและตรวจให้ข้อมูลตรงกับเฉลย",
        409,
      );
    return json(saved.data);
  } catch (error) {
    return failure(error);
  }
}
export const POST = PUT;
