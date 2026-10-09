import "server-only";
import sharp from "sharp";
import { ApiError } from "@/lib/supabase/api";
import type { Raster } from "./scan-qr";

export async function decodeScanImage(
  value: string,
): Promise<{ bytes: Uint8Array; raster: Raster }> {
  const raw = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
  if (raw.length > 2_000_000)
    throw new ApiError("IMAGE_TOO_LARGE", "ภาพใหญ่เกินไป กรุณาถ่ายใหม่", 413);
  try {
    const image = sharp(raw, { limitInputPixels: 25_000_000, failOn: "error" })
      .autoOrient()
      .flatten({ background: "white" });
    const metadata = await image.metadata();
    if (
      !["jpeg", "png"].includes(metadata.format ?? "") ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error("invalid image");
    const normalized = image.resize({
      width: 1800,
      height: 1800,
      fit: "inside",
      withoutEnlargement: true,
    });
    // Do not reduce geometry/resolution to force a size target. Optical reads
    // below are made from these exact retained JPEG bytes, never the source.
    let bytes = await normalized.clone().jpeg({ quality: 75 }).toBuffer();
    for (const quality of [70, 65, 60]) {
      if (bytes.length <= 300_000) break;
      bytes = await normalized.clone().jpeg({ quality }).toBuffer();
    }
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      bytes,
      raster: {
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(data),
      },
    };
  } catch {
    throw new ApiError(
      "INVALID_IMAGE",
      "อ่านไฟล์ภาพไม่ได้ เลือกภาพ JPG / PNG ใหม่",
      422,
    );
  }
}
