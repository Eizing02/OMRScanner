import { validQuad, type Quad } from "./camera-geometry";
/** Manual-corner fallback when the optional OpenCV bundle cannot load.
 * Projective (not bilinear) mapping, with bilinear pixel interpolation. */
export function warpCanvas(
  source: HTMLCanvasElement,
  quad: Quad,
  single: boolean,
) {
  if (!validQuad(quad)) throw new Error("มุมกระดาษไขว้กัน กรุณาปรับใหม่");
  const [p0, p1, p2, p3] = quad.map((p) => ({
    x: p.x * source.width,
    y: p.y * source.height,
  }));
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(denominator) < 1e-8) throw new Error("มุมกระดาษไม่ถูกต้อง");
  const g = (dx3 * dy2 - dx2 * dy3) / denominator,
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = p1.x - p0.x + g * p1.x,
    b = p3.x - p0.x + h * p3.x,
    c = p0.x;
  const d = p1.y - p0.y + g * p1.y,
    e = p3.y - p0.y + h * p3.y,
    f = p0.y;
  const width = single ? 900 : 1800,
    height = Math.round(width * (single ? 210 / 148.5 : 210 / 297));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d"),
    input = source
      .getContext("2d")
      ?.getImageData(0, 0, source.width, source.height);
  if (!context || !input) throw new Error("อ่านภาพไม่ได้");
  const output = context.createImageData(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1),
        v = y / (height - 1),
        w = g * u + h * v + 1;
      const sx = Math.max(
        0,
        Math.min(source.width - 1, (a * u + b * v + c) / w),
      );
      const sy = Math.max(
        0,
        Math.min(source.height - 1, (d * u + e * v + f) / w),
      );
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        x1 = Math.min(x0 + 1, source.width - 1),
        y1 = Math.min(y0 + 1, source.height - 1),
        fx = sx - x0,
        fy = sy - y0;
      const positions = [
        (y0 * source.width + x0) * 4,
        (y0 * source.width + x1) * 4,
        (y1 * source.width + x0) * 4,
        (y1 * source.width + x1) * 4,
      ];
      const weights = [
          (1 - fx) * (1 - fy),
          fx * (1 - fy),
          (1 - fx) * fy,
          fx * fy,
        ],
        i = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++)
        output.data[i + ch] = positions.reduce(
          (sum, pos, k) => sum + input.data[pos + ch] * weights[k],
          0,
        );
      output.data[i + 3] = 255;
    }
  context.putImageData(output, 0, 0);
  return canvas;
}
