import {
  AlignmentType,
  Document,
  Footer,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  convertMillimetersToTwip,
} from "docx";
import type { ScoreExportRow, ScoreReportDetails } from "@/types/export";
import {
  scoreReportContext,
  scoreSummaryCells,
  scoreSummaryColumns,
} from "./score-report";

export function buildScoreReportWord(
  rows: ScoreExportRow[],
  report: ScoreReportDetails,
) {
  const margin = convertMillimetersToTwip(16);
  const width = convertMillimetersToTwip(178);
  const columnWidths = scoreSummaryColumns.map((column) =>
    Math.round((column.width / 100) * width),
  );
  const centered = (text: string, size: number, bold = false) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text,
          size,
          sizeComplexScript: size,
          bold,
          boldComplexScript: bold,
        }),
      ],
    });
  const tableRow = (values: readonly string[], isHeader = false) =>
    new TableRow({
      cantSplit: true,
      tableHeader: isHeader,
      children: values.map(
        (text, index) =>
          new TableCell({
            width: { size: columnWidths[index], type: WidthType.DXA },
            ...(isHeader ? { shading: { fill: "F4F6F8" } } : {}),
            children: [
              new Paragraph({
                alignment: scoreSummaryColumns[index].numeric
                  ? AlignmentType.RIGHT
                  : AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text,
                    bold: isHeader,
                    boldComplexScript: isHeader,
                  }),
                ],
              }),
            ],
          }),
      ),
    });

  const document = new Document({
    title: report.title,
    subject: report.subject,
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: "Tahoma", hAnsi: "Tahoma", cs: "Tahoma" },
            size: 20,
            sizeComplexScript: 20,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: margin,
              bottom: margin,
              left: margin,
              right: margin,
            },
          },
        },
        children: [
          centered(report.school, 22),
          centered("รายงานผลสอบ", 32, true),
          centered(report.title, 24),
          centered(scoreReportContext(report), 20),
          centered(`ยืนยันแล้ว ${rows.length} คน`, 20),
          new Table({
            width: { size: width, type: WidthType.DXA },
            columnWidths,
            layout: TableLayoutType.FIXED,
            margins: { top: 80, bottom: 80, left: 90, right: 90 },
            rows: [
              tableRow(
                scoreSummaryColumns.map(({ title }) => title),
                true,
              ),
              ...rows.map((row) => tableRow(scoreSummaryCells(row))),
            ],
          }),
        ],
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ children: ["หน้า ", PageNumber.CURRENT] }),
                ],
              }),
            ],
          }),
        },
      },
    ],
  });
  return Packer.toBlob(document);
}
