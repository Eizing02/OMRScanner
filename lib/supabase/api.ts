import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "./server";
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
export async function context(write = false) {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user)
    throw new ApiError("UNAUTHENTICATED", "กรุณาเข้าสู่ระบบก่อนทำรายการ", 401);
  const member = await db
    .from("school_members")
    .select("school_id,role")
    .eq("user_id", data.user.id)
    .eq("status", "active")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (member.error || !member.data)
    throw new ApiError(
      "FORBIDDEN",
      "บัญชีนี้ยังไม่มีสิทธิ์ในโรงเรียน กรุณาติดต่อผู้ดูแล",
      403,
    );
  if (write && !["admin", "teacher"].includes(member.data.role))
    throw new ApiError(
      "FORBIDDEN",
      "บัญชีผู้ตรวจไม่มีสิทธิ์เปลี่ยนข้อมูลนี้",
      403,
    );
  return {
    db,
    user: data.user,
    schoolId: member.data.school_id as string,
    role: member.data.role as string,
  };
}
export async function requestBody(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new ApiError("ORIGIN_DENIED", "แหล่งที่มาของคำขอไม่ถูกต้อง", 403);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError("INVALID_CONTENT_TYPE", "คำขอต้องเป็น JSON", 415);
  const limit = 1024 * 1024;
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
