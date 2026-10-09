import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "./server";
import { headers } from "next/headers";
import { z } from "zod";
import { accessContextSchema } from "@/types/access";
export class ApiError extends Error {
  constructor(
    public code: string,
    public messageTh: string,
    public status: number,
  ) {
    super(messageTh);
  }
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(
    { data, error: null, requestId: crypto.randomUUID() },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
export function failure(error: unknown) {
  if (error instanceof ApiError)
    return NextResponse.json(
      {
        data: null,
        error: { code: error.code, messageTh: error.messageTh },
        requestId: crypto.randomUUID(),
      },
      {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  if (error instanceof Error && error.message === "SUPABASE_NOT_CONFIGURED")
    return failure(
      new ApiError(
        "NOT_CONFIGURED",
        "ยังไม่ได้เชื่อม Supabase กรุณาตั้งค่าระบบ",
        503,
      ),
    );
  return failure(
    new ApiError("INTERNAL_ERROR", "ทำรายการไม่สำเร็จ กรุณาลองใหม่", 500),
  );
}
export async function accessContext() {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user)
    throw new ApiError("UNAUTHENTICATED", "กรุณาเข้าสู่ระบบก่อนทำรายการ", 401);
  const result = await db.rpc("get_access_context");
  if (result.error)
    throw new ApiError(
      "ACCESS_SETUP_REQUIRED",
      result.error.message?.includes("WORKSPACE_CONFLICT")
        ? "พบหลายพื้นที่ของบัญชีนี้ กรุณาให้เจ้าของระบบตรวจข้อมูลก่อนเข้าใช้งาน"
        : "ยังติดตั้งฐานข้อมูลไม่ครบ กรุณาให้เจ้าของระบบใช้ชุด SQL ติดตั้งก่อน",
      503,
    );
  const parsed = accessContextSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.userId !== data.user.id)
    throw new ApiError(
      "INVALID_ACCESS",
      "ตรวจสอบสิทธิ์บัญชีไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่",
      403,
    );
  return { db, user: data.user, access: parsed.data };
}
export async function ownerContext() {
  const result = await accessContext();
  if (result.access.role !== "owner" || result.access.status !== "approved")
    throw new ApiError(
      "FORBIDDEN",
      "เฉพาะเจ้าของระบบเท่านั้นที่จัดการผู้ใช้ได้",
      403,
    );
  return result;
}
export async function context(write = false) {
  const { db, user, access } = await accessContext();
  if (access.status !== "approved" || !access.schoolId)
    throw new ApiError(
      "ACCESS_NOT_APPROVED",
      "บัญชีนี้ยังไม่ได้รับอนุมัติหรือถูกระงับการใช้งาน",
      403,
    );
  const requested = (await headers()).get("x-workspace-id");
  if (requested && !z.uuid().safeParse(requested).success)
    throw new ApiError("FORBIDDEN", "พื้นที่ที่ร้องขอไม่ถูกต้อง", 403);
  const schoolId = requested || access.schoolId;
  const readOnly = schoolId !== access.schoolId;
  if (readOnly && (access.role !== "owner" || write))
    throw new ApiError(
      "READ_ONLY_WORKSPACE",
      "การดูพื้นที่ของผู้ใช้อื่นเป็นแบบอ่านอย่างเดียว กลับพื้นที่ของคุณก่อนบันทึก",
      403,
    );
  if (readOnly) {
    const target = await db
      .from("schools")
      .select("id")
      .eq("id", schoolId)
      .maybeSingle();
    if (target.error || !target.data)
      throw new ApiError("FORBIDDEN", "ไม่พบพื้นที่หรือไม่มีสิทธิ์เปิดดู", 403);
  }
  return {
    db,
    user,
    schoolId,
    readOnly,
    access,
    role: readOnly ? "viewer" : "admin",
  };
}
export async function requestBody(request: Request, limit = 1024 * 1024) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError("ORIGIN_DENIED", "แหล่งที่มาของคำขอไม่ถูกต้อง", 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError("INVALID_CONTENT_TYPE", "คำขอต้องเป็น JSON", 415);
  if (Number(request.headers.get("content-length")) > limit)
    throw new ApiError("PAYLOAD_TOO_LARGE", "ข้อมูลมีขนาดใหญ่เกินไป", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("INVALID_JSON", "คำขอไม่มีข้อมูล JSON", 400);
  let content = "",
    size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError("PAYLOAD_TOO_LARGE", "ข้อมูลมีขนาดใหญ่เกินไป", 413);
      }
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new ApiError("INVALID_JSON", "รูปแบบ JSON ไม่ถูกต้อง", 400);
  }
}
