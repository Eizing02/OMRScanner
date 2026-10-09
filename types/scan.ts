import { z } from "zod";
import type { Observation, ReviewItem } from "./result";
import type {
  SheetLayout,
  compileOmrTemplate,
} from "@/lib/omr/generate-template";

export const setTokenSchema = z
  .string()
  .regex(/^SAS2:[a-f0-9]{64}$/, "QR ไม่ใช่ชุดกระดาษคำตอบของระบบ");
export const scanInputSchema = z
  .object({
    requestId: z.uuid(),
    original: z
      .string()
      .max(2_800_000)
      .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/)
      .optional(), // Legacy clients may send it; never persist new originals.
    processed: z
      .string()
      .max(2_800_000)
      .regex(/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/),
    paper: z.enum(["single", "a4"]),
    expectedExamId: z.uuid().optional(),
    replacePending: z.boolean().default(false),
    reason: z.string().trim().max(500).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.replacePending && v.reason.length < 3)
      ctx.addIssue({
        code: "custom",
        message: "ระบุเหตุผลก่อนแทนที่ผลที่ยังไม่ยืนยัน",
      });
  });
export const reviewInputSchema = z
  .object({
    scanId: z.uuid(),
    revision: z.number().int().positive(),
    action: z.enum(["correct", "identify", "confirm", "reject"]),
    question: z.number().int().min(1).max(60).optional(),
    choice: z.enum(["A", "B", "C", "D", "E"]).nullable().optional(),
    studentCode: z
      .string()
      .regex(/^\d{5}$/, "รหัสต้องครบ 5 หลัก")
      .optional(),
    reason: z.string().trim().max(500).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.action !== "confirm" && v.reason.length < 3)
      ctx.addIssue({
        code: "custom",
        message: "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร",
      });
    if (v.action === "correct" && (!v.question || v.choice === undefined))
      ctx.addIssue({ code: "custom", message: "เลือกข้อและคำตอบที่แก้ไข" });
    if (v.action === "identify" && !v.studentCode)
      ctx.addIssue({ code: "custom", message: "เลือกรหัสนักเรียนก่อนบันทึก" });
  });
export type LockedScanTemplate = {
  id: string;
  exam_id: string;
  exam_version_id: string;
  set_token: string;
  layout_json: SheetLayout;
  omr_json: ReturnType<typeof compileOmrTemplate>;
};
export type DigitRead = {
  digit: number;
  value: number | null;
  state: Observation["state"];
  fills: number[];
};
export type OpticalRead = {
  studentCode: string | null;
  digits: DigitRead[];
  answers: (Observation & { fills: number[]; confidence: number })[];
};
export type ScanReceipt = {
  id: string;
  studentCode: string | null;
  name: string;
  score: number;
  maxScore: number;
};
export type StoredReview = ReviewItem & {
  revision: number;
  templateId: string;
  originalPath: string | null;
  processedPath: string;
  slot: number;
  paper: "single" | "a4";
  idObservations: DigitRead[];
};
