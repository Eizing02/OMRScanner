import jsQR from "jsqr";
import { setTokenSchema } from "@/types/scan";

export type Raster = { width: number; height: number; data: Uint8ClampedArray };
export function rasterRegion(
  image: Raster,
  left: number,
  width: number,
): Raster {
  const x = Math.max(0, Math.floor(left)),
    w = Math.min(Math.floor(width), image.width - x);
  const data = new Uint8ClampedArray(w * image.height * 4);
  for (let y = 0; y < image.height; y++)
    data.set(
      image.data.subarray(
        (y * image.width + x) * 4,
        (y * image.width + x + w) * 4,
      ),
      y * w * 4,
    );
  return { width: w, height: image.height, data };
}
export function readSetQr(image: Raster): string | null {
  const result = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "attemptBoth",
  });
  const parsed = setTokenSchema.safeParse(result?.data);
  return parsed.success ? parsed.data : null;
}
export function readPageQrs(image: Raster) {
  const whole = readSetQr(image);
  const half = Math.floor(image.width / 2);
  const left = readSetQr(rasterRegion(image, 0, half));
  const right = readSetQr(rasterRegion(image, half, image.width - half));
  return { whole, left, right };
}
