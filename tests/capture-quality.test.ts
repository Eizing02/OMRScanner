import { describe, expect, it } from "vitest";
import {
  captureGeometry,
  advanceCaptureStability,
  luminanceQuality,
  assessPaperQuality,
} from "@/lib/omr/capture-quality";
import sharp from "sharp";
import { captureFixture } from "./capture-fixture";
import type { Quad } from "@/lib/omr/camera-geometry";
const a4: Quad = [
  { x: 0.1, y: 0.05 },
  { x: 0.9, y: 0.05 },
  { x: 0.9, y: 0.95 },
  { x: 0.1, y: 0.95 },
];
describe("auto-capture gates (heuristics, not physical accuracy claims)", () => {
  it("accepts printed QR/markers, rejects missing markers, wrong QR and blurred answer regions", async () => {
    const { image, template } = await captureFixture();
    const raster = async (buffer: Buffer) => {
      const { data, info } = await sharp(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(data),
      };
    };
    const paper = await raster(image);
    expect(assessPaperQuality(paper, template, true)).toBeNull();
    expect(
      assessPaperQuality(
        paper,
        { ...template, set_token: `SAS2:${"0".repeat(64)}` },
        true,
      ),
    ).toContain("QR");
    const missing = await sharp(image)
      .composite([
        {
          input: {
            create: { width: 30, height: 30, channels: 4, background: "white" },
          },
          left: 30,
          top: 30,
        },
      ])
      .png()
      .toBuffer();
    expect(assessPaperQuality(await raster(missing), template, true)).toContain(
      "จุดดำ",
    );
    const bottom = await sharp(image)
      .extract({ left: 0, top: 425, width: 900, height: 730 })
      .blur(10)
      .png()
      .toBuffer();
    const blurred = await sharp(image)
      .composite([{ input: bottom, left: 0, top: 425 }])
      .png()
      .toBuffer();
    expect(assessPaperQuality(await raster(blurred), template, true)).toContain(
      "คำตอบยังไม่ชัด",
    );
  });
  it("requires correct paper shape, all corners inside frame and enough native pixels", () => {
    expect(captureGeometry(a4, 1920, 1200, false)).toBeNull();
    expect(captureGeometry(a4, 1920, 1200, true)).toContain("ขนาน");
    expect(captureGeometry(a4, 640, 400, false)).toContain("ละเอียด");
    expect(
      captureGeometry(
        [{ x: 0, y: 0 }, ...a4.slice(1)] as Quad,
        1920,
        1200,
        false,
      ),
    ).toContain("4 มุม");
  });
  it("requires five consecutive eligible stable frames, resets on motion or missing QR/quality, and caps progress", () => {
    let progress = 0;
    for (let i = 0; i < 5; i++)
      progress = advanceCaptureStability(progress, 0.005, true);
    expect(progress).toBe(5);
    expect(advanceCaptureStability(progress, 0.03, true)).toBe(0);
    expect(advanceCaptureStability(progress, 0, false)).toBe(0);
    expect(advanceCaptureStability(progress, 0, true)).toBe(5);
  });
  it("separates blank/flat blurry frames from sharp printed contrast and detects low light", () => {
    const raster = (draw: (x: number, y: number) => number) => ({
      width: 120,
      height: 120,
      data: Uint8ClampedArray.from({ length: 120 * 120 * 4 }, (_, i) =>
        i % 4 === 3
          ? 255
          : draw(Math.floor(i / 4) % 120, Math.floor(i / 4 / 120)),
      ),
    });
    expect(luminanceQuality(raster(() => 255)).sharpness).toBe(0);
    expect(
      luminanceQuality(
        raster((x, y) => (x % 10 === 0 || y % 10 === 0 ? 0 : 255)),
      ).sharpness,
    ).toBeGreaterThan(35);
    expect(luminanceQuality(raster(() => 80)).brightness).toBeLessThan(145);
  });
});
