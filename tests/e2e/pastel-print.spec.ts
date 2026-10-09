import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

test("school PDF header has a large upright logo, dotted identity and no score label", async ({
  page,
}) => {
  await page.goto("/exams/demo-math/print");
  const sheet = page.getByRole("img", { name: "กระดาษคำตอบตัวอย่างหนึ่งใบ" });
  await expect(sheet.locator("[data-sheet-logo]")).toHaveAttribute(
    "width",
    "20",
  );
  await expect(
    sheet.locator("text").filter({ hasText: /^\.\.\.\.\.\.\.\.\.\.\. \/ 20$/ }),
  ).toHaveCount(1);
  await expect(sheet.locator("text").filter({ hasText: /^คะแนน/ })).toHaveCount(
    0,
  );
  await expect(sheet).toContainText("ระดับชั้น …ม.3…  ห้อง …1…");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })
    .click();
  await (await download).saveAs("output/pdf/school-answer-sheet-example.pdf");
});

for (const format of ["jpeg", "png"] as const)
  test(`${format} EXIF orientation is identical in preview and print without changing stored source`, async ({
    page,
  }) => {
    const source = sharp(
      Buffer.from(
        '<svg width="120" height="60"><rect width="120" height="60" fill="#d82030"/><rect x="0" width="40" height="60" fill="#184db0"/></svg>',
      ),
    );
    const buffer = await source
      .withMetadata({ orientation: 6 })
      [format]()
      .toBuffer();
    await page.goto("/settings");
    await page
      .getByLabel("อัปโหลดโลโก้โรงเรียน")
      .setInputFiles({
        name: `orientation.${format}`,
        mimeType: `image/${format}`,
        buffer,
      });
    const url = `data:image/${format};base64,${buffer.toString("base64")}`;
    await expect(page.getByAltText("โลโก้โรงเรียนปัจจุบัน")).toHaveAttribute(
      "src",
      url,
    );
    await page.goto("/exams/demo-math/print");
    await expect(page.locator("[data-sheet-logo]")).toHaveAttribute(
      "href",
      url,
    );
    const preview = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, url);
    expect(preview).toEqual({ width: 60, height: 120 });
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })
      .click();
    const pdf = (await readFile((await (await download).path())!)).toString(
      "latin1",
    );
    expect(pdf.includes("/Width 60")).toBe(true);
    expect(pdf.includes("/Height 120")).toBe(true);
    expect(pdf.includes("/DCTDecode")).toBe(false);
  });

test("palette roles and reduced motion keep feedback without spatial movement", async ({
  page,
}) => {
  await page.goto("/dashboard");
  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return ["--mint", "--sky", "--lavender", "--lilac"].map((name) =>
      styles.getPropertyValue(name).trim(),
    );
  });
  expect(tokens).toEqual(["#defcf9", "#cadefc", "#c3bef0", "#cca8e9"]);
  await expect(page.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(222, 252, 249)",
  );
  await expect(page.locator(".nav-item.active svg").first()).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.goto("/settings");
  await expect(
    page.getByText("รูปภาพขนาดไม่เกิน 5 MB", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ระบบจะลบภาพเก่าหลังบันทึกภาพใหม่สำเร็จ"),
  ).toHaveCount(0);
});
