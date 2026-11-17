import { z } from "zod";
export const integrationModeSchema = z.enum(["manual", "auto_after_confirm"]);
export const integrationConnectionSchema = z.object({
  id: z.uuid(),
  connectionId: z.uuid().nullable(),
  destinationSchoolId: z.uuid().nullable(),
  destinationLabel: z.string(),
  status: z.enum(["pending_approval", "active", "revoked", "error"]),
  mode: integrationModeSchema,
  enabled: z.boolean(),
  revocationPending: z.boolean(),
  recoveryPending: z.boolean().default(false),
  signedStage: z
    .enum([
      "prepare",
      "preparing",
      "submit",
      "waiting",
      "active",
      "rejected",
      "expired",
      "cancelled",
    ])
    .optional(),
  requestedAt: z.string().optional(),
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export const publicationSummarySchema = z.object({
  preview: z
    .object({
      metadata: z
        .object({
          title: z.string(),
          subject: z.string(),
          exam_type: z.string(),
          classroom: z.string(),
          academic_year: z.number().int(),
          term: z.number().int(),
        })
        .nullable(),
      confirmedCount: z.number().int().nonnegative(),
      reviewCount: z.number().int().nonnegative(),
      identityIssueCount: z.number().int().nonnegative(),
      identityIssues: z.array(
        z.object({
          originalCode: z
            .string()
            .regex(/^[0-9]{5}$/)
            .nullable(),
          currentCode: z
            .string()
            .regex(/^[0-9]{5}$/)
            .nullable(),
        }),
      ),
      blocked: z.string().nullable(),
      fingerprint: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .nullable(),
    })
    .nullish(),
  recoveryRequired: z.boolean().default(false),
  termClosed: z.boolean().default(false),
  canWithdraw: z.boolean().default(false),
  canRetryWithdrawal: z.boolean().default(false),
  withdrawalBlocked: z.boolean().default(false),
  state: z.enum(["draft", "active", "withdraw_pending", "withdrawn", "error"]),
  revision: z.number().int().min(0),
  confirmed: z.number().int().min(0),
  pending: z.number().int().min(0),
  delivered: z.number().int().min(0),
  unmatched: z.array(z.string().regex(/^[0-9]{5}$/)),
  invalid: z.array(z.string().regex(/^[0-9]{5}$/)),
  lastError: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
});
const signedPairingAvailabilitySchema = z.enum([
  "ready",
  "closed",
  "unavailable",
  "google_required",
]);
export type SignedPairingAvailability = z.infer<
  typeof signedPairingAvailabilitySchema
>;
export const integrationOverviewSchema = z.object({
  enabled: z.boolean(),
  receiverReady: z.boolean(),
  readOnly: z.boolean(),
  signedPairing: z
    .object({
      destinationLabel: z.string(),
      workspaceLabel: z.string(),
      availability: signedPairingAvailabilitySchema,
    })
    .nullish(),
  connection: integrationConnectionSchema.nullable(),
  publication: publicationSummarySchema.nullable(),
});
export type IntegrationOverview = z.infer<typeof integrationOverviewSchema>;
export const pairingInputSchema = z.strictObject({
  method: z.literal("signed"),
  requestId: z.uuid(),
  consent: z.literal(true),
});
const expectedRequestId = z.uuid().optional();
export const connectionCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("refresh"), expectedRequestId }),
  z.strictObject({
    action: z.literal("mode"),
    mode: integrationModeSchema,
    enabled: z.boolean(),
    consent: z.literal(true),
  }),
  z.strictObject({
    action: z.literal("revoke"),
    consent: z.literal(true),
    expectedRequestId,
  }),
  z.strictObject({
    action: z.literal("recover"),
    consent: z.literal(true),
    expectedRequestId,
  }),
]);
const publicationRequest = {
  requestId: z.uuid(),
  consent: z.literal(true),
};
export const publicationCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({
    ...publicationRequest,
    action: z.literal("publish"),
    previewFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({ ...publicationRequest, action: z.literal("withdraw") }),
  z.strictObject({ ...publicationRequest, action: z.literal("retry") }),
]);
