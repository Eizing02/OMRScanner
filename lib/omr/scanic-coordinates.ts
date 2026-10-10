import type { CornerPoints } from "scanic";
import { validQuad, type Quad } from "./camera-geometry";

/** Scanic returns INPUT image pixels, not its internally resized pixels. */
export function normalizedCorners(
  corners: CornerPoints | null,
  width: number,
  height: number,
): Quad | null {
  if (!corners || width <= 0 || height <= 0) return null;
  const quad = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ].map((p) => ({ x: p.x / width, y: p.y / height })) as Quad;
  return validQuad(quad) ? quad : null;
}
export function pixelCorners(
  quad: Quad,
  width: number,
  height: number,
): CornerPoints {
  if (!validQuad(quad)) throw new Error("มุมกระดาษไม่ถูกต้อง กรุณาปรับมุมใหม่");
  const [topLeft, topRight, bottomRight, bottomLeft] = quad.map((p) => ({
    x: p.x * width,
    y: p.y * height,
  }));
  return { topLeft, topRight, bottomRight, bottomLeft };
}
