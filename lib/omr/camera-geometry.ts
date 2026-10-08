export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];
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
