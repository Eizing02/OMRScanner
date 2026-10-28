import { beforeAll, describe, it, expect, vi } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { buildPrintPdf } from "@/lib/export/export-pdf";
import {
  defaultLayout,
  mmToPt,
  PRINT_GLYPH_ADVANCE_EM,
  printTexts,
  resolveGeometry,
  wrapPrintText,
  printStudentErrors,
  resolvePrintLayout,
} from "@/lib/omr/generate-template";
import { createSetIdentity } from "@/lib/omr/qr";
import type { PrintStudent } from "@/types/print";
const printStudents: PrintStudent[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    student_code: "02074",
    full_name: "เด็กชายสมชาย ทดสอบการพิมพ์",
    classroom_name: "ม.3/1",
    number: null,
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    student_code: "00005",
    full_name: "เด็กหญิงสมใจ ทดสอบการพิมพ์",
    classroom_name: "ม.3/1",
    number: null,
  },
];
beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const file = await readFile(
      url.endsWith("school-logo.png")
        ? "public/omr-assets/school-logo.png"
        : url.endsWith("NotoSansThai-Bold.ttf")
          ? "public/omr-assets/NotoSansThai-Bold.ttf"
          : "public/omr-assets/NotoSansThai-Regular.ttf",
    );
    return new Response(file);
  });
});
describe("print PDF actual output", () => {
  it("embeds the original school logo dimensions without downsampling", async () => {
    const result = await buildPrintPdf(
      { ...defaultLayout, logo: "/omr-assets/school-logo.png" },
      2,
    );
    const output = result.pdf.output();
    expect(output).toContain("/Width 742");
    expect(output).toContain("/Height 763");
    expect(result.manifest.layout.logo).toBeNull();
  });
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
    result.pdf.setFont("Thai", "bold");
    const bold = result.pdf.getFont().metadata as typeof font;
    for (const char of "0123456789.A4%ชื่อรหัส…–กขคงจ /·")
      expect(
        bold.cmap.unicode.codeMap[char.codePointAt(0)!],
        `bold missing ${char}`,
      ).toBeGreaterThan(0);
    result.pdf.setFont("Thai", "normal");
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
  it("prints different named students left/right, preserving five-digit leading zeroes", async () => {
    const result = await buildPrintPdf(
      {
        ...defaultLayout,
        school: "โรงเรียนกุงแก้ววิทยาคาร",
        logo: "/omr-assets/school-logo.png",
      },
      printStudents,
    );
    expect(result.pdf.getNumberOfPages()).toBe(1);
    expect(
      result.manifest.sheets.map((s) => [
        s.studentCode,
        s.studentId,
        s.page,
        s.slot,
      ]),
    ).toEqual([
      ["02074", printStudents[0].id, 1, 0],
      ["00005", printStudents[1].id, 1, 1],
    ]);
    expect(new Set(result.manifest.sheets.map((s) => s.token)).size).toBe(1);
    expect(
      printTexts(
        defaultLayout,
        resolveGeometry(defaultLayout),
        printStudents[0],
      ).some((t) => t.value.includes("02074")),
    ).toBe(true);
    expect(
      printTexts(
        defaultLayout,
        resolveGeometry(defaultLayout),
        printStudents[0],
      ).some((t) => t.value.includes("เลขที่")),
    ).toBe(false);
    if (process.env.PRINT_QA_ARTIFACTS === "true") {
      await mkdir("tmp/pdfs", { recursive: true });
      await writeFile(
        "tmp/pdfs/personalized-20.pdf",
        new Uint8Array(result.pdf.output("arraybuffer")),
      );
      const full = await buildPrintPdf(
        {
          ...defaultLayout,
          school: "โรงเรียนกุงแก้ววิทยาคาร",
          logo: "/omr-assets/school-logo.png",
          questionCount: 60,
          choiceCount: 5,
          totalScore: 60,
        },
        printStudents,
      );
      await writeFile(
        "tmp/pdfs/personalized-60.pdf",
        new Uint8Array(full.pdf.output("arraybuffer")),
      );
    }
  });
  it("keeps expiring/replaced logos out of identity and rejects invalid roster or registry mismatches", async () => {
    const plain = await createSetIdentity(defaultLayout);
    const branded = await createSetIdentity({
      ...defaultLayout,
      logo: "/omr-assets/school-logo.png",
    });
    expect(branded.token).toBe(plain.token);
    expect(branded.snapshot.layout.logo).toBeNull();
    expect(
      printStudentErrors(defaultLayout, [
        { ...printStudents[0], student_code: "2074" },
      ]),
    ).not.toHaveLength(0);
    await expect(
      buildPrintPdf(defaultLayout, [
        { ...printStudents[0], student_code: "2074" },
      ]),
    ).rejects.toThrow();
    const generated = await buildPrintPdf(defaultLayout, printStudents);
    await expect(
      buildPrintPdf(defaultLayout, printStudents, {
        ...generated.manifest,
        sheets: generated.manifest.sheets.map((s) => ({
          ...s,
          studentCode: "99999",
        })),
      }),
    ).rejects.toThrow("ทะเบียน");
    const longer = [{ ...printStudents[0], full_name: "ก".repeat(100) }];
    const expanded = resolvePrintLayout(defaultLayout, longer);
    expect(resolveGeometry(expanded).sheetsPerPage).toBe(1);
    expect(printStudentErrors(expanded, longer)).toEqual([]);
  });
});
