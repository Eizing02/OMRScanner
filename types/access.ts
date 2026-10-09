import { z } from "zod";

export const accessStatusSchema = z.enum([
  "pending", "approved", "rejected", "suspended",
]);
export type AccessStatus = z.infer<typeof accessStatusSchema>;
export type AccessContext = {
  userId: string;
  email: string;
  displayName: string;
  role: "owner" | "teacher";
  status: AccessStatus;
  schoolId: string | null;
};
export type ManagedUser = AccessContext & {
  createdAt: string;
  reviewedAt: string | null;
};
export const accessContextSchema = z.object({
  userId: z.uuid(), email: z.string(), displayName: z.string(),
  role: z.enum(["owner", "teacher"]), status: accessStatusSchema,
  schoolId: z.uuid().nullable(),
});
export const accessDecisionSchema = z.object({
  userId: z.uuid(),
  status: accessStatusSchema.exclude(["pending"]),
  reason: z.string().trim().min(3, "กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร").max(300),
});
