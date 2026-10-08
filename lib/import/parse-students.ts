import { studentSchema } from "@/types/student";
import { normalizeName } from "./normalize-name";
export const columnAliases = {
  student_code: ["student_code", "รหัสนักเรียน", "รหัสนร", "id"],
  first_name: ["first_name", "ชื่อ"],
  last_name: ["last_name", "สกุล", "นามสกุล"],
  full_name: ["full_name", "name", "ชื่อ-สกุล"],
  classroom_name: ["classroom_name", "class_name", "ชั้น", "grade"],
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
  const seen = new Set<string>();
  return rows.map((row, i) => {
    const name = normalizeName(String(row[mapping.full_name] ?? ""));
    const code = String(row[mapping.student_code] ?? "").trim();
    const data = {
      student_code: code,
      first_name: String(row[mapping.first_name] ?? name.first_name).trim(),
      last_name: String(row[mapping.last_name] ?? name.last_name).trim(),
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
    if (seen.has(code)) errors.push("รหัสซ้ำภายในไฟล์ กรุณาตรวจสอบทั้งสองแถว");
    seen.add(code);
    return { row: i + 2, data, errors };
  });
}
