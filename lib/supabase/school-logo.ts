import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./api";
import type { SchoolBranding } from "@/types/school";
export const LOGO_BUCKET = "school-logos";
export async function readBranding(db: SupabaseClient, schoolId: string, readOnly = false): Promise<SchoolBranding> {
  const { data, error } = await db.from("schools")
    .select("name_th,logo_image_url,logo_image_public_id,logo_revision,settings")
    .eq("id", schoolId).single();
  if (error) throw new ApiError("SETTINGS_SETUP_REQUIRED", "กรุณาติดตั้งชุด SQL บัญชีและ Storage ก่อน", 503);
  let imageUrl = data.logo_image_url;
  if (data.logo_image_public_id?.startsWith(`${schoolId}/`)) {
    const signed = await db.storage.from(LOGO_BUCKET).createSignedUrl(data.logo_image_public_id, 600);
    if (signed.error) throw new ApiError("LOGO_READ_FAILED", "เปิดโลโก้ไม่สำเร็จ กรุณาลองโหลดใหม่", 503);
    imageUrl = signed.data.signedUrl;
  }
  const cleanup = readOnly ? null : await db.from("logo_cleanup_jobs").select("id", { count: "exact", head: true }).eq("school_id", schoolId);
  return { school: data.name_th, image_url: imageUrl, image_public_id: data.logo_image_public_id,
    revision: data.logo_revision, settings: data.settings, canUpload: !readOnly, cleanupPending: cleanup?.count ?? 0 };
}
export async function cleanupOldLogos(db: SupabaseClient, schoolId: string): Promise<boolean> {
  const jobs = await db.from("logo_cleanup_jobs").select("id,object_path").eq("school_id", schoolId);
  if (jobs.error) return false;
  let complete = true;
  for (const job of jobs.data) {
    const current = await db.from("schools").select("logo_image_public_id").eq("id", schoolId).single();
    if (current.error || !job.object_path.startsWith(`${schoolId}/`) || current.data.logo_image_public_id === job.object_path) {
      complete = false; continue;
    }
    const removed = await db.storage.from(LOGO_BUCKET).remove([job.object_path]);
    if (removed.error) { complete = false; continue; }
    // A 200 from Storage can still be a no-op (for example after suspension).
    // The RPC verifies the object is absent before retiring the durable job.
    const done = await db.rpc("complete_logo_cleanup", {
      input: { school_id: schoolId, job_id: job.id },
    });
    if (done.error) complete = false;
  }
  return complete;
}
