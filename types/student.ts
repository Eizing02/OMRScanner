import { z } from "zod";
export const studentSchema = z.object({
  student_code: z
    .string()
    .regex(/^[0-9]{5}$/, "รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก เช่น 04217"),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  classroom_name: z.string().trim().min(1).max(30),
  number: z.number().int().min(1).max(100).nullable(),
});
export type Student = z.infer<typeof studentSchema> & { id: string };
