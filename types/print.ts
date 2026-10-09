import { z } from "zod";
import { layoutSchema, type SheetLayout } from "@/lib/omr/generate-template";

export type PrintStudent = {
  id: string;
  student_code: string;
  full_name: string;
  classroom_name: string;
  number: number | null;
};
export type PrintManifest = {
  schemaVersion: 3;
  experimental: true;
  qrScope: "exam-key-layout-version";
  examId: string;
  examVersion: number;
  setToken: string;
  templateId: string;
  templateUuid?: string;
  jobId?: string;
  layout: SheetLayout;
  layoutHash: string;
  omr: ReturnType<
    typeof import("@/lib/omr/generate-template").compileOmrTemplate
  >;
  print: {
    paperWidthMm: number;
    paperHeightMm: number;
    sheetWidthMm: number;
    sheetHeightMm: number;
    sheetsPerPage: number;
    pageCount: number;
    scalePercent: number;
  };
  sheets: {
    token: string;
    instanceId: string;
    studentId: string | null;
    studentCode: string | null;
    page: number;
    slot: number;
  }[];
};
export const printRegistrationSchema = z
  .object({
    layout: layoutSchema,
    requestId: z.uuid(),
    studentIds: z.array(z.uuid()).min(1).max(200).optional(),
    blankCount: z.number().int().min(1).max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (Boolean(value.studentIds) === Boolean(value.blankCount))
      ctx.addIssue({
        code: "custom",
        message: "เลือกพิมพ์รายชื่อหรือใบสำรองอย่างใดอย่างหนึ่ง",
      });
    if (
      value.studentIds &&
      new Set(value.studentIds).size !== value.studentIds.length
    )
      ctx.addIssue({ code: "custom", message: "รายชื่อนักเรียนซ้ำในชุดพิมพ์" });
  });
export type PrintRegistrationInput = z.infer<typeof printRegistrationSchema>;
export type RegisteredPrint = {
  jobId: string;
  layout: SheetLayout;
  students: PrintStudent[];
  manifest: PrintManifest;
};
