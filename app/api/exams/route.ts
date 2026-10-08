import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
import { examSchema } from "@/types/exam";
import { z } from "zod";
export async function GET() {
  try {
    const { db, schoolId } = await context();
    const { data, error } = await db
      .from("exams")
      .select(
        "id,title,created_at,archived,exam_versions(config_json,version_no)",
      )
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    if (error) throw new ApiError("READ_FAILED", "โหลดชุดสอบไม่สำเร็จ", 500);
    return json(
      data.map((e) => {
        const version = [...e.exam_versions].sort(
          (a, b) => b.version_no - a.version_no,
        )[0];
        return {
          ...version?.config_json,
          id: e.id,
          version: version?.version_no ?? 1,
          stage: 0,
          scanned: 0,
          students: 0,
          reviewCount: 0,
          archived: e.archived,
          updatedAt: e.created_at,
        };
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = examSchema.safeParse(await requestBody(request));
    if (!parsed.success)
      throw new ApiError(
        "INVALID_EXAM",
        parsed.error.issues.map((i) => i.message).join(" · "),
        422,
      );
    const { data, error } = await db.rpc("create_exam_draft", {
      input: { ...parsed.data, school_id: schoolId },
    });
    if (error)
      throw new ApiError(
        "CREATE_FAILED",
        "บันทึกชุดสอบไม่สำเร็จ กรุณาตรวจข้อมูลและสิทธิ์",
        409,
      );
    return json(
      {
        ...parsed.data,
        id: data.id,
        version: 1,
        stage: 0,
        scanned: 0,
        students: 0,
        reviewCount: 0,
        archived: false,
        updatedAt: data.created_at,
      },
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = z
      .object({
        id: z.uuid(),
        expectedVersion: z.number().int().positive(),
        config: examSchema,
      })
      .safeParse(await requestBody(request));
    if (!parsed.success)
      throw new ApiError(
        "INVALID_EXAM",
        "ข้อมูลโครงข้อสอบไม่ถูกต้อง กรุณาตรวจจำนวนข้อและเฉลย",
        422,
      );
    const { data, error } = await db.rpc("create_exam_version", {
      input: {
        ...parsed.data.config,
        exam_id: parsed.data.id,
        expected_version: parsed.data.expectedVersion,
        school_id: schoolId,
      },
    });
    if (error)
      throw new ApiError(
        "VERSION_SAVE_FAILED",
        "บันทึกเวอร์ชันไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุด และตรวจว่าติดตั้ง migration รองรับ 60 ข้อแล้ว",
        409,
      );
    return json(data, 201);
  } catch (e) {
    return failure(e);
  }
}
