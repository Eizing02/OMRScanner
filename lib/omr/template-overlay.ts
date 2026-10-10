import { resolveGeometry } from "./generate-template";
import { paperPoint, validQuad, type Quad } from "./camera-geometry";
import type { LockedScanTemplate } from "@/types/scan";

export function templateOverlay(
  template: LockedScanTemplate,
  quad: Quad,
  single: boolean,
) {
  if (!validQuad(quad)) return [];
  const g = resolveGeometry(template.layout_json);
  const leaves = single || g.sheetsPerPage === 1 ? 1 : 2;
  const paperWidth = g.sheetWidth * leaves;
  const bound = (points: { x: number; y: number }[], radius: number) => ({
    x: Math.min(...points.map((p) => p.x)) - radius,
    y: Math.min(...points.map((p) => p.y)) - radius,
    width:
      Math.max(...points.map((p) => p.x)) -
      Math.min(...points.map((p) => p.x)) +
      radius * 2,
    height:
      Math.max(...points.map((p) => p.y)) -
      Math.min(...points.map((p) => p.y)) +
      radius * 2,
  });
  const regions = [
    { name: "qr", ...g.qr, height: g.qr.width },
    {
      name: "student-code",
      ...bound(template.omr_json.centersMm.id, g.bubbleRadius + 1),
    },
    {
      name: "answers",
      ...bound(template.omr_json.centersMm.answers, g.bubbleRadius + 1),
    },
    ...g.markers.map((marker, i) => ({
      name: `marker-${i}`,
      ...marker,
      width: 3,
      height: 3,
    })),
  ];
  return Array.from({ length: leaves }, (_, leaf) =>
    regions.map((r) => {
      const x = r.x + leaf * g.sheetWidth;
      return {
        name: `${leaf}-${r.name}`,
        points: [
          [x, r.y],
          [x + r.width, r.y],
          [x + r.width, r.y + r.height],
          [x, r.y + r.height],
        ].map(([px, py]) =>
          paperPoint(quad, px / paperWidth, py / g.sheetHeight),
        ),
      };
    }),
  ).flat();
}
