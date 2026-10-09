import "server-only";
import { createHash } from "node:crypto";
import { ApiError } from "@/lib/supabase/api";

export function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );
}
export async function uploadOriginalLogo(file: Blob, schoolId: string) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !apiKey || !secret || !/^[a-zA-Z0-9_-]+$/.test(cloud))
    throw new ApiError(
      "CLOUDINARY_NOT_CONFIGURED",
      "ยังไม่ได้ตั้งค่า Cloudinary ฝั่งเซิร์ฟเวอร์",
      503,
    );
  const publicId = `school-logos/${schoolId}/${crypto.randomUUID()}`;
  const params = {
    overwrite: "false",
    public_id: publicId,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const signature = createHash("sha1")
    .update(
      Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join("&") + secret,
    )
    .digest("hex");
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.set(key, value);
  form.set("file", file, "logo");
  form.set("api_key", apiKey);
  form.set("signature", signature);
  // No incoming resize, quality, format transformation or upload preset.
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud}/image/upload`,
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    },
  );
  const data = await response.json();
  if (
    !response.ok ||
    data.public_id !== publicId ||
    !Number.isInteger(data.version) ||
    !["png", "jpg", "jpeg"].includes(data.format)
  )
    throw new ApiError(
      "LOGO_UPLOAD_FAILED",
      "อัปโหลดภาพไม่สำเร็จ กรุณาลองใหม่",
      502,
    );
  return {
    image_public_id: publicId,
    image_url: `https://res.cloudinary.com/${cloud}/image/upload/fl_original/v${data.version}/${publicId}.${data.format}`,
  };
}
