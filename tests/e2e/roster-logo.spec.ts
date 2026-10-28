import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import * as XLSX from "xlsx";
async function capture(page: Page, path: string) {
  await page.evaluate(async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(1);
  if (process.env.OMR_CAPTURE_EVIDENCE === "false") return;
  if (
    process.env.OMR_CAPTURE_EVIDENCE === "recapture" &&
    ![
      ".impeccable/review/roster-list-mobile.png",
      ".impeccable/review/school-logo-mobile.png",
    ].includes(path)
  )
    return;
  await page.screenshot({ path, fullPage: true });
}
test("legacy XLSX preserves formatted five-digit codes, prefixes and optional numbers", async ({
  page,
}) => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["รหัสนักเรียน", "ชื่อ", "สกุล", "ชั้น", "เลขที่"],
    [7, "นายกิตติกร", "ตัวอย่าง", "ม.6/2", 3],
  ]);
  sheet.A2.z = "00000";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "รายชื่อ");
  await page.goto("/students/import");
  await page
    .getByLabel("เลือกไฟล์รายชื่อนักเรียน", { exact: true })
    .setInputFiles({
      name: "legacy.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
    });
  await expect(page.locator("tbody")).toContainText("00007");
  await expect(page.locator("tbody td").nth(2)).toHaveText("นายกิตติกร");
  await expect(page.locator("tbody td").nth(3)).toHaveText("ตัวอย่าง");
  await expect(
    page.getByRole("button", { name: "ตรวจ 1 รายชื่อ", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "ตรวจ 1 รายชื่อ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ยืนยันบันทึก 1 รายชื่อ", exact: true })
    .click();
  await expect(page).toHaveURL(/\/students$/);
  const stored = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("smart-answer-sheet-demo-v1")!,
    ).students.find(
      (s: { student_code: string }) => s.student_code === "00007",
    ),
  );
  expect(stored).toMatchObject({
    prefix: "นาย",
    number: 3,
    grade_level: "ม.6",
    room: 2,
  });
});
test("preview pagination exposes errors beyond the first hundred rows", async ({
  page,
}) => {
  const rows = Array.from(
    { length: 101 },
    (_, i) => `${String(i + 1).padStart(5, "0")},เด็กหญิงมณี ตัวอย่าง,ม.1`,
  );
  rows[100] = "1234,เด็กหญิงมณี ตัวอย่าง,ม.1";
  await page.goto("/students/import");
  await page
    .getByLabel("เลือกไฟล์รายชื่อนักเรียน", { exact: true })
    .setInputFiles({
      name: "large.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`รหัสประจำตัว,ชื่อ-สกุล,ชั้น\n${rows.join("\n")}\n`),
    });
  await expect(
    page.getByRole("button", { name: "ตรวจ 101 รายชื่อ", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText(
    "รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก",
  );
});

test("three-column CSV preserves zeros/prefixes, previews errors, imports and filters", async ({
  page,
}) => {
  await page.goto("/students/import");
  const file = page.getByLabel("เลือกไฟล์รายชื่อนักเรียน", { exact: true });
  await file.focus();
  await expect(page.locator(".file-drop")).toHaveCSS("outline-width", "3px");
  await expect(page.locator(".file-drop")).toHaveCSS(
    "outline-color",
    "rgb(102, 83, 164)",
  );
  await file.setInputFiles({
    name: "class.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "\uFEFFรหัสประจำตัว,ชื่อ-สกุล,ชั้น\n00001,เด็กชายกิตติกร ตัวอย่าง,ม.1\n00002,เด็กหญิงมณี ตัวอย่าง,ม.1/2\n",
    ),
  });
  await expect(
    page.getByRole("combobox", { name: "รหัสประจำตัว", exact: true }),
  ).toHaveValue("รหัสประจำตัว");
  await expect(page.locator("tbody")).toContainText("00001");
  await expect(page.locator("tbody td").nth(2)).toHaveText("เด็กชายกิตติกร");
  await expect(page.locator("tbody td").nth(3)).toHaveText("ตัวอย่าง");
  for (const [viewport, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await capture(page, `.impeccable/review/roster-import-${viewport}.png`);
    const overflow = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll("body *")]
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          right: element.getBoundingClientRect().right,
        })),
    }));
    expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(
      overflow.viewport + 1,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page
    .getByRole("button", { name: "ตรวจ 2 รายชื่อ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ยืนยันบันทึก 2 รายชื่อ", exact: true })
    .click();
  await expect(page).toHaveURL(/\/students$/);
  await expect(page.locator("thead th")).toHaveText([
    "",
    "รหัสประจำตัว",
    "ชื่อ",
    "นามสกุล",
    "ระดับชั้น",
    "จัดการนักเรียน",
  ]);
  await page
    .getByRole("combobox", { name: "ระดับชั้น", exact: true })
    .selectOption("ม.1");
  await page
    .getByRole("combobox", { name: "ชั้น / ห้อง", exact: true })
    .selectOption("ม.1");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("00001");
  for (const [viewport, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await capture(page, `.impeccable/review/roster-list-${viewport}.png`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.reload();
  await expect(page.locator("tbody")).toContainText("เด็กหญิงมณี");
  await page.goto("/students/import");
  await file.setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "รหัสประจำตัว,ชื่อ-สกุล,ชั้น\n1234,นายก ข,ม.7\n00001,นายค ง,ม.1\n",
    ),
  });
  await expect(
    page.getByRole("button", { name: "ตรวจ 2 รายชื่อ", exact: true }),
  ).toBeDisabled();
  // Existing codes remain valid candidates for an explicit update preview.
  await expect(page.locator("tbody")).not.toContainText("รหัสมีอยู่ในระบบแล้ว");
  await expect(page.locator("tbody")).toContainText(
    "รหัสนักเรียนต้องเป็นตัวเลข 5 หลัก",
  );
  // A rejected second file clears the old preview instead of leaving it importable.
  await file.setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("bad"),
  });
  await expect(page.locator("tbody")).toHaveCount(0);
});

test("original PNG logo works on desktop/mobile, reprints old exams with latest logo and survives reload", async ({
  page,
}) => {
  await page.goto("/exams/demo-thai/omr-generate");
  await page
    .getByLabel("ชื่อโรงเรียน", { exact: true })
    .fill("โรงเรียนเดิมทดสอบ"); // save an old template snapshot
  await page.goto("/exams/demo-math/omr-generate");
  const sheet = page.getByRole("img", { name: "กระดาษคำตอบตัวอย่างหนึ่งใบ" });
  await expect(sheet.locator("[data-sheet-logo]")).toHaveAttribute(
    "href",
    "/omr-assets/school-logo.png",
  );
  await page
    .getByRole("button", { name: "โลโก้โรงเรียน", exact: true })
    .click();
  const bytes = await readFile("public/omr-assets/school-logo.png");
  const logoInput = page
    .getByLabel("อัปโหลดโลโก้โรงเรียน")
    .filter({ visible: true });
  await logoInput.focus();
  await expect(logoInput.locator("..")).toHaveCSS("outline-width", "3px");
  await expect(logoInput.locator("..")).toHaveCSS(
    "outline-color",
    "rgb(102, 83, 164)",
  );
  await logoInput.setInputFiles({
    name: "school.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  const expected = `data:image/png;base64,${bytes.toString("base64")}`;
  await expect(sheet.locator("[data-sheet-logo]")).toHaveAttribute(
    "href",
    expected,
  );
  await expect(sheet.locator("[data-sheet-logo]")).toHaveAttribute(
    "preserveAspectRatio",
    "xMidYMid meet",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "ใช้โลโก้ต้นฉบับแล้ว" }),
  ).toBeVisible();
  for (const [viewport, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    if (viewport === "mobile") {
      await page
        .getByRole("button", { name: "หัวกระดาษและโลโก้", exact: true })
        .click();
      await page.getByLabel("ส่วนที่ต้องการแก้ไข").selectOption("logo");
    }
    await page.evaluate(() => document.fonts.ready);
    await capture(page, `.impeccable/review/school-logo-${viewport}.png`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
  await page.reload();
  await expect(sheet.locator("[data-sheet-logo]")).toHaveAttribute(
    "href",
    expected,
  );
  await page.goto("/exams/demo-thai/omr-generate");
  await expect
    .poll(() =>
      sheet
        .locator("[data-sheet-logo]")
        .getAttribute("href")
        .then((href) => href === expected),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "หัวกระดาษและโลโก้", exact: true })
    .click();
  await page.getByLabel("ส่วนที่ต้องการแก้ไข").selectOption("heading");
  await expect(page.getByLabel("ชื่อโรงเรียน", { exact: true })).toHaveValue(
    "โรงเรียนเดิมทดสอบ",
  );
});

test("mobile JPEG upload keeps original bytes while PDF embeds lossless orientation-correct PNG", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/exams/demo-math/omr-generate");
  await page
    .getByRole("button", { name: "หัวกระดาษและโลโก้", exact: true })
    .click();
  await page.getByLabel("ส่วนที่ต้องการแก้ไข").selectOption("logo");
  const dataUrl = await page.evaluate(async () => {
    const image = new Image();
    image.src = "/omr-assets/school-logo.png";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  });
  await page
    .getByLabel("อัปโหลดโลโก้โรงเรียน")
    .filter({ visible: true })
    .setInputFiles({
      name: "fixture.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
    });
  const logo = page.locator("[data-sheet-logo]");
  await expect(logo).toHaveAttribute("href", dataUrl);
  await page.getByRole("link", { name: "ดูตัวอย่างก่อนพิมพ์" }).click();
  const download = page.waitForEvent("download", (d) =>
    d.suggestedFilename().endsWith(".pdf"),
  );
  await page
    .getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })
    .click();
  const file = await (await download).path();
  const pdf = (await readFile(file!)).toString("latin1");
  // PNG may be embedded as raw RGB or Flate-compressed RGB; both are
  // lossless. Do not require a compression filter that jsPDF need not use.
  expect(pdf.includes("/DCTDecode")).toBe(false);
  expect(pdf.includes("/ColorSpace /DeviceRGB")).toBe(true);
  expect(pdf.includes("/Width 742")).toBe(true);
  expect(pdf.includes("/Height 763")).toBe(true);
});
