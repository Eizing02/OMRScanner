import jsQR from "jsqr";
import { setTokenSchema } from "@/types/scan";
import type { LockedScanTemplate } from "@/types/scan";
import { resolveGeometry } from "./generate-template";

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
  return readSetQrDetails(image)?.token ?? null;
}
export function readSetQrDetails(image: Raster) {
  const result = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "attemptBoth",
  });
  const parsed = setTokenSchema.safeParse(result?.data);
  return parsed.success && result
    ? { token: parsed.data, location: result.location }
    : null;
}
export type SetQrRead = NonNullable<ReturnType<typeof readSetQrDetails>>;

/** Rectified orientation is part of optical safety: symmetric corner marks cannot prove it. */
export function qrAlignmentError(
  image: Raster,
  template: LockedScanTemplate,
  qr: SetQrRead,
) {
  const {
    topLeftCorner: a,
    topRightCorner: b,
    bottomRightCorner: c,
    bottomLeftCorner: d,
  } = qr.location;
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (Math.abs(angle) > 0.25)
    return "หมุนกระดาษให้หัวอยู่ด้านบน แล้วปรับมุมใหม่";
  const geometry = resolveGeometry(template.layout_json);
  const expected = geometry.qr;
  const scale = image.width / geometry.sheetWidth;
  const cx = (a.x + b.x + c.x + d.x) / 4 / scale;
  const cy =
    (a.y + b.y + c.y + d.y) / 4 / (image.height / geometry.sheetHeight);
  if (
    Math.abs(cx - (expected.x + expected.width / 2)) > 4 ||
    Math.abs(cy - (expected.y + expected.width / 2)) > 4
  )
    return "ตำแหน่ง QR ไม่ตรงแม่แบบ เลือกขนาดกระดาษและปรับมุมใหม่";
  return null;
}
/** Decode the locked QR ROI first, with full-leaf fallback. Never accept the cached live QR as evidence. */
export function readLockedQr(
  image: Raster,
  template: LockedScanTemplate,
): SetQrRead | null {
  const geometry = resolveGeometry(template.layout_json),
    qr = geometry.qr;
  const sx = image.width / geometry.sheetWidth,
    sy = image.height / geometry.sheetHeight;
  const x = Math.max(0, Math.floor((qr.x - 4) * sx)),
    y = Math.max(0, Math.floor((qr.y - 4) * sy));
  const w = Math.min(image.width - x, Math.ceil((qr.width + 8) * sx)),
    h = Math.min(image.height - y, Math.ceil((qr.width + 8) * sy));
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++)
    pixels.set(
      image.data.subarray(
        ((row + y) * image.width + x) * 4,
        ((row + y) * image.width + x + w) * 4,
      ),
      row * w * 4,
    );
  const found = readSetQrDetails({ width: w, height: h, data: pixels });
  if (!found) return readSetQrDetails(image);
  const location = Object.fromEntries(
    Object.entries(found.location).map(([name, p]) => [
      name,
      { x: p.x + x, y: p.y + y },
    ]),
  ) as SetQrRead["location"];
  return { token: found.token, location };
}
export function readPageQrs(image: Raster) {
  const whole = readSetQr(image);
  const half = Math.floor(image.width / 2);
  const left = readSetQr(rasterRegion(image, 0, half));
  const right = readSetQr(rasterRegion(image, half, image.width - half));
  return { whole, left, right };
}
