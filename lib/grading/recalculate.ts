import type { ReviewItem } from "@/types/result";
import type { Exam } from "@/types/exam";
import { gradeExam } from "./grade-exam";
export function effectiveAnswers(item: ReviewItem) {
  return item.rawAnswers.map((a) =>
    Object.prototype.hasOwnProperty.call(item.corrections, a.question)
      ? {
          ...a,
          choice: item.corrections[a.question],
          state:
            item.corrections[a.question] === null
              ? ("blank" as const)
              : ("valid" as const),
        }
      : a,
  );
}
export function scoreRow(item: ReviewItem, exam: Exam) {
  const grade = gradeExam(exam, effectiveAnswers(item));
  const row: Record<string, string | number> = {
    เลขที่: item.number ?? "",
    รหัสนักเรียน: item.studentCode,
    "ชื่อ-สกุล": item.name,
    "ชั้น/ห้อง": item.classroom,
    จำนวนข้อ: exam.questionCount,
    ถูก: grade.correct,
    ผิด:
      exam.questionCount -
      grade.correct -
      grade.blank -
      grade.multiple -
      grade.uncertain,
    ไม่ตอบ: grade.blank,
    ฝนหลายคำตอบ: grade.multiple,
    คะแนนเต็ม: grade.maxScore,
    คะแนนที่ได้: grade.score,
    เปอร์เซ็นต์: Math.round(grade.percent * 100) / 100,
    "ผ่าน/ไม่ผ่าน": grade.passed ? "ผ่าน" : "ไม่ผ่าน",
    สถานะ: "ยืนยันแล้ว",
  };
  for (const answer of grade.evaluations) {
    row[`คำตอบข้อ ${answer.question}`] = answer.choice ?? "";
    row[`คะแนนข้อ ${answer.question}`] = answer.awarded;
  }
  return row;
}
