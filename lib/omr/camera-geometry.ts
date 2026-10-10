export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];
/** Display smoothing only. Capture/stability always use the unsmoothed corners. */
export function smoothQuad(previous: Quad, current: Quad, weight = 0.55): Quad {
  return current.map((p, i) => ({
    x: previous[i].x + (p.x - previous[i].x) * weight,
    y: previous[i].y + (p.y - previous[i].y) * weight,
  })) as Quad;
}
export function polygonArea(quad: Quad) {
  return (
    Math.abs(
      quad.reduce(
        (sum, p, i) =>
          sum + p.x * quad[(i + 1) % 4].y - p.y * quad[(i + 1) % 4].x,
        0,
      ),
    ) / 2
  );
}
export function validQuad(quad: Quad) {
  if (
    quad.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1,
    )
  )
    return false;
  const cross = quad.map((p, i) => {
    const a = quad[(i + 1) % 4],
      b = quad[(i + 2) % 4];
    return (a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x);
  });
  return polygonArea(quad) > 0.04 && cross.every((c) => c > 0);
}
export function motionDistance(a: Quad, b: Quad) {
  return Math.max(
    ...a.map((point, i) => Math.hypot(point.x - b[i].x, point.y - b[i].y)),
  );
}
export const defaultQuad: Quad = [
  { x: 0.12, y: 0.14 },
  { x: 0.88, y: 0.14 },
  { x: 0.88, y: 0.86 },
  { x: 0.12, y: 0.86 },
];
/** Forward homography from rectified paper (0..1) into the displayed camera quad. */
export function paperPoint(quad: Quad, u: number, v: number): Point {
  const [a, b, c, d] = quad;
  const dx1 = b.x - c.x,
    dx2 = d.x - c.x,
    dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y,
    dy2 = d.y - c.y,
    dy3 = a.y - b.y + c.y - d.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 1e-8) throw new Error("INVALID_QUAD");
  const g = (dx3 * dy2 - dx2 * dy3) / determinant,
    h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const w = g * u + h * v + 1;
  return {
    x: ((b.x - a.x + g * b.x) * u + (d.x - a.x + h * d.x) * v + a.x) / w,
    y: ((b.y - a.y + g * b.y) * u + (d.y - a.y + h * d.y) * v + a.y) / w,
  };
}
