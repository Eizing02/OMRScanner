"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Search,
  Eye,
  History,
  LockKeyhole,
  Pencil,
  ArrowLeft,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { SheetPreview } from "@/components/omr/omr-sheet-preview";
import {
  Badge,
  EmptyState,
  Modal,
  Notice,
  PageHeading,
} from "@/components/ui/primitives";
import { thaiChoices, choices, type Choice } from "@/types/exam";
import { gradeExam, canVerify } from "@/lib/grading/grade-exam";
export function ReviewCenter() {
  const { reviews, setReviews, getExamVersion, getLayout, mode, notify } =
    useWorkspace();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState<number | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("needs_review");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("processed");
  const [verify, setVerify] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const items = reviews.filter(
    (r) => r.status === filter && `${r.studentCode} ${r.name}`.includes(query),
  );
  const item = reviews.find((r) => r.id === activeId) ?? items[0];
  const exam = item ? getExamVersion(item.examId, item.examVersion) : undefined;
  const answers =
    item?.rawAnswers.map((a) =>
      item.resolved.includes(a.question)
        ? {
            ...a,
            choice: item.corrections[a.question],
            state: item.corrections[a.question]
              ? ("valid" as const)
              : ("blank" as const),
          }
        : a,
    ) ?? [];
  const grade = exam ? gradeExam(exam, answers) : null;
  const unresolved = answers.filter(
    (a) => a.state === "ambiguous" || a.state === "unreadable",
  );
  function correct() {
    if (!item || question === null || !reason.trim() || mode !== "demo") return;
    const old = item.rawAnswers.find((a) => a.question === question);
    setReviews(
      reviews.map((r) =>
        r.id === item.id
          ? {
              ...r,
              corrections: { ...r.corrections, [question]: choice },
              resolved: Array.from(new Set([...r.resolved, question])),
              audit: [
                ...r.audit,
                {
                  at: new Date().toISOString(),
                  reason: reason.trim(),
                  question,
                  before: r.corrections[question] ?? old?.choice ?? null,
                  after: choice,
                },
              ],
            }
          : r,
      ),
    );
    setQuestion(null);
    setReason("");
    notify("บันทึกการแก้ไขพร้อมเหตุผลในพื้นที่ทดลองแล้ว");
  }
  return (
    <>
      <PageHeading
        title="ศูนย์ตรวจสอบ"
        description="ตรวจหลักฐานและแก้รายการที่ไม่แน่ใจ ก่อนยืนยันคะแนน"
        actions={
          <Link href="/scan" className="btn btn-secondary">
            สแกนเพิ่ม
            <ArrowRight size={16} />
          </Link>
        }
      />
      <div className="review-tabs">
        <button
          className={filter === "needs_review" ? "active" : ""}
          onClick={() => {
            setFilter("needs_review");
            setActiveId(null);
          }}
        >
          รอตรวจสอบ{" "}
          <Badge tone="amber">
            {reviews.filter((r) => r.status === "needs_review").length}
          </Badge>
        </button>
        <button
          className={filter === "verified" ? "active" : ""}
          onClick={() => {
            setFilter("verified");
            setActiveId(null);
          }}
        >
          ยืนยันแล้ว{" "}
          <Badge tone="green">
            {reviews.filter((r) => r.status === "verified").length}
          </Badge>
        </button>
      </div>
      {!reviews.length ? (
        <EmptyState
          title="ยังไม่มีผลสแกนให้ตรวจสอบ"
          description="ระบบ OMR ต้องเชื่อมต่อก่อน จึงจะมีผลอ่านจริงเข้าสู่คิว"
        />
      ) : (
        <div className="review-workspace">
          <aside className="panel review-queue">
            <div className="section-title">
              <h2>รายการกระดาษ</h2>
              <span className="muted small">{items.length} ใบ</span>
            </div>
            <label className="search-input">
              <Search size={16} />
              <input
                placeholder="ชื่อหรือรหัสนักเรียน"
                aria-label="ค้นหารายการตรวจสอบ"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="review-queue-list">
              {items.map((r) => (
                <button
                  key={r.id}
                  className={item?.id === r.id ? "active" : ""}
                  onClick={() => setActiveId(r.id)}
                >
                  <span className="avatar avatar-light">{r.number}</span>
                  <div>
                    <strong>{r.name}</strong>
                    <span>
                      {r.studentCode} · {r.classroom}
                    </span>
                    <small>
                      {r.status === "verified"
                        ? "ยืนยันในตัวอย่างแล้ว"
                        : r.reason}
                    </small>
                  </div>
                  <ChevronDown size={15} />
                </button>
              ))}
            </div>
            {!items.length && (
              <EmptyState
                title="ไม่มีรายการ"
                description="เลือกสถานะอื่นหรือเปลี่ยนคำค้นหา"
              />
            )}
          </aside>
          {item && exam && (
            <>
              <section className="review-image-panel">
                <div className="image-toolbar">
                  <div className="segmented-control">
                    <button
                      className={view === "original" ? "active" : ""}
                      onClick={() => setView("original")}
                    >
                      ต้นฉบับ
                    </button>
                    <button
                      className={view === "processed" ? "active" : ""}
                      onClick={() => setView("processed")}
                    >
                      หลังปรับภาพ
                    </button>
                    <button
                      className={view === "compare" ? "active" : ""}
                      onClick={() => setView("compare")}
                    >
                      เปรียบเทียบ
                    </button>
                  </div>
                  <Badge>ภาพสังเคราะห์</Badge>
                </div>
                <div
                  className={`review-paper-view ${view === "compare" ? "compare" : ""}`}
                >
                  {view === "compare" && (
                    <div>
                      <span>ต้นฉบับ</span>
                      <SheetPreview
                        layout={getLayout(exam)}
                        single
                        marked={item.rawAnswers}
                      />
                    </div>
                  )}
                  <div>
                    <span>
                      {view === "original"
                        ? "ต้นฉบับ"
                        : "หลังปรับภาพ · ข้อที่ควรตรวจ"}
                    </span>
                    <SheetPreview
                      layout={getLayout(exam)}
                      single
                      marked={item.rawAnswers}
                      highlight={
                        view !== "original"
                          ? unresolved[0]?.question
                          : undefined
                      }
                    />
                  </div>
                </div>
                <div className="image-footer">
                  <Eye size={16} />
                  ภาพจำลองสำหรับทดลองตรวจทาน · ไม่มีผล OMR จริง
                </div>
              </section>
              <section className="panel review-detail">
                <div className="student-match">
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.studentCode} · {item.classroom} · เลขที่{" "}
                      {item.number}
                    </p>
                  </div>
                  <Badge tone="green">
                    <CheckCircle2 size={13} />
                    ข้อมูลตัวอย่าง
                  </Badge>
                </div>
                <div className="review-score">
                  <div>
                    <span>คะแนนเบื้องต้น</span>
                    <strong>
                      {grade?.score}
                      <small> / {grade?.maxScore}</small>
                    </strong>
                  </div>
                  <div>
                    <span>ยังต้องตรวจ</span>
                    <strong className="amber-text">
                      {unresolved.length}
                      <small> ข้อ</small>
                    </strong>
                  </div>
                </div>
                <h2>ตรวจคำตอบรายข้อ</h2>
                <div className="answer-review-scroll">
                  <table className="data-table answer-review-table">
                    <thead>
                      <tr>
                        <th>ข้อ</th>
                        <th>อ่านได้</th>
                        <th>เฉลย</th>
                        <th>สถานะ</th>
                        <th>
                          <span className="sr-only">แก้ไข</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {answers.map((a, i) => (
                        <tr
                          key={a.question}
                          className={
                            a.state === "ambiguous" || a.state === "unreadable"
                              ? "uncertain-row"
                              : ""
                          }
                        >
                          <td>{a.question}</td>
                          <td>
                            {a.choice
                              ? thaiChoices[choices.indexOf(a.choice)]
                              : "—"}
                          </td>
                          <td>
                            {
                              thaiChoices[
                                choices.indexOf(exam.answerKey[i].correct)
                              ]
                            }
                          </td>
                          <td>
                            {item.resolved.includes(a.question) ? (
                              <Badge tone="blue">แก้ไขแล้ว</Badge>
                            ) : a.state === "ambiguous" ? (
                              <Badge tone="amber">ไม่ชัดเจน</Badge>
                            ) : a.state === "valid" ? (
                              <span className="small muted">อ่านได้</span>
                            ) : (
                              <Badge>
                                {a.state === "blank" ? "ไม่ตอบ" : "หลายคำตอบ"}
                              </Badge>
                            )}
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              disabled={item.status !== "needs_review"}
                              aria-label={`แก้คำตอบข้อ ${a.question}`}
                              onClick={() => {
                                setQuestion(a.question);
                                setChoice(a.choice);
                                setReason("");
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="review-detail-footer">
                  <button
                    className="text-button"
                    onClick={() => setShowHistory(true)}
                  >
                    <History size={15} />
                    ประวัติการแก้ไข ({item.audit.length})
                  </button>
                  {item.status === "needs_review" ? (
                    <button
                      className="btn btn-primary full-width"
                      disabled={
                        !canVerify(
                          answers,
                          exam.questionCount,
                          exam.choiceCount,
                        ) || mode !== "demo"
                      }
                      onClick={() => setVerify(true)}
                    >
                      <ClipboardCheck size={17} />
                      ยืนยันคะแนนในตัวอย่าง
                    </button>
                  ) : (
                    <Notice tone="success">
                      ยืนยันในพื้นที่ทดลองแล้ว · ยังไม่เผยแพร่ผลจริง
                    </Notice>
                  )}
                  {unresolved.length > 0 && (
                    <small className="muted">
                      ตรวจข้อที่ไม่ชัดเจนให้ครบก่อนยืนยันคะแนน
                    </small>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      )}
      <Modal
        open={question !== null}
        onOpenChange={(open) => !open && setQuestion(null)}
        title={`แก้คำตอบข้อ ${question}`}
        description="ผลอ่านต้นฉบับจะถูกเก็บไว้ การแก้ไขต้องระบุเหตุผล"
      >
        <div className="choice-buttons large">
          {choices.slice(0, exam?.choiceCount ?? 4).map((c, i) => (
            <button
              key={c}
              className={choice === c ? "selected" : ""}
              aria-pressed={choice === c}
              onClick={() => setChoice(c)}
            >
              {thaiChoices[i]}
            </button>
          ))}
          <button
            className={choice === null ? "selected" : ""}
            onClick={() => setChoice(null)}
          >
            ไม่ตอบ
          </button>
        </div>
        <label>
          เหตุผลในการแก้ไข
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="เช่น ตรวจจากภาพต้นฉบับแล้วพบรอยฝนที่ชัดเจน"
            required
          />
        </label>
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setQuestion(null)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-primary"
            disabled={reason.trim().length < 3}
            onClick={correct}
          >
            บันทึกการแก้ไข
          </button>
        </div>
      </Modal>
      <Modal
        open={verify}
        onOpenChange={setVerify}
        title="ยืนยันคะแนนในพื้นที่ทดลอง"
        description="การยืนยันนี้บันทึกเฉพาะในเบราว์เซอร์ ไม่ใช่ผลสอบจริง"
      >
        <p>
          ตรวจข้อมูลนักเรียนและคำตอบครบแล้ว คะแนน {grade?.score} /{" "}
          {grade?.maxScore}
        </p>
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setVerify(false)}
          >
            <ArrowLeft size={16} />
            กลับไปตรวจ
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (
                item &&
                exam &&
                canVerify(answers, exam.questionCount, exam.choiceCount)
              )
                setReviews(
                  reviews.map((r) =>
                    r.id === item.id ? { ...r, status: "verified" } : r,
                  ),
                );
              setVerify(false);
              setActiveId(null);
              notify("ยืนยันคะแนนตัวอย่างแล้ว");
            }}
          >
            <LockKeyhole size={16} />
            ยืนยันในตัวอย่าง
          </button>
        </div>
      </Modal>
      <Modal
        open={showHistory}
        onOpenChange={setShowHistory}
        title="ประวัติการแก้ไข"
      >
        {item?.audit.length ? (
          item.audit.map((a, i) => (
            <div className="audit-entry" key={i}>
              <strong>
                ข้อ {a.question} · {a.before ?? "ไม่ตอบ"} →{" "}
                {a.after ?? "ไม่ตอบ"}
              </strong>
              <p>{a.reason}</p>
              <small>{new Date(a.at).toLocaleString("th-TH")}</small>
            </div>
          ))
        ) : (
          <p className="muted">ยังไม่มีการแก้ไข</p>
        )}
      </Modal>
    </>
  );
}
