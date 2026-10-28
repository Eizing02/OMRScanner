import { z } from "zod";
import { studentSchema } from "@/types/student";
import { normalizeClassroom } from "@/lib/import/normalize-classroom";
import { rosterCommand, rosterRpc } from "@/lib/import/roster-api";
import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
export async function GET(request: Request) {
  try {
    const { db, schoolId } = await context();
    const params = new URL(request.url).searchParams;
    const view = params.get("view");
    if (view) {
      const query = z
        .object({
          view: z.enum(["page", "export", "directory", "directory_options"]),
          page: z.coerce.number().int().min(0).max(20000).default(0),
          limit: z.coerce.number().int().min(1).max(2000).default(50),
          status: z.enum(["active", "inactive", "all"]).default("active"),
          query: z.string().max(100).default(""),
          grade: z.string().max(10).optional(),
          classroom: z.string().max(30).optional(),
          directoryId: z.uuid().optional(),
          examId: z.uuid().optional(),
        })
        .safeParse(Object.fromEntries(params));
      if (!query.success)
        throw new ApiError(
          "INVALID_ROSTER_QUERY",
          "ตัวกรองรายชื่อไม่ถูกต้อง",
          422,
        );
      return json(
        await rosterRpc(
          db,
          view === "page" || view === "export"
            ? "get_student_roster"
            : "get_roster_directory",
          {
            ...query.data,
            school_id: schoolId,
            export: view === "export",
            view: view === "directory_options" ? "options" : "students",
          },
        ),
      );
    }
    const { data, error } = await db
      .from("students")
      .select(
        "id,student_code,prefix,full_name,first_name,last_name,classroom_name,grade_level,room,number",
      )
      .eq("school_id", schoolId)
      .order("student_code");
    // Read existing rosters during a staged migration; never infer lost prefixes.
    if (error?.code === "42703" || error?.code === "PGRST204") {
      const legacy = await db
        .from("students")
        .select("id,student_code,first_name,last_name,classroom_name,number")
        .eq("school_id", schoolId)
        .order("student_code");
      if (legacy.error)
        throw new ApiError("READ_FAILED", "โหลดรายชื่อนักเรียนไม่สำเร็จ", 500);
      return json(
        legacy.data?.map((row) => ({
          ...row,
          prefix: "",
          full_name: `${row.first_name} ${row.last_name}`,
          grade_level:
            normalizeClassroom(row.classroom_name)?.grade_level ?? null,
          room: normalizeClassroom(row.classroom_name)?.room ?? null,
        })),
      );
    }
    if (error)
      throw new ApiError(
        "READ_FAILED",
        "โหลดรายชื่อไม่สำเร็จ กรุณาตรวจสิทธิ์และ migration 003",
        500,
      );
    return json(data);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const raw = await requestBody(request);
    if (raw && typeof raw === "object" && "action" in raw)
      return json(await rosterCommand(db, schoolId, raw));
    const parsed = z
      .object({
        students: z.array(studentSchema).min(1).max(2000),
        filename: z.string().min(1).max(200),
      })
      .safeParse(raw);
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
    // An old RPC would silently discard the new prefix field: refuse that write.
    const readiness = await db
      .from("students")
      .select("prefix,full_name,grade_level,room")
      .eq("school_id", schoolId)
      .limit(0);
    if (readiness.error)
      throw new ApiError(
        "ROSTER_MIGRATION_REQUIRED",
        "กรุณาติดตั้ง migration 003 ก่อนนำเข้า เพื่อเก็บคำนำหน้าและชั้นให้ครบ",
        503,
      );
    const { data, error } = await db.rpc("import_students", {
      input: { ...parsed.data, school_id: schoolId },
    });
    if (error)
      throw new ApiError(
        "IMPORT_FAILED",
        "นำเข้าไม่สำเร็จ กรุณาตรวจรหัสซ้ำ สิทธิ์ และ migration 003 ไม่มีแถวใดถูกบันทึก",
        409,
      );
    return json(data, 201);
  } catch (e) {
    return failure(e);
  }
}
