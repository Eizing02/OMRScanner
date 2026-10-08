import QRCode from "qrcode";
import {
  compileOmrTemplate,
  layoutSchema,
  type SheetLayout,
} from "./generate-template";
export const createSheetToken = () => `SAS:${crypto.randomUUID()}`;
export async function createSetIdentity(layout: SheetLayout) {
  const parsed = layoutSchema.parse(layout);
  const snapshot = { layout: parsed, omr: compileOmrTemplate(parsed) };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(snapshot)),
  );
  const layoutHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return {
    token: `SAS2:${layoutHash}`,
    layoutHash,
    templateId: `g2-${layoutHash}`,
    snapshot,
  };
}
export const qrDataUrl = (token: string) =>
  QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 4, width: 256 });
