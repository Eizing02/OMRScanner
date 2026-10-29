import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";

test("settings persist and exam uses exact actual classrooms, configured subjects and academic defaults", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "ภาพรวมงานตรวจสอบ" }),
  ).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("smart-answer-sheet-demo-v1")!,
    );
    stored.students = [
      {
        id: "roster-one",
        student_code: "00001",
        prefix: "เด็กชาย",
        first_name: "กิตติกร",
        last_name: "ตัวอย่าง",
        classroom_name: "ม.1",
        number: null,
      },
      {
        id: "roster-two",
        student_code: "00002",
        prefix: "เด็กหญิง",
        first_name: "มณี",
        last_name: "ตัวอย่าง",
        classroom_name: "ม.1/2",
        number: null,
      },
    ];
    localStorage.setItem("smart-answer-sheet-demo-v1", JSON.stringify(stored));
  });
  await page.goto("/settings");
  await page.reload();
  await page
    .getByLabel("ชื่อโรงเรียน", { exact: true })
    .fill("โรงเรียนทดสอบการตั้งค่า");
  await page.getByLabel("ปีการศึกษาเริ่มต้น", { exact: true }).fill("2570");
  await page
    .getByRole("combobox", { name: "ภาคเรียนเริ่มต้น", exact: true })
    .selectOption("2");
  await page
    .getByLabel("วิชาที่ใช้บ่อย", { exact: true })
    .fill("ดาราศาสตร์\nภาษาไทย\nดาราศาสตร์");
  await page
    .getByRole("button", { name: "บันทึกการตั้งค่า", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "บันทึกการตั้งค่าในพื้นที่ทดลองแล้ว" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("ชื่อโรงเรียน", { exact: true })).toHaveValue(
    "โรงเรียนทดสอบการตั้งค่า",
  );
  await expect(page.getByLabel("วิชาที่ใช้บ่อย", { exact: true })).toHaveValue(
    "ดาราศาสตร์\nภาษาไทย",
  );
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    const overflow = await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
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
    expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(
      overflow.viewport + 1,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `.impeccable/review/accounts-settings-${viewport.width === 1440 ? "desktop" : "mobile"}.png`,
      fullPage: true,
    });
  }
  await page.goto("/exams/new");
  await expect(
    page.getByRole("heading", { name: "สร้างชุดสอบ", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const classroom = page.getByRole("combobox", {
    name: "ชั้น / ห้อง",
    exact: true,
  });
  await expect(classroom.locator("option")).toHaveText([
    "เลือกชั้น / ห้อง",
    "ม.1",
    "ม.1/2",
  ]);
  await expect(
    page.getByRole("combobox", { name: "ปีการศึกษา", exact: true }),
  ).toHaveValue("2570");
  await expect(
    page.getByRole("combobox", { name: "ภาคเรียน", exact: true }),
  ).toHaveValue("2");
  await page
    .getByLabel("ชื่อชุดสอบ", { exact: true })
    .fill("ทดสอบชั้นจากรายชื่อจริง");
  await page
    .getByRole("combobox", { name: "วิชา", exact: true })
    .selectOption("ดาราศาสตร์");
  await classroom.selectOption("ม.1/2");
  await expect(
    page.getByText("มีนักเรียน 1 คนในรายชื่อ", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("จำนวนข้อ", { exact: true }).fill("60");
  await page.getByRole("radio", { name: /5 ตัวเลือก/ }).check();
  await page.screenshot({
    path: ".impeccable/review/accounts-exam-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "กำหนดเฉลย", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "เฉลยข้อ 60", exact: true }),
  ).toHaveCount(1);
  for (const group of await page
    .getByRole("group", { name: /^เฉลยข้อ / })
    .all())
    await group.getByRole("button", { name: "ก", exact: true }).click();
  await page
    .getByRole("button", { name: "สร้างชุดสอบและออกแบบกระดาษ", exact: true })
    .click();
  await expect(page).toHaveURL(/\/omr-generate$/);
  const created = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("smart-answer-sheet-demo-v1")!).exams.find(
      (exam: { title: string }) => exam.title === "ทดสอบชั้นจากรายชื่อจริง",
    ),
  );
  expect(created).toMatchObject({
    classroom: "ม.1/2",
    subject: "ดาราศาสตร์",
    year: 2570,
    term: 2,
    questionCount: 60,
    choiceCount: 5,
  });
});

test("empty roster never invents classrooms and blocks exam creation", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "ภาพรวมงานตรวจสอบ" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("smart-answer-sheet-demo-v1")!,
    );
    stored.students = [];
    localStorage.setItem("smart-answer-sheet-demo-v1", JSON.stringify(stored));
  });
  await page.goto("/exams/new");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "ชั้น / ห้อง", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("combobox", { name: "ชั้น / ห้อง", exact: true })
      .locator("option"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "กำหนดเฉลย", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("status").filter({ hasText: "ยังไม่มีรายชื่อนักเรียน" }),
  ).toBeVisible();
});

test("settings logo picker keeps original PNG bytes and keyboard focus", async ({
  page,
}) => {
  const bytes = await readFile("public/omr-assets/school-logo.png");
  await page.goto("/settings");
  const picker = page.getByLabel("อัปโหลดโลโก้โรงเรียน", { exact: true });
  await page
    .getByLabel("ชื่อโรงเรียน", { exact: true })
    .fill("ชื่อโรงเรียนที่ยังไม่บันทึก");
  await picker.focus();
  await expect(page.locator(".settings-logo-upload")).toHaveCSS(
    "outline-width",
    "3px",
  );
  await picker.setInputFiles({
    name: "original-logo.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await expect(
    page.getByRole("img", { name: "โลโก้โรงเรียนปัจจุบัน", exact: true }),
  ).toHaveAttribute("src", `data:image/png;base64,${bytes.toString("base64")}`);
  await expect(page.getByLabel("ชื่อโรงเรียน", { exact: true })).toHaveValue(
    "ชื่อโรงเรียนที่ยังไม่บันทึก",
  );
  await page.reload();
  await expect(
    page.getByRole("img", { name: "โลโก้โรงเรียนปัจจุบัน", exact: true }),
  ).toHaveAttribute("src", `data:image/png;base64,${bytes.toString("base64")}`);
});
