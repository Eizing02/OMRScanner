import { z } from "zod";
import { studentSchema, type Student } from "./student";

export type RosterFilters = {
  query?: string;
  grade?: string;
  classroom?: string;
  status?: "active" | "inactive" | "all";
  page?: number;
  limit?: number;
  examId?: string;
};
export type RosterPage = {
  students: Student[];
  total: number;
  activeCount: number;
  classrooms: { name: string; count: number }[];
  page: number;
  limit: number;
};
export type PersonInput = Pick<
  Student,
  "student_code" | "first_name" | "last_name" | "classroom_name" | "number"
> & { prefix: string };
export type ImportRow = {
  status: "add" | "update" | "unchanged" | "restore" | "managed";
  before: PersonInput | null;
  after: PersonInput;
  studentId: string | null;
  revision: number;
};
export type RosterPlan = {
  planId: string;
  rows: ImportRow[];
  count?: number;
  expiresAt: string;
};
export type SelectionPlan = {
  planId: string;
  rows: { before: PersonInput; studentId: string; revision: number }[];
  count: number;
  expiresAt: string;
};
export type Directory = {
  id: string;
  name: string;
  academic_year: number;
  term: number;
  revision: number;
  canManage: boolean;
  classrooms: { name: string; count: number }[];
  selectedClasses: string[];
};
export type DirectoryOptions = {
  canCreate: boolean;
  directories: Directory[];
  accounts: { id: string; email: string; name: string }[];
  cleanupReady?: boolean;
  trash?: {
    id: string;
    name: string;
    revision: number;
    deletedAt: string;
    purgeAfter: string;
    canRestore: boolean;
  }[];
};
export type DirectoryTrashPreview = {
  id: string;
  name: string;
  revision: number;
  studentCount: number;
  classroomCount: number;
  subscribedWorkspaces: number;
  cleanupReady: boolean;
};
export type ReviewSummary = {
  id: string;
  examId: string;
  examVersion?: number;
  studentCode: string;
  name: string;
  classroom: string;
  number?: number | null;
  status: "needs_review" | "verified" | "voided";
  reason: string;
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
};
export type ReviewPage = {
  items: ReviewSummary[];
  total: number;
  counts: { needs_review: number; verified: number; voided: number };
  page: number;
  limit: number;
};
export type RecentReview = Pick<
  ReviewSummary,
  "id" | "examId" | "studentCode" | "name" | "classroom" | "reason"
>;
export type WorkspaceSummary = {
  activeCount: number;
  classrooms: { name: string; count: number }[];
  reviewCount: number;
  exams: {
    id: string;
    scanned: number;
    students: number;
    reviewCount: number;
  }[];
  recentReviews: RecentReview[];
};
export const personInput = (
  s: Student | z.output<typeof studentSchema>,
): PersonInput => ({
  student_code: s.student_code,
  prefix: s.prefix ?? "",
  first_name: s.first_name,
  last_name: s.last_name,
  classroom_name: s.classroom_name,
  number: s.number,
});
const id = z.uuid();
const revision = z.number().int().positive();
const consent = z.literal(true);
const filters = z.object({
  query: z.string().max(100).optional(),
  grade: z.string().max(10).optional(),
  classroom: z.string().max(30).optional(),
});
// Reuse the public normalizer, not Zod's internal representation.
const importPerson = z.unknown().transform((value, ctx) => {
  const parsed = studentSchema.safeParse(value);
  if (!parsed.success) {
    parsed.error.issues.forEach((i) =>
      ctx.addIssue({ code: "custom", message: i.message }),
    );
    return z.NEVER;
  }
  const numberProvided =
    typeof value === "object" && value !== null && "numberProvided" in value
      ? (value as { numberProvided: unknown }).numberProvided
      : true;
  if (typeof numberProvided !== "boolean") {
    ctx.addIssue({ code: "custom", message: "ข้อมูลเลขที่ไม่ถูกต้อง" });
    return z.NEVER;
  }
  const expectedRevision =
    typeof value === "object" && value !== null && "expectedRevision" in value
      ? (value as { expectedRevision: unknown }).expectedRevision
      : undefined;
  if (
    expectedRevision !== undefined &&
    (typeof expectedRevision !== "number" ||
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 0)
  ) {
    ctx.addIssue({ code: "custom", message: "รุ่นข้อมูลนักเรียนไม่ถูกต้อง" });
    return z.NEVER;
  }
  return {
    ...personInput(parsed.data),
    numberProvided,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  };
});
export const rosterCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), student: studentSchema }),
  z.object({
    action: z.literal("update"),
    id,
    revision,
    student: studentSchema,
  }),
  z.object({
    action: z.literal("preview_import"),
    students: z.array(importPerson).min(1).max(2000),
    filename: z.string().min(1).max(200),
    directoryId: id.optional(),
  }),
  z.object({
    action: z.literal("apply_plan"),
    planId: id,
    consent,
    directory: z.boolean().default(false),
  }),
  z
    .object({
      action: z.literal("preview_selection"),
      operation: z.enum(["archive", "restore"]),
      ids: z.array(id).min(1).max(2000).optional(),
      excludedIds: z.array(id).max(2000).optional(),
      allMatching: z.boolean().optional(),
      filters: filters.default({}),
    })
    .refine(
      (v) => !!v.ids?.length || v.allMatching === true,
      "เลือกรายชื่อก่อน",
    ),
  z.object({ action: z.literal("sync") }),
  z.object({
    action: z.literal("directory_create"),
    name: z.string().trim().min(1).max(120),
    year: z.number().int().min(2500).max(2700),
    term: z.number().int().min(1).max(3),
  }),
  z.object({
    action: z.literal("directory_manage"),
    directoryId: id,
    revision,
    operation: z.enum(["grant", "revoke", "period", "archive", "restore"]),
    userId: id.optional(),
    studentId: id.optional(),
    role: z.enum(["manager", "teacher"]).optional(),
    year: z.number().int().min(2500).max(2700).optional(),
    term: z.number().int().min(1).max(3).optional(),
  }),
  z.object({ action: z.literal("directory_from_workspace"), directoryId: id }),
  z
    .object({
      action: z.literal("directory_lifecycle"),
      operation: z.enum(["preview_trash", "trash", "restore"]),
      directoryId: id,
      revision: revision.optional(),
      requestId: z.uuid().optional(),
      confirmationName: z.string().max(120).optional(),
      consent: z.boolean().optional(),
    })
    .superRefine((v, ctx) => {
      if (
        v.operation !== "preview_trash" &&
        (!v.revision || !v.requestId || v.consent !== true)
      )
        ctx.addIssue({
          code: "custom",
          message: "ตรวจรายการและยืนยันก่อนทำต่อ",
        });
      if (v.operation === "trash" && !v.confirmationName)
        ctx.addIssue({
          code: "custom",
          message: "พิมพ์ชื่อโรงเรียนเพื่อยืนยัน",
        });
    }),
  z.object({
    action: z.literal("preview_subscribe"),
    directoryId: id,
    classrooms: z.array(z.string().max(30)).max(100),
  }),
  z.object({
    action: z.literal("subscribe"),
    directoryId: id,
    revision,
    classrooms: z.array(z.string().max(30)).max(100),
    adoptCodes: z
      .array(z.string().regex(/^[0-9]{5}$/))
      .max(2000)
      .optional(),
    includeExcluded: z.boolean().optional(),
    consent,
  }),
  z.object({ action: z.literal("detach"), id, revision, consent }),
]);
export function rosterRpcInput(
  command: z.output<typeof rosterCommandSchema>,
  schoolId: string,
) {
  let name: string;
  let input: Record<string, unknown> = { ...command, school_id: schoolId };
  switch (command.action) {
    case "create":
    case "update":
      name = "manage_student";
      input.student = personInput(command.student);
      break;
    case "preview_import":
      name = command.directoryId
        ? "preview_directory_import"
        : "preview_student_import";
      break;
    case "apply_plan":
      name = command.directory
        ? "apply_directory_import"
        : "apply_student_plan";
      break;
    case "preview_selection":
      name = "preview_student_selection";
      input.action = command.operation;
      break;
    case "sync":
      name = "sync_student_directory";
      break;
    case "directory_create":
      name = "manage_roster_directory";
      input.action = "create";
      break;
    case "directory_manage":
      name = "manage_roster_directory";
      input.action = command.operation;
      break;
    case "directory_from_workspace":
      name = "preview_directory_import";
      input = {
        school_id: schoolId,
        directoryId: command.directoryId,
        fromWorkspace: true,
      };
      break;
    case "directory_lifecycle":
      name = "manage_directory_lifecycle";
      input.action = command.operation;
      break;
    case "preview_subscribe":
      name = "preview_directory_subscription";
      break;
    case "subscribe":
      name = "subscribe_student_directory";
      break;
    case "detach":
      name = "detach_student_directory";
      break;
  }
  return { name, input };
}
