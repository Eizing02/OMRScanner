import * as XLSX from "xlsx";
import type { Student } from "@/types/student";
const headers = ["รหัสประจำตัว", "ชื่อ", "นามสกุล", "ระดับชั้น", "เลขที่"];
function rowsFor(students: Student[]) {
  return students.map((s) => [
    s.student_code,
    `${s.prefix ?? ""}${s.first_name}`,
    s.last_name,
    s.classroom_name,
    s.number === null ? "" : String(s.number),
  ]);
}
export function studentWorkbook(students: Student[] = [], template = false) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rowsFor(students)]);
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 26 },
    { wch: 24 },
    { wch: 16 },
    { wch: 10 },
  ];
  // Text cells and text format, never an Excel formula to preserve zeroes.
  for (
    let i = 2;
    i <= Math.max(students.length + 1, template ? 2001 : 1);
    i++
  ) {
    const key = `A${i}`;
    sheet[key] = sheet[key]
      ? { ...sheet[key], t: "s", z: "@" }
      : { t: "z", z: "@" };
  }
  if (template) sheet["!ref"] = "A1:E2001";
  XLSX.utils.book_append_sheet(book, sheet, "รายชื่อนักเรียน");
  if (template)
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["ตัวอย่างเท่านั้น — กรอกรายชื่อจริงในแผ่น รายชื่อนักเรียน"],
        headers,
        ["02000", "นายสมชาย", "ตัวอย่าง", "ม.4", ""],
        ["02001", "เด็กหญิงมณี", "ตัวอย่าง", "ม.1/1", ""],
        [
          "รหัสประจำตัวเป็นข้อความ 5 หลัก · ชื่อรวมคำนำหน้า · เลขที่เว้นว่างได้",
        ],
        ["รหัสเดิมจะอัปเดตหลังตรวจพรีวิว · คนที่ไม่อยู่ในไฟล์จะไม่ถูกลบ"],
      ]),
      "คำแนะนำและตัวอย่าง",
    );
  return XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}
export function studentCsv(students: Student[] = []) {
  const safe = (v: string) =>
    `"${(/^[=+@-]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  return (
    "\uFEFF" +
    [headers, ...rowsFor(students)]
      .map((row) => row.map((v) => safe(String(v))).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
export function downloadStudentFile(
  students: Student[],
  format: "xlsx" | "csv",
  template = false,
) {
  const content =
    format === "xlsx"
      ? studentWorkbook(students, template)
      : studentCsv(students);
  const blob = new Blob([content], {
    type:
      format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${template ? "แม่แบบรายชื่อนักเรียน" : "รายชื่อนักเรียน"}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
