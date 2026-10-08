import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("wide school and exam headings never intrude into score or QR regions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/exams/demo-math/omr-generate");
  await page.getByLabel("ชื่อโรงเรียน", { exact: true }).fill("W".repeat(31));
  await page.getByLabel("ชื่อชุดสอบ", { exact: true }).fill("W".repeat(60));
  const preview = page.getByRole("img", { name: "กระดาษคำตอบตัวอย่างหนึ่งใบ" });
  await expect(preview).toHaveAttribute("viewBox", "0 0 297 210");
  await page.evaluate(() => document.fonts.ready);
  await expect(preview.locator("image")).toHaveCount(1);
  const headingRightEdges = await preview.locator("text").evaluateAll((texts) =>
    texts
      .filter((t) => t.textContent?.includes("WWW"))
      .map((t) => {
        const box = (t as SVGGraphicsElement).getBBox();
        return box.x + box.width;
      }),
  );
  expect(headingRightEdges.length).toBeGreaterThan(0);
  expect(Math.max(...headingRightEdges)).toBeLessThan(297 - 38.5);
  await page.screenshot({
    path: ".impeccable/review/answer-sheet-wide-heading-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "ดูตัวอย่างก่อนพิมพ์" }).click();
  await page.getByLabel("จำนวนกระดาษคำตอบ").fill("1");
  await page.getByRole("checkbox").check();
  const download = page.waitForEvent("download", (d) =>
    d.suggestedFilename().endsWith(".pdf"),
  );
  await page
    .getByRole("button", { name: "ดาวน์โหลด PDF ทดสอบ", exact: true })
    .click();
  await (
    await download
  ).saveAs(".impeccable/review/answer-sheet-wide-heading.pdf");
});
test("live single-sheet layout, version-safe changes, matching keys and real PDF", async ({
  page,
}) => {
  await page.goto("/exams/demo-math/omr-generate");
  await expect(page.getByLabel("จำนวนข้อ", { exact: true })).toHaveValue("20");
  const preview = page.getByRole("img", { name: "กระดาษคำตอบตัวอย่างหนึ่งใบ" });
  await expect(preview).toHaveAttribute("viewBox", "0 0 148.5 210");
  await expect(preview.locator("[data-question]")).toHaveCount(80);
  await expect(preview.locator("image")).toHaveCount(1);
  const firstQr = await preview.locator("image").getAttribute("href");
  await page.getByLabel("จำนวนข้อ", { exact: true }).fill("60");
  await page.getByLabel("ตัวเลือก", { exact: true }).selectOption("5");
  await expect(preview).toHaveAttribute("viewBox", "0 0 297 210");
  await expect(preview.locator("[data-question]")).toHaveCount(300);
  await expect(
    page.getByRole("status").filter({ hasText: "พื้นที่ครึ่ง A4 ไม่พอ" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "ดูตัวอย่างก่อนพิมพ์" }).click();
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "ดาวน์โหลด PDF ทดสอบ", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "กลับไปออกแบบ" }).click();
  await page
    .getByRole("button", { name: "บันทึกโครงข้อสอบ", exact: true })
    .click();
  await page.getByRole("button", { name: "ยืนยันบันทึกเวอร์ชันใหม่" }).click();
  await expect(
    page.getByText("จำนวนข้อ/ตัวเลือกยังไม่ตรงกับเฉลยเดิม"),
  ).toHaveCount(0);
  await expect(preview.locator("image")).not.toHaveAttribute("href", firstQr!);
  await page.getByRole("link", { name: "ตรวจหรือแก้เฉลย" }).click();
  await page.getByRole("button", { name: "แก้เฉลยเป็นเวอร์ชันใหม่" }).click();
  await page
    .getByRole("group", { name: "เฉลยข้อ 60", exact: true })
    .getByRole("button", { name: "จ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "บันทึกเฉลยเวอร์ชันใหม่", exact: true })
    .click();
  await page
    .getByRole("button", { name: "ยืนยันบันทึกเฉลย", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "60 คะแนนเต็ม" }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: "ออกแบบกระดาษคำตอบ", exact: true })
    .click();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.locator(".toast")).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await expect(preview.locator("image")).toHaveCount(1);
    if (name === "desktop") {
      const canvas = await page.locator(".canvas-scroll").boundingBox();
      const paper = await preview.boundingBox();
      expect(paper!.x + paper!.width).toBeLessThanOrEqual(
        canvas!.x + canvas!.width,
      );
    }
    await page.screenshot({
      path: `.impeccable/review/answer-sheet-60-${name}.png`,
      fullPage: true,
    });
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
  await page.getByRole("link", { name: "ดูตัวอย่างก่อนพิมพ์" }).click();
  await page.getByLabel("จำนวนกระดาษคำตอบ").fill("3");
  await expect(page.getByText("3 แผ่น", { exact: true })).toBeVisible();
  await page.getByRole("checkbox").check();
  const download = page.waitForEvent("download", (d) =>
    d.suggestedFilename().endsWith(".pdf"),
  );
  await page
    .getByRole("button", { name: "ดาวน์โหลด PDF ทดสอบ", exact: true })
    .click();
  await (await download).saveAs("output/pdf/answer-sheet-60-test.pdf");
  await page.goto("/review");
  await expect(
    page.getByRole("button", { name: "แก้คำตอบข้อ 7", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("/ 20", { exact: true })).toBeVisible();
});
