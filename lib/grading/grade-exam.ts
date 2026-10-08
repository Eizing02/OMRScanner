import { examSchema, choices, type ExamInput } from "@/types/exam";
import type { Observation } from "@/types/result";
export function gradeExam(exam: ExamInput, observations: Observation[]) {
  examSchema.parse(exam);
  const byQuestion = new Map<number, Observation>();
  for (const answer of observations) {
    if (byQuestion.has(answer.question))
      throw new Error("พบคำตอบซ้ำในข้อเดียวกัน");
    if (
      !Number.isInteger(answer.question) ||
      answer.question < 1 ||
      answer.question > exam.questionCount
    )
      throw new Error("เลขข้ออยู่นอกชุดสอบ");
    if (
      !["valid", "blank", "multiple", "ambiguous", "unreadable"].includes(
        answer.state,
      ) ||
      (answer.state === "valid" &&
        (!answer.choice ||
          !choices.slice(0, exam.choiceCount).includes(answer.choice)))
    )
      throw new Error("ข้อมูลคำตอบไม่ถูกต้อง");
    byQuestion.set(answer.question, answer);
  }
  let score = 0,
    correct = 0,
    blank = 0,
    multiple = 0,
    uncertain = 0;
  const evaluations = exam.answerKey.map((key) => {
    const answer = byQuestion.get(key.question);
    const state = answer?.state ?? "unreadable";
    if (state === "blank") blank++;
    if (state === "multiple") multiple++;
    if (state === "ambiguous" || state === "unreadable") uncertain++;
    const awarded =
      state === "valid" && answer?.choice === key.correct ? key.points : 0;
    if (state === "valid" && answer?.choice === key.correct) correct++;
    score += awarded;
    return {
      question: key.question,
      state,
      choice: answer?.choice ?? null,
      awarded,
    };
  });
  const maxScore = exam.answerKey.reduce((sum, key) => sum + key.points, 0);
  const percent = maxScore ? (score / maxScore) * 100 : 0;
  return {
    score,
    maxScore,
    percent,
    correct,
    blank,
    multiple,
    uncertain,
    passed: percent >= exam.passingPercent,
    evaluations,
    status: "needs_review" as const,
  };
}
export function canVerify(
  answers: Observation[],
  expectedCount = 20,
  choiceCount = 4,
) {
  return (
    answers.length === expectedCount &&
    new Set(answers.map((a) => a.question)).size === expectedCount &&
    answers.every(
      (a) =>
        Number.isInteger(a.question) &&
        a.question >= 1 &&
        a.question <= expectedCount &&
        (a.state === "blank" ||
          a.state === "multiple" ||
          (a.state === "valid" &&
            a.choice !== null &&
            choices.slice(0, choiceCount).includes(a.choice))),
    )
  );
}
export function canPublish(status: string) {
  return status === "verified";
}
