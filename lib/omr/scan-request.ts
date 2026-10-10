import "server-only";
import { ApiError, requestBody } from "@/lib/supabase/api";
import { scanInputSchema, scanMetadataSchema } from "@/types/scan";

export async function scanRequestBody(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data")) {
    const parsed = scanInputSchema.safeParse(
      await requestBody(request, 6_000_000),
    );
    if (!parsed.success)
      throw new ApiError(
        "INVALID_SCAN",
        "ข้อมูลภาพไม่ถูกต้อง กรุณาถ่ายหรือเลือกภาพใหม่",
        422,
      );
    return parsed.data;
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError("ORIGIN_DENIED", "แหล่งที่มาของคำขอไม่ถูกต้อง", 403);
  const limit = 2_050_000;
  if (Number(request.headers.get("content-length")) > limit)
    throw new ApiError("PAYLOAD_TOO_LARGE", "ข้อมูลมีขนาดใหญ่เกินไป", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("INVALID_SCAN", "คำขอไม่มีภาพ", 400);
  // Bound actual streamed bytes BEFORE the multipart parser allocates files.
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError("PAYLOAD_TOO_LARGE", "ข้อมูลมีขนาดใหญ่เกินไป", 413);
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(new Blob(chunks), {
      headers: { "Content-Type": type },
    }).formData();
  } catch {
    throw new ApiError("INVALID_SCAN", "รูปแบบไฟล์ไม่ถูกต้อง", 400);
  }
  const meta = form.get("metadata"),
    file = form.get("processed");
  if (
    form.getAll("metadata").length !== 1 ||
    form.getAll("processed").length !== 1 ||
    [...form.keys()].some((key) => !["metadata", "processed"].includes(key)) ||
    typeof meta !== "string" ||
    meta.length > 4096 ||
    !(file instanceof Blob) ||
    !["image/jpeg", "image/png"].includes(file.type) ||
    file.size === 0 ||
    file.size > 2_000_000
  )
    throw new ApiError(
      "INVALID_SCAN",
      "เลือกไฟล์ JPG / PNG ที่ปรับมุมแล้ว",
      422,
    );
  let parsed;
  try {
    parsed = scanMetadataSchema.safeParse(JSON.parse(meta));
  } catch {
    /* Invalid JSON is a validation failure. */
  }
  if (!parsed?.success)
    throw new ApiError("INVALID_SCAN", "ข้อมูลภาพไม่ถูกต้อง กรุณาลองใหม่", 422);
  return {
    ...parsed.data,
    processed: new Uint8Array(await file.arrayBuffer()),
  };
}
