import { jsPDF } from "jspdf";
import {
  answerBubbles,
  resolveGeometry,
  idBubbles,
  printTexts,
  mmToPt,
  validateLayout,
  printStudentErrors,
  resolvePrintLayout,
  modernPrint,
  fillExamples,
  type SheetLayout,
} from "@/lib/omr/generate-template";
import { createSetIdentity, qrDataUrl } from "@/lib/omr/qr";
import { thaiChoices } from "@/types/exam";
import { printableLogo } from "@/lib/omr/logo-image";
import type { PrintManifest, PrintStudent } from "@/types/print";

export async function buildPrintPdf(
  inputLayout: SheetLayout,
  rosterOrCount: number | PrintStudent[],
  registeredManifest?: PrintManifest,
) {
  const students = typeof rosterOrCount === "number" ? [] : rosterOrCount;
  const count =
    typeof rosterOrCount === "number" ? rosterOrCount : students.length;
  const layout = resolvePrintLayout(inputLayout, students);
  const issues = validateLayout(layout);
  issues.errors.push(...printStudentErrors(layout, students));
  if (issues.errors.length) throw new Error(issues.errors.join("; "));
  if (!Number.isInteger(count) || count < 1 || count > 200)
    throw new Error("จำนวนใบต้องอยู่ระหว่าง 1–200");
  const identity = await createSetIdentity(layout);
  const g = resolveGeometry(layout);
  if (
    registeredManifest &&
    (registeredManifest.setToken !== identity.token ||
      registeredManifest.layoutHash !== identity.layoutHash ||
      registeredManifest.sheets.length !== count ||
      registeredManifest.sheets.some(
        (sheet, index) =>
          sheet.studentId !== (students[index]?.id ?? null) ||
          sheet.studentCode !== (students[index]?.student_code ?? null) ||
          sheet.page !== Math.floor(index / g.sheetsPerPage) + 1 ||
          sheet.slot !== index % g.sheetsPerPage,
      ))
  )
    throw new Error("ข้อมูลชุดพิมพ์ไม่ตรงกับทะเบียน กรุณาสร้างชุดพิมพ์ใหม่");
  const fontResponse = await fetch("/omr-assets/NotoSansThai-Regular.ttf");
  if (!fontResponse.ok)
    throw new Error("ไม่พบฟอนต์สำหรับ PDF กรุณาตรวจไฟล์ฟอนต์");
  const bytes = new Uint8Array(await fontResponse.arrayBuffer());
  let fontBinary = "";
  for (const byte of bytes) fontBinary += String.fromCharCode(byte);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.addFileToVFS("Thai.ttf", btoa(fontBinary));
  doc.addFont("Thai.ttf", "Thai", "normal");
  if (modernPrint(layout)) {
    const response = await fetch("/omr-assets/NotoSansThai-Bold.ttf");
    if (!response.ok) throw new Error("โหลดฟอนต์ตัวหนาไม่สำเร็จ กรุณาลองใหม่");
    const bold = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bold) binary += String.fromCharCode(byte);
    doc.addFileToVFS("Thai-Bold.ttf", btoa(binary));
    doc.addFont("Thai-Bold.ttf", "Thai", "bold");
  }
  doc.setFont("Thai");
  const qr = await qrDataUrl(identity.token, modernPrint(layout) ? 512 : 256);
  const logo = layout.logo ? await printableLogo(layout.logo) : null;
  const sheets: PrintManifest["sheets"] = [];
  for (let index = 0; index < count; index++) {
    const student = students[index];
    const slot = index % g.sheetsPerPage;
    if (index > 0 && slot === 0) doc.addPage("a4", "landscape");
    const offset = slot * g.sheetWidth;
    const text = (
      value: string,
      x: number,
      y: number,
      size: number,
      align: "left" | "center" = "left",
      weight: "normal" | "bold" = "normal",
    ) => {
      doc.setFont("Thai", weight);
      doc.setFontSize(mmToPt(size));
      doc.text(value, offset + x, y, { align });
    };
    doc.setDrawColor(0);
    doc.setTextColor(0);
    doc.setFillColor(0, 0, 0);
    doc.setLineWidth(0.2);
    g.markers.forEach((m) => doc.rect(offset + m.x, m.y, 3, 3, "F"));
    if (logo) {
      const dimensions = logo;
      const scale = Math.min(
        g.logo.width / dimensions.width,
        g.logo.height / dimensions.height,
      );
      const w = dimensions.width * scale,
        h = dimensions.height * scale;
      doc.addImage(
        logo.dataUrl,
        "PNG",
        offset + g.logo.x + (g.logo.width - w) / 2,
        g.logo.y + (g.logo.height - h) / 2,
        w,
        h,
      );
    }
    doc.rect(offset + g.score.x, g.score.y, g.score.width, g.score.height);
    doc.addImage(qr, "PNG", offset + g.qr.x, g.qr.y, g.qr.width, g.qr.width);
    printTexts(layout, g, student).forEach((t) =>
      text(t.value, t.x, t.y, t.size, t.align, t.weight),
    );
    if (modernPrint(layout))
      for (const example of fillExamples(g)) {
        doc.circle(
          offset + example.x,
          example.y,
          example.kind === "outside" ? 2.5 : 1.8,
          example.kind === "partial" ? "S" : "F",
        );
        if (example.kind === "partial")
          doc.circle(offset + example.x - 0.4, example.y, 0.8, "F");
        if (example.kind === "outside") {
          doc.setDrawColor(255);
          doc.circle(offset + example.x, example.y, 1.8);
          doc.setDrawColor(0);
        }
        if (example.kind === "multiple")
          doc.circle(offset + example.x + 5.5, example.y, 1.8, "F");
        text(
          `${example.kind === "correct" ? "ถูก" : "ผิด"} · ${example.label}`,
          example.labelX,
          example.y + 0.9,
          2.5,
        );
      }
    for (let digit = 0; digit < 5; digit++) {
      doc.rect(offset + g.idStart.x + digit * g.idStepX - 2, 75, 4, 4);
      if (student)
        text(
          student.student_code[digit],
          g.idStart.x + digit * g.idStepX,
          78,
          2.6,
          "center",
        );
    }
    idBubbles(g).forEach((b) => {
      const filled = student?.student_code[b.digit] === String(b.value);
      // Solid black, without a white number breaking the filled OMR area.
      doc.circle(offset + b.x, b.y, g.bubbleRadius, filled ? "F" : "S");
      if (!filled) text(String(b.value), b.x, b.y + 0.85, 2.2, "center");
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
      studentId: student?.id ?? null,
      studentCode: student?.student_code ?? null,
      page: Math.floor(index / g.sheetsPerPage) + 1,
      slot,
    });
  }
  return {
    pdf: doc,
    manifest:
      registeredManifest ??
      ({
        schemaVersion: 3,
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
      } satisfies PrintManifest),
  };
}
