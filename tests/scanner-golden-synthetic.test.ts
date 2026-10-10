import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { captureFixture } from "./capture-fixture";
import { readOpticalMarks } from "@/lib/omr/detect-bubbles";
import { choices } from "@/types/exam";
import {
  readLockedQr,
  qrAlignmentError,
  rasterRegion,
} from "@/lib/omr/scan-qr";

vi.mock("server-only", () => ({}));
const { decodeScanImage } = await import("@/lib/omr/scan-image");

// These are controlled digital rasters, NOT a physical-pencil accuracy dataset.
for (const [printStyle, version] of [
  ["classic", 2],
  ["compact", 3],
  ["school", 4],
] as const) {
  for (const full of [false, true]) {
    it(`retains locked v${version} QR/ID/answers in ${full ? "60×5 full A4" : "20×4 cut half"} evidence`, async () => {
      const { image, template } = await captureFixture(
        {
          printStyle,
          questionCount: full ? 60 : 20,
          choiceCount: full ? 5 : 4,
          paperMode: full ? "full" : "auto",
        },
        full ? "00005" : "02074",
      );
      expect(template.omr_json.geometryVersion).toBe(version);
      const jpeg = await sharp(image).jpeg({ quality: 85 }).toBuffer();
      const evidence = await decodeScanImage(new Uint8Array(jpeg));
      expect(Buffer.from(evidence.bytes).equals(jpeg)).toBe(true);
      const qr = readLockedQr(evidence.raster, template)!;
      expect(qr.token).toBe(template.set_token);
      expect(qrAlignmentError(evidence.raster, template, qr)).toBeNull();
      const read = readOpticalMarks(evidence.raster, template);
      expect(read.studentCode).toBe(full ? "00005" : "02074");
      expect(read.answers).toHaveLength(full ? 60 : 20);
      expect(
        read.answers.every(
          (answer) => answer.state === "valid" && answer.choice === choices[0],
        ),
      ).toBe(true);
      if (!full) {
        // The same per-exam QR works for both leaves; server reads each leaf independently.
        const a4 = await sharp({
          create: {
            width: 1800,
            height: 1273,
            channels: 3,
            background: "white",
          },
        })
          .composite([
            { input: image, left: 0, top: 0 },
            { input: image, left: 900, top: 0 },
          ])
          .jpeg({ quality: 85 })
          .toBuffer();
        const paper = (await decodeScanImage(new Uint8Array(a4))).raster;
        for (const left of [0, 900]) {
          const leaf = rasterRegion(paper, left, 900);
          expect(readLockedQr(leaf, template)?.token).toBe(template.set_token);
          expect(readOpticalMarks(leaf, template).studentCode).toBe("02074");
        }
      }
    });
  }
}
