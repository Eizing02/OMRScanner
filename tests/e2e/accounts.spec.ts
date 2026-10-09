import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { captureFixture } from "../capture-fixture";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const schoolA = "11111111-1111-4111-8111-111111111111",
  schoolB = "22222222-2222-4222-8222-222222222222";
const access = (id = userA, status = "approved", role = "teacher") => ({
  userId: id,
  email: id === userA ? "teacher-a@example.test" : "teacher-b@example.test",
  displayName: id === userA ? "ครูบัญชี ก" : "ครูบัญชี ข",
  role,
  status,
  schoolId: status === "approved" ? (id === userA ? schoolA : schoolB) : null,
});
async function fixtures(
  page: Page,
  getAccess: () => ReturnType<typeof access> | null,
) {
  await page.route("https://accounts-test.supabase.co/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "fixture_no_session" }),
    }),
  );
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({
      json: { data: { configured: true, googleEnabled: true } },
    }),
  );
  await page.route("**/api/me/context", (route) => {
    const current = getAccess();
    return route.fulfill({
      status: current ? 200 : 401,
      json: current
        ? { data: current, error: null }
        : { data: null, error: { messageTh: "กรุณาเข้าสู่ระบบ" } },
    });
  });
  await page.route("**/api/exams", (route) =>
    route.fulfill({ json: { data: [], error: null } }),
  );
  await page.route("**/api/omr-layouts", (route) =>
    route.fulfill({ json: { data: [], error: null } }),
  );
  await page.route("**/api/scan-records", (route) =>
    route.fulfill({
      json: { data: { reviews: [], versions: [] }, error: null },
    }),
  );
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      json: {
        data: {
          school:
            route.request().headers()["x-workspace-id"] === schoolB
              ? "โรงเรียนบัญชี ข"
              : "โรงเรียนบัญชี ก",
          image_url: null,
          image_public_id: null,
          revision: "33333333-3333-4333-8333-333333333333",
          settings: { academicYear: 2569, term: 1, subjects: [] },
          canUpload: true,
          cleanupPending: 0,
        },
        error: null,
      },
    }),
  );
  await page.route("**/api/students", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            student_code: "02074",
            prefix: "เด็กชาย",
            first_name:
              route.request().headers()["x-workspace-id"] === schoolB
                ? "นักเรียนบัญชีข"
                : "นักเรียนบัญชีก",
            last_name: "ตัวอย่าง",
            classroom_name: "ม.1/2",
            number: null,
          },
        ],
        error: null,
      },
    }),
  );
}

test("auto capture locks QR first, stops the camera, supports retake and saves processed pixels only", async ({
  page,
}) => {
  await fixtures(page, () => access());
  const { image, template } = await captureFixture();
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/scan-records**", (route) => {
    if (route.request().method() === "POST") {
      posted = route.request().postDataJSON();
      return route.fulfill({
        json: {
          data: [
            {
              id: crypto.randomUUID(),
              studentCode: "02074",
              name: "นักเรียนทดสอบ",
              score: 20,
              maxScore: 20,
            },
          ],
          error: null,
        },
      });
    }
    return route.fulfill({
      json: {
        data: new URL(route.request().url()).searchParams.has("token")
          ? template
          : { reviews: [], versions: [] },
        error: null,
      },
    });
  });
  await page.addInitScript(
    async (png) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#273642";
      ctx.fillRect(0, 0, 1200, 1600);
      const image = new Image();
      image.src = png;
      await image.decode();
      ctx.drawImage(image, 150, 160, 900, 1273);
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => {
          const media = canvas.captureStream(10);
          const frames = setInterval(() => {
            if (
              media
                .getVideoTracks()
                .every((track) => track.readyState === "ended")
            )
              clearInterval(frames);
            else ctx.drawImage(image, 150, 160, 900, 1273);
          }, 100);
          return media;
        },
      });
    },
    `data:image/png;base64,${image.toString("base64")}`,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/scan");
  await page
    .getByRole("combobox", { name: "รูปแบบกระดาษ" })
    .selectOption("single");
  await expect(
    page.getByRole("button", { name: "อัตโนมัติ", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "เปิดกล้อง", exact: true }).click();
  await expect(page.getByAltText("ภาพหลังปรับมุม")).toBeVisible({
    timeout: 45000,
  });
  await expect(
    page.getByRole("button", { name: "ยืนยันมุมกระดาษ" }),
  ).toHaveCount(0);
  expect(
    await page
      .locator("video")
      .evaluate((el) =>
        ((el as HTMLVideoElement).srcObject as MediaStream)
          .getTracks()
          .every((t) => t.readyState === "ended"),
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "ถ่ายใหม่", exact: true }).click();
  await expect(page.getByAltText("ภาพหลังปรับมุม")).toBeVisible({
    timeout: 30000,
  });
  await page.screenshot({
    path: ".impeccable/review/auto-capture-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "อ่านคำตอบและบันทึก", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "สแกนใบถัดไป" })).toBeVisible();
  expect(posted).not.toHaveProperty("original");
  expect(posted).toMatchObject({
    paper: "single",
    expectedExamId: template.exam_id,
  });
  await page.getByRole("button", { name: "สแกนใบถัดไป" }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "อัตโนมัติ", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("pending, rejected and suspended accounts cannot mount the workspace", async ({
  page,
}) => {
  let current = access(userA, "pending");
  await fixtures(page, () => current);
  let workspaceCalls = 0;
  page.on("request", (request) => {
    if (
      /\/api\/(students|exams|settings|omr-layouts)$/.test(
        new URL(request.url()).pathname,
      )
    )
      workspaceCalls++;
  });
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "บัญชีของคุณกำลังรออนุมัติ" }),
  ).toBeVisible();
  expect(workspaceCalls).toBe(0);
  await expect(page.getByRole("link", { name: "คลังชุดสอบ" })).toHaveCount(0);
  current = access(userA, "suspended");
  await page.getByRole("button", { name: "ตรวจสอบสถานะอีกครั้ง" }).click();
  await expect(
    page.getByRole("heading", { name: "บัญชีนี้ถูกระงับการใช้งาน" }),
  ).toBeVisible();
  expect(workspaceCalls).toBe(0);
  current = access(userA, "rejected");
  await page.getByRole("button", { name: "ตรวจสอบสถานะอีกครั้ง" }).click();
  await expect(
    page.getByRole("heading", { name: "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน" }),
  ).toBeVisible();
  expect(workspaceCalls).toBe(0);
});
test("a refreshed account remounts caches and scopes all data requests", async ({
  page,
}) => {
  let current = access();
  await fixtures(page, () => current);
  await page.goto("/students");
  await expect(page.locator("thead th")).toHaveText([
    "รหัสประจำตัว",
    "ชื่อ",
    "นามสกุล",
    "ระดับชั้น",
  ]);
  await expect(page.locator("tbody td")).toHaveText([
    "02074",
    "เด็กชายนักเรียนบัญชีก",
    "ตัวอย่าง",
    "ม.1/2",
  ]);
  current = access(userB);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("tbody td")).toHaveText([
    "02074",
    "เด็กชายนักเรียนบัญชีข",
    "ตัวอย่าง",
    "ม.1/2",
  ]);
  await expect(
    page.getByRole("cell", { name: "เด็กชายนักเรียนบัญชีก", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".school-context")).toContainText(
    "โรงเรียนบัญชี ข",
  );
  current = access(userB, "suspended");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "บัญชีนี้ถูกระงับการใช้งาน" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "เด็กชายนักเรียนบัญชีข", exact: true }),
  ).toHaveCount(0);
});
test("Google entry and pending state have Thai accessible desktop and mobile layouts", async ({
  page,
}) => {
  let current: ReturnType<typeof access> | null = null;
  await fixtures(page, () => current);
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "เข้าสู่ระบบด้วย Google" }),
  ).toBeEnabled();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `.impeccable/review/accounts-login-${name}.png`,
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
  current = access(userA, "pending");
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "บัญชีของคุณกำลังรออนุมัติ" }),
  ).toBeVisible();
  await page.screenshot({
    path: ".impeccable/review/accounts-pending-mobile.png",
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
test("owner manages access with reasons and inspects another workspace read-only", async ({
  page,
}) => {
  const current = access(userA, "approved", "owner");
  await fixtures(page, () => current);
  let teacher = access(userB);
  const decisions: unknown[] = [];
  await page.route("**/api/admin/users", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      decisions.push(body);
      teacher = { ...teacher, status: body.status };
      return route.fulfill({
        json: { data: { userId: userB, status: body.status }, error: null },
      });
    }
    return route.fulfill({
      json: {
        data: [current, teacher].map((user) => ({
          ...user,
          createdAt: "2026-10-09T00:00:00Z",
          reviewedAt: null,
        })),
        error: null,
      },
    });
  });
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "ระงับการใช้งาน", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", {
    name: "ยืนยันระงับการใช้งาน",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByRole("textbox", { name: /เหตุผล/ })
    .fill("ระงับบัญชีทดสอบชั่วคราว");
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  expect(decisions).toEqual([
    { userId: userB, status: "suspended", reason: "ระงับบัญชีทดสอบชั่วคราว" },
  ]);
  await page.getByRole("button", { name: "อนุมัติ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: /เหตุผล/ })
    .fill("อนุมัติครูทดสอบอีกครั้ง");
  await page
    .getByRole("button", { name: "ยืนยันอนุมัติการใช้งาน", exact: true })
    .click();
  await page.getByRole("button", { name: "เปิดดูงาน", exact: true }).click();
  await expect(page.locator(".inspection-banner")).toContainText(
    "อ่านอย่างเดียว",
  );
  await expect(page.locator(".inspection-banner")).toContainText(
    teacher.displayName,
  );
  await expect(page.locator(".inspection-banner")).toContainText(teacher.email);
  await expect(page.locator(".school-context")).toContainText(
    "โรงเรียนบัญชี ข",
  );
  await page.getByRole("link", { name: "การตั้งค่า", exact: true }).click();
  await expect(page.getByLabel("ชื่อโรงเรียน", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "บันทึกการตั้งค่า", exact: true }),
  ).toBeDisabled();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await page.screenshot({
      path: `.impeccable/review/accounts-inspection-${name}.png`,
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
  await page
    .getByRole("button", { name: "กลับพื้นที่ของฉัน", exact: true })
    .click();
  await expect(page.locator(".inspection-banner")).toHaveCount(0);
  await expect(page.locator(".school-context")).toContainText(
    "โรงเรียนบัญชี ก",
  );
});
