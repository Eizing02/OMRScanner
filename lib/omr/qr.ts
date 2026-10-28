import QRCode from "qrcode";
import {
  compileOmrTemplate,
  layoutSchema,
  resolveGeometry,
  type SheetLayout,
} from "./generate-template";
export const createSheetToken = () => `SAS:${crypto.randomUUID()}`;
export async function createSetIdentity(layout: SheetLayout) {
  const parsed = layoutSchema.parse(layout);
  // A signed URL expires and the current school logo can change on reprint.
  // Neither is part of the answer geometry or the exam/key identity.
  const locked = {
    ...parsed,
    logo: null,
    paperMode:
      resolveGeometry(parsed).sheetsPerPage === 1
        ? ("full" as const)
        : ("auto" as const),
  };
  const snapshot = { layout: locked, omr: compileOmrTemplate(locked) };
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
export const qrDataUrl = (token: string, width = 256) =>
  QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 4, width });
