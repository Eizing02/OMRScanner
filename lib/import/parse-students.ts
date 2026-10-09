import { studentSchema } from "@/types/student";
import { normalizeName } from "./normalize-name";
import { normalizeClassroom } from "./normalize-classroom";
export const columnAliases = {
  student_code: [
    "student_code",
    "รหัสประจำตัว",
    "รหัสประจำตัวนักเรียน",
    "รหัสนักเรียน",
    "รหัสนร",
    "id",
  ],
  first_name: ["first_name", "ชื่อ"],
  last_name: ["last_name", "สกุล", "นามสกุล"],
  full_name: [
    "full_name",
    "name",
    "ชื่อ-สกุล",
    "ชื่อ–สกุล",
    "ชื่อ-นามสกุล",
    "ชื่อสกุล",
  ],
  classroom_name: [
    "classroom_name",
    "class_name",
    "ระดับชั้น",
    "ชั้น",
    "ชั้น/ห้อง",
    "grade",
  ],
  number: ["number", "เลขที่"],
};
export type ColumnMapping = Record<keyof typeof columnAliases, string>;
export function inferMapping(headers: string[]): ColumnMapping {
  return Object.fromEntries(
    Object.entries(columnAliases).map(([key, aliases]) => [
      key,
      headers.find((h) => aliases.includes(h.trim())) ?? "",
    ]),
  ) as ColumnMapping;
}
export function previewStudents(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = String(row[mapping.student_code] ?? "").trim();
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return rows.map((row, i) => {
    const full = String(row[mapping.full_name] ?? "").trim();
    const name = normalizeName(
      full ||
        `${row[mapping.first_name] ?? ""} ${row[mapping.last_name] ?? ""}`,
    );
    const code = String(row[mapping.student_code] ?? "").trim();
    const data = {
      student_code: code,
      prefix: name.prefix,
      first_name: name.first_name,
      last_name: name.last_name,
      classroom_name: String(row[mapping.classroom_name] ?? "").trim(),
      number:
        row[mapping.number] === undefined || row[mapping.number] === ""
          ? null
          : Number(row[mapping.number]),
    };
    const parsed = studentSchema.safeParse(data);
    const errors = parsed.success
      ? []
      : parsed.error.issues.map((e) => e.message);
    if ((counts.get(code) ?? 0) > 1)
      errors.push("รหัสซ้ำภายในไฟล์ กรุณาตรวจสอบทั้งสองแถว");
    return {
      row: i + 2,
      data: parsed.success
        ? parsed.data
        : {
            ...data,
            full_name: `${name.prefix}${name.first_name} ${name.last_name}`,
            grade_level:
              normalizeClassroom(data.classroom_name)?.grade_level ?? "",
            room: normalizeClassroom(data.classroom_name)?.room ?? null,
          },
      errors,
    };
  });
}
