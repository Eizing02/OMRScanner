"use client";
import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { gradeExam } from "@/lib/grading/grade-exam";
import { downloadScores } from "@/lib/export/export-excel";
import {
  Badge,
  EmptyState,
  Notice,
  PageHeading,
} from "@/components/ui/primitives";
export function Results() {
  const { reviews, getExamVersion, mode, notify } = useWorkspace();
  const [onlyVerified, setOnlyVerified] = useState(true);
  const rows = reviews
    .filter(
      (r) =>
        (!onlyVerified || r.status === "verified") &&
        getExamVersion(r.examId, r.examVersion),
    )
    .map((r) => {
      const exam = getExamVersion(r.examId, r.examVersion)!;
      const answers = r.rawAnswers.map((a) =>
        r.resolved.includes(a.question)
          ? {
              ...a,
              choice: r.corrections[a.question],
              state: r.corrections[a.question]
                ? ("valid" as const)
                : ("blank" as const),
            }
          : a,
      );
      const grade = gradeExam(exam, answers);
      return {
        เลขที่: r.number,
        รหัสนักเรียน: r.studentCode,
        "ชื่อ-สกุล": r.name,
        "ชั้น/ห้อง": r.classroom,
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
        สถานะ:
          r.status === "verified"
            ? "ยืนยันในตัวอย่าง"
            : "รอตรวจสอบ · ยังไม่ยืนยัน",
        ...Object.fromEntries(
          answers.flatMap((a, i) => [
            [`คำตอบข้อ ${a.question}`, a.choice ?? ""],
            [`คะแนนข้อ ${a.question}`, grade.evaluations[i].awarded],
          ]),
        ),
      };
    });
  return (
    <>
      <PageHeading
        title="ผลสอบและรายงาน"
        description="ส่งออกเฉพาะคะแนนที่ตรวจแล้วเป็นค่าเริ่มต้น"
        actions={
          <>
            <button
              className="btn btn-secondary"
              disabled={!rows.length || mode !== "demo"}
              onClick={() => {
                downloadScores(rows, "csv");
                notify("ส่งออก CSV ตัวอย่างแล้ว");
              }}
            >
              <Download size={16} />
              CSV ตัวอย่าง
            </button>
            <button
              className="btn btn-primary"
              disabled={!rows.length || mode !== "demo"}
              onClick={() => {
                downloadScores(rows, "xlsx");
                notify("ส่งออก Excel ตัวอย่างแล้ว");
              }}
            >
              <FileSpreadsheet size={17} />
              Excel ตัวอย่าง
            </button>
          </>
        }
      />
      <Notice>
        รายงานในพื้นที่ทดลองใช้ข้อมูลสังเคราะห์ การส่งออกข้อมูลจริงบน server และ
        audit ยังอยู่ระหว่างพัฒนา
      </Notice>
      <section className="panel">
        <div className="table-toolbar">
          <h2>สมุดคะแนน</h2>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={onlyVerified}
              onChange={(e) => setOnlyVerified(e.target.checked)}
            />
            เฉพาะที่ยืนยันแล้ว
          </label>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>รหัสนักเรียน</th>
                <th>ชื่อ-สกุล</th>
                <th>ชั้น</th>
                <th>คะแนน</th>
                <th>ผล</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row["รหัสนักเรียน"]}>
                  <td>{row["รหัสนักเรียน"]}</td>
                  <td>{row["ชื่อ-สกุล"]}</td>
                  <td>{row["ชั้น/ห้อง"]}</td>
                  <td>
                    {row["คะแนนที่ได้"]} / {row["คะแนนเต็ม"]}
                  </td>
                  <td>{row["ผ่าน/ไม่ผ่าน"]}</td>
                  <td>
                    <Badge
                      tone={
                        row["สถานะ"] === "ยืนยันในตัวอย่าง" ? "green" : "amber"
                      }
                    >
                      {row["สถานะ"]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <EmptyState
            title="ยังไม่มีคะแนนที่ยืนยันแล้ว"
            description="ตรวจรายการไม่ชัดในศูนย์ตรวจสอบและยืนยันก่อนส่งออก"
          />
        )}
      </section>
    </>
  );
}
