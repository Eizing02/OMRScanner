"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { choices, examSchema, thaiChoices, type Choice } from "@/types/exam";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Notice, PageHeading } from "@/components/ui/primitives";
export function ExamForm() {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("คณิตศาสตร์");
  const [classroom, setClassroom] = useState("ม.3/1");
  const [examType, setExamType] = useState("เก็บคะแนน");
  const [questionCount, setQuestionCount] = useState(20);
  const [choiceCount, setChoiceCount] = useState<4 | 5>(4);
  const [answers, setAnswers] = useState<Choice[]>(Array(20).fill("A"));
  const [points, setPoints] = useState<number[]>(Array(20).fill(1));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { createExam, mode, notify } = useWorkspace();
  const router = useRouter();
  async function save() {
    setError("");
    const parsed = examSchema.safeParse({
      title,
      subject,
      classroom,
      examType,
      questionCount,
      choiceCount,
      year: 2569,
      term: 1,
      passingPercent: 50,
      answerKey: answers.map((correct, i) => ({
        question: i + 1,
        correct,
        points: points[i],
      })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" · "));
      return;
    }
    setSaving(true);
    try {
      const exam = await createExam(parsed.data);
      notify(
        mode === "demo"
          ? "สร้างชุดสอบในพื้นที่ทดลองแล้ว"
          : "บันทึกชุดสอบบนระบบแล้ว",
      );
      router.push(`/exams/${exam.id}/omr-generate`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        title="สร้างชุดสอบ"
        description="เตรียมข้อมูลชุดสอบและเฉลย ก่อนออกแบบกระดาษคำตอบ"
      />
      <div className="wizard-steps">
        <span className={step === 0 ? "active" : "complete"}>
          {step === 1 ? <Check size={16} /> : "1"}ข้อมูลชุดสอบ
        </span>
        <i />
        <span className={step === 1 ? "active" : ""}>2 เฉลยและคะแนน</span>
        <i />
        <span>3 ออกแบบกระดาษ</span>
      </div>
      <section className="panel form-panel">
        {error && <Notice tone="error">{error}</Notice>}
        {step === 0 ? (
          <>
            <h2>รายละเอียดชุดสอบ</h2>
            <p className="muted">ชื่อที่ชัดเจนช่วยให้กลับมาค้นหาได้ง่าย</p>
            <div className="form-grid">
              <label className="span-two">
                ชื่อชุดสอบ
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น สมการและอสมการเชิงเส้น"
                  maxLength={120}
                  required
                />
              </label>
              <label>
                วิชา
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={80}
                />
              </label>
              <label>
                ชั้น / ห้อง
                <input
                  value={classroom}
                  onChange={(e) => setClassroom(e.target.value)}
                  maxLength={30}
                />
              </label>
              <label>
                ประเภทการสอบ
                <select
                  value={examType}
                  onChange={(e) => setExamType(e.target.value)}
                >
                  {[
                    "เก็บคะแนน",
                    "ก่อนเรียน",
                    "หลังเรียน",
                    "กลางภาค",
                    "ปลายภาค",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                จำนวนข้อ
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={questionCount}
                  onChange={(e) => {
                    const count = Math.max(
                      1,
                      Math.min(60, Math.trunc(Number(e.target.value) || 1)),
                    );
                    setQuestionCount(count);
                    setAnswers((old) =>
                      Array.from({ length: count }, (_, i) => old[i] ?? "A"),
                    );
                    setPoints((old) =>
                      Array.from({ length: count }, (_, i) => old[i] ?? 1),
                    );
                  }}
                />
                <small>สูงสุด 60 ข้อ · จัดคอลัมน์อัตโนมัติ</small>
              </label>
              <label>
                จำนวนตัวเลือก
                <select
                  value={choiceCount}
                  onChange={(e) => {
                    const count = Number(e.target.value) as 4 | 5;
                    setChoiceCount(count);
                    setAnswers((old) =>
                      old.map((a) => (count === 4 && a === "E" ? "A" : a)),
                    );
                  }}
                >
                  <option value={4}>4 ตัวเลือก · ก ข ค ง</option>
                  <option value={5}>5 ตัวเลือก · ก ข ค ง จ</option>
                </select>
              </label>
              <label>
                ปีการศึกษา
                <input value="2569" readOnly />
              </label>
              <label>
                ภาคเรียน
                <input value="1" readOnly />
              </label>
            </div>
            <div className="dialog-actions">
              <Link href="/exams" className="btn btn-secondary">
                ยกเลิก
              </Link>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (title.trim().length < 3) {
                    setError("กรุณากรอกชื่อชุดสอบอย่างน้อย 3 ตัวอักษร");
                    return;
                  }
                  setError("");
                  setStep(1);
                }}
              >
                กำหนดเฉลย
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="section-title">
              <h2>เฉลยและคะแนนรายข้อ</h2>
              <span>{points.reduce((a, b) => a + b, 0)} คะแนนเต็ม</span>
            </div>
            <p className="muted">เลือกคำตอบที่ถูกต้องหนึ่งตัวเลือกในแต่ละข้อ</p>
            <div className="answer-key-grid">
              {answers.map((answer, i) => (
                <div className="key-row" key={i}>
                  <strong>ข้อ {i + 1}</strong>
                  <div
                    className="choice-buttons"
                    role="group"
                    aria-label={`เฉลยข้อ ${i + 1}`}
                  >
                    {choices.slice(0, choiceCount).map((c, n) => (
                      <button
                        key={c}
                        aria-pressed={answer === c}
                        className={answer === c ? "selected" : ""}
                        onClick={() =>
                          setAnswers((old) =>
                            old.map((a, j) => (j === i ? c : a)),
                          )
                        }
                      >
                        {thaiChoices[n]}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    aria-label={`คะแนนข้อ ${i + 1}`}
                    min={0}
                    max={100}
                    step={0.5}
                    value={points[i]}
                    onChange={(e) =>
                      setPoints((old) =>
                        old.map((p, j) =>
                          j === i ? Number(e.target.value) : p,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <div className="dialog-actions">
              <button className="btn btn-secondary" onClick={() => setStep(0)}>
                <ArrowLeft size={16} />
                ย้อนกลับ
              </button>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={save}
              >
                <Plus size={17} />
                {saving ? "กำลังบันทึก…" : "สร้างชุดสอบและออกแบบกระดาษ"}
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
