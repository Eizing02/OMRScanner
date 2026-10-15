import { z } from "zod";

export const SCORE_SCHEMA_VERSION = "1.0" as const;
export const MAX_RESULTS_PER_BATCH = 100;
export const MAX_BATCH_COUNT = 100;
export const MAX_EVENT_BYTES = 256 * 1024;
export const studentCodeSchema = z.string().regex(/^[0-9]{5}$/);
const utc = z.iso.datetime();
export const examMetadataSchema = z.strictObject({
  title: z.string().trim().min(3).max(120),
  subject: z.string().trim().min(1).max(80),
  exam_type: z.enum([
    "เก็บคะแนน",
    "ก่อนเรียน",
    "หลังเรียน",
    "กลางภาค",
    "ปลายภาค",
  ]),
  classroom: z.string().trim().min(1).max(30),
  academic_year: z.number().int().min(2500).max(2700),
  term: z.number().int().min(1).max(3),
});
export const publishedResultSchema = z
  .strictObject({
    source_scan_id: z.uuid(),
    source_exam_version_id: z.uuid(),
    student_code: studentCodeSchema,
    score: z.number().min(0).max(6000),
    max_score: z.number().positive().max(6000),
    percent: z.number().min(0).max(100),
    passed: z.boolean(),
    confirmed_at: utc,
  })
  .superRefine((value, ctx) => {
    if (
      value.score > value.max_score ||
      Math.abs(value.percent - (value.score / value.max_score) * 100) > 0.011
    )
      ctx.addIssue({ code: "custom", message: "SCORE_MISMATCH" });
  });
export const scoreEventSchema = z
  .strictObject({
    schema_version: z.literal(SCORE_SCHEMA_VERSION),
    event_id: z.uuid(),
    connection_id: z.uuid(),
    source_workspace_id: z.uuid(),
    source_exam_id: z.uuid(),
    publication_revision: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
    action: z.enum(["publish_results", "withdraw_exam"]),
    batch_index: z
      .number()
      .int()
      .min(0)
      .max(MAX_BATCH_COUNT - 1),
    batch_count: z.number().int().min(1).max(MAX_BATCH_COUNT),
    occurred_at: utc,
    exam: examMetadataSchema,
    results: z.array(publishedResultSchema).max(MAX_RESULTS_PER_BATCH),
  })
  .superRefine((value, ctx) => {
    if (
      value.batch_index >= value.batch_count ||
      new Set(value.results.map((r) => r.student_code)).size !==
        value.results.length ||
      (value.action === "publish_results" && !value.results.length) ||
      (value.action === "withdraw_exam" &&
        (value.results.length !== 0 ||
          value.batch_index !== 0 ||
          value.batch_count !== 1))
    )
      ctx.addIssue({ code: "custom", message: "INVALID_BATCH" });
  });
export type ScoreEvent = z.infer<typeof scoreEventSchema>;
const issue = z.strictObject({
  student_code: studentCodeSchema,
  reason: z.enum([
    "STUDENT_NOT_FOUND",
    "STUDENT_NOT_ELIGIBLE",
    "INVALID_SCORE",
    "IDENTITY_MAPPING_REQUIRED",
  ]),
});
export const scoreAckSchema = z.strictObject({
  schema_version: z.literal(SCORE_SCHEMA_VERSION),
  event_id: z.uuid(),
  status: z.enum(["processed", "stale_ignored"]),
  accepted: z.number().int().min(0).max(MAX_RESULTS_PER_BATCH),
  unmatched: z.array(issue).max(MAX_RESULTS_PER_BATCH),
  invalid: z.array(issue).max(MAX_RESULTS_PER_BATCH),
});
export type ScoreAck = z.infer<typeof scoreAckSchema>;
export function validateAcknowledgment(
  input: unknown,
  event: ScoreEvent,
): ScoreAck {
  const ack = scoreAckSchema.parse(input);
  const codes = [...ack.unmatched, ...ack.invalid].map((r) => r.student_code);
  if (
    ack.event_id !== event.event_id ||
    new Set(codes).size !== codes.length ||
    codes.some((code) => !event.results.some((r) => r.student_code === code)) ||
    (ack.status === "processed" &&
      ack.accepted + codes.length !== event.results.length) ||
    (ack.status === "stale_ignored" &&
      (ack.accepted !== 0 || codes.length !== 0))
  )
    throw new Error("INVALID_ACK");
  return ack;
}
