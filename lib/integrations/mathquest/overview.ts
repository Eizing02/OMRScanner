import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { integrationFlags, signedPairingConfig } from "./config";
import { integrationRpc } from "./publisher";
import { integrationOverviewSchema } from "@/types/integration";
export async function integrationOverview(
  db: SupabaseClient,
  schoolId: string,
  readOnly: boolean,
  examId?: string,
  preview = false,
) {
  const flags = integrationFlags();
  const state =
    flags.enabled && !readOnly
      ? await integrationRpc(db, "get_mathquest_status", {
          school_id: schoolId,
          ...(examId ? { exam_id: examId } : {}),
          ...(preview ? { preview: true } : {}),
        })
      : { connection: null, publication: null };
  const signed =
    !examId && !readOnly && flags.enabled && flags.receiverReady
      ? signedPairingConfig()
      : null;
  const workspace = signed
    ? await db
        .from("schools")
        .select("name_th")
        .eq("id", schoolId)
        .maybeSingle()
    : null;
  return integrationOverviewSchema.parse({
    ...flags,
    readOnly,
    ...state,
    ...(signed && workspace?.data?.name_th
      ? {
          signedPairing: {
            destinationLabel: signed.label,
            workspaceLabel: workspace.data.name_th,
            availability: "unavailable",
          },
        }
      : {}),
  });
}
