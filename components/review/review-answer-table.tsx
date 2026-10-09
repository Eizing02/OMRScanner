"use client";
/* eslint-disable @next/next/no-img-element -- Signed private scan images are fetched on demand. */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  Search,
  History,
  Pencil,
  ScanLine,
  RefreshCw,
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
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import { thaiChoices, choices, type Choice } from "@/types/exam";
import { gradeExam, canVerify } from "@/lib/grading/grade-exam";
import { effectiveAnswers } from "@/lib/grading/recalculate";
import type { StoredReview, LockedScanTemplate } from "@/types/scan";
type Media = {
  original: string;
  processed: string;
  template: Pick<LockedScanTemplate, "layout_json" | "omr_json">;
};
export function ReviewCenter({
  examId,
  initialItemId,
}: { examId?: string; initialItemId?: string } = {}) {
  const {
    reviews,
    setReviews,
    getExamVersion,
    getLayout,
    mode,
    notify,
    request,
    readOnly,
    refreshReviews,
  } = useWorkspace();
  const [activeId, setActiveId] = useState<string | null>(
      initialItemId ?? null,
    ),
    [filter, setFilter] = useState("needs_review"),
    [query, setQuery] = useState("");
  const [pane, setPane] = useState("answers"),
    [view, setView] = useState("processed"),
    [showAll, setShowAll] = useState(false),
    [highlight, setHighlight] = useState<number | undefined>();
  const [dialog, setDialog] = useState<
      "correct" | "identify" | "reject" | "confirm" | null
    >(null),
    [question, setQuestion] = useState(1),
    [choice, setChoice] = useState<Choice | null>(null);
  const [reason, setReason] = useState(""),
    [studentCode, setStudentCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [history, setHistory] = useState(false),
    [media, setMedia] = useState<Media | null>(null),
    [mediaId, setMediaId] = useState(""),
    [mediaError, setMediaError] = useState("");
  const [refreshImage, setRefreshImage] = useState(0);
  const items = reviews.filter(
    (r) =>
      (!examId || r.examId === examId) &&
      r.status === filter &&
      `${r.studentCode} ${r.name}`.includes(query),
  );
  const item = items.find((r) => r.id === activeId) ?? items[0],
    exam = item ? getExamVersion(item.examId, item.examVersion) : undefined;
  const stored = item as StoredReview | undefined,
    answers = item ? effectiveAnswers(item) : [],
    grade = exam ? gradeExam(exam, answers) : null;
  const unresolved = answers.filter(
    (a) => a.state === "ambiguous" || a.state === "unreadable",
  );
  const visible = showAll
    ? answers
    : answers.filter((a) => a.state !== "valid");
  useEffect(() => {
    if (!item || mode !== "connected") return;
    let active = true;
    const controller = new AbortController();
    request(`/api/scan-records?media=${item.id}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.messageTh ?? "โหลดภาพไม่ได้");
        if (active) {
          setMedia(body.data);
          setMediaId(item.id);
          setMediaError("");
        }
      })
      .catch((e) => {
        if (active)
          setMediaError(e instanceof Error ? e.message : "โหลดภาพไม่ได้");
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [item, mode, request, refreshImage]);
  async function mutate() {
    if (!item || !exam || !dialog || readOnly) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "connected") {
        const response = await request(
          "/api/scan-records",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scanId: item.id,
              revision: stored?.revision,
              action: dialog,
              reason,
              ...(dialog === "correct" ? { question, choice } : {}),
              ...(dialog === "identify" ? { studentCode } : {}),
            }),
          },
          true,
        );
        const body = await response.json();
        if (!response.ok) {
          await refreshReviews();
          throw new Error(body.error?.messageTh ?? "บันทึกไม่สำเร็จ");
        }
        await refreshReviews();
      } else if (mode === "demo") {
        setReviews(
          reviews.map((r) =>
            r.id !== item.id
              ? r
              : dialog === "correct"
                ? {
                    ...r,
                    corrections: { ...r.corrections, [question]: choice },
                    resolved: [...new Set([...r.resolved, question])],
                    audit: [
                      ...r.audit,
                      {
                        at: new Date().toISOString(),
                        reason,
                        question,
                        before:
                          answers.find((a) => a.question === question)
                            ?.choice ?? null,
                        after: choice,
                      },
                    ],
                  }
                : dialog === "confirm"
                  ? { ...r, status: "verified" }
                  : dialog === "reject"
                    ? { ...r, status: "voided" }
                    : r,
          ),
        );
      } else throw new Error("ยังไม่ได้เชื่อมต่อระบบ");
      setDialog(null);
      setReason("");
      notify(
        dialog === "confirm"
          ? "ยืนยันคะแนนแล้ว"
          : dialog === "reject"
            ? "ปฏิเสธภาพสแกนแล้ว"
            : "บันทึกการแก้ไขแล้ว",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  const confirmed = item?.status === "verified",
    canConfirm = Boolean(
      item?.studentCode &&
      exam &&
      canVerify(answers, exam.questionCount, exam.choiceCount) &&
      !readOnly,
    );
  const image = (original = false) => {
    if (!item || !exam) return null;
    if (mode === "demo")
      return (
        <SheetPreview
          layout={getLayout(exam)}
          single
          marked={item.rawAnswers}
          highlight={!original ? highlight : undefined}
        />
      );
    if (mediaError)
      return (
        <Notice tone="error">
          {mediaError}
          <button
            className="text-button"
            onClick={() => setRefreshImage((v) => v + 1)}
          >
            โหลดภาพใหม่
          </button>
        </Notice>
      );
    if (mediaId !== item.id || !media)
      return (
        <div className="loading-state" role="status">
          กำลังโหลดภาพ…
        </div>
      );
    const width = stored?.paper === "a4" ? 297 : 148.5,
      offset =
        stored?.paper === "a4" &&
        media.template.layout_json.paperMode !== "full"
          ? (stored.slot ?? 0) * 148.5
          : 0;
    const bubbles = media.template.omr_json.centersMm.answers.filter(
      (b) => b.question === highlight,
    );
    return (
      <div className="scan-proof">
        {original ? (
          <img
            src={media.original}
            alt="ภาพสแกนต้นฉบับ"
            onError={() =>
              setMediaError("ภาพหมดอายุหรือโหลดไม่สำเร็จ กดโหลดภาพใหม่")
            }
          />
        ) : (
          <svg
            viewBox={`0 0 ${width} 210`}
            role="img"
            aria-label={
              highlight
                ? `ภาพสแกนและตำแหน่งคำตอบข้อ ${highlight}`
                : "ภาพที่ใช้ตรวจคำตอบ"
            }
          >
            <image
              href={media.processed}
              x={0}
              y={0}
              width={width}
              height={210}
              preserveAspectRatio="none"
              onError={() =>
                setMediaError("ภาพหมดอายุหรือโหลดไม่สำเร็จ กดโหลดภาพใหม่")
              }
            />
            {highlight &&
              bubbles.map((b) => (
                <circle
                  key={b.option}
                  cx={b.x + offset}
                  cy={b.y}
                  r={2.8}
                  fill="none"
                  stroke="#e89508"
                  strokeWidth={0.6}
                />
              ))}
          </svg>
        )}
      </div>
    );
  };
  return (
    <div className="task-workspace review-task" data-pane={pane}>
      <PageHeading
        title="ศูนย์ตรวจสอบ"
        actions={
          <Link href="/scan" className="btn btn-secondary">
            สแกนเพิ่ม <ArrowRight size={16} />
          </Link>
        }
      />
      <div className="review-context-bar">
        <label>
          <span className="sr-only">สถานะผลสแกน</span>
          <select
            aria-label="สถานะผลสแกน"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setActiveId(null);
            }}
          >
            <option value="needs_review">
              รอตรวจสอบ (
              {reviews.filter((r) => r.status === "needs_review").length})
            </option>
            <option value="verified">
              ยืนยันแล้ว (
              {reviews.filter((r) => r.status === "verified").length})
            </option>
            <option value="voided">ปฏิเสธแล้ว</option>
          </select>
        </label>
        <label className="review-student-select">
          <span className="sr-only">เลือกกระดาษคำตอบ</span>
          <select
            aria-label="เลือกกระดาษคำตอบ"
            value={item?.id ?? ""}
            onChange={(e) => {
              setActiveId(e.target.value);
              setHighlight(undefined);
            }}
          >
            {items.map((r) => (
              <option key={r.id} value={r.id}>
                {r.studentCode || "รอตรวจรหัส"} · {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <WorkspaceTabs
        value={pane}
        onChange={setPane}
        items={[
          { id: "queue", label: "รายการ" },
          { id: "image", label: "ภาพสแกน" },
          { id: "answers", label: "คำตอบและคะแนน" },
        ]}
      />
      {error && !dialog && <Notice tone="error">{error}</Notice>}
      {!reviews.length ? (
        <EmptyState
          title="ยังไม่มีผลสแกน"
          description="สแกนกระดาษคำตอบเพื่อเริ่มตรวจคะแนน"
        >
          <Link href="/scan" className="btn btn-primary">
            <ScanLine size={17} />
            สแกนกระดาษคำตอบ
          </Link>
        </EmptyState>
      ) : (
        <div className="review-workspace">
          <aside className="panel review-queue" data-work-pane="queue">
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
                  onClick={() => {
                    setActiveId(r.id);
                    setHighlight(undefined);
                    setPane("answers");
                  }}
                >
                  <div>
                    <strong>{r.name}</strong>
                    <span>
                      {r.studentCode || "รอตรวจรหัส"} · {r.classroom}
                    </span>
                    <small>
                      {r.status === "verified" ? "ยืนยันแล้ว" : r.reason}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          </aside>
          {item && exam ? (
            <>
              <section className="review-image-panel" data-work-pane="image">
                <div className="image-toolbar">
                  <div className="segmented-control">
                    {[
                      { id: "original", label: "ต้นฉบับ" },
                      { id: "processed", label: "หลังปรับภาพ" },
                      { id: "compare", label: "เทียบภาพ" },
                    ].map((v) => (
                      <button
                        key={v.id}
                        className={view === v.id ? "active" : ""}
                        onClick={() => setView(v.id)}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="icon-button"
                    aria-label="โหลดภาพใหม่"
                    onClick={() => {
                      setMediaError("");
                      setRefreshImage((v) => v + 1);
                    }}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <div
                  className={`review-paper-view ${view === "compare" ? "compare" : ""}`}
                >
                  {view === "compare" && image(true)}
                  {image(view === "original")}
                </div>
                {mode === "demo" && (
                  <small className="image-footer">ภาพสังเคราะห์</small>
                )}
              </section>
              <section className="panel review-detail" data-work-pane="answers">
                <div className="student-match">
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.studentCode || "ยังไม่ระบุนักเรียน"} ·{" "}
                      {item.classroom}
                    </p>
                  </div>
                  <Badge tone={confirmed ? "green" : "amber"}>
                    {confirmed ? "ยืนยันแล้ว" : "รอยืนยัน"}
                  </Badge>
                </div>
                {!item.studentCode && (
                  <button
                    className="btn btn-secondary"
                    disabled={readOnly}
                    onClick={() => {
                      setStudentCode("");
                      setReason("");
                      setDialog("identify");
                    }}
                  >
                    ระบุนักเรียน
                  </button>
                )}
                <div className="review-score">
                  <div>
                    <span>
                      {confirmed ? "คะแนนที่ยืนยันแล้ว" : "คะแนนเบื้องต้น"}
                    </span>
                    <strong>
                      {grade?.score}
                      <small> / {grade?.maxScore}</small>
                    </strong>
                  </div>
                  <div>
                    <span>ต้องตรวจ</span>
                    <strong className="amber-text">
                      {unresolved.length}
                      <small> ข้อ</small>
                    </strong>
                  </div>
                </div>
                <div className="answer-filter">
                  <h2>คำตอบ</h2>
                  <button
                    className="btn btn-ghost"
                    aria-pressed={showAll}
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll ? "เฉพาะที่ควรตรวจ" : "แสดงทุกข้อ"}
                  </button>
                </div>
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
                      {visible.map((a) => (
                        <tr
                          key={a.question}
                          className={
                            a.state === "ambiguous" || a.state === "unreadable"
                              ? "uncertain-row"
                              : ""
                          }
                        >
                          <td>
                            <button
                              className="question-link"
                              onClick={() => {
                                setHighlight(a.question);
                                setPane("image");
                              }}
                              aria-label={`ดูภาพข้อ ${a.question}`}
                            >
                              {a.question}
                            </button>
                          </td>
                          <td>
                            {a.choice
                              ? thaiChoices[choices.indexOf(a.choice)]
                              : "—"}
                          </td>
                          <td>
                            {
                              thaiChoices[
                                choices.indexOf(
                                  exam.answerKey.find(
                                    (k) => k.question === a.question,
                                  )!.correct,
                                )
                              ]
                            }
                          </td>
                          <td>
                            <Badge
                              tone={
                                item.resolved.includes(a.question)
                                  ? "blue"
                                  : a.state === "ambiguous" ||
                                      a.state === "unreadable"
                                    ? "amber"
                                    : "neutral"
                              }
                            >
                              {item.resolved.includes(a.question)
                                ? "แก้ไขแล้ว"
                                : {
                                    valid: "อ่านได้",
                                    blank: "ไม่ตอบ",
                                    multiple: "หลายคำตอบ",
                                    ambiguous: "ไม่ชัด",
                                    unreadable: "อ่านไม่ได้",
                                  }[a.state]}
                            </Badge>
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              disabled={
                                item.status !== "needs_review" || readOnly
                              }
                              aria-label={`แก้คำตอบข้อ ${a.question}`}
                              onClick={() => {
                                setQuestion(a.question);
                                setChoice(a.choice);
                                setReason("");
                                setError("");
                                setDialog("correct");
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!visible.length && (
                    <div className="compact-empty">
                      ไม่มีคำตอบที่ต้องตรวจเพิ่มเติม
                    </div>
                  )}
                </div>
                <button
                  className="text-button review-history"
                  onClick={() => setHistory(true)}
                >
                  <History size={15} />
                  ประวัติการแก้ไข ({item.audit.length})
                </button>
              </section>
            </>
          ) : (
            <EmptyState
              title="ไม่มีรายการในสถานะนี้"
              description="เปลี่ยนตัวกรองหรือคำค้นหา"
            />
          )}
        </div>
      )}
      {item && exam && (
        <footer className="workspace-actionbar">
          <span>
            {grade?.score} / {grade?.maxScore} คะแนน
            {unresolved.length ? ` · ตรวจอีก ${unresolved.length} ข้อ` : ""}
          </span>
          {item.status === "needs_review" ? (
            <div>
              <button
                className="btn btn-secondary"
                disabled={readOnly || busy}
                onClick={() => {
                  setReason("");
                  setDialog("reject");
                }}
              >
                ปฏิเสธภาพ
              </button>
              <button
                className="btn btn-primary"
                disabled={!canConfirm || busy}
                onClick={() => {
                  setError("");
                  setDialog("confirm");
                }}
              >
                <ClipboardCheck size={17} />
                ยืนยันคะแนน
              </button>
            </div>
          ) : (
            <Badge tone={confirmed ? "green" : "red"}>
              {confirmed ? "ยืนยันแล้ว" : "ปฏิเสธแล้ว"}
            </Badge>
          )}
        </footer>
      )}
      <Modal
        open={dialog !== null}
        onOpenChange={(open) => !open && !busy && setDialog(null)}
        title={
          dialog === "correct"
            ? `แก้คำตอบข้อ ${question}`
            : dialog === "identify"
              ? "ระบุนักเรียน"
              : dialog === "reject"
                ? "ปฏิเสธภาพสแกน"
                : "ยืนยันคะแนน"
        }
      >
        {dialog === "correct" && (
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
        )}
        {dialog === "identify" && (
          <label>
            รหัสนักเรียน 5 หลัก
            <input
              value={studentCode}
              inputMode="numeric"
              maxLength={5}
              onChange={(e) =>
                setStudentCode(e.target.value.replace(/\D/g, ""))
              }
            />
          </label>
        )}
        {dialog === "confirm" ? (
          <p>
            {item?.name} · {item?.studentCode}
            <br />
            คะแนน {grade?.score} / {grade?.maxScore} · เมื่อตรวจครบแล้วจึงยืนยัน
          </p>
        ) : (
          <label>
            เหตุผล
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              required
            />
          </label>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setDialog(null)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-primary"
            disabled={
              busy ||
              readOnly ||
              (dialog !== "confirm" && reason.trim().length < 3) ||
              (dialog === "identify" && studentCode.length !== 5)
            }
            onClick={() => void mutate()}
          >
            {busy
              ? "กำลังบันทึก…"
              : dialog === "confirm"
                ? "ยืนยันคะแนน"
                : "บันทึก"}
          </button>
        </div>
      </Modal>
      <Modal open={history} onOpenChange={setHistory} title="ประวัติการแก้ไข">
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
          <p>ยังไม่มีการแก้ไข</p>
        )}
      </Modal>
    </div>
  );
}
