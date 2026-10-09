import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("ScanSob manifest and home-screen icons are public without a teacher session", async ({
  page,
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    short_name: "ScanSob",
    display: "standalone",
    start_url: "/dashboard",
    scope: "/",
  });
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/png");
  }
  await page.goto("/login");
  await expect(page).toHaveTitle("ScanSob · สแกนสอบ");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/omr-assets/scansob-app-180.png",
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    "href",
    "/omr-assets/scansob-app-32.png",
  );
  await expect(
    page.locator('meta[name="apple-mobile-web-app-title"]'),
  ).toHaveAttribute("content", "ScanSob");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#defcf9",
  );
});

test("the supplied app logo appears on desktop, phone and iPad without covering controls", async ({
  page,
}) => {
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["phone", 390, 844],
    ["ipad-portrait", 768, 1024],
    ["ipad-landscape", 1024, 768],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/login");
    const logo = page.getByRole("img", { name: "ScanSob สแกนสอบ" });
    await expect(logo).toBeVisible();
    await expect
      .poll(() =>
        logo.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `.impeccable/review/scansob-login-${name}.png`,
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);

    await page.goto("/dashboard");
    if (width <= 900)
      await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click();
    const brand = page.locator(".sidebar .brand");
    await expect(brand).toContainText("ScanSob");
    await expect(brand.locator("img.app-logo")).toBeVisible();
    await expect
      .poll(() =>
        brand
          .locator("img")
          .evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.screenshot({
      path: `.impeccable/review/scansob-shell-${name}.png`,
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false);
  }
});
