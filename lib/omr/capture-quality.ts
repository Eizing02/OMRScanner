import { polygonArea, validQuad, type Quad } from "./camera-geometry";
import { fillPercentage } from "./detect-bubbles";
import {
  rasterRegion,
  readLockedQr,
  qrAlignmentError,
  type Raster,
} from "./scan-qr";
import type { LockedScanTemplate } from "@/types/scan";

/** Conservative capture gates, not an accuracy certification. Recalibrate
 * against physical paper/device images before changing these thresholds. */
export function captureGeometry(
  quad: Quad,
  width: number,
  height: number,
  single: boolean,
) {
  if (
    !validQuad(quad) ||
    quad.some((p) => p.x < 0.015 || p.y < 0.015 || p.x > 0.985 || p.y > 0.985)
  )
    return "ให้เห็นขอบกระดาษครบทั้ง 4 มุม";
  if (polygonArea(quad) < 0.28) return "ขยับกล้องให้ใกล้กระดาษขึ้น";
  const sides = quad.map((p, i) =>
    Math.hypot(
      (p.x - quad[(i + 1) % 4].x) * width,
      (p.y - quad[(i + 1) % 4].y) * height,
    ),
  );
  const ratio = (sides[0] + sides[2]) / (sides[1] + sides[3]);
  const expected = (single ? 148.5 : 297) / 210;
  if (
    Math.max(
      sides[0] / sides[2],
      sides[2] / sides[0],
      sides[1] / sides[3],
      sides[3] / sides[1],
    ) > 1.6 ||
    Math.abs(ratio / expected - 1) > 0.3
  )
    return "ถือกล้องให้ขนานกระดาษ และเลือกขนาดกระดาษให้ตรง";
  if (
    Math.min(sides[0], sides[2]) / (single ? 148.5 : 297) < 3.2 ||
    Math.min(sides[1], sides[3]) / 210 < 3.2
  )
    return "ขยับใกล้ขึ้น ภาพยังละเอียดไม่พอ";
  return null;
}

export function luminanceQuality(
  image: Raster,
  top = 0,
  bottom = image.height,
) {
  const gray = (x: number, y: number) => {
    const i = (y * image.width + x) * 4;
    return (
      image.data[i] * 0.2126 +
      image.data[i + 1] * 0.7152 +
      image.data[i + 2] * 0.0722
    );
  };
  let count = 0,
    light = 0,
    sum = 0,
    squares = 0,
    ink = 0;
  for (
    let y = Math.max(2, Math.floor(top));
    y < Math.min(image.height - 2, bottom);
    y += 3
  )
    for (let x = 2; x < image.width - 2; x += 3) {
      const value = gray(x, y);
      const laplacian =
        gray(x - 1, y) +
        gray(x + 1, y) +
        gray(x, y - 1) +
        gray(x, y + 1) -
        4 * value;
      light += value;
      sum += laplacian;
      squares += laplacian * laplacian;
      if (value < 155) ink++;
      count++;
    }
  return {
    brightness: count ? light / count : 0,
    sharpness: count ? squares / count - (sum / count) ** 2 : 0,
    ink: count ? ink / count : 0,
  };
}

export function assessPaperQuality(
  image: Raster,
  template: LockedScanTemplate,
  single: boolean,
) {
  const leaves =
    !single && template.layout_json.paperMode !== "full"
      ? [
          rasterRegion(image, 0, Math.floor(image.width / 2)),
          rasterRegion(
            image,
            Math.floor(image.width / 2),
            image.width - Math.floor(image.width / 2),
          ),
        ]
      : [image];
  let printed = 0;
  for (const leaf of leaves) {
    const quality = luminanceQuality(leaf);
    // Last odd two-up print may leave the other half entirely blank.
    if (leaves.length === 2 && quality.ink < 0.005) continue;
    printed++;
    if (quality.brightness < 145) return "เพิ่มแสงและหลีกเลี่ยงเงาบนกระดาษ";
    const qr = readLockedQr(leaf, template);
    if (qr?.token !== template.set_token)
      return "ให้ QR ชัด และหลีกเลี่ยงแสงสะท้อน";
    const alignment = qrAlignmentError(leaf, template, qr);
    if (alignment) return alignment;
    const mmWidth = template.layout_json.paperMode === "full" ? 297 : 148.5;
    const sx = leaf.width / mmWidth,
      sy = leaf.height / 210;
    for (const [x, y] of [
      [7.5, 7.5],
      [mmWidth - 7.5, 7.5],
      [7.5, 202.5],
      [mmWidth - 7.5, 202.5],
    ])
      if (fillPercentage(leaf, x * sx, y * sy, 0.65 * Math.min(sx, sy)) < 55)
        return "ให้เห็นจุดดำครบ หลีกเลี่ยงเงาและแสงสะท้อน";
    const answers = luminanceQuality(leaf, 70 * sy, 190 * sy);
    if (answers.sharpness < 35 || answers.ink < 0.002)
      return "ภาพคำตอบยังไม่ชัด ถือให้นิ่งหรือถ่ายใหม่";
  }
  return printed ? null : "ยังไม่พบกระดาษคำตอบ";
}

export function advanceCaptureStability(
  previous: number,
  movement: number,
  eligible: boolean,
) {
  return eligible && movement < 0.012 ? Math.min(5, previous + 1) : 0;
}
