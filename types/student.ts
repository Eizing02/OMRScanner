import { z } from "zod";
import { namePrefixes } from "@/lib/import/normalize-name";
import { normalizeClassroom } from "@/lib/import/normalize-classroom";
export const studentSchema = z
  .object({
    student_code: z
      .string()
      .regex(/^[0-9]{5}$/, "รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก เช่น 04217"),
    prefix: z.enum(["", ...namePrefixes]).default(""),
    first_name: z
      .string()
      .trim()
      .min(1, "กรุณาระบุชื่อ")
      .max(80, "ชื่อยาวเกิน 80 ตัวอักษร"),
    last_name: z
      .string()
      .trim()
      .min(1, "กรุณาระบุนามสกุล")
      .max(80, "นามสกุลยาวเกิน 80 ตัวอักษร"),
    classroom_name: z
      .string()
      .trim()
      .max(30)
      .refine(
        (value) => normalizeClassroom(value) !== null,
        "ชั้นต้องเป็น ม.1–ม.6 เช่น ม.1 หรือ ม.1/2",
      ),
    number: z.number().int().min(1).max(100).nullable().default(null),
  })
  .transform((data) => ({
    ...data,
    ...normalizeClassroom(data.classroom_name)!,
    full_name: `${data.prefix}${data.first_name} ${data.last_name}`,
  }));
type NormalizedStudent = z.output<typeof studentSchema>;
// Older demo records remain readable; all new imports carry the normalized fields.
export type Student = Omit<
  NormalizedStudent,
  "prefix" | "full_name" | "grade_level" | "room"
> &
  Partial<
    Pick<NormalizedStudent, "prefix" | "full_name" | "grade_level" | "room">
  > & { id: string };
export function studentFullName(
  student: Pick<Student, "prefix" | "first_name" | "last_name">,
) {
  return `${student.prefix ?? ""}${student.first_name} ${student.last_name}`;
}
