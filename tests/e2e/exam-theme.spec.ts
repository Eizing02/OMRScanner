import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function fillSetup(page: Page) {
  await page
    .getByLabel("ชื่อชุดสอบ", { exact: true })
    .fill("ประเมินเรื่องสมการและอสมการเชิงเส้น");
  await page
    .getByRole("combobox", { name: "วิชา", exact: true })
    .selectOption("คณิตศาสตร์");
  await page
    .getByRole("combobox", { name: "ชั้น / ห้อง", exact: true })
    .selectOption("ม.3/1");
}

test("explicit answer keys preserve edits and clear removed choices without substituting answers", async ({
  page,
}) => {
  await page.goto("/exams/new");
  await page.getByRole("button", { name: "กำหนดเฉลย", exact: true }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(3);
  await expect(
    page.locator('input[aria-invalid="true"]').first(),
  ).toBeFocused();
  await page.locator("input[maxlength='120']").fill("ทดสอบเฉลยที่เลือกเอง");
  await page
    .getByRole("combobox", { name: "วิชา", exact: true })
    .selectOption("คณิตศาสตร์");
  await page
    .getByRole("combobox", { name: "ชั้น / ห้อง", exact: true })
    .selectOption("ม.3/1");
  const count = page.getByRole("spinbutton", { name: "จำนวนข้อ", exact: true });
  await count.fill("");
  await expect(count).toHaveValue("");
  await page.getByRole("button", { name: "กำหนดเฉลย", exact: true }).click();
  await expect(count).toHaveAttribute("aria-invalid", "true");
  await count.fill("3");
  await page.getByRole("radio", { name: /5 ตัวเลือก/ }).check();
  await page.getByRole("button", { name: "กำหนดเฉลย", exact: true }).click();
  const save = page.getByRole("button", {
    name: "สร้างชุดสอบและออกแบบกระดาษ",
    exact: true,
  });
  const answer = (n: number) =>
    page.getByRole("group", { name: `เฉลยข้อ ${n}`, exact: true });
  await expect(
    page.locator('.choice-buttons button[aria-pressed="true"]'),
  ).toHaveCount(0);
  await expect(save).toBeDisabled();
  await answer(1).getByRole("button", { name: "จ", exact: true }).click();
  await answer(2).getByRole("button", { name: "ข", exact: true }).click();
  await answer(3).getByRole("button", { name: "ก", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "คะแนนข้อ 2", exact: true })
    .fill("");
  await expect(save).toBeDisabled();
  await page
    .getByRole("spinbutton", { name: "คะแนนข้อ 2", exact: true })
    .fill("2.5");
  await expect(save).toBeEnabled();
  await page.getByRole("button", { name: "ย้อนกลับ", exact: true }).click();
  await count.fill("2");
  await page.getByRole("button", { name: "กำหนดเฉลย", exact: true }).click();
  await expect(answer(3)).toHaveCount(0);
  await page.getByRole("button", { name: "ย้อนกลับ", exact: true }).click();
  await count.fill("3");
  await page.getByRole("radio", { name: /4 ตัวเลือก/ }).check();
  await expect(
    page.getByRole("status").filter({ hasText: "ยกเลิกเฉลย จ แล้ว" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "กำหนดเฉลย", exact: true }).click();
  await expect(answer(1).locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(
    answer(2).getByRole("button", { name: "ข", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    answer(3).getByRole("button", { name: "ก", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("spinbutton", { name: "คะแนนข้อ 2", exact: true }),
  ).toHaveValue("2.5");
  await expect(save).toBeDisabled();
  await answer(1).getByRole("button", { name: "ง", exact: true }).click();
  await save.click();
  await expect(page).toHaveURL(/\/omr-generate$/);
  const created = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("smart-answer-sheet-demo-v1")!).exams.find(
      (e: { title: string }) => e.title === "ทดสอบเฉลยที่เลือกเอง",
    ),
  );
  expect(created.answerKey).toEqual([
    { question: 1, correct: "D", points: 1 },
    { question: 2, correct: "B", points: 2.5 },
    { question: 3, correct: "A", points: 1 },
  ]);
});

test("exam form and sixty-question keys stay usable on phone and iPad with visible action row", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/exams/new");
  await fillSetup(page);
  await page
    .getByRole("spinbutton", { name: "จำนวนข้อ", exact: true })
    .fill("60");
  await page.getByRole("radio", { name: /5 ตัวเลือก/ }).check();
  for (const state of ["details", "answers"]) {
    if (state === "answers") {
      await page
        .getByRole("button", { name: "กำหนดเฉลย", exact: true })
        .click();
      await page
        .getByRole("group", { name: "เฉลยข้อ 1", exact: true })
        .getByRole("button", { name: "ข", exact: true })
        .click();
    }
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
      ["ipad", 768, 1024],
      ["ipad-landscape", 1024, 768],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(async () => {
        await document.fonts.ready;
        document.querySelector(".exam-step-body")?.scrollTo(0, 0);
      });
      await expect(page.locator(".exam-actions")).toBeVisible();
      const actions = (await page.locator(".exam-actions").boundingBox())!;
      const nav = await page.locator(".mobile-bottom-nav").boundingBox();
      expect(actions.y + actions.height).toBeLessThanOrEqual(nav?.y ?? height);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight - innerHeight,
        ),
      ).toBeLessThanOrEqual(1);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      if (state === "answers") {
        expect(
          (await page.locator(".choice-buttons button").first().boundingBox())!
            .height,
        ).toBeGreaterThanOrEqual(44);
        await page
          .getByRole("group", { name: "เฉลยข้อ 60", exact: true })
          .getByRole("button", { name: "จ", exact: true })
          .click();
        await expect(
          page.getByRole("group", { name: "เฉลยข้อ 60", exact: true }),
        ).toBeVisible();
        await page.evaluate(() =>
          document.querySelector(".exam-step-body")?.scrollTo(0, 0),
        );
      }
      await page.screenshot({
        path: `.impeccable/review/exam-${state}-${name}.png`,
        fullPage: true,
        style: "nextjs-portal { display: none; }",
      });
    }
  }
});
