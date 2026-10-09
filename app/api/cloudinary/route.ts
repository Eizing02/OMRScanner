// Compatibility for older clients: school logos now use private Supabase Storage.
// Cloudinary helpers remain reserved for scanned OMR images, not school branding.
export { GET } from "../settings/route";
export { POST } from "../settings/logo/route";
// Next statically reads route configuration from this file, not re-exports.
export const runtime = "nodejs";
