import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { studentCsv, studentWorkbook } from "@/lib/import/student-files";
import { inferMapping, previewStudents } from "@/lib/import/parse-students";
const person = {
  id: "synthetic",
  student_code: "02000",
  prefix: "นาย" as const,
  first_name: "สมชาย",
  last_name: "ตัวอย่าง",
  classroom_name: "ม.4",
  number: null,
};
describe("student files", () => {
  it("round trips five-digit string IDs and four agreed columns plus optional number", () => {
    const book = XLSX.read(studentWorkbook([person]), { type: "array" });
    const sheet = book.Sheets[book.SheetNames[0]];
    expect(sheet.A2.t).toBe("s");
    expect(sheet.A2.v).toBe("02000");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      defval: "",
    });
    const preview = previewStudents(rows, inferMapping(Object.keys(rows[0])));
    expect(preview[0].errors).toEqual([]);
    expect(preview[0].data).toMatchObject({
      student_code: "02000",
      prefix: "นาย",
      classroom_name: "ม.4",
    });
  });
  it("keeps fake examples out of the first import sheet and formats ID input cells as text", () => {
    const book = XLSX.read(studentWorkbook([], true), {
      type: "array",
      cellNF: true,
      sheetStubs: true,
    });
    expect(
      XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { raw: false }),
    ).toEqual([]);
    expect(book.Sheets[book.SheetNames[0]].A2.z).toBe("@");
    expect(book.SheetNames).toEqual(["รายชื่อนักเรียน", "คำแนะนำและตัวอย่าง"]);
  });
  it("emits UTF-8 BOM CSV and escapes formula-like text without turning codes into formulas", () => {
    const csv = studentCsv([{ ...person, first_name: "=HYPERLINK(test)" }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"02000"');
    const noPrefix = studentCsv([
      {
        ...person,
        prefix: "" as typeof person.prefix,
        first_name: "=HYPERLINK(test)",
      },
    ]);
    expect(noPrefix).toContain("'=HYPERLINK");
    expect(studentCsv()).not.toContain("02000");
  });
});
