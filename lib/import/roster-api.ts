import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/supabase/api";
import { rosterCommandSchema, rosterRpcInput } from "@/types/roster";

const errors: Record<string, [string, number]> = {
  DIRECTORY_NOT_FOUND: ["ไม่พบทะเบียนโรงเรียนนี้ อาจถูกลบแล้ว", 404],
  DIRECTORY_TRASHED: ["ทะเบียนโรงเรียนอยู่ในถังขยะ กรุณากู้คืนก่อนแก้ไข", 409],
  DIRECTORY_RESTORE_EXPIRED: ["พ้นกำหนดกู้คืน 14 วันแล้ว", 410],
  DIRECTORY_CLEANUP_NOT_READY: [
    "ยังไม่เปิดงานลบทะเบียนอัตโนมัติ กรุณาตั้งค่างานตามเวลาก่อน",
    503,
  ],
  DIRECTORY_NAME_MISMATCH: ["ชื่อโรงเรียนไม่ตรง กรุณาตรวจอีกครั้ง", 422],
  DIRECTORY_REQUEST_CONFLICT: [
    "คำขอนี้ใช้กับรายการอื่นแล้ว กรุณาตรวจรายการใหม่",
    409,
  ],
  DIRECTORY_CONSENT_REQUIRED: ["กรุณายืนยันการจัดการทะเบียนโรงเรียน", 422],
  FORBIDDEN: ["ไม่มีสิทธิ์จัดการรายชื่อในพื้นที่นี้", 403],
  DUPLICATE_CODE: ["รหัสนี้มีอยู่แล้ว หรือซ้ำภายในไฟล์", 409],
  STALE_ROSTER: ["รายชื่อเปลี่ยนแล้ว กรุณาโหลดและตรวจรายการใหม่", 409],
  STALE_DIRECTORY: ["ทะเบียนโรงเรียนเปลี่ยนแล้ว กรุณาตรวจรายการใหม่", 409],
  DIRECTORY_MANAGED: [
    "รายชื่อนี้อัปเดตจากโรงเรียน แก้ที่ทะเบียนกลางหรือแยกมาจัดการเอง",
    409,
  ],
  STUDENT_NOT_FOUND: ["ไม่พบรายชื่อนักเรียน กรุณาโหลดใหม่", 404],
  STUDENT_IDENTITY_LOCKED: ["ไม่สามารถเปลี่ยนรหัสประจำตัวของนักเรียนเดิม", 409],
  SELECT_DIRECTORY_CLASS: [
    "เลือกห้องจากทะเบียนโรงเรียนอีกครั้งก่อนคืนรายชื่อนี้",
    409,
  ],
  PLAN_NOT_FOUND: ["ไม่พบรายการที่ตรวจไว้ กรุณาตรวจใหม่", 404],
  PLAN_EXPIRED: ["รายการตรวจหมดอายุ กรุณาตรวจใหม่ก่อนบันทึก", 409],
  INVALID_SELECTION: ["กรุณาเลือกรายชื่อหรือห้องให้ถูกต้อง", 422],
  INVALID_CLASSROOM: ["ไม่พบห้องที่เลือกในทะเบียนปัจจุบัน", 422],
  INVALID_STUDENT_FIELDS: ["ตรวจรหัส ชื่อ นามสกุล ชั้น และเลขที่", 422],
  INVALID_IMPORT: ["ตรวจข้อมูลนำเข้า ไม่เกิน 2,000 แถวต่อครั้ง", 422],
  INVALID_ROSTER_QUERY: ["ตัวกรองรายชื่อไม่ถูกต้อง", 422],
  INVALID_ROSTER_ACTION: ["คำสั่งจัดการรายชื่อไม่ถูกต้อง", 422],
};
export function rosterError(message: string) {
  const code = Object.keys(errors).find((k) => message.includes(k));
  if (code) return new ApiError(code, ...errors[code]);
  if (/does not exist|schema cache|could not find/i.test(message))
    return new ApiError(
      "ROSTER_SETUP_REQUIRED",
      "ยังติดตั้งระบบรายชื่อไม่ครบ กรุณาตรวจ SQL 013–016 และ 019–020 สำหรับถังขยะโรงเรียน",
      503,
    );
  return new ApiError("ROSTER_FAILED", "ทำรายการไม่สำเร็จ กรุณาลองใหม่", 503);
}
export async function rosterRpc(
  db: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
) {
  const result = await db.rpc(name, { input });
  if (result.error) throw rosterError(result.error.message);
  return result.data;
}
export async function rosterCommand(
  db: SupabaseClient,
  schoolId: string,
  raw: unknown,
) {
  const parsed = rosterCommandSchema.safeParse(raw);
  if (!parsed.success)
    throw new ApiError(
      "INVALID_ROSTER",
      parsed.error.issues.map((i) => i.message).join(" · "),
      422,
    );
  const { name, input } = rosterRpcInput(parsed.data, schoolId);
  return rosterRpc(db, name, input);
}
