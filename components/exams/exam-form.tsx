"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";
import { choices, examSchema, thaiChoices, type Choice } from "@/types/exam";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Notice, PageHeading } from "@/components/ui/primitives";
import { defaultWorkspaceSettings } from "@/types/school";

type Field = "title" | "subject" | "classroom" | "questionCount";
export function ExamForm() {
  const form = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [subjectSelection, setSubjectSelection] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [classroom, setClassroom] = useState("");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [passingPercent, setPassingPercent] = useState(50);
  const [examType, setExamType] = useState("เก็บคะแนน");
  const [countText, setCountText] = useState("20");
  const [choiceCount, setChoiceCount] = useState<4 | 5>(4);
  // Retain entered values when a teacher reduces then restores the question count.
  const [answers, setAnswers] = useState<(Choice | null)[]>(
    Array(60).fill(null),
  );
  const [points, setPoints] = useState<string[]>(Array(60).fill("1"));
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<Field, string>>
  >({});
  const [choiceNotice, setChoiceNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const {
    createExam,
    mode,
    notify,
    rosterSummary,
    exams,
    branding,
    readOnly,
    loading,
  } = useWorkspace();
  const settings = branding.settings ?? defaultWorkspaceSettings;
  const classrooms = rosterSummary.classrooms
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
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
  const selectedClassSize =
    rosterSummary.classrooms.find((c) => c.name === selectedClassroom)?.count ??
    0;
  const count = Number(countText);
  const validCount =
    countText.trim() !== "" &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 60;
  const questionCount = validCount ? count : 0;
  const visibleAnswers = answers.slice(0, questionCount);
  const completed = visibleAnswers.filter(Boolean).length;
  const pointValues = points
    .slice(0, questionCount)
    .map((p) => (p.trim() === "" ? NaN : Number(p)));
  const validPoint = (p: number) => Number.isFinite(p) && p >= 0 && p <= 100;
  const allPointsValid = pointValues.every(validPoint);
  const total = pointValues.reduce(
    (sum, p) => sum + (validPoint(p) ? p : 0),
    0,
  );
  const ready = validCount && completed === questionCount && allPointsValid;
  const router = useRouter();

  function clearField(field: Field) {
    setFieldErrors((old) => ({ ...old, [field]: undefined }));
  }
  function validateSetup() {
    const errors: Partial<Record<Field, string>> = {};
    if (title.trim().length < 3)
      errors.title = "กรอกชื่อชุดสอบอย่างน้อย 3 ตัวอักษร";
    if (!subject) errors.subject = "เลือกวิชาหรือเพิ่มวิชาใหม่";
    if (!classrooms.includes(classroom))
      errors.classroom = "เลือกชั้น / ห้องจากรายชื่อนักเรียน";
    if (!validCount) errors.questionCount = "กรอกจำนวนเต็ม 1–60 ข้อ";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return false;
    }
    return true;
  }
  function changeChoiceCount(value: 4 | 5) {
    const removed = value === 4 && answers.includes("E");
    setAnswers((old) =>
      old.map((answer) => (value === 4 && answer === "E" ? null : answer)),
    );
    setChoiceCount(value);
    setChoiceNotice(
      removed ? "ยกเลิกเฉลย จ แล้ว กรุณาเลือกเฉลยใหม่ในข้อที่ว่าง" : "",
    );
  }
  async function save() {
    setError("");
    if (readOnly || saving || loading) return;
    if (!validateSetup()) {
      setStep(0);
      return;
    }
    if (!ready) {
      setError("เลือกเฉลยให้ครบ และกรอกคะแนน 0–100 ทุกข้อ");
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
      answerKey: visibleAnswers.map((correct, i) => ({
        question: i + 1,
        correct,
        points: pointValues[i],
      })),
    });
    if (!parsed.success) {
      setError("ตรวจสอบข้อมูลชุดสอบและเฉลยให้ครบก่อนบันทึก");
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
      setError(
        e instanceof Error ? e.message : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setSaving(false);
    }
  }
  function fieldMessage(field: Field) {
    return fieldErrors[field] ? (
      <small className="field-error" id={`exam-${field}-error`}>
        {fieldErrors[field]}
      </small>
    ) : null;
  }
  return (
    <div className="task-workspace exam-builder">
      <PageHeading title="สร้างชุดสอบ" />
      <ol className="wizard-steps" aria-label="ขั้นตอนสร้างชุดสอบ">
        <li
          className={step === 0 ? "active" : "complete"}
          aria-current={step === 0 ? "step" : undefined}
        >
          <span className="step-index">
            {step === 1 ? <Check size={16} /> : "1"}
          </span>
          ข้อมูลชุดสอบ
        </li>
        <li
          className={step === 1 ? "active" : ""}
          aria-current={step === 1 ? "step" : undefined}
        >
          <span className="step-index">2</span>เฉลยและคะแนน
        </li>
        <li>
          <span className="step-index">3</span>ออกแบบกระดาษ
        </li>
      </ol>
      <form
        ref={form}
        className="panel form-panel exam-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 0) {
            setError("");
            if (validateSetup()) setStep(1);
          } else void save();
        }}
      >
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
          <legend className="sr-only">
            {step === 0 ? "ข้อมูลชุดสอบ" : "เฉลยและคะแนน"}
          </legend>
          <div className="exam-step-body">
            {step === 0 ? (
              <>
                <section
                  className="exam-form-section"
                  aria-labelledby="exam-details-heading"
                >
                  <h2 id="exam-details-heading">รายละเอียดชุดสอบ</h2>
                  <div className="form-grid">
                    <label className="span-two">
                      ชื่อชุดสอบ
                      <input
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          clearField("title");
                        }}
                        placeholder="เช่น สมการและอสมการเชิงเส้น"
                        maxLength={120}
                        required
                        aria-invalid={Boolean(fieldErrors.title)}
                        aria-describedby={
                          fieldErrors.title ? "exam-title-error" : undefined
                        }
                      />
                      {fieldMessage("title")}
                    </label>
                    <label>
                      วิชา
                      <select
                        aria-label="วิชา"
                        value={subjectChoice}
                        onChange={(e) => {
                          setSubjectSelection(e.target.value);
                          clearField("subject");
                        }}
                        required
                        aria-invalid={Boolean(fieldErrors.subject)}
                        aria-describedby={
                          fieldErrors.subject ? "exam-subject-error" : undefined
                        }
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
                      {subjectChoice !== "__new" && fieldMessage("subject")}
                    </label>
                    <label>
                      ชั้น / ห้อง
                      <select
                        aria-label="ชั้น / ห้อง"
                        aria-describedby={
                          fieldErrors.classroom
                            ? "exam-classroom-error"
                            : "exam-classroom-help"
                        }
                        aria-invalid={Boolean(fieldErrors.classroom)}
                        value={selectedClassroom}
                        onChange={(e) => {
                          setClassroom(e.target.value);
                          clearField("classroom");
                        }}
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
                      {fieldMessage("classroom")}
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
                          onChange={(e) => {
                            setNewSubject(e.target.value);
                            clearField("subject");
                          }}
                          maxLength={80}
                          placeholder="เช่น ภาษาไทย"
                          required
                          aria-invalid={Boolean(fieldErrors.subject)}
                          aria-describedby={
                            fieldErrors.subject
                              ? "exam-subject-error"
                              : undefined
                          }
                        />
                        {fieldMessage("subject")}
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
                        aria-describedby={
                          fieldErrors.questionCount
                            ? "exam-questionCount-error"
                            : "exam-question-count-help"
                        }
                        aria-invalid={Boolean(fieldErrors.questionCount)}
                        min={1}
                        max={60}
                        step={1}
                        value={countText}
                        onChange={(e) => {
                          setCountText(e.target.value);
                          clearField("questionCount");
                        }}
                      />
                      {fieldMessage("questionCount")}
                      <small id="exam-question-count-help">1–60 ข้อ</small>
                    </label>
                  </div>
                  <fieldset className="choice-count-field">
                    <legend>จำนวนตัวเลือก</legend>
                    <div className="choice-count-options">
                      {([4, 5] as const).map((value) => (
                        <label
                          key={value}
                          className={choiceCount === value ? "is-selected" : ""}
                        >
                          <input
                            type="radio"
                            name="choiceCount"
                            value={value}
                            checked={choiceCount === value}
                            onChange={() => changeChoiceCount(value)}
                          />
                          <span>
                            <strong>{value} ตัวเลือก</strong>
                            <small>
                              {thaiChoices.slice(0, value).join(" ")}
                            </small>
                          </span>
                          {choiceCount === value && (
                            <Check size={18} aria-hidden="true" />
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {choiceNotice && (
                    <Notice tone="warning">{choiceNotice}</Notice>
                  )}
                </section>
                <section
                  className="exam-form-section"
                  aria-labelledby="exam-term-heading"
                >
                  <h2 id="exam-term-heading">ภาคเรียนและเกณฑ์ผ่าน</h2>
                  <div className="form-grid exam-term-grid">
                    <label>
                      ปีการศึกษา
                      <select
                        value={year}
                        onChange={(e) =>
                          setSelectedYear(Number(e.target.value))
                        }
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
                        onChange={(e) =>
                          setSelectedTerm(Number(e.target.value))
                        }
                      >
                        {[1, 2, 3].map((value) => (
                          <option key={value} value={value}>
                            {value === 3
                              ? "ภาคฤดูร้อน"
                              : `ภาคเรียนที่ ${value}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      เกณฑ์ผ่าน
                      <select
                        value={passingPercent}
                        onChange={(e) =>
                          setPassingPercent(Number(e.target.value))
                        }
                      >
                        {[0, 40, 50, 60, 70, 80, 90, 100].map((value) => (
                          <option key={value} value={value}>
                            {value}% ของคะแนนเต็ม
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
              </>
            ) : (
              <>
                <div className="exam-key-heading">
                  <div>
                    <h2>เฉลยและคะแนนรายข้อ</h2>
                    <p>
                      {title} · {selectedClassroom}
                    </p>
                  </div>
                  <strong>
                    {new Intl.NumberFormat("th", {
                      maximumFractionDigits: 2,
                    }).format(total)}{" "}
                    คะแนนเต็ม
                  </strong>
                </div>
                <div className="key-progress" role="status">
                  <span
                    className={completed === questionCount ? "is-complete" : ""}
                  >
                    {completed === questionCount && (
                      <Check size={16} aria-hidden="true" />
                    )}
                    เลือกเฉลยแล้ว {completed} / {questionCount} ข้อ
                  </span>
                  <span>คะแนนต่อข้อ 0–100</span>
                </div>
                <div className="answer-key-grid">
                  {visibleAnswers.map((answer, i) => (
                    <div
                      className={`key-row ${answer ? "is-answered" : ""}`}
                      key={i}
                    >
                      <strong>ข้อ {i + 1}</strong>
                      <div
                        className="choice-buttons"
                        role="group"
                        aria-label={`เฉลยข้อ ${i + 1}`}
                      >
                        {choices.slice(0, choiceCount).map((c, n) => (
                          <button
                            type="button"
                            key={c}
                            aria-label={thaiChoices[n]}
                            aria-pressed={answer === c}
                            className={answer === c ? "selected" : ""}
                            onClick={() =>
                              setAnswers((old) =>
                                old.map((a, j) => (j === i ? c : a)),
                              )
                            }
                          >
                            {thaiChoices[n]}
                            {answer === c && (
                              <Check size={12} aria-hidden="true" />
                            )}
                          </button>
                        ))}
                      </div>
                      <label className="key-points">
                        <span className="sr-only">คะแนนข้อ {i + 1}</span>
                        <input
                          type="number"
                          aria-label={`คะแนนข้อ ${i + 1}`}
                          min={0}
                          max={100}
                          step="any"
                          value={points[i]}
                          aria-invalid={!validPoint(pointValues[i])}
                          aria-describedby={
                            !validPoint(pointValues[i])
                              ? `points-${i}-error`
                              : undefined
                          }
                          onChange={(e) =>
                            setPoints((old) =>
                              old.map((p, j) => (j === i ? e.target.value : p)),
                            )
                          }
                        />
                        {!validPoint(pointValues[i]) && (
                          <small
                            className="field-error"
                            id={`points-${i}-error`}
                          >
                            0–100
                          </small>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="exam-actions">
            {step === 0 ? (
              <>
                <Link href="/exams" className="btn btn-secondary">
                  ยกเลิก
                </Link>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!classrooms.length}
                >
                  กำหนดเฉลย
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStep(0)}
                >
                  <ArrowLeft size={16} />
                  ย้อนกลับ
                </button>
                <span className="exam-save-status">
                  {!allPointsValid
                    ? "ตรวจสอบคะแนนรายข้อ"
                    : completed < questionCount
                      ? `เหลือเฉลย ${questionCount - completed} ข้อ`
                      : "พร้อมสร้างชุดสอบ"}
                </span>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || !ready}
                >
                  {saving ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Plus size={17} />
                  )}
                  {saving ? "กำลังบันทึก…" : "สร้างชุดสอบและออกแบบกระดาษ"}
                </button>
              </>
            )}
          </div>
        </fieldset>
      </form>
    </div>
  );
}
