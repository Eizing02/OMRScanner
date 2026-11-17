import { choices, thaiChoices } from "@/types/exam";
import type { PrintStudent } from "@/types/print";
import {
  measurePrintText,
  wrapMeasuredText,
  type PrintText,
  type SheetGeometry,
  type SheetLayout,
} from "./generate-template";

const answerTop = 120;
const tableTop = 109;
const headerBottom = 117.3;
const tabLeft = 11.5;
const limitPerColumn = 16;

export function schoolGridPrint(layout: Pick<SheetLayout, "printStyle">) {
  return (
    layout.printStyle === "school-grid" ||
    layout.printStyle === "school-grid-portrait"
  );
}

export const isPortraitA4Template = (
  layout: Pick<SheetLayout, "printStyle" | "paperMode">,
) =>
  layout.printStyle === "school-grid-portrait" && layout.paperMode === "full";

export function gridPaper(width: number, layout: SheetLayout) {
  const half = width === 148.5;
  const portrait = width === 210;
  const height = portrait ? 297 : 210;
  const maxRows = portrait ? 20 : limitPerColumn;
  const columns = Math.ceil(layout.questionCount / maxRows);
  const rows = Math.ceil(layout.questionCount / columns);
  const answerStepX = half ? 5.5 : 9.5;
  const columnWidth = Math.min((width - 23) / columns, half ? 64 : 68.5);
  const left = (width - columnWidth * columns) / 2;
  const firstOption =
    (columnWidth + 8.7 - (layout.choiceCount - 1) * answerStepX) / 2;
  return {
    paperWidth: portrait ? 210 : 297,
    paperHeight: height,
    sheetWidth: width,
    sheetHeight: height,
    sheetsPerPage: half ? 2 : 1,
    columns,
    rows,
    maxRows,
    fits: columns <= (half ? 3 : 4),
    bubbleRadius: 1.8,
    answerStepX,
    answerStepY: portrait ? 7.5 : 5,
    answerColumnWidth: columnWidth,
    answerStart: { x: left + firstOption, y: answerTop },
    idStart: { x: 14.8, y: 44.8 },
    idStepX: 6.6,
    idStepY: 5.5,
    qr: { x: width - 39, y: 33, width: 28 },
    score: { x: width - 39.7, y: 11.3, width: 28.7, height: 13.7 },
    logo: { x: 11.5, y: 10, width: 16.5, height: 17.4 },
    markers: [
      { x: 6, y: 6 },
      { x: width - 9, y: 6 },
      { x: 6, y: height - 9 },
      { x: width - 9, y: height - 9 },
    ],
    heading: { x: 31.6, width: width - 74 },
  };
}

const schoolName = (layout: SheetLayout) =>
  layout.school.replace(/\s*\n\s*/g, " ");
function linesFit(
  value: string,
  width: number,
  size: number,
  count: number,
  bold = true,
) {
  const lines = wrapMeasuredText(value, width, size, bold);
  return (
    lines.length <= count &&
    lines.every((line) => measurePrintText(line, size, bold) <= width)
  );
}

export function gridTextFits(layout: SheetLayout, g: SheetGeometry) {
  const infoWidth = g.qr.x - 6 - 65;
  return (
    measurePrintText(schoolName(layout), 3.1, true) <= g.heading.width &&
    linesFit(layout.title, g.heading.width, 4.45, 2) &&
    linesFit(layout.subject, infoWidth, 3, 2) &&
    linesFit(layout.examType, infoWidth, 3, 2) &&
    linesFit(layout.instructions, g.sheetWidth - 23, 2.4, 1, true)
  );
}

function classValues(classroom: string) {
  const [grade, room] = classroom.split("/");
  return { grade, room };
}

export function gridStudentFits(g: SheetGeometry, student: PrintStudent) {
  const { grade, room } = classValues(student.classroom_name);
  return (
    linesFit(student.full_name, g.sheetWidth - 78, 3.05, 2) &&
    (!grade || measurePrintText(grade, 3, true) <= 20) &&
    (!room || measurePrintText(room, 3, true) <= 9) &&
    (student.number == null ||
      measurePrintText(String(student.number), 3, true) <= 18)
  );
}

export function gridPrintTexts(
  layout: SheetLayout,
  g: SheetGeometry,
  student?: PrintStudent,
): PrintText[] {
  const right = g.sheetWidth - 11.5;
  const infoEnd = g.qr.x - 6;
  const headerShift = layout.headerOffsetMm * 0.5;
  const school = schoolName(layout);
  const schoolSize = Math.max(
    3.1,
    Math.min(
      3.7,
      g.heading.width / Math.max(1, measurePrintText(school, 1, true)),
    ),
  );
  const bold = "bold" as const;
  const centered = "center" as const;
  const texts: PrintText[] = [];
  function addLines(
    value: string,
    x: number,
    y: number,
    width: number,
    size: number,
    pitch = 4.3,
  ) {
    texts.push(
      ...wrapMeasuredText(value, width, size, true).map((part, i) => ({
        value: part,
        x,
        y: y + pitch * i,
        size,
        weight: bold,
      })),
    );
  }
  function field(
    label: string,
    value: string,
    lx: number,
    vx: number,
    end: number,
    y: number,
    size = 3,
  ) {
    texts.push({ value: label, x: lx, y, size: 2.6 });
    addLines(value, vx, y, end - vx, size);
  }
  texts.push(
    { value: "กระดาษคำตอบ", x: g.heading.x, y: 11.8 + headerShift, size: 2.35 },
    {
      value: school,
      x: g.heading.x,
      y: 17.1 + headerShift,
      size: schoolSize,
      weight: bold,
    },
    {
      value: `/ ${layout.totalScore}`,
      x: right - 2.2,
      y: 20.2,
      size: 3,
      align: "right",
    },
    {
      value: "รหัสนักเรียน",
      x: 28,
      y: 35.9,
      size: 2.65,
      weight: bold,
      align: centered,
    },
    { value: "QR ชุดสอบ", x: g.qr.x + 14, y: 64, size: 2.2, align: centered },
  );
  addLines(
    layout.title,
    g.heading.x,
    23 + headerShift,
    g.heading.width,
    4.45,
    4.8,
  );
  field("วิชา", layout.subject, 50, 65, infoEnd, 38.2);
  field("ประเภท", layout.examType, 50, 65, infoEnd, 47.3);
  field("ภาคเรียน", String(layout.term), 50, 65, 72, 57.1);
  field("ปีการศึกษา", String(layout.year), 75, 93, infoEnd, 57.1, 2.7);
  field("ชื่อ–สกุล", student?.full_name ?? "", 50, 66.5, right, 70, 3.05);
  const { grade, room } = classValues(
    student?.classroom_name ?? layout.classroom,
  );
  field("ระดับชั้น", grade || "", 50, 66, 86, 84);
  if (room || !student) field("ห้อง", room ?? "", 88, 95, 105, 84);
  if (student?.number != null || !student)
    field(
      "เลขที่",
      student?.number == null ? "" : String(student.number),
      110,
      119,
      137,
      84,
    );
  texts.push({
    value: layout.instructions,
    x: tabLeft,
    y: 100.2,
    size: 2.4,
    weight: bold,
  });
  return texts;
}

type Rule = { x1: number; y1: number; x2: number; y2: number; dashed: boolean };

export function gridDecorations(
  layout: SheetLayout,
  g: SheetGeometry,
  student?: PrintStudent,
) {
  const lines: Rule[] = [];
  const texts: PrintText[] = [];
  const right = g.sheetWidth - 11.5;
  const rule = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dashed = false,
  ) => lines.push({ x1, y1, x2, y2, dashed });
  const frame = (x: number, y: number, w: number, h: number) => {
    rule(x, y, x + w, y);
    rule(x, y + h, x + w, y + h);
    rule(x, y, x, y + h);
    rule(x + w, y, x + w, y + h);
  };
  rule(tabLeft, 31.65, right, 31.65);
  frame(tabLeft, 32.8, 33, 63.7);
  rule(tabLeft, 37.25, 44.5, 37.25);
  rule(tabLeft, 42.35, 44.5, 42.35);
  for (let column = 1; column < 5; column++) {
    rule(
      tabLeft + column * g.idStepX,
      37.25,
      tabLeft + column * g.idStepX,
      96.5,
    );
  }
  rule(g.score.x + 2.6, 20.35, g.score.x + 15.7, 20.35, true);
  for (const [value, y] of [
    [layout.subject, 39.25],
    [layout.examType, 48.35],
  ] as const) {
    rule(64, y, g.qr.x - 6, y, true);
    if (wrapMeasuredText(value, g.qr.x - 71, 3, true).length > 1)
      rule(64, y + 4.3, g.qr.x - 6, y + 4.3, true);
  }
  rule(64, 58.1, 72, 58.1, true);
  rule(92.5, 58.1, g.qr.x - 6, 58.1, true);
  rule(66, 71.1, right, 71.1, true);
  if (
    student &&
    wrapMeasuredText(student.full_name, right - 66.5, 3.05, true).length > 1
  )
    rule(66, 75.4, right, 75.4, true);
  rule(65, 85, 86, 85, true);
  if (classValues(student?.classroom_name ?? layout.classroom).room || !student)
    rule(94.5, 85, 105, 85, true);
  if (student?.number != null || !student) rule(118, 85, 137, 85, true);

  const width = g.answerColumnWidth * g.columns;
  const left = (g.sheetWidth - width) / 2;
  const lastY = g.answerStart.y + (g.rows - 1) * g.answerStepY;
  const bottom = lastY + 2.6;
  frame(left, tableTop, width, bottom - tableTop);
  rule(left, headerBottom, left + width, headerBottom);
  for (let column = 0; column < g.columns; column++) {
    const start = left + column * g.answerColumnWidth;
    const firstOption = g.answerStart.x + column * g.answerColumnWidth;
    if (column) rule(start, tableTop, start, bottom);
    rule(start + 8.7, tableTop, start + 8.7, bottom);
    rule(start + 8.7, 111.8, start + g.answerColumnWidth, 111.8);
    rule(start + 8.7, 114.55, start + g.answerColumnWidth, 114.55);
    texts.push({
      value: "ข้อ",
      x: start + 4.35,
      y: 114,
      size: 2.35,
      align: "center",
      weight: "bold",
    });
    for (let option = 0; option < layout.choiceCount; option++) {
      const x = firstOption + option * g.answerStepX;
      if (option)
        rule(
          x - g.answerStepX / 2,
          tableTop,
          x - g.answerStepX / 2,
          headerBottom,
        );
      texts.push(
        {
          value: String(option + 1),
          x,
          y: 111.15,
          size: 1.85,
          align: "center",
        },
        {
          value: thaiChoices[option],
          x,
          y: 114,
          size: 2,
          align: "center",
          weight: "bold",
        },
        { value: choices[option], x, y: 116.72, size: 1.85, align: "center" },
      );
    }
  }
  return { lines, texts, questionLeft: left + 4.35 };
}

export const gridExamples = [
  { kind: "correct", label: "ฝนเต็มวง", x: 13.5, labelX: 17.1 },
  { kind: "partial", label: "ฝนไม่เต็มวง", x: 44.95, labelX: 48.6 },
  { kind: "multiple", label: "ฝนสองวง", x: 76.4, labelX: 85 },
  { kind: "outside", label: "ฝนเลยวง", x: 109, labelX: 113.3 },
] as const;
export const gridExampleY = 104.6;
