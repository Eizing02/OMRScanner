import { describe, it, expect } from "vitest";
import {
  defaultLayout,
  resolveGeometry,
  answerBubbles,
  compileOmrTemplate,
  validateLayout,
  printTexts,
  layoutForExam,
} from "@/lib/omr/generate-template";
import { createSetIdentity } from "@/lib/omr/qr";
import { choices, examSchema, resizeAnswerKey } from "@/types/exam";
import { demoExams } from "@/lib/demo";
import { gradeExam, canVerify } from "@/lib/grading/grade-exam";

describe("adaptive printable layout", () => {
  it.each([4, 5] as const)(
    "fits every supported question count with %i choices without shrinking",
    (choiceCount) => {
      for (let questionCount = 1; questionCount <= 60; questionCount++) {
        const layout = { ...defaultLayout, questionCount, choiceCount };
        const g = resolveGeometry(layout);
        expect(
          validateLayout(layout).errors,
          `${questionCount}/${choiceCount}`,
        ).toEqual([]);
        expect(g.bubbleRadius).toBe(1.8);
        const bubbles = answerBubbles(layout);
        expect(bubbles).toHaveLength(questionCount * choiceCount);
        expect(new Set(bubbles.map((b) => `${b.x},${b.y}`)).size).toBe(
          bubbles.length,
        );
        expect(
          bubbles.every(
            (b) =>
              b.x - 7 >= 59 &&
              b.x + g.bubbleRadius <= g.sheetWidth - 10 &&
              b.y + g.bubbleRadius <= 183,
          ),
        ).toBe(true);
        const template = compileOmrTemplate(layout);
        expect(template.centersMm.answers).toEqual(bubbles);
        for (const b of bubbles.filter((b) => b.option === 0)) {
          const field = template.fieldBlocks[`answer_${b.question}`];
          const factor = 900 / g.sheetWidth;
          expect(field.origin[0] / factor + g.bubbleRadius).toBeCloseTo(b.x);
          expect(field.origin[1] / factor + g.bubbleRadius).toBeCloseTo(b.y);
          expect(field.bubbleValues).toEqual(choices.slice(0, choiceCount));
        }
      }
    },
  );
  it("uses the fit boundary, full override and text overflow rather than a hard-coded count", () => {
    const half = resolveGeometry(defaultLayout);
    const capacity = half.maxRows * 2;
    expect(
      resolveGeometry({ ...defaultLayout, questionCount: capacity })
        .sheetsPerPage,
    ).toBe(2);
    expect(
      resolveGeometry({ ...defaultLayout, questionCount: capacity + 1 })
        .autoExpanded,
    ).toBe(true);
    expect(
      resolveGeometry({ ...defaultLayout, paperMode: "full" }).sheetsPerPage,
    ).toBe(1);
    expect(
      resolveGeometry({ ...defaultLayout, title: "ก".repeat(100) })
        .autoExpanded,
    ).toBe(true);
    expect(
      printTexts(defaultLayout).some((t) => t.value.includes("คะแนน")),
    ).toBe(true);
    expect(
      validateLayout({ ...defaultLayout, questionCount: 61 }).errors.length,
    ).toBeGreaterThan(0);
  });
  it("orders down then right without phantom questions in a partially filled last column", () => {
    const layout = { ...defaultLayout, questionCount: 21 };
    const first = answerBubbles(layout).filter((b) => b.option === 0);
    const g = resolveGeometry(layout);
    expect(first[g.rows].question).toBe(g.rows + 1);
    expect(first[g.rows].x).toBeGreaterThan(first[0].x);
    expect(first[g.rows].y).toBe(first[0].y);
    expect(first.at(-1)?.question).toBe(21);
  });
  it("shares a stable QR within one version and changes it for exam, key or physical geometry", async () => {
    const base = layoutForExam(defaultLayout, demoExams[0]);
    const a = await createSetIdentity(base);
    expect(await createSetIdentity({ ...base })).toEqual(a);
    for (const patch of [
      { examId: "other" },
      { examVersion: base.examVersion + 1 },
      { paperMode: "full" as const },
      { choiceCount: 5 as const },
      { answerKeySignature: "changed" },
    ])
      expect((await createSetIdentity({ ...base, ...patch })).token).not.toBe(
        a.token,
      );
    expect(a.token).not.toContain(base.examId);
  });
  it("grades and verifies 60 five-choice answers, preserving existing key points", () => {
    const keys = resizeAnswerKey(demoExams[0], 60, 5).map((a) => ({
      ...a,
      correct: "E" as const,
    }));
    const exam = examSchema.parse({
      ...demoExams[0],
      questionCount: 60,
      choiceCount: 5,
      answerKey: keys,
    });
    const answers = keys.map((a) => ({
      question: a.question,
      choice: a.correct,
      state: "valid" as const,
    }));
    expect(gradeExam(exam, answers).score).toBe(60);
    expect(canVerify(answers, 60, 5)).toBe(true);
    expect(canVerify(answers, 60, 4)).toBe(false);
    expect(examSchema.safeParse({ ...exam, questionCount: 59 }).success).toBe(
      false,
    );
    expect(examSchema.safeParse({ ...exam, choiceCount: 4 }).success).toBe(
      false,
    );
  });
});
