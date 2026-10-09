import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("exam permanent deletion requires exact name and keeps the roster", async ({
  page,
}) => {
  await page.goto("/students");
  // Wait for demo hydration before taking the baseline, not an empty SSR table.
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const before = await page.locator("tbody tr").count();
  await page.goto("/exams");
  const row = page.locator("tbody tr").first();
  const title = await row.locator(".table-exam a").innerText();
  await row.getByRole("button", { name: /ตัวเลือก/ }).click();
  await page.getByRole("button", { name: "ลบชุดสอบถาวร", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const remove = dialog.getByRole("button", { name: "ลบถาวร", exact: true });
  await expect(remove).toBeDisabled();
  await dialog.getByLabel("พิมพ์ชื่อชุดสอบเพื่อยืนยัน").fill("ผิด");
  await expect(remove).toBeDisabled();
  await dialog.getByLabel("พิมพ์ชื่อชุดสอบเพื่อยืนยัน").fill(title);
  await remove.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("tbody")).not.toContainText(title);
  await page.reload();
  await expect(page.locator("tbody")).not.toContainText(title);
  await page.goto("/students");
  await expect(page.locator("tbody tr")).toHaveCount(before);
});

test("review gives questions the main scroll area on desktop, phones and both iPad orientations", async ({
  page,
}) => {
  await page.goto("/review");
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone-small", 375, 812],
    ["phone", 390, 844],
    ["ipad-portrait", 768, 1024],
    ["ipad-landscape", 1024, 768],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await expect(
      page.getByRole("button", { name: "แก้คำตอบข้อ 20", exact: true }),
    ).toBeAttached();
    const questions = page.locator(".answer-review-scroll");
    await expect(questions).toBeVisible();
    const dimensions = await questions.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return {
        height: el.clientHeight,
        row: el.querySelector("tbody tr")!.getBoundingClientRect().height,
        bottom: box.bottom,
        scroll: el.scrollHeight,
      };
    });
    expect(dimensions.height / dimensions.row).toBeGreaterThanOrEqual(5);
    expect(dimensions.bottom).toBeLessThan(height);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `.impeccable/review/review-compact-${name}.png`,
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await questions.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect(
      page.getByRole("button", { name: "แก้คำตอบข้อ 20", exact: true }),
    ).toBeInViewport();
    await questions.evaluate((el) => (el.scrollTop = 0));
    if (width <= 1200) {
      await page.getByRole("button", { name: "ภาพสแกน", exact: true }).click();
      await expect(questions).toBeHidden();
      await expect(page.locator(".review-image-panel")).toBeVisible();
      await page
        .getByRole("button", { name: "คำตอบและคะแนน", exact: true })
        .click();
      await expect(questions).toBeVisible();
      await expect(page.locator(".review-image-panel")).toBeHidden();
    }
  }
});
