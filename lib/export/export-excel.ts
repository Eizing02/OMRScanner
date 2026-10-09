import * as XLSX from "xlsx";
export const safeCell = (value: string) =>
  /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
export function downloadScores(
  rows: Record<string, string | number>[],
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
    XLSX.writeFile(book, "ผลคะแนน.xlsx");
  } else {
    const blob = new Blob(["\uFEFF", XLSX.utils.sheet_to_csv(sheet)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ผลคะแนน.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
