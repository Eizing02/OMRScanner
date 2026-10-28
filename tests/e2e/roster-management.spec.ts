import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as XLSX from "xlsx";
import { readFile } from "node:fs/promises";
import { rosterBrowserFixture } from "./roster-fixtures";
import { owner, teacherA } from "../score-integration-fixture";
test.use({ actionTimeout: 15000 });

async function capture(page: Page, surface: string) {
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
    ["ipad", 768, 1024],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
      document
        .querySelectorAll<HTMLElement>(".main-content, .table-scroll")
        .forEach((el) => el.scrollTo(0, 0));
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `.impeccable/review/student-management-${surface}-${name}.png`,
      fullPage: true,
      style: "nextjs-portal { display: none; }",
    });
  }
}
function workbook(rows: string[][]) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["รหัสประจำตัว", "ชื่อ", "นามสกุล", "ระดับชั้น"],
      ...rows,
    ]),
    "รายชื่อนักเรียน",
  );
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

test("a paged connected review loads one detail and confirms through the existing authoritative RPC", async ({
  page,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  const f = await rosterBrowserFixture(page);
  try {
    const old = await f.exam();
    await page.goto("/review");
    await expect(
      page.getByRole("button", { name: "ยืนยันคะแนน", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    expect(
      f.requests.filter((r) => r.method === "GET" && r.view === "detail"),
    ).toHaveLength(1);
    await expect(page.locator(".answer-review-scroll tbody tr")).toHaveCount(
      20,
    );
    await page
      .getByRole("button", { name: "ยืนยันคะแนน", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "ยืนยันคะแนน", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(
      (
        await f.db.query<{ status: string }>(
          "select status from public.exam_results where scan_id=$1",
          [old.scanId],
        )
      ).rows[0].status,
    ).toBe("confirmed");
    expect(runtimeErrors).toEqual([]);
  } finally {
    await f.db.close();
  }
});

test("batch confirmation previews current-page readiness and confirms selected scores through PostgreSQL", async ({
  page,
}) => {
  const f = await rosterBrowserFixture(page);
  try {
    for (const file of [
      "202610280017_print_v5.sql",
      "202610280018_batch_confirmation.sql",
    ])
      await f.db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    const ready = await f.exam(0),
      unclear = await f.exam(1);
    await f.db.query(
      "update detected_answers set detection_status='ambiguous' where scan_id=$1 and question_number=1",
      [unclear.scanId],
    );
    await f.db.query("select private.recalculate_scan($1)", [unclear.scanId]);
    await page.goto("/review");
    await page
      .getByRole("button", { name: "ยืนยันหลายรายการ", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "ยืนยันคะแนนที่เลือก" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "ยืนยัน 1 รายการ", exact: true }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole("checkbox", { name: /ยืนยัน 00124/ }),
    ).toBeDisabled();
    for (const [name, width, height] of [
      ["phone", 390, 844],
      ["ipad", 768, 1024],
      ["ipad-landscape", 1024, 768],
      ["desktop", 1440, 1000],
    ] as const) {
      await page.setViewportSize({ width, height });
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
      await page.screenshot({
        path: `.impeccable/review/batch-confirm-${name}.png`,
        fullPage: true,
      });
    }
    await dialog
      .getByRole("button", { name: "ยืนยัน 1 รายการ", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    const states = (
      await f.db.query<{ id: string; scan_status: string }>(
        "select id,scan_status from scan_records where id=any($1::uuid[])",
        [[ready.scanId, unclear.scanId]],
      )
    ).rows;
    expect(states.find((r) => r.id === ready.scanId)?.scan_status).toBe(
      "confirmed",
    );
    expect(states.find((r) => r.id === unclear.scanId)?.scan_status).toBe(
      "pending_review",
    );
  } finally {
    await f.db.close();
  }
});

test("manual edits, exact-code file updates and removal preserve confirmed history and scoped reads", async ({
  page,
}) => {
  const f = await rosterBrowserFixture(page);
  try {
    const old = await f.exam();
    await f.confirm(old.scanId);
    await page.goto("/students");
    await expect(
      page.getByRole("button", { name: "แก้ไข 00123", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "เพิ่มนักเรียน", exact: true })
      .click();
    const form = page.getByRole("dialog", {
      name: "เพิ่มนักเรียน",
      exact: true,
    });
    await form.getByLabel("รหัสประจำตัว", { exact: true }).fill("02000");
    await form.getByLabel("คำนำหน้า").selectOption("เด็กชาย");
    await form.getByLabel("ชื่อ", { exact: true }).fill("สมชาย");
    await form.getByLabel("นามสกุล", { exact: true }).fill("ใจดี");
    await expect(page.getByRole("dialog")).toHaveAccessibleName(
      "เพิ่มนักเรียน",
    );
    await form
      .getByRole("combobox", { name: "ชั้น / ห้อง", exact: true })
      .selectOption("ม.1/1");
    await form
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    await expect(form).toBeHidden();
    await expect(
      page.getByRole("button", { name: "แก้ไข 02000", exact: true }),
    ).toBeVisible();
    const id = (
      await f.db.query<{ id: string }>(
        "select id from public.students where school_id=$1 and student_code='02000'",
        [f.schoolA],
      )
    ).rows[0].id;
    await page
      .getByRole("button", { name: "แก้ไข 02000", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("นามสกุล", { exact: true })
      .fill("ใจดีใหม่");
    await page
      .getByRole("button", { name: "บันทึกข้อมูล", exact: true })
      .click();
    await expect(page.getByText("ใจดีใหม่", { exact: true })).toBeVisible();
    await page.goto("/students/import");
    await page
      .getByLabel("เลือกไฟล์รายชื่อนักเรียน", { exact: true })
      .setInputFiles({
        name: "เลื่อนชั้นสังเคราะห์.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: workbook([
          ["02000", "นายสมชาย", "ใจดีใหม่", "ม.4"],
          ["00123", "นายนักเรียน", "จำลอง", "ม.4"],
          ["03000", "นางสาวนักเรียนใหม่", "ตัวอย่าง", "ม.4"],
        ]),
      });
    await page
      .getByRole("button", { name: "ตรวจ 3 รายชื่อ", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "ยืนยันบันทึก 3 รายชื่อ", exact: true }),
    ).toBeEnabled();
    await page.locator(".roster-diff").first().locator("summary").click();
    await capture(page, "import-diff");
    await page
      .getByRole("button", { name: "ยืนยันบันทึก 3 รายชื่อ", exact: true })
      .click();
    await expect(page).toHaveURL(/\/students$/);
    await expect(page.getByText("นายสมชาย", { exact: true })).toBeVisible();
    expect(
      (
        await f.db.query<{ id: string }>(
          "select id from public.students where school_id=$1 and student_code='02000'",
          [f.schoolA],
        )
      ).rows[0].id,
    ).toBe(id);
    await page.goto(`/exams/${old.examId}/results`);
    await expect(
      page.locator("tbody").getByText("เด็กชายนักเรียน จำลอง", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("tbody").getByText("ม.1/1", { exact: true }),
    ).toBeVisible();
    await page.goto("/students");
    await page
      .getByRole("button", { name: "นำออก 02000", exact: true })
      .click();
    await page
      .getByRole("button", { name: "ยืนยันนำออก", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "แก้ไข 02000", exact: true }),
    ).toBeHidden();
    await page
      .getByRole("combobox", { name: "รายชื่อ", exact: true })
      .selectOption("inactive");
    await page
      .getByRole("button", { name: "คืนรายชื่อ 02000", exact: true })
      .click();
    await page
      .getByRole("button", { name: "ยืนยันคืนรายชื่อ", exact: true })
      .click();
    expect(
      (
        await f.db.query<{ score: string; status: string }>(
          "select score,status from public.exam_results where scan_id=$1",
          [old.scanId],
        )
      ).rows[0],
    ).toEqual({ score: "20", status: "confirmed" });
    expect(
      f.requests.filter(
        (r) =>
          r.method === "GET" &&
          ["/api/students", "/api/scan-records", "/api/omr-layouts"].includes(
            r.path,
          ) &&
          !r.view &&
          r.path !== "/api/omr-layouts",
      ),
    ).toEqual([]);
  } finally {
    await f.db.close();
  }
});

test("school grants, class subscriptions, automatic promotion and local exclusions are explicit", async ({
  page,
}) => {
  const f = await rosterBrowserFixture(page, owner);
  try {
    const ownerSchool = (
      await f.rpc<{ schoolId: string }>(owner, "get_access_context")
    ).schoolId;
    await f.rpc(owner, "import_students", {
      school_id: ownerSchool,
      filename: "ทะเบียนสังเคราะห์.csv",
      students: [
        {
          student_code: "02000",
          prefix: "เด็กชาย",
          first_name: "สมชาย",
          last_name: "ตัวอย่าง",
          classroom_name: "ม.3/1",
          number: null,
        },
      ],
    });
    await page.goto("/students");
    await page
      .getByRole("button", { name: "ทะเบียนโรงเรียน", exact: true })
      .click();
    await page
      .getByRole("button", { name: "สร้างทะเบียนโรงเรียน", exact: true })
      .click();
    await page
      .getByLabel("ชื่อโรงเรียน", { exact: true })
      .fill("โรงเรียนทะเบียนสังเคราะห์");
    await page
      .getByRole("button", { name: "สร้างทะเบียน", exact: true })
      .click();
    await page
      .getByRole("button", { name: "จัดการทะเบียน", exact: true })
      .click();
    await page
      .getByRole("button", { name: "ใช้รายชื่อในพื้นที่ของฉัน", exact: true })
      .click();
    await page
      .getByRole("button", { name: "ยืนยันนำเข้าทะเบียนกลาง", exact: true })
      .click();
    await page.getByRole("button", { name: "สิทธิ์ครู", exact: true }).click();
    await page
      .getByRole("combobox", { name: "ครูที่ได้รับอนุมัติ", exact: true })
      .selectOption(teacherA);
    await page
      .getByRole("button", { name: "ให้สิทธิ์ทะเบียนโรงเรียนนี้", exact: true })
      .click();
    await expect(
      page.getByText("teacher-a@example.test", { exact: false }).last(),
    ).toBeVisible();
    f.setActor(teacherA);
    await page.reload();
    await page
      .getByRole("button", { name: "ทะเบียนโรงเรียน", exact: true })
      .click();
    await page.getByLabel("ม.3/1", { exact: false }).check();
    await capture(page, "directory");
    await page
      .getByRole("button", { name: "ตรวจรายชื่อที่จะดึง", exact: true })
      .click();
    await page
      .getByRole("button", { name: "ยืนยันติดตามห้อง", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "ทะเบียนโรงเรียน", exact: true })
      .getByRole("button", { name: "ปิด", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "แก้ไข 02000", exact: true }),
    ).toBeVisible();
    const directory = (
      await f.db.query<{ id: string }>(
        "select id from public.roster_directories",
      )
    ).rows[0].id;
    const plan = await f.rpc<{ planId: string }>(
      owner,
      "preview_directory_import",
      {
        school_id: ownerSchool,
        directoryId: directory,
        filename: "รุ่นใหม่.csv",
        students: [
          {
            student_code: "02000",
            prefix: "นาย",
            first_name: "สมชาย",
            last_name: "ตัวอย่าง",
            classroom_name: "ม.4/1",
            number: null,
          },
          {
            student_code: "02002",
            prefix: "เด็กชาย",
            first_name: "รุ่นใหม่",
            last_name: "ตัวอย่าง",
            classroom_name: "ม.3/1",
            number: null,
          },
        ],
      },
    );
    await f.rpc(owner, "apply_directory_import", {
      school_id: ownerSchool,
      planId: plan.planId,
      consent: true,
    });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "แก้ไข 02000", exact: true }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "แก้ไข 02002", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "นำออก 02002", exact: true })
      .click();
    await page
      .getByRole("button", { name: "ยืนยันนำออก", exact: true })
      .click();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "แก้ไข 02002", exact: true }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: "แก้ไข 00123", exact: true }),
    ).toBeVisible();
  } finally {
    await f.db.close();
  }
});

test("server pagination, all-matching selection and Excel downloads cover more than the visible page", async ({
  page,
}) => {
  const f = await rosterBrowserFixture(page);
  try {
    await f.rpc(teacherA, "import_students", {
      school_id: f.schoolA,
      filename: "หลายหน้า.csv",
      students: Array.from({ length: 70 }, (_, i) => ({
        student_code: String(4000 + i).padStart(5, "0"),
        prefix: "เด็กหญิง",
        first_name: `นักเรียน${i}`,
        last_name: "นามสกุลตัวอย่างสำหรับตรวจความกว้าง",
        classroom_name: "ม.1/1",
        number: null,
      })),
    });
    await page.goto("/students");
    await expect(
      page.getByRole("button", { name: "แก้ไข 04000", exact: true }),
    ).toBeVisible();
    await capture(page, "list");
    await page.getByText("ดาวน์โหลด", { exact: true }).click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "รายชื่อตามตัวกรอง · Excel", exact: true })
      .click();
    const stream = await (await download).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const book = XLSX.read(Buffer.concat(chunks), { type: "buffer" });
    expect(
      XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]),
    ).toHaveLength(72);
    await page.getByLabel("เลือกทั้งหน้านี้", { exact: true }).check();
    await page
      .getByRole("button", {
        name: "เลือกทั้งหมด 72 คนตามตัวกรอง",
        exact: true,
      })
      .click();
    await page.getByLabel("เลือก 04000", { exact: true }).uncheck();
    await page
      .getByRole("button", { name: "นำออกที่เลือก", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "นำออกจากรายชื่อ", exact: true })
        .getByText("นำออก 71 คน", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "ยืนยันนำออก", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "แก้ไข 04000", exact: true }),
    ).toBeVisible();
    expect(
      await f.rpc(teacherA, "get_student_roster", { school_id: f.schoolA }),
    ).toMatchObject({ total: 1, activeCount: 1 });
    await page
      .getByRole("button", { name: "เพิ่มนักเรียน", exact: true })
      .click();
    await capture(page, "form");
  } finally {
    await f.db.close();
  }
});
