import { createHash } from "node:crypto";
import { z } from "zod";
import {
  context,
  json,
  failure,
  requestBody,
  ApiError,
} from "@/lib/supabase/api";
import {
  scanInputSchema,
  reviewInputSchema,
  setTokenSchema,
  type LockedScanTemplate,
} from "@/types/scan";
import { decodeScanImage } from "@/lib/omr/scan-image";
import { rasterRegion, readSetQr, type Raster } from "@/lib/omr/scan-qr";
import { readOpticalMarks } from "@/lib/omr/detect-bubbles";
import { scanDatabaseError } from "@/lib/omr/scan-errors";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db, schoolId } = await context();
    const params = new URL(request.url).searchParams;
    if (params.has("token")) {
      const token = setTokenSchema.safeParse(params.get("token"));
      if (!token.success)
        throw new ApiError("INVALID_QR", "QR ไม่ใช่กระดาษคำตอบของระบบ", 422);
      const { data, error } = await db
        .from("omr_templates")
        .select("id,exam_id,exam_version_id,set_token,layout_json,omr_json")
        .eq("school_id", schoolId)
        .eq("set_token", token.data)
        .maybeSingle();
      if (error) throw scanDatabaseError(error.message);
      if (!data) throw scanDatabaseError("QR_NOT_REGISTERED");
      return json(data);
    }
    if (params.has("media")) {
      const id = z.uuid().safeParse(params.get("media"));
      if (!id.success)
        throw new ApiError("INVALID_SCAN", "รหัสภาพไม่ถูกต้อง", 422);
      const { data, error } = await db
        .from("scan_records")
        .select("image_url,image_public_id,template_id")
        .eq("school_id", schoolId)
        .eq("id", id.data)
        .maybeSingle();
      if (error) throw scanDatabaseError(error.message);
      if (!data) throw new ApiError("SCAN_NOT_FOUND", "ไม่พบภาพสแกน", 404);
      const paths = [data.image_url, data.image_public_id];
      const signed = await db.storage
        .from("scan-images")
        .createSignedUrls(paths, 300);
      if (signed.error || !signed.data?.every((item) => item.signedUrl))
        throw new ApiError(
          "IMAGE_UNAVAILABLE",
          "โหลดภาพไม่ได้ กรุณาลองใหม่",
          503,
        );
      const locked = await db
        .from("omr_templates")
        .select("layout_json,omr_json")
        .eq("school_id", schoolId)
        .eq("id", data.template_id)
        .single();
      if (locked.error)
        throw new ApiError("TEMPLATE_MISSING", "โหลดแม่แบบไม่สำเร็จ", 500);
      return json({
        original: signed.data[0].signedUrl,
        processed: signed.data[1].signedUrl,
        template: locked.data,
      });
    }
    const [reviews, versions] = await Promise.all([
      db.rpc("get_scan_reviews", { tenant: schoolId }),
      db
        .from("exam_versions")
        .select("exam_id,version_no,config_json,created_at")
        .eq("school_id", schoolId),
    ]);
    if (reviews.error) throw scanDatabaseError(reviews.error.message);
    if (versions.error)
      throw new ApiError("READ_FAILED", "โหลดเฉลยของผลสแกนไม่สำเร็จ", 500);
    return json({
      reviews: reviews.data,
      versions: versions.data.map((v) => ({
        ...v.config_json,
        id: v.exam_id,
        version: v.version_no,
        updatedAt: v.created_at,
        stage: 0,
        scanned: 0,
        reviewCount: 0,
        students: 0,
        archived: false,
      })),
    });
  } catch (error) {
    return failure(error);
  }
}

function hasPrintedContent(image: Raster) {
  let dark = 0,
    count = 0;
  for (let i = 0; i < image.data.length; i += 4 * 7) {
    if (
      image.data[i] < 180 &&
      image.data[i + 1] < 180 &&
      image.data[i + 2] < 180
    )
      dark++;
    count++;
  }
  return dark / count > 0.005;
}
export async function POST(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = scanInputSchema.safeParse(
      await requestBody(request, 6_000_000),
    );
    if (!parsed.success)
      throw new ApiError(
        "INVALID_SCAN",
        "ข้อมูลภาพไม่ถูกต้อง กรุณาถ่ายหรือเลือกภาพใหม่",
        422,
      );
    const input = parsed.data;
    const [original, processed] = await Promise.all([
      decodeScanImage(input.original),
      decodeScanImage(input.processed),
    ]);
    const wholeToken = readSetQr(processed.raster);
    // Resolve the immutable registered template before touching any bubble.
    const regions =
      input.paper === "a4"
        ? [
            processed.raster,
            rasterRegion(
              processed.raster,
              0,
              Math.floor(processed.raster.width / 2),
            ),
            rasterRegion(
              processed.raster,
              Math.floor(processed.raster.width / 2),
              processed.raster.width - Math.floor(processed.raster.width / 2),
            ),
          ]
        : [processed.raster];
    const tokens = regions.map(readSetQr);
    const first = wholeToken ?? tokens.find(Boolean);
    if (!first)
      throw new ApiError(
        "QR_NOT_FOUND",
        "อ่าน QR ไม่ได้ ถ่ายให้เห็น QR ชัดและกระดาษครบทั้งใบ",
        422,
      );
    const found = await db
      .from("omr_templates")
      .select("id,exam_id,exam_version_id,set_token,layout_json,omr_json")
      .eq("school_id", schoolId)
      .in("set_token", [
        ...new Set(tokens.filter((t): t is string => Boolean(t))),
      ]);
    if (found.error) throw scanDatabaseError(found.error.message);
    const template = (found.data ?? []).find((t) => t.set_token === first) as
      LockedScanTemplate | undefined;
    if (!template) throw scanDatabaseError("QR_NOT_REGISTERED");
    const full = template.layout_json.paperMode === "full";
    if (full && input.paper !== "a4")
      throw new ApiError(
        "PAPER_MODE",
        "ชุดนี้ใช้ A4 เต็มแผ่น เลือก A4 ทั้งแผ่นแล้วปรับมุมใหม่",
        422,
      );
    const sheets =
      !full && input.paper === "a4" ? regions.slice(1) : [processed.raster];
    const records = sheets.flatMap((image, slot) => {
      const token = readSetQr(image);
      if (!token) {
        if (sheets.length === 2 && !hasPrintedContent(image)) return [];
        throw new ApiError(
          "QR_NOT_FOUND",
          `อ่าน QR ของ${sheets.length === 2 ? `ใบ${slot + 1}` : "กระดาษ"}ไม่ได้ กรุณาถ่ายใหม่`,
          422,
        );
      }
      const locked = (found.data ?? []).find((t) => t.set_token === token) as
        LockedScanTemplate | undefined;
      if (!locked) throw scanDatabaseError("QR_NOT_REGISTERED");
      if (
        locked.exam_id !== template.exam_id ||
        locked.exam_version_id !== template.exam_version_id ||
        locked.id !== template.id ||
        (input.expectedExamId && locked.exam_id !== input.expectedExamId)
      )
        throw new ApiError(
          "QR_MISMATCH",
          "QR ไม่ตรงกับชุดสอบที่เลือก หรือสองใบใช้คนละแม่แบบ กรุณาแยกสแกน",
          422,
        );
      try {
        const read = readOpticalMarks(image, locked);
        return [
          {
            token,
            slot,
            student_code: read.studentCode,
            digits: read.digits,
            answers: read.answers,
          },
        ];
      } catch (error) {
        throw new ApiError(
          "OPTICAL_QUALITY",
          error instanceof Error ? error.message : "ภาพไม่ชัด กรุณาถ่ายใหม่",
          422,
        );
      }
    });
    if (!records.length)
      throw new ApiError("INVALID_SCAN", "ไม่พบกระดาษคำตอบในภาพ", 422);
    const hash = createHash("sha256")
      .update(original.bytes)
      .update(processed.bytes)
      .update(input.paper)
      .digest("hex");
    const reserved = await db.rpc("reserve_scan_upload", {
      input: {
        school_id: schoolId,
        request_id: input.requestId,
        payload_hash: hash,
      },
    });
    if (reserved.error) throw scanDatabaseError(reserved.error.message);
    const upload = reserved.data;
    if (upload.status !== "complete") {
      // Immutable upload paths make retries safe. Never upsert a saved image.
      for (const [path, bytes] of [
        [upload.original_path, original.bytes],
        [upload.processed_path, processed.bytes],
      ] as [string, Uint8Array][]) {
        const result = await db.storage
          .from("scan-images")
          .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
        if (result.error) {
          const existing = await db.storage.from("scan-images").download(path);
          if (
            existing.error ||
            !existing.data ||
            createHash("sha256")
              .update(Buffer.from(await existing.data.arrayBuffer()))
              .digest("hex") !==
              createHash("sha256").update(bytes).digest("hex")
          )
            throw new ApiError(
              "IMAGE_UPLOAD_FAILED",
              "บันทึกภาพไม่ได้ กรุณาลองอีกครั้ง ภาพเดิมจะไม่ถูกเขียนทับ",
              503,
            );
        }
      }
    }
    const result = await db.rpc("save_scan_batch", {
      input: {
        school_id: schoolId,
        upload_id: upload.id,
        records,
        paper: input.paper,
        replace_pending: input.replacePending,
        reason: input.reason,
      },
    });
    if (result.error) {
      const code = ["DUPLICATE_SCAN", "CONFIRMED_RESULT_EXISTS"].find((code) =>
        result.error!.message.includes(code),
      );
      if (code) {
        const audit = await db.rpc("record_duplicate_scan", {
          input: { school_id: schoolId, upload_id: upload.id, code },
        });
        if (audit.error)
          throw new ApiError(
            "AUDIT_FAILED",
            "ตรวจพบภาพซ้ำ แต่บันทึกประวัติไม่ได้ กรุณาลองใหม่ ไม่มีการเขียนทับคะแนน",
            503,
          );
      }
      throw scanDatabaseError(result.error.message);
    }
    return json(result.data, 201);
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    const parsed = reviewInputSchema.safeParse(await requestBody(request));
    if (!parsed.success)
      throw new ApiError(
        "INVALID_REVIEW",
        "ตรวจข้อมูลและระบุเหตุผลก่อนบันทึก",
        422,
      );
    const result = await db.rpc("review_scan", {
      input: { ...parsed.data, school_id: schoolId },
    });
    if (result.error) throw scanDatabaseError(result.error.message);
    return json(result.data);
  } catch (error) {
    return failure(error);
  }
}
