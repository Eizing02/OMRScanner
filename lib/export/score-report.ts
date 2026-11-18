import type { ScoreExportRow, ScoreReportDetails } from "@/types/export";

export const scoreSummaryColumns = [
  { title: "เลขที่", width: 7, numeric: true },
  { title: "รหัส", width: 13, numeric: false },
  { title: "ชื่อ-สกุล", width: 38, numeric: false },
  { title: "ชั้น/ห้อง", width: 14, numeric: false },
  { title: "คะแนน", width: 15, numeric: true },
  { title: "ผล", width: 13, numeric: false },
] as const;

export function scoreSummaryCells(row: ScoreExportRow) {
  return [
    row.เลขที่,
    row.รหัสนักเรียน,
    row["ชื่อ-สกุล"],
    row["ชั้น/ห้อง"],
    `${row.คะแนนที่ได้} / ${row.คะแนนเต็ม}`,
    row["ผ่าน/ไม่ผ่าน"],
  ].map((value) => String(value ?? ""));
}

export function scoreReportContext(report: ScoreReportDetails) {
  return `วิชา${report.subject} · ${report.classroom} · ภาคเรียนที่ ${report.term} / ${report.year}`;
}
