import { z } from "zod";
export const choices = ["A", "B", "C", "D", "E"] as const;
export const thaiChoices = ["ก", "ข", "ค", "ง", "จ"];
export type Choice = (typeof choices)[number];
export const answerKeySchema = z.object({
  question: z.number().int().min(1).max(60),
  correct: z.enum(choices),
  points: z.number().min(0).max(100),
});
export const examSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    subject: z.string().trim().min(1).max(80),
    classroom: z.string().trim().min(1).max(30),
    examType: z.enum([
      "เก็บคะแนน",
      "ก่อนเรียน",
      "หลังเรียน",
      "กลางภาค",
      "ปลายภาค",
    ]),
    questionCount: z.number().int().min(1).max(60),
    choiceCount: z.union([z.literal(4), z.literal(5)]),
    year: z.number().int().min(2500).max(2700),
    term: z.number().int().min(1).max(3),
    passingPercent: z.number().min(0).max(100),
    answerKey: z.array(answerKeySchema).min(1).max(60),
  })
  .superRefine((value, ctx) => {
    if (
      value.answerKey.length !== value.questionCount ||
      value.answerKey.some(
        (key, i) =>
          key.question !== i + 1 ||
          !choices.slice(0, value.choiceCount).includes(key.correct),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "เฉลยต้องเรียงครบทุกข้อและอยู่ในตัวเลือกของชุดสอบ",
      });
  });
export type ExamInput = z.infer<typeof examSchema>;
export function resizeAnswerKey(
  exam: ExamInput,
  questionCount: number,
  choiceCount: 4 | 5,
) {
  return Array.from({ length: questionCount }, (_, i) => ({
    question: i + 1,
    correct: choices.slice(0, choiceCount).includes(exam.answerKey[i]?.correct)
      ? exam.answerKey[i].correct
      : ("A" as Choice),
    points: exam.answerKey[i]?.points ?? 1,
  }));
}
export type Exam = ExamInput & {
  id: string;
  version: number;
  stage: number;
  scanned: number;
  students: number;
  reviewCount: number;
  archived: boolean;
  updatedAt: string;
};
