import { describe, expect, it } from "vitest";
import {
  answerBubbles,
  defaultLayout,
  printTexts,
  resolveGeometry,
  validateLayout,
} from "@/lib/omr/generate-template";

describe("school print header", () => {
  it("enlarges identity and writable score without touching compact answer/QR positions", () => {
    const current = resolveGeometry(defaultLayout);
    const compact = resolveGeometry({
      ...defaultLayout,
      printStyle: "compact",
    });
    expect(current.logo.width).toBe(20);
    expect(current.score.height).toBe(14);
    expect(current.qr).toEqual(compact.qr);
    expect(answerBubbles(defaultLayout)).toEqual(
      answerBubbles({ ...defaultLayout, printStyle: "compact" }),
    );
    const text = printTexts(defaultLayout, current, {
      id: "fixture",
      student_code: "02074",
      full_name: "เด็กชายกิตติกร ตัวอย่าง",
      classroom_name: "ม.3/1",
      number: 7,
    });
    expect(text.some((t) => t.value === "........... / 20")).toBe(true);
    expect(text.some((t) => t.value.startsWith("คะแนน"))).toBe(false);
    expect(
      text.some((t) => t.value.includes("…เด็กชายกิตติกร ตัวอย่าง…")),
    ).toBe(true);
    expect(
      text.some((t) => t.value === "ระดับชั้น …ม.3…  ห้อง …1…  เลขที่ …7…"),
    ).toBe(true);
    expect(text.some((t) => t.value === "รหัส …02074…")).toBe(true);
  });
  it("uses a dash for an unsuffixed class, not an invented room", () => {
    const layout = { ...defaultLayout, classroom: "ม.6" };
    const texts = printTexts(layout, resolveGeometry(layout), {
      id: "fixture",
      student_code: "00001",
      full_name: "นายสมชาย ตัวอย่าง",
      classroom_name: "ม.6",
      number: null,
    });
    expect(texts.some((t) => t.value === "ระดับชั้น …ม.6…  ห้อง …—…")).toBe(
      true,
    );
  });
  it("fits the supported question and choice range or expands before reducing OMR marks", () => {
    for (let questionCount = 1; questionCount <= 60; questionCount++)
      for (const choiceCount of [4, 5] as const) {
        const layout = { ...defaultLayout, questionCount, choiceCount };
        expect(validateLayout(layout).errors).toEqual([]);
        const g = resolveGeometry(layout);
        expect(g.bubbleRadius).toBe(1.8);
        expect(g.score.y + g.score.height).toBeLessThan(g.qr.y);
        expect(answerBubbles(layout)).toHaveLength(questionCount * choiceCount);
      }
  });
});
