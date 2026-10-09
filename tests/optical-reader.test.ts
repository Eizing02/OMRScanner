import { describe, it, expect } from "vitest";
import sharp from "sharp";
import QRCode from "qrcode";
import { readFile } from "node:fs/promises";
import { classifyFills, readOpticalMarks } from "@/lib/omr/detect-bubbles";
import { rasterRegion, readSetQr, type Raster } from "@/lib/omr/scan-qr";
import {
  defaultLayout,
  compileOmrTemplate,
  resolveGeometry,
  layoutSchema,
} from "@/lib/omr/generate-template";
import { createSetIdentity } from "@/lib/omr/qr";
import type { LockedScanTemplate } from "@/types/scan";
function fixture(full = false, questionCount = 20, choiceCount: 4 | 5 = 4) {
  const layout = {
      ...defaultLayout,
      questionCount,
      choiceCount,
      paperMode: full ? ("full" as const) : ("auto" as const),
    },
    g = resolveGeometry(layout),
    omr = compileOmrTemplate(layout);
  const width = full ? 1800 : 900,
    height = Math.round((width * 210) / g.sheetWidth),
    data = new Uint8ClampedArray(width * height * 4).fill(255);
  const image = { width, height, data },
    scale = width / g.sheetWidth;
  const disk = (x: number, y: number, r: number) => {
    for (
      let py = Math.floor((y - r) * scale);
      py <= Math.ceil((y + r) * scale);
      py++
    )
      for (
        let px = Math.floor((x - r) * scale);
        px <= Math.ceil((x + r) * scale);
        px++
      )
        if ((px / scale - x) ** 2 + (py / scale - y) ** 2 <= r * r) {
          const pos = (py * width + px) * 4;
          data[pos] = data[pos + 1] = data[pos + 2] = 0;
        }
  };
  for (const m of g.markers) disk(m.x + 1.5, m.y + 1.5, 1.2);
  for (const b of omr.centersMm.id)
    if ("02074"[b.digit] === String(b.value)) disk(b.x, b.y, 1.8);
  return {
    image,
    disk,
    template: { layout_json: layout, omr_json: omr } as LockedScanTemplate,
  };
}
describe("optical reader and QR", () => {
  it("classifies blank, multiple, weak and close marks without guessing", () => {
    expect(classifyFills([0, 4, 8, 19]).state).toBe("blank");
    expect(classifyFills([55, 56, 1, 0]).state).toBe("multiple");
    expect(classifyFills([54, 2, 0, 1]).state).toBe("ambiguous");
    expect(classifyFills([60, 50, 1, 0]).state).toBe("ambiguous");
    expect(classifyFills([90, 2, 3, 1])).toMatchObject({
      state: "valid",
      index: 0,
    });
  });
  it("preserves 02074 and uses locked centers for full/half layouts", () => {
    for (const [full, count, choices] of [
      [false, 20, 4],
      [true, 20, 4],
      [true, 60, 5],
    ] as const) {
      const f = fixture(full, count, choices),
        b = f.template.omr_json.centersMm.answers.find(
          (b) => b.question === 3 && b.option === 2,
        )!;
      f.disk(b.x, b.y, 1.8);
      const read = readOpticalMarks(f.image, f.template);
      expect(read.studentCode).toBe("02074");
      expect(read.answers).toHaveLength(count);
      expect(read.answers[2]).toMatchObject({ choice: "C", state: "valid" });
      expect(read.answers[0].state).toBe("blank");
    }
  });
  it("rejects an arbitrary crop or missing registration marker", () => {
    const f = fixture();
    expect(() =>
      readOpticalMarks({ ...f.image, width: 1800 }, f.template),
    ).toThrow("สัดส่วน");
    f.image.data.fill(255);
    expect(() => readOpticalMarks(f.image, f.template)).toThrow("จุดจัดแนว");
  });
  it("decodes actual QR pixels, rejects unrelated payloads, supports rotation", async () => {
    const identity = await createSetIdentity(defaultLayout);
    for (const text of [identity.token, "https://example.com"]) {
      const png = await QRCode.toBuffer(text, { width: 420, margin: 4 });
      const { data, info } = await sharp(png)
        .rotate(90)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(
        readSetQr({
          width: info.width,
          height: info.height,
          data: new Uint8ClampedArray(data),
        }),
      ).toBe(text === identity.token ? text : null);
    }
  });
  it("keeps old geometry separate from the new print identity", async () => {
    const classic = layoutSchema.parse({
        ...defaultLayout,
        printStyle: "classic",
      }),
      compact = { ...defaultLayout, printStyle: "compact" as const };
    expect(compileOmrTemplate(classic).geometryVersion).toBe(2);
    expect(compileOmrTemplate(compact).geometryVersion).toBe(3);
    expect(compileOmrTemplate(defaultLayout).geometryVersion).toBe(4);
    expect(compileOmrTemplate(defaultLayout).centersMm).toEqual(
      compileOmrTemplate(compact).centersMm,
    );
    expect((await createSetIdentity(defaultLayout)).token).not.toBe(
      (await createSetIdentity(compact)).token,
    );
    expect((await createSetIdentity(classic)).token).not.toBe(
      (await createSetIdentity(compact)).token,
    );
  });
  it.runIf(process.env.PRINT_QA_ARTIFACTS === "true")(
    "reads real PDF rasterized Thai letters as blank; identifies both students",
    async () => {
      const bytes = await readFile("tmp/pdfs/personalized-20.png");
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const raster: Raster = {
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(data),
      };
      const layout = {
        ...defaultLayout,
        school: "โรงเรียนกุงแก้ววิทยาคาร",
        logo: null,
      };
      const template = {
        layout_json: layout,
        omr_json: compileOmrTemplate(layout),
      } as LockedScanTemplate;
      for (let slot = 0; slot < 2; slot++) {
        const image = rasterRegion(
          raster,
          slot * Math.floor(raster.width / 2),
          Math.floor(raster.width / 2),
        );
        const read = readOpticalMarks(image, template);
        expect(read.studentCode).toBe(slot ? "00005" : "02074");
        expect(read.answers.map((a) => a.state)).toEqual(
          Array(20).fill("blank"),
        );
        expect(readSetQr(image)).toMatch(/^SAS2:/);
      }
    },
  );
});
