import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("wide school and exam headings never intrude into score or QR regions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/exams/demo-math/omr-generate");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("smart-answer-sheet-demo-v1")),
    )
    .not.toBeNull();
  await page.evaluate(() => {
    const saved = JSON.parse(
      localStorage.getItem("smart-answer-sheet-demo-v1")!,
    );
    saved.exams = saved.exams.map((exam: { id: string; title: string }) =>
      exam.id === "demo-math" ? { ...exam, title: "W".repeat(60) } : exam,
    );
    saved.sheetLayouts = {};
    localStorage.setItem("smart-answer-sheet-demo-v1", JSON.stringify(saved));
  });
  await page.reload();
  await page.getByLabel("ชื่อโรงเรียน", { exact: true }).fill("W".repeat(31));
  await expect(page.getByLabel("ชื่อชุดสอบ", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  const preview = page.getByRole("img", { name: "กระดาษคำตอบตัวอย่างหนึ่งใบ" });
  await expect(preview).toHaveAttribute("viewBox", "0 0 297 210");
  await page.evaluate(() => document.fonts.ready);
  await expect(preview.locator("[data-sheet-qr]")).toHaveCount(1);
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
  await page.getByLabel("รูปแบบ").selectOption("blank");
  await page.getByLabel("จำนวนใบสำรอง").fill("1");
  const download = page.waitForEvent("download", (d) =>
    d.suggestedFilename().endsWith(".pdf"),
  );
  await page
    .getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })
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
  await expect(preview.locator("[data-sheet-qr]")).toHaveCount(1);
  const firstQr = await preview.locator("[data-sheet-qr]").getAttribute("href");
  await page.getByLabel("จำนวนข้อ", { exact: true }).fill("60");
  await page.getByLabel("ตัวเลือก", { exact: true }).selectOption("5");
  await expect(preview).toHaveAttribute("viewBox", "0 0 297 210");
  await expect(preview.locator("[data-question]")).toHaveCount(300);
  await expect(
    page.getByRole("status").filter({ hasText: "พื้นที่ครึ่ง A4 ไม่พอ" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "ดูตัวอย่างก่อนพิมพ์" }).click();
  await page.getByLabel("รูปแบบ").selectOption("blank");
  await expect(
    page.getByRole("button", { name: "ดาวน์โหลด PDF", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "ออกแบบ", exact: true }).click();
  await page
    .getByRole("button", { name: "บันทึกโครงข้อสอบ", exact: true })
    .click();
  await page.getByRole("button", { name: "ยืนยันบันทึกเวอร์ชันใหม่" }).click();
  await expect(
    page.getByText("จำนวนข้อ/ตัวเลือกยังไม่ตรงกับเฉลยเดิม"),
  ).toHaveCount(0);
  await expect(preview.locator("[data-sheet-qr]")).not.toHaveAttribute(
    "href",
    firstQr!,
  );
  await page.getByRole("link", { name: "แก้ข้อมูลและเฉลยชุดสอบ" }).click();
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
    await expect(preview.locator("[data-sheet-qr]")).toHaveCount(1);
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
  await page.getByRole("button", { name: /^รายชื่อ ·/ }).click();
  await page.getByLabel("รูปแบบ").selectOption("blank");
  await page.getByLabel("จำนวนใบสำรอง").fill("3");
  await expect(page.getByText("3 แผ่น A4", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download", (d) =>
    d.suggestedFilename().endsWith(".pdf"),
  );
  await page
    .getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })
    .click();
  await (await download).saveAs("output/pdf/answer-sheet-60-test.pdf");
  await page.goto("/review");
  await page
    .getByRole("button", { name: "แก้คำตอบข้อ 7", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "แก้คำตอบข้อ 7", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".workspace-actionbar")).toContainText(
    "19 / 20 คะแนน",
  );
});
test("personalized print previews real roster names and five solid ID marks with a shared QR", async ({
  page,
}) => {
  await page.goto("/exams/demo-math/print");
  const preview = page.getByRole("img", { name: "กระดาษคำตอบตัวอย่างหนึ่งใบ" });
  await expect(page.getByLabel("รูปแบบ")).toHaveValue("roster");
  await expect(preview).toContainText("รหัส …02074…");
  await expect(
    preview.locator('circle[data-id-digit][fill="#000"]'),
  ).toHaveCount(5);
  await expect(preview.locator("[data-question]")).toHaveCount(80);
  await expect(preview.locator("[data-sheet-qr]")).toHaveCount(1);
  const qr = await preview.locator("[data-sheet-qr]").getAttribute("href");
  await page.getByLabel("ตัวอย่างนักเรียน").selectOption("demo-student-1");
  await expect(preview).toContainText("รหัส …04217…");
  await expect(preview.locator("[data-sheet-qr]")).toHaveAttribute("href", qr!);
  await expect(page.getByText("2 แผ่น A4", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download", (d) =>
    d.suggestedFilename().endsWith(".pdf"),
  );
  await page
    .getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })
    .click();
  await (await download).saveAs("output/pdf/personalized-20-test.pdf");
});
