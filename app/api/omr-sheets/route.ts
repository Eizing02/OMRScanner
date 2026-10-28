import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
import {
  printRegistrationSchema,
  type PrintManifest,
  type PrintStudent,
  type RegisteredPrint,
} from "@/types/print";
import {
  printStudentErrors,
  resolveGeometry,
  resolvePrintLayout,
  validateLayout,
  layoutSchema,
} from "@/lib/omr/generate-template";
import { studentFullName } from "@/types/student";
import { createSetIdentity } from "@/lib/omr/qr";
import { z } from "zod";
import { rosterRpc } from "@/lib/import/roster-api";
import type { Student } from "@/types/student";

export async function GET(request: Request) {
  try {
    const { db, schoolId } = await context();
    const examId = new URL(request.url).searchParams.get("examId");
    if (examId && !z.uuid().safeParse(examId).success)
      throw new ApiError("INVALID_EXAM_ID", "รหัสชุดสอบไม่ถูกต้อง", 422);
    let query = db
      .from("print_jobs")
      .select("id,exam_id,exam_version_id,template_id,sheet_count,created_at")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (examId) query = query.eq("exam_id", examId);
    const result = await query;
    if (result.error)
      throw new ApiError(
        "PRINT_READ_FAILED",
        "โหลดทะเบียนชุดพิมพ์ไม่สำเร็จ",
        500,
      );
    return json(result.data);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = printRegistrationSchema.safeParse(
      await requestBody(request),
    );
    if (!parsed.success)
      throw new ApiError(
        "INVALID_PRINT",
        parsed.error.issues.map((i) => i.message).join(" · "),
        422,
      );
    const input = parsed.data;
    await rosterRpc(db, "sync_student_directory", { school_id: schoolId });
    const previous = await db
      .from("print_jobs")
      .select(
        "id,omr_sheets(student_id,student_code,full_name,classroom_name,number,page_number,slot)",
      )
      .eq("school_id", schoolId)
      .eq("request_id", input.requestId)
      .maybeSingle();
    if (previous.error)
      throw new ApiError(
        "PRINT_READ_FAILED",
        "ตรวจทะเบียนชุดพิมพ์ไม่สำเร็จ กรุณาลองใหม่",
        503,
      );
    let students: PrintStudent[] = [];
    if (previous.data)
      students = [...previous.data.omr_sheets]
        .sort((a, b) => a.page_number - b.page_number || a.slot - b.slot)
        .flatMap((sheet) =>
          sheet.student_id
            ? [
                {
                  id: sheet.student_id,
                  student_code: sheet.student_code!,
                  full_name: sheet.full_name!,
                  classroom_name: sheet.classroom_name!,
                  number: sheet.number,
                },
              ]
            : [],
        );
    if (input.studentIds && !previous.data) {
      const roster = (await rosterRpc(db, "get_workspace_read_model", {
        school_id: schoolId,
        view: "exam_roster",
        examId: input.layout.examId,
        version: input.layout.examVersion,
      })) as { students: Student[] };
      const byId = new Map(
        roster.students.map((student) => [student.id, student]),
      );
      students = input.studentIds.map((id) => {
        const student = byId.get(id);
        if (!student)
          throw new ApiError(
            "PRINT_STUDENT_DENIED",
            "มีนักเรียนที่ไม่อยู่ในพื้นที่ของคุณ กรุณาโหลดรายชื่อใหม่",
            422,
          );
        return {
          id,
          student_code: student.student_code,
          full_name: student.full_name ?? studentFullName(student),
          classroom_name: student.classroom_name,
          number: student.number,
        };
      });
    }
    const layout = resolvePrintLayout(
      { ...input.layout, logo: null },
      students,
    );
    const errors = [
      ...validateLayout(layout).errors,
      ...(previous.data ? [] : printStudentErrors(layout, students)),
    ];
    if (errors.length)
      throw new ApiError("INVALID_PRINT_LAYOUT", errors.join(" · "), 422);
    const identity = await createSetIdentity(layout);
    const registration = await db.rpc("register_omr_print", {
      input: {
        school_id: schoolId,
        request_id: input.requestId,
        identity_json: JSON.stringify(identity.snapshot),
        ...(input.studentIds
          ? { student_ids: input.studentIds }
          : { blank_count: input.blankCount }),
      },
    });
    if (registration.error)
      throw new ApiError(
        "PRINT_REGISTRATION_FAILED",
        "ลงทะเบียนชุดพิมพ์ไม่สำเร็จ กรุณาตรวจสิทธิ์และข้อมูลข้อสอบล่าสุด แล้วลองใหม่",
        409,
      );
    const registered = registration.data as {
      jobId: string;
      templateUuid: string;
      layoutHash: string;
      setToken: string;
      layout: unknown;
      omr: PrintManifest["omr"];
      sheets: {
        instanceId: string;
        studentId: string | null;
        studentCode: string | null;
        fullName: string | null;
        classroom: string | null;
        number: number | null;
        page: number;
        slot: number;
      }[];
    };
    const lockedLayout = layoutSchema.parse(registered.layout);
    const g = resolveGeometry(lockedLayout);
    // The RPC snapshots names/codes again under the database transaction. Use
    // those authoritative snapshots for the actual PDF, never client strings.
    students = registered.sheets.flatMap((sheet) =>
      sheet.studentId
        ? [
            {
              id: sheet.studentId,
              student_code: sheet.studentCode!,
              full_name: sheet.fullName!,
              classroom_name: sheet.classroom!,
              number: sheet.number,
            },
          ]
        : [],
    );
    const manifest: PrintManifest = {
      schemaVersion: 3,
      experimental: true,
      qrScope: "exam-key-layout-version",
      examId: lockedLayout.examId,
      examVersion: lockedLayout.examVersion,
      setToken: registered.setToken,
      templateId: `g2-${registered.layoutHash}`,
      templateUuid: registered.templateUuid,
      jobId: registered.jobId,
      layout: lockedLayout,
      layoutHash: registered.layoutHash,
      omr: registered.omr,
      print: {
        paperWidthMm: 297,
        paperHeightMm: 210,
        sheetWidthMm: g.sheetWidth,
        sheetHeightMm: 210,
        sheetsPerPage: g.sheetsPerPage,
        pageCount: Math.ceil(registered.sheets.length / g.sheetsPerPage),
        scalePercent: 100,
      },
      sheets: registered.sheets.map((sheet) => ({
        token: registered.setToken,
        instanceId: sheet.instanceId,
        studentId: sheet.studentId,
        studentCode: sheet.studentCode,
        page: sheet.page,
        slot: sheet.slot,
      })),
    };
    return json(
      {
        jobId: registered.jobId,
        layout: lockedLayout,
        students,
        manifest,
      } satisfies RegisteredPrint,
      201,
    );
  } catch (error) {
    return failure(error);
  }
}
