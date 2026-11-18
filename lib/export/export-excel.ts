import * as XLSX from "xlsx";
import type { ScoreExportRow } from "@/types/export";
export const safeCell = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
export function buildScoreTable(
  rows: ScoreExportRow[],
  format: "xlsx" | "csv",
) {
  const clean = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" ? safeCell(value) : value,
      ]),
    ),
  );
  const sheet = XLSX.utils.json_to_sheet(clean);
  if (format === "xlsx") {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Scores");
    return new Blob([XLSX.write(book, { type: "array", bookType: "xlsx" })], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  return new Blob(["\uFEFF", XLSX.utils.sheet_to_csv(sheet)], {
    type: "text/csv;charset=utf-8",
  });
}
