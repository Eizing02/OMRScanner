import { test, expect } from "@playwright/test";
test.use({
  hasTouch: true,
  permissions: ["camera"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
});
test("actual OpenCV edge adapter and perspective crop on a digital fixture", async ({
  page,
}) => {
  await page.goto("/scan");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#273642";
    ctx.fillRect(0, 0, 900, 700);
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.moveTo(90, 80);
    ctx.lineTo(810, 60);
    ctx.lineTo(830, 620);
    ctx.lineTo(100, 640);
    ctx.closePath();
    ctx.fill();
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetic-perspective.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByAltText("ภาพต้นฉบับที่ถ่าย")).toBeVisible();
  await page.waitForFunction(() =>
    Boolean((window as unknown as { cv?: { Mat?: unknown } }).cv?.Mat),
  );
  const corner = page.getByRole("button", {
    name: "ปรับมุมบนซ้าย",
    exact: true,
  });
  const before = Number(await corner.getAttribute("data-x"));
  await corner.focus();
  await corner.press("ArrowRight");
  await expect
    .poll(async () => Number(await corner.getAttribute("data-x")))
    .toBeCloseTo(before + 0.005, 3);
  const box = (await corner.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 12,
    box.y + box.height / 2 + 12,
  );
  await page.mouse.up();
  expect(Number(await corner.getAttribute("data-x"))).toBeGreaterThan(
    before + 0.005,
  );
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: ".impeccable/review/scanner-corners-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThan(1);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: ".impeccable/review/scanner-corners-mobile.png",
    fullPage: true,
  });
  const mobileBox = (await corner.boundingBox())!;
  expect(mobileBox.width).toBeGreaterThanOrEqual(44);
  const beforeTouch = Number(await corner.getAttribute("data-x"));
  const cdp = await page.context().newCDPSession(page);
  const touch = { x: mobileBox.x + 24, y: mobileBox.y + 24 };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touch.x + 10, y: touch.y + 10 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(Number(await corner.getAttribute("data-x"))).toBeGreaterThan(
    beforeTouch,
  );
  await page.getByRole("button", { name: "ยืนยันมุมกระดาษ" }).click();
  await expect(page.getByAltText("ภาพหลังปรับมุม")).toBeVisible({
    timeout: 45000,
  });
  const dimensions = await page
    .getByAltText("ภาพหลังปรับมุม")
    .evaluate((el) => ({
      w: (el as HTMLImageElement).naturalWidth,
      h: (el as HTMLImageElement).naturalHeight,
    }));
  expect(dimensions).toEqual({ w: 1800, h: 1273 });
  await expect(
    page.getByText(
      "TODO: เชื่อมพื้นที่จัดเก็บภาพและ OMR worker ก่อนส่งตรวจจริง",
    ),
  ).toBeVisible();
});
test("camera capture works and media tracks stop after capture", async ({
  page,
}) => {
  await page.goto("/scan");
  await page.getByRole("button", { name: "เปิดกล้อง", exact: true }).click();
  await expect(page.locator("video")).toBeVisible();
  await page.waitForFunction(() => {
    const video = document.querySelector("video")!;
    return video.videoWidth > 0;
  });
  const playing = await page
    .locator("video")
    .evaluate((el) =>
      ((el as HTMLVideoElement).srcObject as MediaStream)
        .getTracks()
        .some((t) => t.readyState === "live"),
    );
  expect(playing).toBe(true);
  await page
    .getByRole("button", { name: "ถ่ายภาพกระดาษ", exact: true })
    .click();
  await expect(page.getByAltText("ภาพต้นฉบับที่ถ่าย")).toBeVisible();
  const stopped = await page
    .locator("video")
    .evaluate((el) =>
      ((el as HTMLVideoElement).srcObject as MediaStream)
        .getTracks()
        .every((t) => t.readyState === "ended"),
    );
  expect(stopped).toBe(true);
});
