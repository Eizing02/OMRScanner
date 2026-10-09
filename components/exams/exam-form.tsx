"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { choices, examSchema, thaiChoices, type Choice } from "@/types/exam";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Notice, PageHeading } from "@/components/ui/primitives";
import { defaultWorkspaceSettings } from "@/types/school";
export function ExamForm() {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [subjectSelection, setSubjectSelection] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [classroom, setClassroom] = useState("");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [passingPercent, setPassingPercent] = useState(50);
  const [examType, setExamType] = useState("เก็บคะแนน");
  const [questionCount, setQuestionCount] = useState(20);
  const [choiceCount, setChoiceCount] = useState<4 | 5>(4);
  const [answers, setAnswers] = useState<Choice[]>(Array(20).fill("A"));
  const [points, setPoints] = useState<number[]>(Array(20).fill(1));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const {
    createExam,
    mode,
    notify,
    students,
    exams,
    branding,
    readOnly,
    loading,
  } = useWorkspace();
  const settings = branding.settings ?? defaultWorkspaceSettings;
  const classrooms = [
    ...new Set(students.map((student) => student.classroom_name)),
  ].sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
  const subjects = [
    ...new Set([...settings.subjects, ...exams.map((exam) => exam.subject)]),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "th"));
  const subjectChoice = subjectSelection || (subjects.length ? "" : "__new");
  const subject = subjectChoice === "__new" ? newSubject.trim() : subjectChoice;
  const year = selectedYear ?? settings.academicYear;
  const term = selectedTerm ?? settings.term;
  const yearOptions = [
    ...new Set([
      year,
      ...Array.from({ length: 5 }, (_, i) => settings.academicYear - 2 + i),
      ...exams.map((exam) => exam.year),
    ]),
  ]
    .filter((value) => value >= 2500 && value <= 2700)
    .sort((a, b) => b - a);
  const selectedClassroom = classrooms.includes(classroom) ? classroom : "";
  const selectedClassSize = students.filter(
    (student) => student.classroom_name === selectedClassroom,
  ).length;
  const router = useRouter();
  async function save() {
    setError("");
    if (readOnly) {
      setError(
        "พื้นที่นี้เปิดดูได้อย่างเดียว กรุณากลับพื้นที่ของคุณก่อนสร้างชุดสอบ",
      );
      return;
    }
    if (!classrooms.includes(classroom)) {
      setError("กรุณาเลือกชั้น / ห้องจากรายชื่อนักเรียนที่นำเข้าแล้ว");
      return;
    }
    const parsed = examSchema.safeParse({
      title,
      subject,
      classroom,
      examType,
      questionCount,
      choiceCount,
      year,
      term,
      passingPercent,
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
      <PageHeading title="สร้างชุดสอบ" />
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
        {readOnly && <Notice tone="warning">พื้นที่นี้อ่านอย่างเดียว</Notice>}
        {!loading && !classrooms.length && (
          <Notice tone="warning">
            ยังไม่มีรายชื่อนักเรียน กรุณา{" "}
            <Link href="/students/import">นำเข้ารายชื่อ</Link> ก่อนสร้างชุดสอบ
          </Notice>
        )}
        <fieldset
          className="exam-form-fields"
          disabled={readOnly || saving || loading}
        >
          {step === 0 ? (
            <>
              <h2>รายละเอียดชุดสอบ</h2>
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
                  <select
                    aria-label="วิชา"
                    value={subjectChoice}
                    onChange={(e) => setSubjectSelection(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      เลือกวิชา
                    </option>
                    {subjects.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                    <option value="__new">เพิ่มวิชาใหม่…</option>
                  </select>
                </label>
                <label>
                  ชั้น / ห้อง
                  <select
                    aria-label="ชั้น / ห้อง"
                    aria-describedby="exam-classroom-help"
                    value={selectedClassroom}
                    onChange={(e) => setClassroom(e.target.value)}
                    disabled={!classrooms.length}
                    required
                  >
                    <option value="" disabled>
                      {loading ? "กำลังโหลดรายชื่อ…" : "เลือกชั้น / ห้อง"}
                    </option>
                    {classrooms.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <small id="exam-classroom-help">
                    {selectedClassroom
                      ? `มีนักเรียน ${selectedClassSize} คนในรายชื่อ`
                      : "เลือกจากรายชื่อนักเรียน"}
                  </small>
                </label>
                {subjectChoice === "__new" && (
                  <label className="span-two">
                    ชื่อวิชาใหม่
                    <input
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      maxLength={80}
                      placeholder="เช่น ภาษาไทย"
                      required
                    />
                  </label>
                )}
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
                    aria-label="จำนวนข้อ"
                    aria-describedby="exam-question-count-help"
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
                  <small id="exam-question-count-help">
                    สูงสุด 60 ข้อ · จัดคอลัมน์อัตโนมัติ
                  </small>
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
                  <select
                    value={year}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                  >
                    {yearOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ภาคเรียน
                  <select
                    value={term}
                    onChange={(e) => setSelectedTerm(Number(e.target.value))}
                  >
                    {[1, 2, 3].map((value) => (
                      <option key={value} value={value}>
                        {value === 3 ? "ภาคฤดูร้อน" : `ภาคเรียนที่ ${value}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  เกณฑ์ผ่าน
                  <select
                    value={passingPercent}
                    onChange={(e) => setPassingPercent(Number(e.target.value))}
                  >
                    {[0, 40, 50, 60, 70, 80, 90, 100].map((value) => (
                      <option key={value} value={value}>
                        {value}% ของคะแนนเต็ม
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="dialog-actions">
                <Link href="/exams" className="btn btn-secondary">
                  ยกเลิก
                </Link>
                <button
                  className="btn btn-primary"
                  disabled={!classrooms.length}
                  onClick={() => {
                    if (title.trim().length < 3) {
                      setError("กรุณากรอกชื่อชุดสอบอย่างน้อย 3 ตัวอักษร");
                      return;
                    }
                    if (!subject || !classrooms.includes(classroom)) {
                      setError(
                        "กรุณาเลือกวิชาและชั้น / ห้องให้ครบก่อนกำหนดเฉลย",
                      );
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
                <button
                  className="btn btn-secondary"
                  onClick={() => setStep(0)}
                >
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
        </fieldset>
      </section>
    </>
  );
}
