import sharp from "sharp";
import QRCode from "qrcode";
import {
  defaultLayout,
  compileOmrTemplate,
  resolveGeometry,
  type SheetLayout,
} from "../lib/omr/generate-template";
import { createSetIdentity } from "../lib/omr/qr";
import type { LockedScanTemplate } from "../types/scan";

/** Synthetic pixels only: no real students or production data. */
export async function captureFixture(
  overrides: Partial<SheetLayout> = {},
  code = "02074",
) {
  const layout = {
    ...defaultLayout,
    examId: "20000000-0000-4000-8000-000000000022",
    ...overrides,
  };
  const geometry = resolveGeometry(layout),
    omr = compileOmrTemplate(layout);
  const identity = await createSetIdentity(layout);
  const template: LockedScanTemplate = {
    id: crypto.randomUUID(),
    exam_id: layout.examId,
    exam_version_id: crypto.randomUUID(),
    set_token: identity.token,
    layout_json: layout,
    omr_json: omr,
  };
  const qr = await QRCode.toDataURL(identity.token, { width: 300, margin: 4 });
  const circles = [
    ...omr.centersMm.id.map(
      (b) =>
        `<circle cx="${b.x}" cy="${b.y}" r="1.8" fill="${code[b.digit] === String(b.value) ? "black" : "white"}" stroke="black" stroke-width=".15"/>`,
    ),
    ...omr.centersMm.answers.map(
      (b) =>
        `<circle cx="${b.x}" cy="${b.y}" r="1.8" fill="${b.option === 0 ? "black" : "white"}" stroke="black" stroke-width=".15"/>`,
    ),
  ].join("");
  const mmWidth = layout.paperMode === "full" ? 297 : 148.5;
  const pxWidth = layout.paperMode === "full" ? 1800 : 900;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pxWidth}" height="1273" viewBox="0 0 ${mmWidth} 210"><rect width="${mmWidth}" height="210" fill="white"/>${geometry.markers.map((m) => `<rect x="${m.x}" y="${m.y}" width="3" height="3"/>`).join("")}<image href="${qr}" x="${geometry.qr.x}" y="${geometry.qr.y}" width="${geometry.qr.width}" height="${geometry.qr.width}"/>${circles}</svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  return { image, template };
}
