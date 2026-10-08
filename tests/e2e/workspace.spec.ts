import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("Thai workspace: real rendered evidence, responsive layouts, accessibility", async ({
  page,
}) => {
  const pages = [
    ["dashboard", "/dashboard"],
    ["exams", "/exams"],
    ["designer", "/exams/demo-math/omr-generate"],
    ["print", "/exams/demo-math/print"],
    ["scanner", "/scan"],
    ["review", "/review"],
  ];
  const findings: unknown[] = [];
  for (const [name, path] of pages) {
    for (const [viewport, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `.impeccable/review/${name}-${viewport}.png`,
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      if (overflow) findings.push({ name, viewport, overflow });
      const a11y = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      for (const v of a11y.violations)
        findings.push({
          name,
          viewport,
          id: v.id,
          elements: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        });
    }
  }
  expect(findings).toEqual([]);
});
test("create demo exam, fix with reason, verify, PDF download", async ({
  page,
}) => {
  await page.goto("/exams/new");
  await page
    .getByLabel("ชื่อชุดสอบ", { exact: true })
    .fill("ชุดสอบทดสอบการทำงาน");
  await page.getByRole("button", { name: "กำหนดเฉลย" }).click();
  await page
    .getByRole("button", { name: "สร้างชุดสอบและออกแบบกระดาษ" })
    .click();
  await expect(page).toHaveURL(/omr-generate/);
  await page.goto("/review");
  await page
    .getByRole("button", { name: "แก้คำตอบข้อ 7", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "บันทึกการแก้ไข" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "ก", exact: true }).click();
  await dialog
    .getByLabel("เหตุผลในการแก้ไข")
    .fill("ตรวจภาพต้นฉบับแล้วพบรอยฝนชัดเจน");
  await dialog.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await page.getByRole("button", { name: "ยืนยันคะแนนในตัวอย่าง" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ยืนยันในตัวอย่าง", exact: true })
    .click();
  await page.getByRole("button", { name: /ยืนยันแล้ว/ }).click();
  await expect(
    page.getByText("ยืนยันในพื้นที่ทดลองแล้ว · ยังไม่เผยแพร่ผลจริง"),
  ).toBeVisible();
  await page.goto("/exams/demo-math/print");
  await page.getByRole("checkbox").check();
  const download = page.waitForEvent("download", (d) =>
    d.suggestedFilename().endsWith(".pdf"),
  );
  await page
    .getByRole("button", { name: "ดาวน์โหลด PDF ทดสอบ", exact: true })
    .click();
  const file = await download;
  await file.saveAs(".impeccable/review/sample-print.pdf");
  expect(await file.failure()).toBeNull();
});
