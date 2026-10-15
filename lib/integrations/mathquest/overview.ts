import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { integrationFlags } from "./config";
import { integrationRpc } from "./publisher";
import { integrationOverviewSchema } from "@/types/integration";
export async function integrationOverview(
  db: SupabaseClient,
  schoolId: string,
  readOnly: boolean,
  examId?: string,
) {
  const flags = integrationFlags();
  const state =
    flags.enabled && !readOnly
      ? await integrationRpc(db, "get_mathquest_status", {
          school_id: schoolId,
          ...(examId ? { exam_id: examId } : {}),
        })
      : { connection: null, publication: null };
  return integrationOverviewSchema.parse({ ...flags, readOnly, ...state });
}
