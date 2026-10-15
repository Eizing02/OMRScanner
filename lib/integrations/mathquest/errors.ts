import "server-only";
import { ApiError } from "@/lib/supabase/api";
const messages: Record<string, [string, number]> = {
  FORBIDDEN: ["ไม่มีสิทธิ์จัดการการเชื่อมต่อในพื้นที่นี้", 403],
  CONNECTION_NOT_ACTIVE: [
    "การเชื่อมต่อยังไม่พร้อม กรุณาตรวจในหน้าตั้งค่า",
    409,
  ],
  CONNECTION_EXISTS: ["มีการเชื่อมต่ออยู่แล้ว กรุณาตรวจสถานะ", 409],
  NO_CONFIRMED_RESULTS: ["ยังไม่มีคะแนนที่ยืนยันแล้ว", 422],
  ZERO_MAX_SCORE: ["คะแนนเต็มต้องมากกว่าศูนย์ก่อนเผยแพร่", 422],
  MIXED_EXAM_METADATA: [
    "ผลสอบใช้ข้อมูลหัวสอบต่างเวอร์ชัน ยังเผยแพร่รวมไม่ได้",
    409,
  ],
  PUBLICATION_WITHDRAW_REQUIRED: [
    "ถอนคะแนนใน MathQuest ให้สำเร็จก่อนลบหรือยกเลิกการเชื่อมต่อ",
    409,
  ],
  PUBLICATION_PENDING: ["ยังมีงานรอส่ง กรุณาตรวจสถานะหรือลองส่งใหม่", 409],
  SYNC_REQUEST_CONFLICT: ["คำขอเดิมมีข้อมูลต่างกัน กรุณาโหลดสถานะใหม่", 409],
  SYNC_LIMIT: ["รายการมากเกินขอบเขตการเผยแพร่ กรุณาติดต่อผู้ดูแล", 422],
  RATE_LIMITED: ["ทำรายการถี่เกินไป กรุณารอสักครู่", 429],
  EXAM_DELETING: ["ชุดสอบกำลังลบ ไม่สามารถเผยแพร่ได้", 409],
  EXAM_NOT_FOUND: ["ไม่พบชุดสอบในพื้นที่นี้", 404],
};
export function integrationDatabaseError(message: string): ApiError {
  const code = Object.keys(messages).find((key) => message.includes(key));
  if (code) return new ApiError(code, ...messages[code]);
  if (message.includes("does not exist") || message.includes("schema cache"))
    return new ApiError(
      "INTEGRATION_SETUP_REQUIRED",
      "ยังติดตั้งฐานข้อมูลการเชื่อมต่อไม่ครบ",
      503,
    );
  return new ApiError(
    "INTEGRATION_FAILED",
    "ทำรายการไม่สำเร็จ กรุณาลองใหม่",
    503,
  );
}
