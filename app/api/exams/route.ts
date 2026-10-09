import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
import { examSchema } from "@/types/exam";
import { z } from "zod";
function lifecycleError(message: string) {
  const errors: Record<string, [string, number]> = {
    FORBIDDEN: ["ไม่มีสิทธิ์จัดการชุดสอบในพื้นที่นี้", 403],
    EXAM_NOT_FOUND: ["ไม่พบชุดสอบ กรุณาโหลดรายการใหม่", 404],
    EXAM_DELETING: ["ชุดสอบนี้กำลังลบ กรุณาดำเนินการลบต่อให้เสร็จ", 409],
    DELETE_CONFIRMATION_REQUIRED: ["พิมพ์ชื่อชุดสอบให้ตรงก่อนลบถาวร", 422],
    MIXED_EXAM_UPLOAD: [
      "พบภาพที่ใช้ร่วมกับชุดสอบอื่น หยุดการลบเพื่อป้องกันข้อมูลสูญหาย",
      409,
    ],
  };
  const code = Object.keys(errors).find((key) => message.includes(key));
  if (code) return new ApiError(code, ...errors[code]);
  if (message.includes("does not exist") || message.includes("schema cache"))
    return new ApiError(
      "EXAM_SETUP_REQUIRED",
      "ยังติดตั้งส่วนลบชุดสอบไม่ครบ กรุณารัน SQL 008",
      503,
    );
  return new ApiError(
    "EXAM_UPDATE_FAILED",
    "ทำรายการไม่สำเร็จ กรุณาลองใหม่",
    503,
  );
}
export async function GET(request?: Request) {
  try {
    const { db, schoolId } = await context();
    const preview =
      request && new URL(request.url).searchParams.get("deletePreview");
    if (preview) {
      if (!z.uuid().safeParse(preview).success)
        throw new ApiError("INVALID_EXAM", "รหัสชุดสอบไม่ถูกต้อง", 422);
      const result = await db.rpc("preview_exam_deletion", {
        input: { school_id: schoolId, exam_id: preview },
      });
      if (result.error) throw lifecycleError(result.error.message);
      return json(result.data);
    }
    const { data, error } = await db
      .from("exams")
      .select(
        "id,title,created_at,archived,deleting,exam_versions(config_json,version_no)",
      )
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false });
    if (error) throw new ApiError("READ_FAILED", "โหลดชุดสอบไม่สำเร็จ", 500);
    const [prints, layouts, roster] = await Promise.all([
      db.from("print_jobs").select("exam_id").eq("school_id", schoolId),
      db.from("omr_layouts").select("exam_id").eq("school_id", schoolId),
      db.from("students").select("classroom_name").eq("school_id", schoolId),
    ]);
    return json(
      data.map((e) => {
        const version = [...e.exam_versions].sort(
          (a, b) => b.version_no - a.version_no,
        )[0];
        return {
          ...version?.config_json,
          id: e.id,
          version: version?.version_no ?? 1,
          stage: prints.data?.some((p) => p.exam_id === e.id)
            ? 3
            : layouts.data?.some((l) => l.exam_id === e.id)
              ? 2
              : 1,
          scanned: 0,
          students:
            roster.data?.filter(
              (s) => s.classroom_name === version?.config_json.classroom,
            ).length ?? 0,
          reviewCount: 0,
          archived: e.archived,
          deleting: e.deleting,
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
    const body = await requestBody(request);
    if (body?.action === "archive") {
      const archive = z
        .object({
          action: z.literal("archive"),
          ids: z.array(z.uuid()).min(1).max(100),
          archived: z.boolean(),
        })
        .safeParse(body);
      if (!archive.success)
        throw new ApiError("INVALID_EXAM", "รายการชุดสอบไม่ถูกต้อง", 422);
      const result = await db.rpc("set_exam_archived", {
        input: { ...archive.data, school_id: schoolId },
      });
      if (result.error) throw lifecycleError(result.error.message);
      return json(result.data);
    }
    const parsed = z
      .object({
        id: z.uuid(),
        expectedVersion: z.number().int().positive(),
        config: examSchema,
      })
      .safeParse(body);
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
export async function DELETE(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = z
      .object({ id: z.uuid(), confirmation: z.string().min(3).max(120) })
      .safeParse(await requestBody(request));
    if (!parsed.success)
      throw new ApiError("INVALID_EXAM", "ตรวจชื่อชุดสอบก่อนลบ", 422);
    const plan = await db.rpc("begin_exam_deletion", {
      input: {
        school_id: schoolId,
        exam_id: parsed.data.id,
        confirmation: parsed.data.confirmation,
      },
    });
    if (plan.error) throw lifecycleError(plan.error.message);
    const job = plan.data;
    if (job.status === "complete") return json({ deleted: true });
    // Bound one request. Durable jobs return only remaining paths on retry.
    // Storage RLS and the final database check independently verify removal.
    const paths: string[] = job.paths;
    if (
      !Array.isArray(paths) ||
      paths.some(
        (path) => typeof path !== "string" || !path.startsWith(`${schoolId}/`),
      )
    )
      throw new ApiError(
        "INVALID_IMAGE_PATH",
        "ตรวจสอบเส้นทางภาพไม่สำเร็จ หยุดการลบ",
        409,
      );
    for (let i = 0; i < Math.min(paths.length, 500); i += 100) {
      const removed = await db.storage
        .from("scan-images")
        .remove(paths.slice(i, Math.min(i + 100, 500)));
      if (removed.error)
        throw new ApiError(
          "EXAM_CLEANUP_PENDING",
          "ลบภาพยังไม่ครบ กดลบอีกครั้งเพื่อทำต่อ คะแนนยังไม่ถูกลบ",
          503,
        );
    }
    const done = await db.rpc("finish_exam_deletion", {
      input: { school_id: schoolId, job_id: job.id },
    });
    if (done.error) {
      if (done.error.message.includes("EXAM_CLEANUP_PENDING"))
        return json({ deleting: true }, 202);
      throw lifecycleError(done.error.message);
    }
    return json({ deleted: true });
  } catch (error) {
    return failure(error);
  }
}
