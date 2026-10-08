import { describe, it, expect } from "vitest";
import { demoExams } from "@/lib/demo";
import { gradeExam, canVerify, canPublish } from "@/lib/grading/grade-exam";
import {
  defaultLayout,
  geometry,
  idBubbles,
  answerBubbles,
  validateLayout,
  compileOmrTemplate,
  mmToPt,
} from "@/lib/omr/generate-template";
import { validQuad, polygonArea, defaultQuad } from "@/lib/omr/camera-geometry";
import { previewStudents, inferMapping } from "@/lib/import/parse-students";
import { examSchema } from "@/types/exam";
import type { Observation } from "@/types/result";
const exam = demoExams[0];
const answers: Observation[] = exam.answerKey.map((a) => ({
  question: a.question,
  state: "valid",
  choice: a.correct,
}));
describe("grade and protect results", () => {
  it("is deterministic and never auto-verifies", () => {
    expect(gradeExam(exam, answers)).toEqual(gradeExam(exam, answers));
    expect(gradeExam(exam, answers)).toMatchObject({
      score: 20,
      status: "needs_review",
      passed: true,
    });
  });
  it("does not score uncertain/multiple/blank answers", () => {
    const result = gradeExam(
      exam,
      answers.map((a, i) => ({
        ...a,
        state:
          i === 0
            ? "ambiguous"
            : i === 1
              ? "multiple"
              : i === 2
                ? "blank"
                : "valid",
      })),
    );
    expect(result).toMatchObject({
      score: 17,
      uncertain: 1,
      multiple: 1,
      blank: 1,
    });
  });
  it("requires a complete unique review and verified-only publication", () => {
    expect(canVerify(answers)).toBe(true);
    expect(canVerify(answers.slice(1))).toBe(false);
    expect(canVerify([...answers.slice(1), answers[1]])).toBe(false);
    expect(canVerify(answers.map((a) => ({ ...a, state: "unreadable" })))).toBe(
      false,
    );
    for (const s of ["scanned", "needs_review", "published", "voided"])
      expect(canPublish(s)).toBe(false);
    expect(canPublish("verified")).toBe(true);
  });
  it("rejects duplicate, fractional and outside questions", () => {
    expect(() => gradeExam(exam, [answers[0], answers[0]])).toThrow();
    expect(() => gradeExam(exam, [{ ...answers[0], question: 1.5 }])).toThrow();
    expect(() => gradeExam(exam, [{ ...answers[0], question: 21 }])).toThrow();
    expect(gradeExam(exam, []).uncertain).toBe(20);
  });
  it("locks uncalibrated presets and invalid answer keys", () => {
    expect(examSchema.safeParse({ ...exam, questionCount: 50 }).success).toBe(
      false,
    );
    expect(
      examSchema.safeParse({
        ...exam,
        answerKey: exam.answerKey.map((a) => ({ ...a, correct: "E" })),
      }).success,
    ).toBe(false);
  });
});
describe("one physical geometry", () => {
  it("uses two independent half sheets and complete regions", () => {
    expect(geometry.paperWidth).toBe(geometry.sheetWidth * 2);
    expect(geometry.paperHeight).toBe(210);
    expect(idBubbles()).toHaveLength(50);
    expect(answerBubbles(defaultLayout)).toHaveLength(80);
    expect(geometry.markers).toHaveLength(4);
    expect(mmToPt(25.4)).toBe(72);
  });
  it("preserves all centers in the OMR manifest", () => {
    const template = compileOmrTemplate(defaultLayout);
    expect(template.centersMm.id).toEqual(idBubbles());
    expect(template.centersMm.answers).toEqual(answerBubbles(defaultLayout));
    expect(template.pageDimensions).toEqual([900, 1273]);
    expect(validateLayout(defaultLayout).errors).toEqual([]);
  });
  it("rejects unsafe movement and overflowing print labels", () => {
    expect(
      validateLayout({ ...defaultLayout, headerOffsetMm: 10 }).errors.length,
    ).toBeGreaterThan(0);
    expect(() =>
      compileOmrTemplate({ ...defaultLayout, title: "ก".repeat(121) }),
    ).toThrow();
  });
  it("requires convex non-crossing crop corners", () => {
    expect(validQuad(defaultQuad)).toBe(true);
    expect(polygonArea(defaultQuad)).toBeGreaterThan(0);
    expect(
      validQuad([
        defaultQuad[0],
        defaultQuad[2],
        defaultQuad[1],
        defaultQuad[3],
      ]),
    ).toBe(false);
  });
});
describe("student import", () => {
  const mapping = inferMapping(["id", "name", "grade"]);
  it("preserves leading zeros and ignores legacy passwords", () => {
    const item = previewStudents(
      [
        {
          id: "02074",
          name: "เด็กชายกิตติกร เหล่าทองสิงห์",
          grade: "ม.1/2",
          password: "DO_NOT_STORE",
        },
      ],
      mapping,
    )[0];
    expect(item.errors).toEqual([]);
    expect(item.data).toMatchObject({
      student_code: "02074",
      first_name: "กิตติกร",
      last_name: "เหล่าทองสิงห์",
    });
    expect(JSON.stringify(item)).not.toContain("DO_NOT_STORE");
  });
  it("does not auto-pad numeric or short IDs and blocks duplicates", () => {
    expect(
      previewStudents([{ id: 2074, name: "นายก ข", grade: "ม.1" }], mapping)[0]
        .errors.length,
    ).toBeGreaterThan(0);
    const rows = Array(2).fill({ id: "02074", name: "นายก ข", grade: "ม.1" });
    expect(previewStudents(rows, mapping)[1].errors.join()).toContain(
      "รหัสซ้ำ",
    );
  });
});
