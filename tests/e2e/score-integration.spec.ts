import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { read, utils } from "xlsx";
import { demoExams, demoReviews, demoStudents } from "@/lib/demo";
import { scoreRow } from "@/lib/grading/recalculate";
import type { SignedPairingAvailability } from "@/types/integration";

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

async function fixtures(page: Page, results = confirmed) {
  let readOnly = false;
  let recoveryFails = false;
  let availability: SignedPairingAvailability = "ready";
  let rejectRequest = false;
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
    signedPairing: {
      destinationLabel: "โรงเรียนปลายทางทดสอบ",
      workspaceLabel: "พื้นที่ครูทดสอบ",
      availability,
    },
    publication: {
      ...publication,
      preview: {
        metadata: {
          title: exam.title,
          subject: exam.subject,
          classroom: exam.classroom,
          exam_type: exam.examType,
          academic_year: exam.year,
          term: exam.term,
        },
        confirmedCount: publication.confirmed,
        reviewCount: 1,
        identityIssueCount: 0,
        identityIssues: [],
        blocked: null,
        fingerprint: publication.revision.toString(16).padStart(64, "0"),
      },
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
  await page.route(
    (url) => url.pathname === `/api/exams/${examId}/publication`,
    async (route) => {
      if (route.request().method() === "POST") {
        const input = route.request().postDataJSON();
        if (input.action === "publish")
          expect(input.previewFingerprint).toBe(
            overview().publication.preview.fingerprint,
          );
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
    },
  );
  await page.route("**/api/integrations/mathquest", async (route) => {
    if (route.request().method() === "POST") {
      const input = route.request().postDataJSON();
      expect(input).toEqual({
        method: "signed",
        requestId: expect.any(String),
        consent: true,
      });
      connection = {
        id: input.requestId,
        connectionId: null,
        destinationSchoolId: null,
        destinationLabel: "โรงเรียนปลายทางทดสอบ",
        status: "pending_approval",
        signedStage: "waiting",
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
          id: connection?.id,
          connectionId: rejectRequest ? null : remoteConnection,
          destinationSchoolId: rejectRequest ? null : destination,
          destinationLabel: "โรงเรียนปลายทางทดสอบ",
          status: rejectRequest ? "error" : "active",
          signedStage: rejectRequest ? "rejected" : "active",
          mode: "manual",
          enabled: !rejectRequest,
          revocationPending: false,
          lastSyncAt: null,
          lastError: rejectRequest ? "CONNECTION_DENIED" : null,
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
                messageTh: "ติดต่อระบบเช็คชื่อไม่สำเร็จ กรุณาลองอีกครั้ง",
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
      } else if (
        input.action === "revoke" &&
        connection?.signedStage === "rejected"
      ) {
        expect(input.expectedRequestId).toBe(connection.id);
        connection = {
          ...connection,
          status: "revoked",
          signedStage: "cancelled",
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
  await page.route("**/api/students**", (route) =>
    route.fulfill({
      json: {
        data:
          route.request().method() === "POST"
            ? { added: 0, updated: 0 }
            : demoStudents,
      },
    }),
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
  await page.route("**/api/scan-records**", (route) => {
    const view = new URL(route.request().url()).searchParams.get("view");
    const score = exam.answerKey.reduce((sum, item) => sum + item.points, 0);
    return route.fulfill({
      json: {
        data:
          view === "summary"
            ? {
                activeCount: demoStudents.length,
                classrooms: [
                  ...new Set(demoStudents.map((s) => s.classroom_name)),
                ].map((name) => ({
                  name,
                  count: demoStudents.filter((s) => s.classroom_name === name)
                    .length,
                })),
                reviewCount: 0,
                recentReviews: [],
                exams: [
                  {
                    id: examId,
                    scanned: 2,
                    students: demoStudents.length,
                    reviewCount: 0,
                  },
                ],
              }
            : view === "results" || view === "queue"
              ? {
                  items: results.slice(0, 20).map((r) => ({
                    ...r,
                    score,
                    maxScore: score,
                    percent: 100,
                    passed: true,
                  })),
                  total: results.length,
                  counts: {
                    needs_review: 0,
                    verified: results.length,
                    voided: 0,
                  },
                  page: 0,
                  limit: 20,
                }
              : { reviews: confirmed, versions: [exam] },
      },
    });
  });
  return {
    setAvailability(value: SignedPairingAvailability) {
      availability = value;
    },
    rejectNextRequest() {
      rejectRequest = true;
    },
    pauseConnection(destinationLabel = "โรงเรียนปลายทางทดสอบ") {
      connection = {
        id: localConnection,
        connectionId: remoteConnection,
        destinationSchoolId: destination,
        destinationLabel,
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

test("downloads four file types through the compact score export dialog", async ({
  page,
}, testInfo) => {
  const results = Array.from({ length: 42 }, (_, index) => ({
    ...confirmed[0],
    id: crypto.randomUUID(),
    studentCode: String(2074 + index).padStart(5, "0"),
    classroom: exam.classroom,
    name: `นักเรียนทดสอบ ${index + 1}`,
    number: index + 1,
  }));
  await fixtures(page, results);
  const rows = results.map((item) => scoreRow(item, exam));
  const requests: unknown[] = [];
  await page.route("**/api/export", async (route) => {
    const input = route.request().postDataJSON();
    requests.push(input);
    await route.fulfill({
      json: {
        data: {
          rows: rows.filter(
            (_, index) => !input.scanIds || input.scanIds.includes(results[index].id),
          ),
        },
      },
    });
  });
  await page.goto("/export");
  const trigger = page.getByRole("button", {
    name: "ส่งออกคะแนน",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "ส่งออกคะแนน", exact: true });
  await trigger.click();
  await expect(dialog.getByText("ยืนยันแล้ว 42 คน")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Excel" })).toBeChecked();
  await expect(dialog.getByRole("radio")).toHaveCount(4);
  await accessibleAndContained(page);
  await page.screenshot({
    path: ".impeccable/review/score-export-desktop.png",
  });

  const formatGrid = dialog.locator(".score-export-formats");
  const columns = () =>
    formatGrid.evaluate(
      (grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length,
    );
  expect(await columns()).toBe(4);
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await columns()).toBe(4);
  await accessibleAndContained(page);
  await page.screenshot({ path: ".impeccable/review/score-export-tablet.png" });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await columns()).toBe(2);
  const excel = dialog.getByRole("radio", { name: "Excel" });
  await excel.focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("radio", { name: "PDF" })).toBeChecked();
  await accessibleAndContained(page);
  await page.screenshot({ path: ".impeccable/review/score-export-phone.png" });

  for (const [label, extension] of [
    ["Excel", "xlsx"],
    ["PDF", "pdf"],
    ["CSV", "csv"],
    ["Word", "docx"],
  ] as const) {
    if (!(await dialog.isVisible())) await trigger.click();
    await dialog.getByText(label, { exact: true }).click();
    const downloaded = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "ดาวน์โหลด", exact: true })
      .click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    const path = testInfo.outputPath(`score.${extension}`);
    await file.saveAs(path);
    const data = await readFile(path);
    if (extension === "xlsx") {
      const book = read(data, { type: "buffer" });
      const sheet = book.Sheets[book.SheetNames[0]];
      expect(sheet.B2).toMatchObject({ t: "s", v: "02074" });
      expect(utils.sheet_to_json(sheet)).toHaveLength(42);
    } else if (extension === "csv") {
      expect(data.subarray(0, 3).toString("hex")).toBe("efbbbf");
      expect(data.toString("utf8")).toContain("02074");
      expect(data.toString("utf8").trimEnd().split(/\r?\n/)).toHaveLength(43);
    } else if (extension === "pdf") {
      expect(data.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(data.toString("latin1")).toMatch(/\/Count [2-9]\b/);
    } else {
      expect(data.subarray(0, 2).toString("ascii")).toBe("PK");
      expect(data.includes(Buffer.from("word/document.xml"))).toBe(true);
    }
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  const individualDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "ดาวน์โหลดรายงาน 02074", exact: true })
    .click();
  const individual = await individualDownload;
  expect(individual.suggestedFilename()).toBe("ผลคะแนนรายบุคคล.pdf");
  expect(requests).toEqual([
    ...["xlsx", "pdf", "csv", "docx"].map((format) => ({ examId, format })),
    { examId, format: "pdf", scanIds: [results[0].id] },
  ]);
});

test("pairs explicitly, publishes confirmed scores and stays usable on desktop phone and iPad", async ({
  page,
}) => {
  const state = await fixtures(page);
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "เชื่อมต่อระบบเช็คชื่อ" });
  const requestButton = section.getByRole("button", {
    name: "ขออนุมัติส่งคะแนน",
  });
  await expect(section.getByRole("textbox")).toHaveCount(0);
  await expect(section.getByRole("checkbox")).toHaveCount(0);
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
    ["ipad", 768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(requestButton).toBeVisible();
    await accessibleAndContained(page);
    await section.screenshot({
      path: `.impeccable/review/integration-request-${name}.png`,
    });
  }
  await requestButton.focus();
  await page.keyboard.press("Enter");
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
  await page.getByRole("button", { name: "ส่งคะแนนไประบบเช็คชื่อ" }).click();
  const dialog = page.getByRole("dialog", { name: "ส่งคะแนนไประบบเช็คชื่อ" });
  await expect(dialog).toContainText("ยืนยันแล้ว");
  await expect(dialog).toContainText("รอตรวจ");
  await expect(dialog).toContainText("ภาคเรียน");
  await dialog.getByRole("checkbox").check();
  await page.screenshot({
    path: ".impeccable/review/integration-score-preview-ipad.png",
  });
  await dialog.getByRole("button", { name: "เผยแพร่คะแนน" }).click();
  await expect(dialog).toContainText("รอส่ง");
  state.deliverPartial();
  await dialog.getByRole("button", { name: "ตรวจสถานะ" }).click();
  await expect(dialog).toContainText("ส่งบางส่วน");
  await dialog.getByText("รหัสไม่พบในระบบเช็คชื่อ 1 คน").click();
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
  await expect(
    page.getByRole("button", { name: "ส่งคะแนนไประบบเช็คชื่อ" }),
  ).toHaveCount(0);
});

test("closed intake or an unavailable receiver never falls back to a code", async ({
  page,
}) => {
  const state = await fixtures(page);
  state.setAvailability("closed");
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "เชื่อมต่อระบบเช็คชื่อ" });
  const request = section.getByRole("button", { name: "ขออนุมัติส่งคะแนน" });
  const refresh = section.getByRole("button", {
    name: "ตรวจความพร้อมอีกครั้ง",
  });
  await expect(section).toContainText("ระบบเช็คชื่อยังไม่เปิดรับคำขอ");
  await expect(section.getByRole("textbox")).toHaveCount(0);
  await expect(request).toHaveCount(0);
  state.setAvailability("unavailable");
  await refresh.click();
  await expect(section).toContainText("ตรวจความพร้อมของระบบเช็คชื่อไม่ได้");
  await expect(request).toHaveCount(0);
  state.setAvailability("ready");
  await refresh.click();
  await expect(request).toBeEnabled();
});

test("shows the attendance brand for a stored fallback without replacing school names", async ({
  page,
}) => {
  const state = await fixtures(page);
  state.pauseConnection("MathQuest");
  await page.goto("/settings");
  const settings = page.getByRole("region", { name: "เชื่อมต่อระบบเช็คชื่อ" });
  await expect(
    settings.getByText("ระบบเช็คชื่อ", { exact: true }),
  ).toBeVisible();
  await expect(settings).not.toContainText("MathQuest");
  await page.goto("/export");
  const open = page.getByRole("button", { name: "ส่งคะแนนไประบบเช็คชื่อ" });
  const dialog = page.getByRole("dialog", { name: "ส่งคะแนนไประบบเช็คชื่อ" });
  await open.click();
  await expect(dialog.getByText("ระบบเช็คชื่อ", { exact: true })).toBeVisible();
  await expect(dialog).not.toContainText("MathQuest");
  state.pauseConnection("โรงเรียนปลายทางทดสอบ");
  await dialog.getByRole("button", { name: "ตรวจสถานะ" }).click();
  await expect(
    dialog.getByText("โรงเรียนปลายทางทดสอบ", { exact: true }),
  ).toBeVisible();
});

test("a rejected request can be closed and submitted again from settings", async ({
  page,
}) => {
  const state = await fixtures(page);
  state.rejectNextRequest();
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "เชื่อมต่อระบบเช็คชื่อ" });
  const request = section.getByRole("button", { name: "ขออนุมัติส่งคะแนน" });
  await request.click();
  await expect(section).toContainText("รออนุมัติ");
  await section.getByRole("button", { name: "ตรวจสถานะ" }).click();
  await expect(section.getByRole("status")).toHaveText("ปฏิเสธ");
  await section.getByRole("button", { name: "ปิดคำขอ", exact: true }).click();
  await page.getByRole("button", { name: "ยืนยันปิดคำขอ" }).click();
  await expect(request).toBeFocused();
  await request.click();
  await expect(section).toContainText("รออนุมัติ");
});

test("a signed request recovers a lost response before polling status", async ({
  page,
}) => {
  await fixtures(page);
  let signed: Record<string, unknown> | null = null;
  const send = () => ({
    enabled: true,
    receiverReady: true,
    readOnly: false,
    connection: signed,
    publication: null,
    signedPairing: signed
      ? null
      : {
          destinationLabel: "โรงเรียนปลายทางทดสอบ",
          workspaceLabel: "พื้นที่ครูทดสอบ",
          availability: "ready",
        },
  });
  await page.route("**/api/integrations/mathquest", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      const request = route.request().postDataJSON();
      expect(request).toEqual({
        method: "signed",
        requestId: expect.any(String),
        consent: true,
      });
      signed = {
        id: request.requestId,
        connectionId: null,
        destinationSchoolId: null,
        destinationLabel: "โรงเรียนปลายทางทดสอบ",
        status: "pending_approval",
        signedStage: "submit",
        mode: "manual",
        enabled: false,
        revocationPending: false,
        lastSyncAt: null,
        lastError: null,
      };
      return route.fulfill({
        status: 503,
        json: { error: { messageTh: "ติดต่อระบบเช็คชื่อไม่สำเร็จ" } },
      });
    }
    if (method === "PATCH") {
      expect(route.request().postDataJSON()).toEqual({
        action: "refresh",
        expectedRequestId: signed?.id,
      });
      signed =
        signed?.signedStage === "submit"
          ? { ...signed, signedStage: "waiting" }
          : {
              ...signed,
              signedStage: "active",
              status: "active",
              enabled: true,
              connectionId: remoteConnection,
              destinationSchoolId: destination,
            };
    }
    return route.fulfill({ json: { data: send() } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "เชื่อมต่อระบบเช็คชื่อ" });
  await expect(section).toContainText("พื้นที่ครูทดสอบ");
  await expect(section.getByLabel("รหัสเชื่อมต่อ")).toHaveCount(0);
  await section.getByRole("button", { name: "ขออนุมัติส่งคะแนน" }).click();
  await expect(section).toContainText("ยังยืนยันผลไม่ได้");
  await expect(
    section.getByRole("button", { name: "ขออนุมัติส่งคะแนน" }),
  ).toHaveCount(0);
  await section.getByRole("button", { name: "ลองส่งคำขอเดิม" }).click();
  await expect(section).toContainText("รออนุมัติ");
  await accessibleAndContained(page);
  await page.screenshot({
    path: ".impeccable/review/integration-signed-phone.png",
    fullPage: true,
  });
  await section.getByRole("button", { name: "ตรวจสถานะ" }).click();
  await expect(section).toContainText("เชื่อมต่อแล้ว");
  await expect(
    section.getByRole("combobox", { name: "การเผยแพร่" }),
  ).toHaveValue("manual");
});

test("recovers with explicit consent and honest retained-score states across supported viewports", async ({
  page,
}) => {
  const state = await fixtures(page);
  state.pauseConnection();
  await page.goto("/settings");
  const section = page.getByRole("region", { name: "เชื่อมต่อระบบเช็คชื่อ" });
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
    name: "กู้คืนการเชื่อมต่อระบบเช็คชื่อ",
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
  await expect(dialog).toContainText("ติดต่อระบบเช็คชื่อไม่สำเร็จ");
  state.recoveryFails(false);
  await dialog.getByRole("button", { name: "ยืนยันกู้คืน" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    section.getByRole("button", { name: "ขออนุมัติส่งคะแนน" }),
  ).toBeFocused();
  state.publicationRecovery();
  await page.goto("/export");
  await page
    .getByRole("button", { name: "ส่งคะแนนไประบบเช็คชื่อ", exact: true })
    .click();
  const publication = page.getByRole("dialog", {
    name: "ส่งคะแนนไประบบเช็คชื่อ",
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
    page.getByRole("button", { name: "ส่งคะแนนไประบบเช็คชื่อ", exact: true }),
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
  await page
    .getByRole("button", { name: "ส่งคะแนนไประบบเช็คชื่อ", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "ส่งคะแนนไประบบเช็คชื่อ" });
  await expect(
    dialog.getByRole("button", { name: "เผยแพร่คะแนน", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "ถอนเผยแพร่", exact: true }).click();
  await expect(dialog).toContainText("ถอนสำเร็จเมื่อระบบเช็คชื่อยืนยันแล้ว");
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
    page.getByRole("button", { name: "ส่งคะแนนไประบบเช็คชื่อ", exact: true }),
  ).toBeFocused();
});
