import "server-only";
import { ApiError } from "@/lib/supabase/api";

/** Compatibility only. Cloudinary was cancelled by the product owner.
 * Keep the old module path; never transmit files or credentials to Cloudinary. */
export function cloudinaryConfigured() {
  return false;
}
export async function uploadOriginalLogo(
  file: Blob,
  schoolId: string,
): Promise<{ image_url: string; image_public_id: string }> {
  void file;
  void schoolId;
  throw new ApiError(
    "CLOUDINARY_DISABLED",
    "ใช้ Supabase Storage ผ่านระบบตั้งค่าโลโก้เท่านั้น",
    410,
  );
}
