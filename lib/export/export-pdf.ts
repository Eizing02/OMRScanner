import { jsPDF } from "jspdf";
import {
  answerBubbles,
  resolveGeometry,
  idBubbles,
  printTexts,
  mmToPt,
  validateLayout,
  type SheetLayout,
} from "@/lib/omr/generate-template";
import { createSetIdentity, qrDataUrl } from "@/lib/omr/qr";
import { thaiChoices } from "@/types/exam";

export async function buildPrintPdf(layout: SheetLayout, count: number) {
  const issues = validateLayout(layout);
  if (issues.errors.length) throw new Error(issues.errors.join("; "));
  if (!Number.isInteger(count) || count < 1 || count > 200)
    throw new Error("จำนวนใบต้องอยู่ระหว่าง 1–200");
  const identity = await createSetIdentity(layout);
  const g = resolveGeometry(layout);
  const fontResponse = await fetch("/omr-assets/NotoSansThai-Regular.ttf");
  if (!fontResponse.ok)
    throw new Error("ไม่พบฟอนต์สำหรับ PDF กรุณาตรวจไฟล์ฟอนต์");
  const bytes = new Uint8Array(await fontResponse.arrayBuffer());
  let fontBinary = "";
  for (const byte of bytes) fontBinary += String.fromCharCode(byte);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.addFileToVFS("Thai.ttf", btoa(fontBinary));
  doc.addFont("Thai.ttf", "Thai", "normal");
  doc.setFont("Thai");
  const qr = await qrDataUrl(identity.token);
  const sheets: {
    token: string;
    instanceId: string;
    page: number;
    slot: number;
  }[] = [];
  for (let index = 0; index < count; index++) {
    const slot = index % g.sheetsPerPage;
    if (index > 0 && slot === 0) doc.addPage("a4", "landscape");
    const offset = slot * g.sheetWidth;
    const text = (
      value: string,
      x: number,
      y: number,
      size: number,
      align: "left" | "center" = "left",
    ) => {
      doc.setFontSize(mmToPt(size));
      doc.text(value, offset + x, y, { align });
    };
    doc.setDrawColor(0);
    doc.setTextColor(0);
    doc.setFillColor(0, 0, 0);
    doc.setLineWidth(0.2);
    g.markers.forEach((m) => doc.rect(offset + m.x, m.y, 3, 3, "F"));
    if (layout.logo) {
      const dimensions = doc.getImageProperties(layout.logo);
      const scale = Math.min(
        g.logo.width / dimensions.width,
        g.logo.height / dimensions.height,
      );
      const w = dimensions.width * scale,
        h = dimensions.height * scale;
      doc.addImage(
        layout.logo,
        "PNG",
        offset + g.logo.x + (g.logo.width - w) / 2,
        g.logo.y + (g.logo.height - h) / 2,
        w,
        h,
      );
    }
    doc.rect(offset + g.score.x, g.score.y, g.score.width, g.score.height);
    doc.addImage(qr, "PNG", offset + g.qr.x, g.qr.y, g.qr.width, g.qr.width);
    printTexts(layout, g).forEach((t) =>
      text(t.value, t.x, t.y, t.size, t.align),
    );
    for (let digit = 0; digit < 5; digit++)
      doc.rect(offset + g.idStart.x + digit * g.idStepX - 2, 75, 4, 4);
    idBubbles(g).forEach((b) => {
      doc.circle(offset + b.x, b.y, g.bubbleRadius);
      text(String(b.value), b.x, b.y + 0.85, 2.2, "center");
    });
    answerBubbles(layout, g).forEach((b) => {
      doc.circle(offset + b.x, b.y, g.bubbleRadius);
      text(thaiChoices[b.option], b.x, b.y + 0.85, 2.2, "center");
      if (b.option === 0) text(String(b.question), b.x - 7, b.y + 1, 2.7);
    });
    if (g.sheetsPerPage === 2) {
      doc.setDrawColor(130);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(148.5, 0, 148.5, 210);
      doc.setLineDashPattern([], 0);
    }
    sheets.push({
      token: identity.token,
      instanceId: crypto.randomUUID(),
      page: Math.floor(index / g.sheetsPerPage) + 1,
      slot,
    });
  }
  return {
    pdf: doc,
    manifest: {
      schemaVersion: 2,
      experimental: true,
      qrScope: "exam-key-layout-version",
      examId: layout.examId,
      examVersion: layout.examVersion,
      setToken: identity.token,
      templateId: identity.templateId,
      layout: identity.snapshot.layout,
      layoutHash: identity.layoutHash,
      omr: identity.snapshot.omr,
      print: {
        paperWidthMm: 297,
        paperHeightMm: 210,
        sheetWidthMm: g.sheetWidth,
        sheetHeightMm: 210,
        sheetsPerPage: g.sheetsPerPage,
        pageCount: Math.ceil(count / g.sheetsPerPage),
        scalePercent: 100,
      },
      sheets,
      // TODO: Register the immutable manifest in the authorized template store before real scanning.
    },
  };
}
