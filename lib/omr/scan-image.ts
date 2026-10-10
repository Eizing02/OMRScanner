import "server-only";
import sharp from "sharp";
import { ApiError } from "@/lib/supabase/api";
import type { Raster } from "./scan-qr";

export async function decodeScanImage(
  value: string | Uint8Array,
): Promise<{ bytes: Uint8Array; raster: Raster; processingVersion: string }> {
  const binary = typeof value !== "string";
  const raw = binary
    ? Buffer.from(value)
    : Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
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
    const retain =
      binary &&
      metadata.format === "jpeg" &&
      Math.max(metadata.width ?? 0, metadata.height ?? 0) <= 1800 &&
      !metadata.exif &&
      !metadata.iptc &&
      !metadata.xmp &&
      !metadata.icc &&
      (!metadata.orientation || metadata.orientation === 1);
    let bytes = retain
      ? raw
      : await normalized
          .clone()
          .jpeg({ quality: binary ? 85 : 75 })
          .toBuffer();
    for (const quality of binary ? [] : [70, 65, 60]) {
      if (bytes.length <= 300_000) break;
      bytes = await normalized.clone().jpeg({ quality }).toBuffer();
    }
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      bytes,
      processingVersion: binary
        ? retain
          ? "binary-v2-retained"
          : "binary-v2-normalized"
        : "legacy-v1",
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
