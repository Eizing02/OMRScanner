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
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export const publicationSummarySchema = z.object({
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
export const integrationOverviewSchema = z.object({
  enabled: z.boolean(),
  receiverReady: z.boolean(),
  readOnly: z.boolean(),
  connection: integrationConnectionSchema.nullable(),
  publication: publicationSummarySchema.nullable(),
});
export type IntegrationOverview = z.infer<typeof integrationOverviewSchema>;
export const pairingInputSchema = z.strictObject({
  requestId: z.uuid(),
  code: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  consent: z.literal(true),
});
export const connectionCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("refresh") }),
  z.strictObject({
    action: z.literal("mode"),
    mode: integrationModeSchema,
    enabled: z.boolean(),
    consent: z.literal(true),
  }),
  z.strictObject({ action: z.literal("revoke"), consent: z.literal(true) }),
  z.strictObject({ action: z.literal("recover"), consent: z.literal(true) }),
]);
export const publicationCommandSchema = z.strictObject({
  action: z.enum(["publish", "withdraw", "retry"]),
  requestId: z.uuid(),
  consent: z.literal(true),
});
