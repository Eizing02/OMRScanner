import { z } from "zod";
import { choices, type Exam } from "@/types/exam";
import type { PrintStudent } from "@/types/print";
import fontMetrics from "./print-font-metrics.json";

export const layoutSchema = z.object({
  schemaVersion: z.literal(1),
  printStyle: z
    .enum(["classic", "compact", "school", "school-v2"])
    .default("classic"),
  school: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().min(1).max(80),
  classroom: z.string().max(30),
  year: z.number().int().min(2500).max(2700),
  term: z.number().int().min(1).max(3),
  instructions: z.string().max(140),
  headerOffsetMm: z.number().min(0).max(5),
  logo: z
    .string()
    .max(7 * 1024 * 1024)
    .refine(
      (value) =>
        value === "/omr-assets/school-logo.png" ||
        /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) ||
        /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\/school-logos\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:png|jpg)\?token=[A-Za-z0-9._~-]+$/.test(
          value,
        ) ||
        /^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_-]+\/image\/upload\/fl_original\/v[0-9]+\/school-logos\/[a-f0-9-]+\/[a-f0-9-]+\.(?:png|jpg|jpeg)$/.test(
          value,
        ),
      "โลโก้ต้องเป็นภาพต้นฉบับ PNG / JPG หรือ URL โลโก้ของระบบ",
    )
    .nullable(),
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
  printStyle: "school-v2",
  school: "โรงเรียนตัวอย่างวิทยา",
  title: "สมการและอสมการเชิงเส้น",
  subject: "คณิตศาสตร์",
  classroom: "ม.3/1",
  year: 2569,
  term: 1,
  instructions:
    "ตรวจชื่อและรหัสนักเรียน ใช้ดินสอ 2B ฝนให้เต็มวง ข้อละ 1 คำตอบ หากเปลี่ยนคำตอบให้ลบให้สะอาด",
  headerOffsetMm: 0,
  logo: null,
  questionCount: 20,
  choiceCount: 4,
});
export function layoutForExam(stored: SheetLayout, exam: Exam): SheetLayout {
  const sameExam = stored.examId === exam.id;
  return {
    ...stored,
    instructions:
      modernPrint(stored) &&
      [
        "ตรวจข้อมูลนักเรียน ใช้ดินสอ 2B ฝนคำตอบให้เต็มวง เพียงหนึ่งคำตอบต่อข้อ",
        "ใช้ดินสอ 2B ฝนรหัสนักเรียนและคำตอบให้เต็มวง เพียงหนึ่งคำตอบต่อข้อ",
      ].includes(stored.instructions)
        ? defaultLayout.instructions
        : stored.instructions,
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
export const modernPrint = (layout: SheetLayout) =>
  layout.printStyle === "school-v2";
export function measurePrintText(value: string, size: number, bold = false) {
  const metrics = fontMetrics[bold ? "bold" : "normal"] as Record<
    string,
    number
  >;
  return (
    Array.from(value).reduce(
      (sum, char) => sum + (metrics[String(char.codePointAt(0))] ?? 1),
      0,
    ) * size
  );
}
// Use the same embedded-font advances in SVG, PDF and the registration validator.
// Thai words stay together; an overlong word is a validation error, never clipped.
export function wrapMeasuredText(
  value: string,
  width: number,
  size: number,
  bold = false,
) {
  const segmenter = new Intl.Segmenter("th", { granularity: "word" });
  return value.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    const segments = Array.from(
      segmenter.segment(paragraph),
      ({ segment }) => segment,
    ).flatMap((segment) =>
      !/\p{Script=Thai}/u.test(segment) &&
      measurePrintText(segment, size, bold) > width - 0.5
        ? Array.from(segment)
        : [segment],
    );
    for (const segment of segments) {
      if (line && measurePrintText(line + segment, size, bold) > width - 0.5) {
        lines.push(line.trim());
        line = segment.trimStart();
      } else line += segment;
    }
    if (line.trim() || !lines.length) lines.push(line.trim());
    return lines;
  });
}
export function fillExamples(g: SheetGeometry) {
  return ["เต็มวง", "ไม่เต็มวง", "ฝน 2 วง", "เลยวง"].map((label, i) => ({
    label,
    kind: ["correct", "partial", "multiple", "outside"][i],
    x: 15,
    y: 146 + i * 10,
    labelX: 25,
    width: Math.min(39, g.sheetWidth - 24),
  }));
}

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
    answerStepX = 5.5;
  const baseStepY = 6;
  const minColumnWidth =
    (layout.choiceCount - 1) * answerStepX + bubbleRadius * 2 + 12;
  const maxColumns = Math.floor((width - right - answerLeft) / minColumnWidth);
  let maxRows = 0;
  while (
    answerTop +
      maxRows * baseStepY +
      Math.floor(maxRows / 5) * 1.5 +
      bubbleRadius <=
    answerBottom
  )
    maxRows++;
  const columns = Math.max(1, Math.ceil(layout.questionCount / maxRows));
  const rows = Math.ceil(layout.questionCount / columns);
  const answerStepY =
    layout.printStyle !== "classic" && rows > 1
      ? Math.min(
          8.5,
          (answerBottom -
            bubbleRadius -
            answerTop -
            Math.floor((rows - 1) / 5) * 1.5) /
            (rows - 1),
        )
      : baseStepY;
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
    qr: modernPrint(layout)
      ? { x: width - 40.5, y: 29, width: 28 }
      : { x: width - 35.5, y: 29, width: 23 },
    score: {
      x: width - 38.5,
      y: 13,
      width: 29,
      height: layout.printStyle === "school" || modernPrint(layout) ? 14 : 11,
    },
    logo: {
      x: 12,
      y: 13,
      width:
        layout.printStyle === "school" || modernPrint(layout)
          ? 20
          : layout.printStyle === "compact"
            ? 16
            : 12,
      height:
        layout.printStyle === "school" || modernPrint(layout)
          ? 20
          : layout.printStyle === "compact"
            ? 16
            : 12,
    },
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
    heading: {
      x:
        layout.printStyle === "school" || modernPrint(layout)
          ? 37
          : layout.printStyle === "compact"
            ? 33
            : 30,
      width:
        width -
        (layout.printStyle === "school" || modernPrint(layout)
          ? 79.5
          : layout.printStyle === "compact"
            ? 75.5
            : 72.5),
    },
  };
}
export type SheetGeometry = ReturnType<typeof geometryFor>;
function textFits(layout: SheetLayout, g: SheetGeometry) {
  if (modernPrint(layout)) {
    const texts = modernPrintTexts(layout, g);
    return (
      texts.every(
        (t) =>
          !t.maxWidth ||
          measurePrintText(t.value, t.size, t.weight === "bold") <= t.maxWidth,
      ) &&
      measurePrintText(layout.school, 3.1, true) <= g.heading.width &&
      wrapMeasuredText(layout.title, g.heading.width, 4.2, true).length <= 2 &&
      wrapMeasuredText(
        `วิชา …${layout.subject}… · …${layout.examType}…`,
        g.qr.x - 16,
        2.8,
        true,
      ).length <= 2 &&
      wrapMeasuredText(layout.instructions, g.sheetWidth - 24, 2.6).length <= 3
    );
  }
  return (
    wrapPrintText(
      printSchool(layout),
      g.heading.width,
      layout.printStyle === "school"
        ? 4.1
        : layout.printStyle === "compact"
          ? 3.8
          : 3.3,
    ).length <= 2 &&
    wrapPrintText(layout.title, g.heading.width, 3.3).length <= 2 &&
    wrapPrintText(printSubject(layout), g.sheetWidth - 57, 2.8).length <= 2 &&
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
  weight?: "normal" | "bold";
  maxWidth?: number;
};
function modernPrintTexts(
  layout: SheetLayout,
  g: SheetGeometry,
  student?: PrintStudent,
): PrintText[] {
  const schoolSize = Math.min(
    4.1,
    g.heading.width / Math.max(1, measurePrintText(layout.school, 1, true)),
  );
  const lines = (
    value: string,
    x: number,
    y: number,
    width: number,
    size: number,
    bold = false,
    pitch = 4,
  ): PrintText[] =>
    wrapMeasuredText(value, width, size, bold).map((line, i) => ({
      value: line,
      x,
      y: y + i * pitch,
      size,
      weight: bold ? "bold" : "normal",
      maxWidth: width,
    }));
  const infoWidth = g.qr.x - 16;
  return [
    {
      value: layout.school.replace(/\s*\n\s*/g, " "),
      x: g.heading.x,
      y: 18 + layout.headerOffsetMm,
      size: Math.max(3.1, schoolSize),
      weight: "bold",
      maxWidth: g.heading.width,
    },
    ...lines(
      layout.title,
      g.heading.x,
      25 + layout.headerOffsetMm,
      g.heading.width,
      4.2,
      true,
      4.7,
    ),
    {
      value: `........... / ${layout.totalScore}`,
      x: g.score.x + g.score.width / 2,
      y: 24,
      size: 2.8,
      align: "center",
    },
    ...lines(
      `วิชา …${layout.subject}… · …${layout.examType}…`,
      12,
      39,
      infoWidth,
      2.8,
      true,
    ),
    {
      value: `ภาคเรียนที่ ${layout.term}  ปีการศึกษา ${layout.year}`,
      x: 12,
      y: 47,
      size: 2.8,
      weight: "bold",
      maxWidth: infoWidth,
    },
    ...lines(
      student
        ? `ชื่อ–สกุล …${student.full_name}…`
        : "ชื่อ–สกุล ................................................................",
      12,
      52,
      infoWidth,
      2.8,
      Boolean(student),
    ),
    {
      value: printClassroom({ ...layout, printStyle: "school" }, student),
      x: 12,
      y:
        student &&
        wrapMeasuredText(
          `ชื่อ–สกุล …${student.full_name}…`,
          infoWidth,
          2.8,
          true,
        ).length > 1
          ? 62
          : 58,
      size: 2.8,
      weight: student ? "bold" : "normal",
      maxWidth: infoWidth,
    },
    {
      value: student ? `รหัส …${student.student_code}…` : "รหัสนักเรียน 5 หลัก",
      x: 26,
      y: 72,
      size: 2.6,
      align: "center",
      weight: student ? "bold" : "normal",
    },
    {
      value: `คำตอบ ${layout.questionCount} ข้อ · ${layout.choiceCount} ตัวเลือก`,
      x: 59,
      y: 72,
      size: 2.8,
    },
    { value: "ตัวอย่างการฝน", x: 12, y: 139, size: 2.7, weight: "bold" },
    ...lines(layout.instructions, 12, 187, g.sheetWidth - 24, 2.6, false, 4),
  ];
}
function printSubject(layout: SheetLayout) {
  return layout.printStyle === "school"
    ? `วิชา …${layout.subject}… · …${layout.examType}…`
    : `วิชา ${layout.subject} · ${layout.examType} · ชั้น ${layout.classroom}`;
}
function printSchool(layout: SheetLayout) {
  const prefix = "โรงเรียน";
  const name = layout.school.slice(prefix.length).trim();
  return layout.printStyle === "school" &&
    layout.school.startsWith(prefix) &&
    name
    ? `${prefix}\n${name}`
    : layout.school;
}
function printClassroom(layout: SheetLayout, student?: PrintStudent) {
  if (layout.printStyle !== "school")
    return student
      ? `ชั้น / ห้อง …${student.classroom_name}…${student.number === null ? "" : `  เลขที่ …${student.number}…`}`
      : "ชั้น / ห้อง ....................... เลขที่ .......................";
  const [grade, room] = (student?.classroom_name ?? layout.classroom).split(
    "/",
  );
  return `ระดับชั้น …${grade || "........"}…  ห้อง …${room || "—"}…${student && student.number === null ? "" : `  เลขที่ …${student?.number ?? "........"}…`}`;
}
export function printTexts(
  layout: SheetLayout,
  g = resolveGeometry(layout),
  student?: PrintStudent,
): PrintText[] {
  if (modernPrint(layout)) return modernPrintTexts(layout, g, student);
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
      printSchool(layout),
      g.heading.x,
      (layout.printStyle === "school" ? 18 : 17) + layout.headerOffsetMm,
      g.heading.width,
      layout.printStyle === "school"
        ? 4.1
        : layout.printStyle === "compact"
          ? 3.8
          : 3.3,
      layout.printStyle === "school" ? 4.5 : 4,
    ),
    ...lines(
      layout.title,
      g.heading.x,
      (layout.printStyle === "school" ? 30 : 28) + layout.headerOffsetMm,
      g.heading.width,
      3.3,
      4,
    ),
    {
      value:
        layout.printStyle === "school"
          ? `........... / ${layout.totalScore}`
          : `คะแนน …… / ${layout.totalScore}`,
      x: g.score.x + g.score.width / 2,
      y: layout.printStyle === "school" ? 24 : 20,
      size: 2.8,
      align: "center",
    },
    ...lines(printSubject(layout), 12, 42, g.sheetWidth - 57, 2.8, 4),
    {
      value: `ภาคเรียนที่ ${layout.term} ปีการศึกษา ${layout.year}`,
      x: 12,
      y: 51,
      size: 2.8,
    },
    ...lines(
      student
        ? `ชื่อ–สกุล …${student.full_name}…`
        : "ชื่อ–สกุล ......................................................................",
      12,
      58,
      g.sheetWidth - 24,
      2.8,
      3.5,
    ),
    {
      value: printClassroom(layout, student),
      x: 12,
      y: 65,
      size: 2.8,
    },
    {
      value: student
        ? `รหัส ${layout.printStyle === "school" ? `…${student.student_code}…` : student.student_code}`
        : "รหัสนักเรียน 5 หลัก",
      x: 26,
      y: 72,
      size: 2.6,
      align: "center",
    },
    {
      value: `คำตอบ ${layout.questionCount} ข้อ · ${layout.choiceCount} ตัวเลือก`,
      x: 59,
      y: 72,
      size: 2.8,
    },
    ...lines(
      student &&
        layout.instructions ===
          "ใช้ดินสอ 2B ฝนรหัสนักเรียนและคำตอบให้เต็มวง เพียงหนึ่งคำตอบต่อข้อ"
        ? "ตรวจชื่อและรหัสที่พิมพ์ไว้ ใช้ดินสอ 2B ฝนเฉพาะคำตอบให้เต็มวง เพียงหนึ่งคำตอบต่อข้อ"
        : layout.instructions,
      12,
      188,
      g.sheetWidth - 24,
      2.6,
      4,
    ),
    ...(layout.printStyle === "classic"
      ? [
          {
            value: `พิมพ์ทดสอบ · รุ่นข้อสอบ ${layout.examVersion} · ขนาดจริง 100% · ห้ามปรับพอดีหน้า`,
            x: g.sheetWidth / 2,
            y: 198,
            size: 2.2,
            align: "center" as const,
          },
        ]
      : []),
  ];
}
export function printStudentErrors(
  layout: SheetLayout,
  students: PrintStudent[],
) {
  const g = resolveGeometry(layout);
  const errors: string[] = [];
  if (new Set(students.map((s) => s.id)).size !== students.length)
    errors.push("รายชื่อนักเรียนซ้ำในชุดพิมพ์");
  for (const student of students) {
    if (!/^[0-9]{5}$/.test(student.student_code))
      errors.push(
        `รหัสนักเรียน ${student.full_name} ต้องเป็นข้อความตัวเลข 5 หลัก`,
      );
    if (
      modernPrint(layout) &&
      (wrapMeasuredText(
        `ชื่อ–สกุล …${student.full_name}…`,
        g.qr.x - 16,
        2.8,
        true,
      ).length > 2 ||
        measurePrintText(
          printClassroom({ ...layout, printStyle: "school" }, student),
          2.8,
          true,
        ) >
          g.qr.x - 16)
    )
      errors.push(`ข้อมูล ${student.student_code} ยาวเกินพื้นที่หัวกระดาษ`);
    if (
      !student.full_name.trim() ||
      wrapPrintText(`ชื่อ–สกุล …${student.full_name}…`, g.sheetWidth - 24, 2.8)
        .length > 2
    )
      errors.push(
        `ชื่อ ${student.full_name} ยาวเกินพื้นที่หัวกระดาษ กรุณาตรวจรายชื่อ`,
      );
    if (student.classroom_name !== layout.classroom)
      errors.push(
        `นักเรียน ${student.student_code} ไม่อยู่ในชั้น ${layout.classroom}`,
      );
  }
  return errors;
}
// Expand the whole batch, not individual papers: every student keeps one QR
// and exactly the same physical bubble coordinates.
export function resolvePrintLayout(
  layout: SheetLayout,
  students: PrintStudent[],
): SheetLayout {
  if (
    layout.paperMode === "auto" &&
    resolveGeometry(layout).sheetsPerPage === 2 &&
    students.some(
      (student) =>
        wrapPrintText(`ชื่อ–สกุล …${student.full_name}…`, 148.5 - 24, 2.8)
          .length > 2,
    )
  )
    return { ...layout, paperMode: "full" };
  return layout;
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
    geometryVersion: modernPrint(layout)
      ? 5
      : layout.printStyle === "school"
        ? 4
        : layout.printStyle === "compact"
          ? 3
          : 2,
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
