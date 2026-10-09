import { z } from "zod";
import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
import { scanDatabaseError } from "@/lib/omr/scan-errors";
import { scoreRow } from "@/lib/grading/recalculate";
import type { ReviewItem } from "@/types/result";
import type { Exam } from "@/types/exam";
export async function POST(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = z
      .object({
        format: z.enum(["xlsx", "csv", "pdf"]),
        examId: z.uuid(),
        scanIds: z.array(z.uuid()).min(1).max(500).optional(),
      })
      .safeParse(await requestBody(request));
    if (!parsed.success)
      throw new ApiError(
        "INVALID_EXPORT",
        "เลือกชุดสอบและคะแนนที่ต้องการส่งออก",
        422,
      );
    const [scans, versions] = await Promise.all([
      db.rpc("get_scan_reviews", {
        tenant: schoolId,
        exam_filter: parsed.data.examId,
      }),
      db
        .from("exam_versions")
        .select("version_no,config_json")
        .eq("school_id", schoolId)
        .eq("exam_id", parsed.data.examId),
    ]);
    if (scans.error) throw scanDatabaseError(scans.error.message);
    if (versions.error)
      throw new ApiError("READ_FAILED", "โหลดเฉลยไม่สำเร็จ", 500);
    const items = (scans.data as ReviewItem[])
      .filter(
        (s) =>
          s.examId === parsed.data.examId &&
          s.status === "verified" &&
          (!parsed.data.scanIds || parsed.data.scanIds.includes(s.id)),
      )
      .sort((a, b) => a.studentCode.localeCompare(b.studentCode));
    if (
      !items.length ||
      (parsed.data.scanIds &&
        items.length !== new Set(parsed.data.scanIds).size)
    )
      throw scanDatabaseError("UNCONFIRMED_EXPORT");
    if (items.length > 500)
      throw new ApiError(
        "EXPORT_LIMIT",
        "ส่งออกได้ไม่เกิน 500 คนต่อชุดสอบ กรุณาแบ่งชุดรายงาน",
        422,
      );
    const rows = items.map((item) => {
      const version = versions.data.find(
        (v) => v.version_no === item.examVersion,
      );
      if (!version)
        throw new ApiError(
          "VERSION_MISSING",
          "ไม่พบเฉลยเวอร์ชันที่ใช้ตรวจ",
          409,
        );
      return scoreRow(item, {
        ...version.config_json,
        id: item.examId,
        version: version.version_no,
      } as Exam);
    });
    const audit = await db.rpc("register_score_export", {
      input: {
        school_id: schoolId,
        format: parsed.data.format,
        scan_ids: items.map((i) => i.id),
      },
    });
    if (audit.error) throw scanDatabaseError(audit.error.message);
    return json({
      rows,
      title: versions.data[0]?.config_json.title ?? "ผลคะแนน",
      jobId: audit.data,
    });
  } catch (error) {
    return failure(error);
  }
}
