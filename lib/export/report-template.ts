import { jsPDF } from "jspdf";
import type { ScoreExportRow, ScoreReportDetails } from "@/types/export";
import {
  scoreReportContext,
  scoreSummaryCells,
  scoreSummaryColumns,
} from "./score-report";

export async function buildScoreReportPdf(
  rows: ScoreExportRow[],
  report: ScoreReportDetails,
  individual = false,
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const response = await fetch("/omr-assets/NotoSansThai-Regular.ttf");
  if (!response.ok) throw new Error("โหลดฟอนต์ PDF ไม่สำเร็จ");
  let binary = "";
  for (const byte of new Uint8Array(await response.arrayBuffer()))
    binary += String.fromCharCode(byte);
  doc.addFileToVFS("Thai.ttf", btoa(binary));
  doc.addFont("Thai.ttf", "Thai", "normal");
  doc.setFont("Thai");
  let page = 1,
    y = 0;
  const margin = 16;
  const width = 178;
  const reportDate = new Date().toLocaleDateString("th-TH");
  function heading() {
    y = 20;
    const line = (text: string, size: number, spacing: number) => {
      doc.setFontSize(size);
      const lines: string[] = doc.splitTextToSize(text, width);
      doc.text(lines, 105, y, { align: "center" });
      y += lines.length * spacing;
    };
    line(report.school, 11, 6);
    line(individual ? "รายงานผลรายบุคคล" : "รายงานผลสอบ", 17, 8);
    line(report.title, 12, 6);
    line(scoreReportContext(report), 10, 5);
    if (!individual) line(`ยืนยันแล้ว ${rows.length} คน`, 10, 5);
    y += 5;
  }
  function footer() {
    doc.setFontSize(8);
    doc.text(`หน้า ${page} · ${reportDate}`, 194, 286, { align: "right" });
  }
  function next() {
    footer();
    doc.addPage();
    page++;
    heading();
  }
  heading();
  if (individual) {
    const row = rows[0];
    if (!row) throw new Error("ไม่พบคะแนน");
    doc.setFontSize(11);
    const name = doc.splitTextToSize(`ชื่อ-สกุล ${row["ชื่อ-สกุล"]}`, 178);
    doc.text(name, 16, y);
    y += name.length * 6;
    doc.text(`รหัส ${row["รหัสนักเรียน"]}   ชั้น ${row["ชั้น/ห้อง"]}`, 16, y);
    y += 8;
    doc.text(
      `คะแนน ${row["คะแนนที่ได้"]} / ${row["คะแนนเต็ม"]}   ${row["เปอร์เซ็นต์"]}%   ${row["ผ่าน/ไม่ผ่าน"]}`,
      16,
      y,
    );
    y += 10;
    for (let q = 1; q <= Number(row["จำนวนข้อ"]); q++) {
      if (y > 270) next();
      doc.setFontSize(10);
      doc.text(
        `ข้อ ${q}     คำตอบ ${row[`คำตอบข้อ ${q}`] || "ไม่ตอบ"}     คะแนน ${row[`คะแนนข้อ ${q}`]}`,
        16,
        y,
      );
      y += 6;
    }
  } else {
    const columnWidths = scoreSummaryColumns.map(
      (column) => (column.width / 100) * width,
    );
    const drawRow = (cells: string[][], height: number, header = false) => {
      if (header) {
        doc.setFillColor(244, 246, 248);
        doc.rect(margin, y, width, height, "F");
      }
      let x = margin;
      for (const [index, lines] of cells.entries()) {
        const alignedRight = scoreSummaryColumns[index].numeric;
        const anchor = alignedRight ? x + columnWidths[index] - 2 : x + 2;
        doc.text(lines, anchor, y + 4.5, {
          align: alignedRight ? "right" : "left",
        });
        x += columnWidths[index];
      }
      y += height;
      doc.setDrawColor(220);
      doc.line(margin, y, margin + width, y);
    };
    const lineHeight = 4;
    const header = () => {
      doc.setFontSize(9);
      drawRow(
        scoreSummaryColumns.map(({ title }) => [title]),
        8,
        true,
      );
    };
    header();
    for (const row of rows) {
      doc.setFontSize(9);
      const cells = scoreSummaryCells(row).map(
        (value, index) =>
          doc.splitTextToSize(value, columnWidths[index] - 4) as string[],
      );
      const height = Math.max(
        8,
        Math.max(...cells.map((lines) => lines.length)) * lineHeight + 4,
      );
      if (y + height > 273) {
        next();
        header();
      }
      drawRow(cells, height);
    }
  }
  footer();
  return doc.output("blob");
}
