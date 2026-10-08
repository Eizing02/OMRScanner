import { z } from "zod";
import { studentSchema } from "@/types/student";
import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
export async function GET() {
  try {
    const { db, schoolId } = await context();
    const { data, error } = await db
      .from("students")
      .select("id,student_code,first_name,last_name,classroom_name,number")
      .eq("school_id", schoolId)
      .order("student_code");
    if (error)
      throw new ApiError("READ_FAILED", "โหลดรายชื่อนักเรียนไม่สำเร็จ", 500);
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = z
      .object({
        students: z.array(studentSchema).min(1).max(2000),
        filename: z.string().min(1).max(200),
      })
      .safeParse(await requestBody(request));
    if (!parsed.success)
      throw new ApiError(
        "INVALID_IMPORT",
        "ข้อมูลนักเรียนไม่ถูกต้อง กรุณาตรวจทุกแถว",
        422,
      );
    if (
      new Set(parsed.data.students.map((s) => s.student_code)).size !==
      parsed.data.students.length
    )
      throw new ApiError("DUPLICATE_CODE", "พบรหัสนักเรียนซ้ำในไฟล์", 409);
    const { data, error } = await db.rpc("import_students", {
      input: { ...parsed.data, school_id: schoolId },
    });
    if (error)
      throw new ApiError(
        "IMPORT_FAILED",
        "นำเข้าไม่สำเร็จ อาจมีรหัสซ้ำหรือไม่มีสิทธิ์ ไม่มีแถวใดถูกบันทึก",
        409,
      );
    return json(data, 201);
  } catch (e) {
    return failure(e);
  }
}
