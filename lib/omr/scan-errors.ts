import { ApiError } from "@/lib/supabase/api";
const messages: Record<string, [string, number]> = {
  DUPLICATE_SCAN: [
    "มีผลสแกนของนักเรียนนี้แล้ว หากจะแทนที่ผลที่ยังไม่ยืนยัน ให้ระบุเหตุผล",
    409,
  ],
  CONFIRMED_RESULT_EXISTS: [
    "นักเรียนนี้มีคะแนนที่ยืนยันแล้ว ไม่สามารถสแกนทับได้",
    409,
  ],
  STALE_REVIEW: ["ผลนี้ถูกแก้ไขแล้ว กรุณาโหลดผลล่าสุดก่อนทำรายการ", 409],
  RESULT_LOCKED: ["ผลนี้ยืนยันหรือปฏิเสธแล้ว ไม่สามารถแก้ไขได้", 409],
  IDENTITY_REQUIRED: ["ระบุนักเรียนให้ถูกต้องก่อนยืนยันคะแนน", 422],
  UNRESOLVED_ANSWERS: ["ตรวจคำตอบที่ไม่ชัดให้ครบก่อนยืนยันคะแนน", 422],
  STUDENT_NOT_IN_EXAM: ["ไม่พบรหัสนักเรียนนี้ในรายชื่อของชุดสอบ", 422],
  REASON_REQUIRED: ["ระบุเหตุผลอย่างน้อย 3 ตัวอักษร", 422],
  FORBIDDEN: ["ไม่มีสิทธิ์ทำรายการในพื้นที่นี้", 403],
  QR_NOT_REGISTERED: [
    "ไม่พบทะเบียน QR นี้ในพื้นที่ของคุณ กรุณาเลือกกระดาษที่พิมพ์จากระบบ",
    422,
  ],
  SCAN_REQUEST_CONFLICT: ["ภาพของรายการนี้เปลี่ยนแล้ว กรุณาเริ่มสแกนใหม่", 409],
  SCAN_IMAGES_MISSING: ["บันทึกภาพไม่ครบ กรุณาลองส่งภาพอีกครั้ง", 409],
  UNCONFIRMED_EXPORT: ["ส่งออกได้เฉพาะคะแนนที่ครูยืนยันแล้ว", 422],
};
export function scanDatabaseError(message: string) {
  const key = Object.keys(messages).find((code) => message.includes(code));
  if (key) return new ApiError(key, ...messages[key]);
  if (message.includes("does not exist") || message.includes("schema cache"))
    return new ApiError(
      "SCAN_SETUP_REQUIRED",
      "ยังติดตั้งส่วนสแกนไม่ครบ กรุณาให้เจ้าของระบบรัน SQL 006 และ 007",
      503,
    );
  return new ApiError(
    "SCAN_SAVE_FAILED",
    "บันทึกผลไม่สำเร็จ กรุณาลองใหม่",
    500,
  );
}
