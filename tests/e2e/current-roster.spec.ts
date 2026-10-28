import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as XLSX from "xlsx";

async function capture(page: Page, surface: string) {
  for (const [viewport, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    if (process.env.OMR_CAPTURE_EVIDENCE !== "false")
      await page.screenshot({
        path: `.impeccable/review/roster-four-${surface}-${viewport}.png`,
        fullPage: true,
      });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
}

for (const format of ["csv", "xlsx"] as const) {
  test(`four-column ${format.toUpperCase()} auto-maps current-term headers and imports safely`, async ({
    page,
  }) => {
    const headers = ["รหัสประจำตัว", "ชื่อ", "นามสกุล", "ระดับชั้น"];
    const data = [
      headers,
      ["00007", "เด็กชายกิตติกร", "ตัวอย่าง", "ม.1/1"],
      ["00008", "เด็กหญิงมณี", "ตัวอย่าง", "ม.1/2"],
      ["00009", "นางสาวมณี", "ตัวอย่าง", "ม.6"],
    ];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet(data),
      "รายชื่อทดสอบ",
    );
    await page.goto("/students/import");
    await page
      .getByLabel("เลือกไฟล์รายชื่อนักเรียน", { exact: true })
      .setInputFiles({
        name: `roster-example.${format}`,
        mimeType:
          format === "csv"
            ? "text/csv"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer:
          format === "csv"
            ? Buffer.from(
                `\uFEFF${data.map((row) => row.join(",")).join("\n")}\n`,
              )
            : XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
      });
    for (const header of headers)
      await expect(
        page.getByRole("combobox", { name: header, exact: true }),
      ).toHaveValue(header);
    await expect(page.locator("thead th")).toHaveText([
      "แถว",
      ...headers,
      "ผลตรวจ",
    ]);
    await expect(page.locator("tbody tr").first().locator("td")).toHaveText([
      "2",
      "00007",
      "เด็กชายกิตติกร",
      "ตัวอย่าง",
      "ม.1/1",
      "ถูกต้อง",
    ]);
    await expect(page.locator(".legacy-mapping")).not.toHaveAttribute("open");
    const button = page.getByRole("button", {
      name: "ตรวจ 3 รายชื่อ",
      exact: true,
    });
    await expect(button).toBeEnabled();
    if (format === "csv") await capture(page, "import");
    await button.click();
    await page
      .getByRole("button", { name: "ยืนยันบันทึก 3 รายชื่อ", exact: true })
      .click();
    await expect(page).toHaveURL(/\/students$/);
    await expect(page.locator("thead th")).toHaveText([
      "",
      ...headers,
      "จัดการนักเรียน",
    ]);
    await page.getByLabel("ค้นหานักเรียน").fill("00007");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody td")).toHaveText([
      "",
      "00007",
      "เด็กชายกิตติกร",
      "ตัวอย่าง",
      "ม.1/1",
      "",
    ]);
    if (format === "csv") await capture(page, "list");
    await page.reload();
    await page.getByLabel("ค้นหานักเรียน").fill("00009");
    await expect(page.locator("tbody td")).toHaveText([
      "",
      "00009",
      "นางสาวมณี",
      "ตัวอย่าง",
      "ม.6",
      "",
    ]);
    const stored = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("smart-answer-sheet-demo-v1")!,
      ).students.find(
        (student: { student_code: string }) => student.student_code === "00009",
      ),
    );
    expect(stored).toMatchObject({
      student_code: "00009",
      prefix: "นางสาว",
      first_name: "มณี",
      last_name: "ตัวอย่าง",
      classroom_name: "ม.6",
      room: null,
      number: null,
    });
  });
}
