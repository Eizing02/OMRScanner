import { context, failure, json, ApiError } from "@/lib/supabase/api";
import { cleanupOldLogos, readBranding, LOGO_BUCKET } from "@/lib/supabase/school-logo";
import { inspectLogo, MAX_LOGO_BYTES } from "@/lib/omr/logo-image";
import { z } from "zod";
import { isRequestOriginAllowed } from "@/lib/supabase/request-origin";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    if (!isRequestOriginAllowed(request)) throw new ApiError("ORIGIN_DENIED", "แหล่งที่มาของคำขอไม่ถูกต้อง", 403);
    const contentType = request.headers.get("content-type");
    if (!contentType?.startsWith("multipart/form-data;")) throw new ApiError("INVALID_CONTENT_TYPE", "กรุณาส่งไฟล์ภาพ", 415);
    if (Number(request.headers.get("content-length")) > MAX_LOGO_BYTES + 65536)
      throw new ApiError("PAYLOAD_TOO_LARGE", "ไฟล์ต้องไม่เกิน 5 MB", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new ApiError("INVALID_UPLOAD", "ไม่มีไฟล์ภาพในคำขอ", 400);
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_LOGO_BYTES + 65536) { await reader.cancel(); throw new ApiError("PAYLOAD_TOO_LARGE", "ไฟล์ต้องไม่เกิน 5 MB", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const form = await new Response(new Blob(chunks as BlobPart[]), { headers: { "Content-Type": contentType } }).formData()
      .catch(() => { throw new ApiError("INVALID_UPLOAD", "ข้อมูลไฟล์ไม่ถูกต้อง", 400); });
    const file = form.get("file"), revision = form.get("revision");
    if (!(file instanceof File) || !z.uuid().safeParse(revision).success) throw new ApiError("INVALID_UPLOAD", "กรุณาเลือกไฟล์และโหลดข้อมูลโรงเรียนใหม่", 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let dimensions;
    try { dimensions = inspectLogo(bytes); }
    catch (error) { throw new ApiError("INVALID_IMAGE", error instanceof Error ? error.message : "ภาพไม่ถูกต้อง", 422); }
    const current = await db.from("schools").select("logo_revision").eq("id", schoolId).single();
    if (current.error) throw new ApiError("SETTINGS_SETUP_REQUIRED", "กรุณาติดตั้งชุด SQL บัญชีและ Storage ก่อน", 503);
    if (current.data.logo_revision !== revision) throw new ApiError("STALE_LOGO", "โลโก้ถูกเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่", 409);
    const objectPath = `${schoolId}/${crypto.randomUUID()}.${dimensions.format === "PNG" ? "png" : "jpg"}`;
    const uploaded = await db.storage.from(LOGO_BUCKET).upload(objectPath, bytes, {
      contentType: dimensions.format === "PNG" ? "image/png" : "image/jpeg", upsert: false, cacheControl: "60",
    });
    if (uploaded.error) throw new ApiError("LOGO_UPLOAD_FAILED", "อัปโหลดโลโก้ไม่สำเร็จ กรุณาตรวจ Storage และสิทธิ์", 503);
    const saved = await db.rpc("update_school_logo", { input: { school_id: schoolId, expected_revision: revision, object_path: objectPath } });
    if (saved.error) {
      // Queue first, under the same school-row lock used by the pointer RPC.
      // A response lost after a successful commit must never delete its active logo.
      const queued = await db.rpc("queue_logo_cleanup", { input: { school_id: schoolId, object_path: objectPath } });
      if (queued.error)
        throw new ApiError("LOGO_ROLLBACK_CHECK_FAILED", "ยังยืนยันการบันทึกโลโก้ไม่ได้ กรุณาโหลดข้อมูลล่าสุดก่อนลองใหม่", 503);
      await cleanupOldLogos(db, schoolId);
      throw new ApiError("LOGO_SAVE_FAILED", "บันทึกโลโก้ไม่สำเร็จ อาจมีการเปลี่ยนพร้อมกัน กรุณาโหลดใหม่", 409);
    }
    const complete = await cleanupOldLogos(db, schoolId);
    return json({ ...await readBranding(db, schoolId), ...dimensions, cleanupWarning: !complete }, 201);
  } catch (error) { return failure(error); }
}
