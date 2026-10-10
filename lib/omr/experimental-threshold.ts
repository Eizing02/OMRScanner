import { fillPercentage } from "./detect-bubbles";
import type { Raster } from "./scan-qr";

/** Benchmark-only candidate. NOT called by the production reader or grading API. */
export function experimentalLocalFill(
  image: Raster,
  x: number,
  y: number,
  radius: number,
) {
  const ring: number[] = [];
  for (
    let py = Math.floor(y - radius * 2.3);
    py <= Math.ceil(y + radius * 2.3);
    py++
  ) {
    for (
      let px = Math.floor(x - radius * 2.3);
      px <= Math.ceil(x + radius * 2.3);
      px++
    ) {
      const distance = Math.hypot(px - x, py - y);
      if (
        px < 0 ||
        py < 0 ||
        px >= image.width ||
        py >= image.height ||
        distance < radius * 1.6 ||
        distance > radius * 2.3
      )
        continue;
      const i = (py * image.width + px) * 4;
      ring.push(
        image.data[i] * 0.2126 +
          image.data[i + 1] * 0.7152 +
          image.data[i + 2] * 0.0722,
      );
    }
  }
  ring.sort((a, b) => a - b);
  const background = ring[Math.floor(ring.length / 2)] ?? 255;
  const threshold = Math.max(
    35,
    Math.min(190, background - Math.max(35, background * 0.28)),
  );
  return {
    background,
    threshold,
    fill: fillPercentage(image, x, y, radius, threshold),
  };
}
