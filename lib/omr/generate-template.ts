import { z } from "zod";
import { choices, type Exam } from "@/types/exam";

export const layoutSchema = z.object({
  schemaVersion: z.literal(1),
  school: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(80),
  classroom: z.string().max(30),
  year: z.number().int().min(2500).max(2700),
  term: z.number().int().min(1).max(3),
  instructions: z.string().max(140),
  headerOffsetMm: z.number().min(0).max(5),
  logo: z.string().nullable(),
  questionCount: z.number().int().min(1).max(60),
  choiceCount: z.union([z.literal(4), z.literal(5)]),
  paperMode: z.enum(["auto", "full"]).default("auto"),
  examId: z.string().min(1).max(100).default("unassigned"),
  examVersion: z.number().int().positive().default(1),
  examType: z.string().max(40).default("เก็บคะแนน"),
  totalScore: z.number().min(0).max(6000).default(20),
  answerKeySignature: z.string().max(16000).default(""),
});
export type SheetLayout = z.infer<typeof layoutSchema>;
export const defaultLayout: SheetLayout = layoutSchema.parse({
  schemaVersion: 1,
  school: "โรงเรียนตัวอย่างวิทยา",
  title: "สมการและอสมการเชิงเส้น",
  subject: "คณิตศาสตร์",
  classroom: "ม.3/1",
  year: 2569,
  term: 1,
  instructions:
    "ใช้ดินสอ 2B ฝนรหัสนักเรียนและคำตอบให้เต็มวง เพียงหนึ่งคำตอบต่อข้อ",
  headerOffsetMm: 0,
  logo: null,
  questionCount: 20,
  choiceCount: 4,
});
export function layoutForExam(stored: SheetLayout, exam: Exam): SheetLayout {
  const sameExam = stored.examId === exam.id;
  return {
    ...stored,
    title: sameExam ? stored.title : exam.title,
    subject: sameExam ? stored.subject : exam.subject,
    classroom: sameExam ? stored.classroom : exam.classroom,
    questionCount: sameExam ? stored.questionCount : exam.questionCount,
    choiceCount: sameExam ? stored.choiceCount : exam.choiceCount,
    year: exam.year,
    term: exam.term,
    examId: exam.id,
    examVersion: exam.version,
    examType: exam.examType,
    totalScore: exam.answerKey.reduce((sum, key) => sum + key.points, 0),
    answerKeySignature: JSON.stringify(exam.answerKey),
  };
}
export const mmToPt = (mm: number) => (mm * 72) / 25.4;
export const mmToPx = (mm: number, dpi: number) => (mm * dpi) / 25.4;

// The bundled Noto Sans Thai has no advance wider than 1 em; its combining
// marks have zero advance and its space is 0.26 em. PDF tests verify these
// font invariants. Use the upper bound in both renderers, not an average width.
export const PRINT_GLYPH_ADVANCE_EM = 1;
export function wrapPrintText(value: string, width: number, fontSize: number) {
  const lines: string[] = [];
  let line = "",
    used = 0;
  for (const char of value) {
    const weight = /\p{M}/u.test(char)
      ? 0
      : char === " "
        ? 0.32
        : PRINT_GLYPH_ADVANCE_EM;
    if (char === "\n" || (used + fontSize * weight > width && line)) {
      lines.push(line.trim());
      line = "";
      used = 0;
      if (char === "\n") continue;
    }
    line += char;
    used += fontSize * weight;
  }
  if (line || !lines.length) lines.push(line.trim());
  return lines;
}
function geometryFor(width: number, layout: SheetLayout) {
  const answerLeft = 59,
    right = 12,
    answerTop = 82,
    answerBottom = 183;
  const bubbleRadius = 1.8,
    answerStepX = 5.5,
    answerStepY = 6;
  const minColumnWidth =
    (layout.choiceCount - 1) * answerStepX + bubbleRadius * 2 + 12;
  const maxColumns = Math.floor((width - right - answerLeft) / minColumnWidth);
  let maxRows = 0;
  while (
    answerTop +
      maxRows * answerStepY +
      Math.floor(maxRows / 5) * 1.5 +
      bubbleRadius <=
    answerBottom
  )
    maxRows++;
  const columns = Math.max(1, Math.ceil(layout.questionCount / maxRows));
  const rows = Math.ceil(layout.questionCount / columns);
  const columnWidth = (width - right - answerLeft) / columns;
  return {
    paperWidth: 297,
    paperHeight: 210,
    sheetWidth: width,
    sheetHeight: 210,
    sheetsPerPage: width === 148.5 ? 2 : 1,
    bubbleRadius,
    columns,
    rows,
    maxRows,
    fits: columns <= maxColumns,
    qr: { x: width - 35.5, y: 29, width: 23 },
    score: { x: width - 38.5, y: 13, width: 29, height: 11 },
    logo: { x: 12, y: 13, width: 12, height: 12 },
    markers: [
      { x: 6, y: 6 },
      { x: width - 9, y: 6 },
      { x: 6, y: 201 },
      { x: width - 9, y: 201 },
    ],
    idStart: { x: 15, y: 82 },
    idStepX: 5.5,
    idStepY: 5.5,
    answerStart: { x: answerLeft + 7, y: answerTop },
    answerStepX,
    answerStepY,
    answerColumnWidth: columnWidth,
    heading: { x: 30, width: width - 72.5 },
  };
}
export type SheetGeometry = ReturnType<typeof geometryFor>;
function textFits(layout: SheetLayout, g: SheetGeometry) {
  return (
    wrapPrintText(layout.school, g.heading.width, 3.3).length <= 2 &&
    wrapPrintText(layout.title, g.heading.width, 3.3).length <= 2 &&
    wrapPrintText(
      `วิชา ${layout.subject} · ${layout.examType} · ชั้น ${layout.classroom}`,
      g.sheetWidth - 57,
      2.8,
    ).length <= 2 &&
    wrapPrintText(layout.instructions, g.sheetWidth - 24, 2.6).length <= 2
  );
}
export function resolveGeometry(layout: SheetLayout) {
  const half = geometryFor(148.5, layout);
  const expanded =
    layout.paperMode === "full" || !half.fits || !textFits(layout, half);
  return {
    ...geometryFor(expanded ? 297 : 148.5, layout),
    autoExpanded: layout.paperMode === "auto" && expanded,
  };
}
// Default compatibility export; variable layouts always use resolveGeometry.
export const geometry = resolveGeometry(defaultLayout);
export function idBubbles(g: SheetGeometry = geometry) {
  return Array.from({ length: 5 }, (_, digit) =>
    Array.from({ length: 10 }, (_, value) => ({
      x: g.idStart.x + digit * g.idStepX,
      y: g.idStart.y + value * g.idStepY,
      digit,
      value,
    })),
  ).flat();
}
export function answerBubbles(
  layout: SheetLayout,
  g = resolveGeometry(layout),
) {
  return Array.from({ length: layout.questionCount }, (_, i) =>
    Array.from({ length: layout.choiceCount }, (_, option) => {
      const row = i % g.rows;
      return {
        question: i + 1,
        option,
        x:
          g.answerStart.x +
          Math.floor(i / g.rows) * g.answerColumnWidth +
          option * g.answerStepX,
        y: g.answerStart.y + row * g.answerStepY + Math.floor(row / 5) * 1.5,
      };
    }),
  ).flat();
}
export type PrintText = {
  value: string;
  x: number;
  y: number;
  size: number;
  align?: "left" | "center";
};
export function printTexts(
  layout: SheetLayout,
  g = resolveGeometry(layout),
): PrintText[] {
  const lines = (
    value: string,
    x: number,
    y: number,
    width: number,
    size: number,
    pitch: number,
  ): PrintText[] =>
    wrapPrintText(value, width, size).map((line, i) => ({
      value: line,
      x,
      y: y + i * pitch,
      size,
    }));
  return [
    ...lines(
      layout.school,
      g.heading.x,
      17 + layout.headerOffsetMm,
      g.heading.width,
      3.3,
      4,
    ),
    ...lines(
      layout.title,
      g.heading.x,
      28 + layout.headerOffsetMm,
      g.heading.width,
      3.3,
      4,
    ),
    {
      value: `คะแนน …… / ${layout.totalScore}`,
      x: g.score.x + g.score.width / 2,
      y: 20,
      size: 2.8,
      align: "center",
    },
    ...lines(
      `วิชา ${layout.subject} · ${layout.examType} · ชั้น ${layout.classroom}`,
      12,
      42,
      g.sheetWidth - 57,
      2.8,
      4,
    ),
    {
      value: `ภาคเรียนที่ ${layout.term} ปีการศึกษา ${layout.year}`,
      x: 12,
      y: 51,
      size: 2.8,
    },
    {
      value:
        "ชื่อ–สกุล ......................................................................",
      x: 12,
      y: 58,
      size: 2.8,
    },
    {
      value:
        "ชั้น / ห้อง ....................... เลขที่ .......................",
      x: 12,
      y: 65,
      size: 2.8,
    },
    { value: "รหัสนักเรียน 5 หลัก", x: 26, y: 72, size: 2.6, align: "center" },
    {
      value: `คำตอบ ${layout.questionCount} ข้อ · ${layout.choiceCount} ตัวเลือก`,
      x: 59,
      y: 72,
      size: 2.8,
    },
    ...lines(layout.instructions, 12, 188, g.sheetWidth - 24, 2.6, 4),
    {
      value: `พิมพ์ทดสอบ · รุ่นข้อสอบ ${layout.examVersion} · ขนาดจริง 100% · ห้ามปรับพอดีหน้า`,
      x: g.sheetWidth / 2,
      y: 198,
      size: 2.2,
      align: "center",
    },
  ];
}
export function validateLayout(layout: SheetLayout) {
  const result = layoutSchema.safeParse(layout);
  const errors = result.success
    ? []
    : result.error.issues.map((i) => i.message);
  if (!result.success) return { errors, warnings: [], checks: [] };
  const g = resolveGeometry(layout);
  if (!g.fits || !textFits(layout, g))
    errors.push("ข้อมูลเกินพื้นที่เต็ม A4 กรุณาย่อข้อความ");
  if (
    [...idBubbles(g), ...answerBubbles(layout, g)].some(
      (b) =>
        b.x - g.bubbleRadius < 10 ||
        b.x + g.bubbleRadius > g.sheetWidth - 10 ||
        b.y + g.bubbleRadius > 183,
    )
  )
    errors.push("วงฝนล้ำพื้นที่ปลอดภัย");
  return {
    errors,
    warnings: ["ยังต้องทดสอบพิมพ์และสแกนจริงก่อนใช้กับคะแนนนักเรียน"],
    checks: [
      `A4 แนวนอน · ${g.sheetsPerPage} ใบต่อแผ่น`,
      `${layout.questionCount} ข้อ · ${layout.choiceCount} ตัวเลือก · ${g.columns} คอลัมน์`,
      "รหัสนักเรียน 5 หลัก · 50 ช่องฝน",
      "QR ชุดเดียวกันและจุดจัดแนวครบทุกใบ",
      "วงฝนขนาดคงที่ 3.6 มม. · ยังต้องสอบเทียบ",
    ],
  };
}
export function compileOmrTemplate(layout: SheetLayout) {
  const validation = validateLayout(layout);
  if (validation.errors.length) throw new Error(validation.errors.join("; "));
  const g = resolveGeometry(layout),
    factor = 900 / g.sheetWidth;
  // Per-question blocks preserve the extra spacing between five-question groups.
  const fields = Object.fromEntries(
    answerBubbles(layout, g)
      .filter((b) => b.option === 0)
      .map((b) => [
        `answer_${b.question}`,
        {
          bubbleValues: choices.slice(0, layout.choiceCount),
          direction: "horizontal",
          fieldLabels: [`q${b.question}`],
          origin: [
            (b.x - g.bubbleRadius) * factor,
            (b.y - g.bubbleRadius) * factor,
          ],
          bubblesGap: g.answerStepX * factor,
          labelsGap: g.answerStepY * factor,
        },
      ]),
  );
  return {
    schemaVersion: 1,
    geometryVersion: 2,
    pageDimensions: [900, Math.round(g.sheetHeight * factor)],
    bubbleDimensions: [
      g.bubbleRadius * 2 * factor,
      g.bubbleRadius * 2 * factor,
    ],
    preProcessors: [],
    customLabels: {},
    emptyValue: "",
    fieldBlocks: {
      student_code: {
        fieldType: "QTYPE_INT",
        fieldLabels: Array.from(
          { length: 5 },
          (_, i) => `student_code_${i + 1}`,
        ),
        origin: [
          (g.idStart.x - g.bubbleRadius) * factor,
          (g.idStart.y - g.bubbleRadius) * factor,
        ],
        bubblesGap: g.idStepY * factor,
        labelsGap: g.idStepX * factor,
      },
      ...fields,
    } as Record<
      string,
      {
        origin: number[];
        fieldLabels: string[];
        bubblesGap: number;
        labelsGap: number;
        bubbleValues?: readonly string[];
        fieldType?: string;
        direction?: string;
      }
    >,
    centersMm: { id: idBubbles(g), answers: answerBubbles(layout, g) },
  };
}
