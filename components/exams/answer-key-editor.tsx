"use client";
import { useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/layout/workspace-provider";
import {
  PageHeading,
  EmptyState,
  Notice,
  Modal,
} from "@/components/ui/primitives";
import { thaiChoices, choices, examSchema, type Exam } from "@/types/exam";
export function AnswerKey({ id }: { id: string }) {
  const { exams, loading } = useWorkspace();
  const exam = exams.find((e) => e.id === id);
  if (loading) return <Notice>กำลังโหลดเฉลย…</Notice>;
  if (!exam)
    return (
      <EmptyState title="ไม่พบชุดสอบ" description="กลับไปเลือกชุดสอบในคลัง" />
    );
  return <AnswerKeyEditor key={`${id}-${exam.version}`} exam={exam} />;
}
function AnswerKeyEditor({ exam }: { exam: Exam }) {
  const { updateExam, notify } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [keys, setKeys] = useState(exam.answerKey);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setSaving(true);
    setError("");
    try {
      await updateExam(exam, examSchema.parse({ ...exam, answerKey: keys }));
      notify("บันทึกเฉลยเป็นเวอร์ชันใหม่แล้ว กระดาษเดิมยังใช้เฉลยเวอร์ชันเดิม");
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        title="เฉลยและคะแนน"
        description={`${exam.title} · เวอร์ชัน ${exam.version} · ${exam.questionCount} ข้อ / ${exam.choiceCount} ตัวเลือก`}
        actions={
          <Link
            href={`/exams/${exam.id}/omr-generate`}
            className="btn btn-secondary"
          >
            ออกแบบกระดาษคำตอบ
          </Link>
        }
      />
      <Notice>
        การแก้เฉลยจะสร้างเวอร์ชันใหม่ ไม่แก้เวอร์ชันของกระดาษที่พิมพ์แล้ว
        กรุณาตรวจเฉลยก่อนพิมพ์ทดสอบ
      </Notice>
      <section className="panel form-panel">
        <div className="section-title">
          <h2>{keys.reduce((sum, key) => sum + key.points, 0)} คะแนนเต็ม</h2>
          {!editing && (
            <button
              className="btn btn-secondary"
              onClick={() => setEditing(true)}
            >
              แก้เฉลยเป็นเวอร์ชันใหม่
            </button>
          )}
        </div>
        <div className="answer-key-grid">
          {keys.map((key, index) => (
            <div className="key-row" key={key.question}>
              <strong>ข้อ {key.question}</strong>
              {editing ? (
                <>
                  <div
                    className="choice-buttons"
                    role="group"
                    aria-label={`เฉลยข้อ ${key.question}`}
                  >
                    {choices.slice(0, exam.choiceCount).map((choice, i) => (
                      <button
                        key={choice}
                        className={key.correct === choice ? "selected" : ""}
                        aria-pressed={key.correct === choice}
                        onClick={() =>
                          setKeys((old) =>
                            old.map((k, j) =>
                              j === index ? { ...k, correct: choice } : k,
                            ),
                          )
                        }
                      >
                        {thaiChoices[i]}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    aria-label={`คะแนนข้อ ${key.question}`}
                    value={key.points}
                    onChange={(e) =>
                      setKeys((old) =>
                        old.map((k, j) =>
                          j === index
                            ? { ...k, points: Number(e.target.value) }
                            : k,
                        ),
                      )
                    }
                  />
                </>
              ) : (
                <>
                  <span className="key-choice">
                    {thaiChoices[choices.indexOf(key.correct)]}
                  </span>
                  <span>{key.points} คะแนน</span>
                </>
              )}
            </div>
          ))}
        </div>
        {editing && (
          <div className="dialog-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setKeys(exam.answerKey);
                setEditing(false);
              }}
            >
              ยกเลิก
            </button>
            <button
              className="btn btn-primary"
              disabled={
                !examSchema.safeParse({ ...exam, answerKey: keys }).success
              }
              onClick={() => setConfirm(true)}
            >
              บันทึกเฉลยเวอร์ชันใหม่
            </button>
          </div>
        )}
      </section>
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="ยืนยันเฉลยเวอร์ชันใหม่"
        description="เก็บเฉลยเดิมไว้ และใช้ QR ใหม่สำหรับการพิมพ์ครั้งถัดไป"
      >
        <p>
          {exam.questionCount} ข้อ ·{" "}
          {keys.reduce((sum, key) => sum + key.points, 0)} คะแนนเต็ม
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={saving}
            onClick={() => setConfirm(false)}
          >
            กลับไปตรวจ
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? "กำลังบันทึก…" : "ยืนยันบันทึกเฉลย"}
          </button>
        </div>
      </Modal>
    </>
  );
}
