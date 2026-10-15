import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { demoExams, demoReviews, demoStudents } from "@/lib/demo";

const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const school = "11111111-1111-4111-8111-111111111111";
const examId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const localConnection = "22222222-2222-4222-8222-222222222222";
const remoteConnection = "33333333-3333-4333-8333-333333333333";
const destination = "44444444-4444-4444-8444-444444444444";

const exam = { ...demoExams[0], id: examId, title: "แบบทดสอบสมการ ม.3/1" };
const confirmed = demoReviews.slice(0, 2).map((review, index) => ({
  ...review,
  id: `55555555-5555-4555-8555-55555555555${index}`,
  examId,
  examVersion: 2,
  status: "verified" as const,
  reason: "ยืนยันแล้ว",
  rawAnswers: exam.answerKey.map((item) => ({
    question: item.question,
    choice: item.correct,
    state: "valid" as const,
  })),
}));

async function fixtures(page: Page) {
  let readOnly = false;
  let recoveryFails = false;
  let connection: null | Record<string, unknown> = null;
  let publication: {
    state: string;
    revision: number;
    confirmed: number;
    pending: number;
    delivered: number;
    unmatched: string[];
    invalid: string[];
    lastError: string | null;
    lastSyncAt: string | null;
    recoveryRequired?: boolean;
    termClosed?: boolean;
  } = {
    state: "draft",
    revision: 0,
    confirmed: 2,
    pending: 0,
    delivered: 0,
    unmatched: [],
    invalid: [],
    lastError: null,
    lastSyncAt: null,
  };
  const overview = () => ({
    enabled: true,
    receiverReady: true,
    readOnly,
    connection,
    publication: {
      ...publication,
      canWithdraw:
        connection?.status === "active" &&
        !connection.revocationPending &&
        publication.revision > 0 &&
        !["withdraw_pending", "withdrawn"].includes(publication.state),
      canRetryWithdrawal:
        connection?.status === "active" &&
        !connection.revocationPending &&
        publication.state === "withdraw_pending" &&
        publication.lastError === "RECEIVER_UNAVAILABLE",
      withdrawalBlocked: publication.lastError === "WITHDRAWAL_PROOF_REQUIRED",
    },
  });
  await page.route("https://accounts-test.supabase.co/**", (route) =>
    route.fulfill({ status: 401, json: { error: "fixture_no_session" } }),
  );
  await page.route("**/api/auth/status", (route) =>
    route.fulfill({
      json: { data: { configured: true, googleEnabled: true } },
    }),
  );
  await page.route("**/api/me/context", (route) =>
    route.fulfill({
      json: {
        data: {
          userId: user,
          email: "teacher@example.test",
          displayName: "ครูทดสอบ",
          role: "teacher",
          status: "approved",
          schoolId: school,
        },
      },
    }),
  );
  await page.route(`**/api/exams/${examId}/publication`, async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      if (input.action === "withdraw")
        publication = {
          ...publication,
          state: "withdraw_pending",
          revision: publication.revision + 1,
          pending: 1,
          lastError: null,
        };
      else if (
        input.action === "retry" &&
        publication.state === "withdraw_pending"
      )
        publication = { ...publication, lastError: null, pending: 1 };
      else
        publication = {
          ...publication,
          state: "active",
          revision: publication.revision + 1,
          pending: 1,
          delivered: 0,
          unmatched: [],
          invalid: [],
          lastError: null,
        };
      return route.fulfill({ status: 202, json: { data: overview() } });
    }
    return route.fulfill({ json: { data: overview() } });
  });
  await page.route("**/api/integrations/mathquest", async (route) => {
    if (route.request().method() === "POST") {
      connection = {
        id: localConnection,
        connectionId: null,
        destinationSchoolId: null,
        destinationLabel: "",
        status: "pending_approval",
        mode: "manual",
        enabled: false,
        revocationPending: false,
        lastSyncAt: null,
        lastError: null,
      };
      return route.fulfill({ status: 202, json: { data: overview() } });
    }
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      if (input.action === "refresh")
        connection = {
          id: localConnection,
          connectionId: remoteConnection,
          destinationSchoolId: destination,
          destinationLabel: "โรงเรียนปลายทางทดสอบ",
          status: "active",
          mode: "manual",
          enabled: true,
          revocationPending: false,
          lastSyncAt: null,
          lastError: null,
        };
      else if (input.action === "mode")
        connection = {
          ...connection!,
          mode: input.mode,
          enabled: input.enabled,
        };
      else if (input.action === "recover") {
        if (recoveryFails) {
          connection = {
            ...connection!,
            recoveryPending: true,
            revocationPending: true,
          };
          return route.fulfill({
            status: 503,
            json: {
              error: {
                messageTh: "ติดต่อ MathQuest ไม่สำเร็จ กรุณาลองอีกครั้ง",
              },
            },
          });
        }
        connection = {
          ...connection!,
          enabled: false,
          status: "revoked",
          recoveryPending: false,
          revocationPending: false,
        };
      } else
        connection = {
          ...connection!,
          enabled: false,
          revocationPending: true,
        };
      return route.fulfill({ json: { data: overview() } });
    }
    return route.fulfill({ json: { data: overview() } });
  });
  await page.route("**/api/exams", (route) =>
    route.fulfill({ json: { data: [exam] } }),
  );
  await page.route("**/api/students", (route) =>
    route.fulfill({ json: { data: demoStudents } }),
  );
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      json: {
        data: {
          school: "โรงเรียนทดสอบ",
          image_url: null,
          image_public_id: null,
          revision: "66666666-6666-4666-8666-666666666666",
          settings: { academicYear: 2569, term: 1, subjects: ["คณิตศาสตร์"] },
          canUpload: true,
          cleanupPending: 0,
        },
      },
    }),
  );
  await page.route("**/api/omr-layouts", (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route("**/api/scan-records", (route) =>
    route.fulfill({ json: { data: { reviews: confirmed, versions: [exam] } } }),
  );
  return {
    pauseConnection() {
      connection = {
        id: localConnection,
        connectionId: remoteConnection,
        destinationSchoolId: destination,
        destinationLabel: "โรงเรียนปลายทางทดสอบ",
        status: "active",
        mode: "manual",
        enabled: false,
        revocationPending: false,
        recoveryPending: false,
        lastSyncAt: null,
        lastError: "CONNECTION_DENIED",
      };
    },
    recoveryFails(value: boolean) {
      recoveryFails = value;
    },
    publicationRecovery() {
      connection = {
        ...connection!,
        status: "active",
        enabled: true,
        recoveryPending: false,
        revocationPending: false,
      };
      publication = {
        ...publication,
        revision: 2,
        state: "error",
        recoveryRequired: true,
        lastError: "REMOTE_REVOKED",
      };
    },
    closeTerm() {
      publication = {
        ...publication,
        recoveryRequired: false,
        termClosed: true,
        lastError: "TERM_CLOSED",
      };
    },
    retryableWithdrawal() {
      publication = {
        ...publication,
        state: "withdraw_pending",
        pending: 1,
        lastError: "RECEIVER_UNAVAILABLE",
      };
    },
    withdrawalProofMissing() {
      publication = {
        ...publication,
        state: "error",
        pending: 1,
        lastError: "WITHDRAWAL_PROOF_REQUIRED",
      };
    },
    deliverPartial() {
      publication = {
        ...publication,
        state: "active",
        pending: 0,
        delivered: 1,
        unmatched: ["04217"],
        lastSyncAt: "2026-10-15T02:00:00.000Z",
      };
    },
    setReadOnly() {
      readOnly = true;
    },
  };
}

async function accessibleAndContained(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
}

test("pairs explicitly, publishes confirmed scores and stays usable on desktop phone and iPad", async ({
  page,
}) => {
  const state = await fixtures(page);
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "เชื่อมต่อ MathQuest" });
  await section.getByLabel("รหัสเชื่อมต่อ").fill("PAIR_1234");
  await section.getByRole("checkbox").check();
  await section.getByRole("button", { name: "ขอเชื่อมต่อ" }).click();
  await expect(section).toContainText("รออนุมัติ");
  await section.getByRole("button", { name: "ตรวจสถานะ" }).click();
  await expect(section).toContainText("โรงเรียนปลายทางทดสอบ");
  await section.getByRole("checkbox").check();
  await section
    .getByRole("combobox", { name: "การเผยแพร่" })
    .selectOption("auto_after_confirm");
  await expect(
    section.getByRole("combobox", { name: "การเผยแพร่" }),
  ).toHaveValue("auto_after_confirm");

  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
    ["ipad", 768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.locator("#mathquest-settings-title").scrollIntoViewIfNeeded();
    await accessibleAndContained(page);
    await page.screenshot({
      path: `.impeccable/review/integration-settings-${name}.png`,
      fullPage: true,
    });
  }

  await page.goto("/export");
  await page.getByRole("button", { name: "MathQuest" }).click();
  const dialog = page.getByRole("dialog", { name: "เผยแพร่คะแนนไป MathQuest" });
  await expect(dialog).toContainText("ยืนยันแล้ว");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "เผยแพร่คะแนน" }).click();
  await expect(dialog).toContainText("รอส่ง");
  state.deliverPartial();
  await dialog.getByRole("button", { name: "ตรวจสถานะ" }).click();
  await expect(dialog).toContainText("มีรหัสต้องตรวจ");
  await dialog.getByText("รหัสไม่ตรง 1 คน").click();
  await expect(dialog).toContainText("04217");
  await dialog.getByRole("button", { name: "ถอนเผยแพร่" }).click();
  await expect(dialog).toContainText("นักเรียนจะไม่เห็นคะแนนชุดนี้");

  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
    ["ipad", 768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    await accessibleAndContained(page);
    await page.screenshot({
      path: `.impeccable/review/integration-results-${name}.png`,
      fullPage: true,
    });
  }
});

test("read-only inspection cannot expose publication controls", async ({
  page,
}) => {
  const state = await fixtures(page);
  state.setReadOnly();
  await page.goto("/export");
  await expect(page.getByRole("button", { name: "MathQuest" })).toHaveCount(0);
});

test("recovers with explicit consent and honest retained-score states across supported viewports", async ({
  page,
}) => {
  const state = await fixtures(page);
  state.pauseConnection();
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "เชื่อมต่อ MathQuest" });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
    ["ipad", 768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByRole("button", { name: "กู้คืนการเชื่อมต่อ" }),
    ).toBeEnabled();
    await accessibleAndContained(page);
    await section.screenshot({
      path: `.impeccable/review/integration-recovery-${name}.png`,
    });
  }
  await section.getByRole("button", { name: "กู้คืนการเชื่อมต่อ" }).click();
  const dialog = page.getByRole("dialog", {
    name: "กู้คืนการเชื่อมต่อ MathQuest",
  });
  await expect(dialog).toContainText("คะแนนที่เคยเผยแพร่ยังไม่ถูกถอน");
  await expect(
    dialog.getByRole("button", { name: "ปิดหน้าต่าง", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "กลับ", exact: true }),
  ).toBeFocused();
  state.recoveryFails(true);
  await dialog.getByRole("button", { name: "ยืนยันกู้คืน" }).click();
  await expect(dialog).toContainText("ติดต่อ MathQuest ไม่สำเร็จ");
  state.recoveryFails(false);
  await dialog.getByRole("button", { name: "ยืนยันกู้คืน" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(section.getByLabel("รหัสเชื่อมต่อ")).toBeVisible();
  await expect(section.getByLabel("รหัสเชื่อมต่อ")).toBeFocused();
  state.publicationRecovery();
  await page.goto("/export");
  await page.getByRole("button", { name: "MathQuest", exact: true }).click();
  const publication = page.getByRole("dialog", {
    name: "เผยแพร่คะแนนไป MathQuest",
  });
  await expect(publication).toContainText("ถอนคะแนนเดิมผ่านการเชื่อมต่อนี้");
  await expect(
    publication.getByRole("button", { name: "เผยแพร่คะแนน", exact: true }),
  ).toBeDisabled();
  await expect(
    publication.getByRole("button", { name: "ถอนเผยแพร่", exact: true }),
  ).toBeEnabled();
  state.closeTerm();
  await publication.getByRole("button", { name: "ตรวจสถานะ" }).click();
  await expect(publication).toContainText(
    "ภาคเรียนนี้ปิดรับคะแนน แต่ขอถอนคะแนนเดิมได้",
  );
  await expect(
    publication.getByRole("button", { name: "ลองส่งใหม่" }),
  ).toBeDisabled();
  await expect(
    publication.getByRole("button", { name: "ถอนเผยแพร่", exact: true }),
  ).toBeEnabled();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
    ["ipad", 768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    await accessibleAndContained(page);
    await publication.screenshot({
      path: `.impeccable/review/integration-term-closed-${name}.png`,
    });
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "MathQuest", exact: true }),
  ).toBeFocused();
});

test("closed-term withdrawal confirms explicitly, retries transport only and explains missing proof", async ({
  page,
}) => {
  const state = await fixtures(page);
  state.pauseConnection();
  state.publicationRecovery();
  state.closeTerm();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/export");
  await page.getByRole("button", { name: "MathQuest", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "เผยแพร่คะแนนไป MathQuest" });
  await expect(
    dialog.getByRole("button", { name: "เผยแพร่คะแนน", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "ถอนเผยแพร่", exact: true }).click();
  await expect(dialog).toContainText("ถอนสำเร็จเมื่อ MathQuest ยืนยันแล้ว");
  await accessibleAndContained(page);
  await dialog.screenshot({
    path: ".impeccable/review/integration-purge-confirm-phone.png",
  });
  await dialog
    .getByRole("button", { name: "ยืนยันถอนเผยแพร่", exact: true })
    .click();
  await expect(dialog).toContainText("รอถอน");
  await expect(
    dialog.getByRole("button", { name: "ถอนเผยแพร่", exact: true }),
  ).toBeDisabled();
  state.retryableWithdrawal();
  await dialog.getByRole("button", { name: "ตรวจสถานะ" }).click();
  await expect(
    dialog.getByRole("button", { name: "ลองถอนอีกครั้ง", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "ลองถอนอีกครั้ง", exact: true })
    .click();
  await expect(dialog).toContainText("รอถอน");
  state.withdrawalProofMissing();
  await dialog.getByRole("button", { name: "ตรวจสถานะ" }).click();
  await expect(dialog).toContainText("กรุณาติดต่อผู้ดูแลปลายทาง");
  await expect(dialog).not.toContainText("มีงานรอส่ง");
  await expect(
    dialog.getByRole("button", { name: "ลองส่งใหม่", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "ขอถอนอีกครั้ง", exact: true }),
  ).toBeEnabled();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
    ["ipad", 768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    await accessibleAndContained(page);
    await dialog.screenshot({
      path: `.impeccable/review/integration-purge-proof-${name}.png`,
    });
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "MathQuest", exact: true }),
  ).toBeFocused();
});
