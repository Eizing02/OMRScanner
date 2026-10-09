import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { appBrand } from "@/lib/app-brand";
import { defaultLayout } from "@/lib/omr/generate-template";

describe("ScanSob app branding", () => {
  it("preserves the supplied artwork byte for byte", async () => {
    const original = await readFile("public/omr-assets/scansob-logo.png");
    expect(createHash("sha256").update(original).digest("hex")).toBe(
      "28428e79658fdb2bd71d6181bb47cd625a35c39a26df9952ed19ebfbb67d8237",
    );
    expect((await sharp(original).metadata()).width).toBe(1254);
    expect(appBrand.logo).not.toContain("school-logo");
    // The generic paper layout must not acquire the app's brand artwork.
    expect(defaultLayout.logo).toBeNull();
  });

  it("provides square opaque PNGs for browser, iOS and Android", async () => {
    for (const size of [32, 180, 192, 512]) {
      const meta = await sharp(
        `public/omr-assets/scansob-app-${size}.png`,
      ).metadata();
      expect(meta).toMatchObject({
        format: "png",
        width: size,
        height: size,
        hasAlpha: false,
      });
    }
    const m = manifest();
    expect(m).toMatchObject({
      id: "/",
      short_name: "ScanSob",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      lang: "th",
    });
    expect(m.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: appBrand.logo,
          sizes: "192x192",
          purpose: "any",
        }),
        expect.objectContaining({
          src: appBrand.icon512,
          sizes: "512x512",
          purpose: "any",
        }),
        expect.objectContaining({
          src: appBrand.maskableIcon,
          sizes: "512x512",
          purpose: "maskable",
        }),
      ]),
    );
  });

  it("keeps the entire maskable artwork inside the central 80% safe circle", async () => {
    const { data, info } = await sharp(`public${appBrand.maskableIcon}`)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 512, height: 512, channels: 3 });
    let coloredPixels = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * 3;
        if (
          data[offset] < 245 ||
          data[offset + 1] < 245 ||
          data[offset + 2] < 245
        ) {
          coloredPixels++;
          expect(Math.hypot(x - 255.5, y - 255.5)).toBeLessThanOrEqual(204.8);
        }
      }
    }
    expect(coloredPixels).toBeGreaterThan(10000);
  });
});
