import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("Thai workspace: real rendered evidence, responsive layouts, accessibility", async ({
  page,
}) => {
  // This matrix drives 30 route/viewport combinations; WASM/Webpack also
  // compiles each route on first navigation on Windows without native SWC.
  test.setTimeout(240000);
  const pages = [
    ["dashboard", "/dashboard"],
    ["exams", "/exams"],
    ["designer", "/exams/demo-math/omr-generate"],
    ["print", "/exams/demo-math/print"],
    ["scanner", "/scan"],
    ["review", "/review"],
    ["settings", "/settings"],
    ["results", "/export"],
    ["login", "/login"],
  ];
  const findings: unknown[] = [];
  for (const [name, path] of pages) {
    for (const [viewport, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
      ...(["designer", "print", "scanner", "review"].includes(name)
        ? ([
            ["ipad-portrait", 768, 1024],
            ["ipad-landscape", 1024, 768],
            ["phone-landscape", 844, 390],
          ] as const)
        : []),
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
      if (name === "scanner" && viewport === "phone-landscape") {
        const controls = await page.locator(".camera-controls").boundingBox();
        const navigation = await page
          .locator(".mobile-bottom-nav")
          .boundingBox();
        expect(controls).not.toBeNull();
        expect(controls!.y + controls!.height).toBeLessThanOrEqual(
          navigation?.y ?? height,
        );
        expect(
          (await page
            .getByRole("button", { name: "เปิดกล้อง", exact: true })
            .boundingBox())!.height,
        ).toBeGreaterThanOrEqual(44);
      }
      if (name === "review" && viewport === "phone-landscape") {
        expect(
          (await page.locator(".answer-review-scroll").boundingBox())!.height,
        ).toBeGreaterThanOrEqual(100);
        await page.locator(".main-content").evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await expect(
          page.getByRole("button", { name: "ยืนยันคะแนน", exact: true }),
        ).toBeInViewport();
      }
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
  await page
    .getByRole("combobox", { name: "วิชา", exact: true })
    .selectOption("คณิตศาสตร์");
  await page
    .getByRole("combobox", { name: "ชั้น / ห้อง", exact: true })
    .selectOption("ม.3/1");
  await page.getByRole("button", { name: "กำหนดเฉลย" }).click();
  for (const group of await page.getByRole("group", { name: /^เฉลยข้อ / }).all())
    await group.getByRole("button", { name: "ก", exact: true }).click();
  await page
    .getByRole("button", { name: "สร้างชุดสอบและออกแบบกระดาษ" })
    .click();
  await expect(page).toHaveURL(/omr-generate/);
  await page.goto("/review");
  await page
    .getByRole("button", { name: "แก้คำตอบข้อ 7", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "บันทึก" })).toBeDisabled();
  await dialog.getByRole("button", { name: "ก", exact: true }).click();
  await dialog.getByLabel("เหตุผล").fill("ตรวจภาพต้นฉบับแล้วพบรอยฝนชัดเจน");
  await dialog.getByRole("button", { name: "บันทึก" }).click();
  await page.getByRole("button", { name: "ยืนยันคะแนน" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ยืนยันคะแนน", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "สถานะผลสแกน" })
    .selectOption("verified");
  await expect(
    page.getByText("ยืนยันแล้ว", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/exams/demo-math/print");
  const download = page.waitForEvent("download", (d) =>
    d.suggestedFilename().endsWith(".pdf"),
  );
  await page
    .getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })
    .click();
  const file = await download;
  await file.saveAs(".impeccable/review/sample-print.pdf");
  expect(await file.failure()).toBeNull();
});
