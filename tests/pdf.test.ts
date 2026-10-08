import { beforeAll, describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { buildPrintPdf } from "@/lib/export/export-pdf";
import {
  defaultLayout,
  mmToPt,
  PRINT_GLYPH_ADVANCE_EM,
  printTexts,
  resolveGeometry,
  wrapPrintText,
} from "@/lib/omr/generate-template";
beforeAll(() => {
  vi.stubGlobal("fetch", async () => {
    const file = await readFile("public/omr-assets/NotoSansThai-Regular.ttf");
    return new Response(file);
  });
});
describe("print PDF actual output", () => {
  it("embeds a complete font, preserves geometry and shares one opaque set QR", async () => {
    const result = await buildPrintPdf(defaultLayout, 3);
    expect(result.pdf.getNumberOfPages()).toBe(2);
    expect(result.pdf.internal.pageSize.getWidth()).toBeCloseTo(297, 1);
    expect(result.pdf.internal.pageSize.getHeight()).toBeCloseTo(210, 1);
    expect(new Set(result.manifest.sheets.map((s) => s.token)).size).toBe(1);
    expect(new Set(result.manifest.sheets.map((s) => s.instanceId)).size).toBe(
      3,
    );
    expect(
      result.manifest.sheets.every((s) => /^SAS2:[a-f0-9]{64}$/.test(s.token)),
    ).toBe(true);
    expect(result.manifest.layoutHash).toHaveLength(64);
    const font = result.pdf.getFont().metadata as unknown as {
      cmap: { unicode: { codeMap: Record<number, number> } };
    };
    for (const char of "0123456789.A4%ชื่อรหัส…–กขคงจ")
      expect(
        font.cmap.unicode.codeMap[char.codePointAt(0)!],
        `font missing ${char}`,
      ).toBeGreaterThan(0);
  });
  it("rejects noninteger counts and unsafe layouts", async () => {
    await expect(buildPrintPdf(defaultLayout, 1.2)).rejects.toThrow();
    await expect(
      buildPrintPdf({ ...defaultLayout, headerOffsetMm: 10 }, 2),
    ).rejects.toThrow();
  });
  it("bounds wide Latin headings using the actual embedded font and expands before QR overlap", async () => {
    const layout = {
      ...defaultLayout,
      school: "W".repeat(31),
      title: "W".repeat(60),
    };
    const result = await buildPrintPdf(layout, 1);
    const font = result.pdf.getFont().metadata as unknown as {
      head: { unitsPerEm: number };
      hmtx: { widths: number[] };
      cmap: { unicode: { codeMap: Record<number, number> } };
    };
    expect(
      Math.max(...font.hmtx.widths) / font.head.unitsPerEm,
    ).toBeLessThanOrEqual(PRINT_GLYPH_ADVANCE_EM);
    for (const [cp, glyph] of Object.entries(font.cmap.unicode.codeMap)) {
      if (/\p{M}/u.test(String.fromCodePoint(Number(cp))))
        expect(font.hmtx.widths[glyph]).toBe(0);
    }
    expect(
      font.hmtx.widths[font.cmap.unicode.codeMap[32]] / font.head.unitsPerEm,
    ).toBeLessThanOrEqual(0.32);
    const g = resolveGeometry(layout);
    expect(g.autoExpanded).toBe(true);
    expect(result.manifest.print.sheetsPerPage).toBe(1);
    for (const value of [layout.school, layout.title, "ภาษาไทย WWW ม.1"]) {
      result.pdf.setFontSize(mmToPt(3.3));
      for (const line of wrapPrintText(value, 76, 3.3))
        expect(result.pdf.getTextWidth(line)).toBeLessThanOrEqual(76);
    }
    for (const t of printTexts(layout).filter((t) => t.x === g.heading.x)) {
      result.pdf.setFontSize(mmToPt(t.size));
      expect(t.x + result.pdf.getTextWidth(t.value)).toBeLessThan(g.score.x);
    }
  });
  it("prints 60-question five-choice sheets one per A4 with no phantom extra copy", async () => {
    const result = await buildPrintPdf(
      { ...defaultLayout, questionCount: 60, choiceCount: 5 },
      3,
    );
    expect(result.pdf.getNumberOfPages()).toBe(3);
    expect(result.manifest.print.sheetsPerPage).toBe(1);
    expect(result.manifest.omr.centersMm.answers).toHaveLength(300);
    expect(result.manifest.sheets.map((s) => [s.page, s.slot])).toEqual([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
  });
});
