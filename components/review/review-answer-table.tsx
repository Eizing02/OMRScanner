"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  Search,
  History,
  Pencil,
  ScanLine,
  RefreshCw,
  Maximize2,
  Minimize2,
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
import type { ConfirmationCandidate } from "@/types/scan";
import type { Exam } from "@/types/exam";
import { useReviewPage } from "./use-review-data";
type Media = {
  original: string | null;
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
    reviewRevision,
  } = useWorkspace();
  const [activeId, setActiveId] = useState<string | null>(
      initialItemId ?? null,
    ),
    [filter, setFilter] = useState("needs_review"),
    [query, setQuery] = useState("");
  const [pane, setPane] = useState("answers"),
    [showAll, setShowAll] = useState(true),
    [focusAnswers, setFocusAnswers] = useState(false),
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
  const [queuePage, setQueuePage] = useState(0);
  const [batchOpen, setBatchOpen] = useState(false);
  const [candidates, setCandidates] = useState<ConfirmationCandidate[]>([]);
  const [selectedScans, setSelectedScans] = useState<string[]>([]);
  const [batchMessage, setBatchMessage] = useState("");
  const [detail, setDetail] = useState<{
    review: StoredReview;
    version: Exam;
  } | null>(null);
  const [detailError, setDetailError] = useState("");
  const remote = useReviewPage({
    view: "queue",
    examId,
    status: filter,
    query,
    page: queuePage,
    limit: 50,
  });
  const retired = useRef(new Set<string>());
  const demoItems = reviews.filter(
    (r) =>
      (!examId || r.examId === examId) &&
      r.status === filter &&
      `${r.studentCode} ${r.name}`.includes(query),
  );
  const items = mode === "connected" ? (remote.data?.items ?? []) : demoItems;
  async function previewConfirmation() {
    if (readOnly || busy || !items.length) return;
    setBusy(true);
    setError("");
    setBatchMessage("");
    try {
      let rows: ConfirmationCandidate[];
      if (mode === "connected") {
        const response = await request(
          "/api/scan-records",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "preview_confirm",
              items: items.slice(0, 50).map((r) => ({ scanId: r.id })),
            }),
          },
          true,
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.messageTh ?? "โหลดรายการไม่สำเร็จ");
        rows = body.data;
      } else
        rows = demoItems.slice(0, 50).map((r) => {
          const version = getExamVersion(r.examId, r.examVersion);
          const ready = Boolean(
            r.status === "needs_review" &&
            r.studentCode &&
            version &&
            canVerify(
              effectiveAnswers(r),
              version.questionCount,
              version.choiceCount,
            ),
          );
          const score = version
            ? gradeExam(version, effectiveAnswers(r))
            : null;
          return {
            scanId: r.id,
            revision: 1,
            name: r.name,
            studentCode: r.studentCode,
            ready,
            reason: ready ? "พร้อมยืนยัน" : "ตรวจคำตอบหรือรหัสก่อน",
            score: score?.score ?? 0,
            maxScore: score?.maxScore ?? 0,
            blankCount: score?.blank ?? 0,
            multipleCount: score?.multiple ?? 0,
          };
        });
      setCandidates(rows);
      setSelectedScans(rows.filter((r) => r.ready).map((r) => r.scanId));
      setBatchOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function confirmSelected() {
    if (readOnly || busy || !selectedScans.length) return;
    setBusy(true);
    setBatchMessage("");
    try {
      const selected = candidates.filter(
        (r) => r.ready && selectedScans.includes(r.scanId),
      );
      if (mode === "connected") {
        const response = await request(
          "/api/scan-records",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "confirm_batch",
              items: selected.map(({ scanId, revision }) => ({
                scanId,
                revision,
              })),
            }),
          },
          true,
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.messageTh ?? "ยืนยันไม่สำเร็จ");
        const outcomes = body.data as {
          scanId: string;
          confirmed: boolean;
          reason?: string;
        }[];
        const failed = outcomes.filter((r) => !r.confirmed);
        await refreshReviews();
        if (failed.length) {
          setSelectedScans([]);
          setCandidates((old) =>
            old.map((r) => ({
              ...r,
              ready: false,
              reason: failed.some((f) => f.scanId === r.scanId)
                ? "ข้อมูลเปลี่ยน กรุณาเปิดตรวจรายการนี้"
                : "ยืนยันแล้ว",
            })),
          );
          setBatchMessage(
            `ยืนยันแล้ว ${outcomes.length - failed.length} รายการ · ต้องตรวจใหม่ ${failed.length} รายการ`,
          );
          return;
        }
      } else
        setReviews(
          reviews.map((r) =>
            selectedScans.includes(r.id) ? { ...r, status: "verified" } : r,
          ),
        );
      notify(`ยืนยันคะแนนแล้ว ${selected.length} รายการ`);
      setBatchOpen(false);
      setSelectedScans([]);
    } catch (e) {
      setBatchMessage(
        e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ กดลองใหม่",
      );
    } finally {
      setBusy(false);
    }
  }
  const chosen = items.find((r) => r.id === activeId) ?? items[0];
  const item =
    mode === "connected"
      ? detail && detail.review.id === chosen?.id
        ? detail.review
        : undefined
      : demoItems.find((r) => r.id === chosen?.id);
  const exam =
    mode === "connected"
      ? item
        ? detail?.version
        : undefined
      : item
        ? getExamVersion(item.examId, item.examVersion)
        : undefined;
  const chosenId = chosen?.id;
  useEffect(() => {
    if (mode !== "connected" || !chosenId) return;
    let active = true;
    const controller = new AbortController();
    request(
      `/api/scan-records?view=detail&id=${encodeURIComponent(chosenId)}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw new Error(body.error?.messageTh ?? "โหลดคำตอบไม่สำเร็จ");
        if (active) {
          setDetail(body.data);
          setDetailError("");
        }
      })
      .catch((e) => {
        if (active && !controller.signal.aborted) {
          setDetail(null);
          setDetailError(e instanceof Error ? e.message : "โหลดคำตอบไม่สำเร็จ");
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [chosenId, mode, request, reviewRevision]);
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
    const load = async () => {
      // Explicit DELETE command retires only legacy originals. Owners viewing
      // another teacher's work never run this write. Processed proof survives.
      if (!readOnly && stored?.originalPath && !retired.current.has(item.id)) {
        retired.current.add(item.id);
        try {
          const cleanup = await request(
            "/api/scan-records",
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scanId: item.id }),
              signal: controller.signal,
            },
            true,
          );
          if (!cleanup.ok && active)
            notify(
              "ภาพตรวจและคะแนนยังอยู่ แต่ลบภาพต้นฉบับยังไม่สำเร็จ ลองเปิดรายการนี้ใหม่",
            );
        } catch {
          /* Reading retained evidence must still work when cleanup fails. */
        }
      }
      return request(`/api/scan-records?media=${item.id}`, {
        signal: controller.signal,
      });
    };
    load()
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
  }, [
    item,
    mode,
    request,
    refreshImage,
    readOnly,
    stored?.originalPath,
    notify,
  ]);
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
  const image = () => {
    if (!item || !exam) return null;
    if (mode === "demo")
      return (
        <SheetPreview
          layout={getLayout(exam)}
          single
          marked={item.rawAnswers}
          highlight={highlight}
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
      </div>
    );
  };
  return (
    <div
      className="task-workspace review-task"
      data-pane={pane}
      data-focus={focusAnswers ? "answers" : undefined}
    >
      <PageHeading
        title="ศูนย์ตรวจสอบ"
        actions={
          <>
            <button
              className="btn btn-secondary"
              disabled={
                readOnly ||
                busy ||
                filter !== "needs_review" ||
                !items.length ||
                remote.loading
              }
              onClick={() => void previewConfirmation()}
            >
              ยืนยันหลายรายการ
            </button>
            <Link href="/scan" className="btn btn-secondary">
              สแกนเพิ่ม <ArrowRight size={16} />
            </Link>
          </>
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
              setQueuePage(0);
            }}
          >
            <option value="needs_review">
              รอตรวจสอบ (
              {mode === "connected"
                ? (remote.data?.counts.needs_review ?? 0)
                : reviews.filter((r) => r.status === "needs_review").length}
              )
            </option>
            <option value="verified">
              ยืนยันแล้ว (
              {mode === "connected"
                ? (remote.data?.counts.verified ?? 0)
                : reviews.filter((r) => r.status === "verified").length}
              )
            </option>
            <option value="voided">ปฏิเสธแล้ว</option>
          </select>
        </label>
        <label className="review-student-select">
          <span className="sr-only">เลือกกระดาษคำตอบ</span>
          <select
            aria-label="เลือกกระดาษคำตอบ"
            value={chosen?.id ?? ""}
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
        onChange={(value) => {
          setPane(value);
          if (value !== "answers") setFocusAnswers(false);
        }}
        items={[
          { id: "queue", label: "รายการ" },
          { id: "image", label: "ภาพสแกน" },
          { id: "answers", label: "คำตอบและคะแนน" },
        ]}
      />
      {error && !dialog && <Notice tone="error">{error}</Notice>}
      {(remote.error || detailError) && (
        <Notice tone="error">
          {remote.error || detailError}
          <button
            className="text-button"
            onClick={() =>
              void refreshReviews().catch((e) =>
                setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"),
              )
            }
          >
            ลองใหม่
          </button>
        </Notice>
      )}
      {remote.loading && <Notice>กำลังโหลดรายการตรวจ…</Notice>}
      {(
        mode === "connected"
          ? remote.data && !Object.values(remote.data.counts).some(Boolean)
          : !reviews.length
      ) ? (
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
                onChange={(e) => {
                  setQuery(e.target.value);
                  setQueuePage(0);
                  setActiveId(null);
                }}
              />
            </label>
            <div className="review-queue-list">
              {items.map((r) => (
                <button
                  key={r.id}
                  className={chosen?.id === r.id ? "active" : ""}
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
            {mode === "connected" && (
              <div className="roster-pagination">
                <span>
                  {remote.data?.total ?? 0} รายการ · หน้า {queuePage + 1}
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={remote.loading || !queuePage}
                  onClick={() => {
                    setQueuePage((v) => v - 1);
                    setActiveId(null);
                  }}
                >
                  ก่อนหน้า
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={
                    remote.loading ||
                    (queuePage + 1) * 50 >= (remote.data?.total ?? 0)
                  }
                  onClick={() => {
                    setQueuePage((v) => v + 1);
                    setActiveId(null);
                  }}
                >
                  ถัดไป
                </button>
              </div>
            )}
          </aside>
          {item && exam ? (
            <>
              <section className="review-image-panel" data-work-pane="image">
                <div className="image-toolbar">
                  <span>ภาพที่ใช้ตรวจคำตอบ</span>
                  <button
                    className="icon-button"
                    aria-label="โหลดภาพใหม่"
                    onClick={() => {
                      setMediaError("");
                      if (item) retired.current.delete(item.id);
                      setRefreshImage((v) => v + 1);
                    }}
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                <div className="review-paper-view">{image()}</div>
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
                  <button
                    className="icon-button"
                    aria-label={`ประวัติการแก้ไข (${item.audit.length})`}
                    onClick={() => setHistory(true)}
                  >
                    <History size={18} />
                  </button>
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
                <div className="answer-filter">
                  <h2>
                    คำตอบ <span className="muted">{visible.length} ข้อ</span>
                  </h2>
                  <div>
                    <button
                      className="btn btn-ghost"
                      aria-pressed={showAll}
                      onClick={() => setShowAll(!showAll)}
                    >
                      {showAll ? "เฉพาะที่ควรตรวจ" : "แสดงทุกข้อ"}
                    </button>
                    <button
                      className="icon-button expand-answers"
                      aria-label={
                        focusAnswers ? "ย่อรายการคำตอบ" : "ขยายรายการคำตอบ"
                      }
                      aria-pressed={focusAnswers}
                      onClick={() => {
                        setFocusAnswers(!focusAnswers);
                        setPane("answers");
                      }}
                    >
                      {focusAnswers ? (
                        <Minimize2 size={18} />
                      ) : (
                        <Maximize2 size={18} />
                      )}
                    </button>
                  </div>
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
                                setFocusAnswers(false);
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
      <Modal
        open={batchOpen}
        onOpenChange={(open) => {
          if (!busy) setBatchOpen(open);
        }}
        title="ยืนยันคะแนนที่เลือก"
        description="เฉพาะรายการในหน้าปัจจุบันที่ตรวจครบแล้ว"
      >
        <label className="confirmation-select-all">
          <input
            type="checkbox"
            checked={
              candidates.some((r) => r.ready) &&
              candidates
                .filter((r) => r.ready)
                .every((r) => selectedScans.includes(r.scanId))
            }
            disabled={busy || !candidates.some((r) => r.ready)}
            onChange={(e) =>
              setSelectedScans(
                e.target.checked
                  ? candidates.filter((r) => r.ready).map((r) => r.scanId)
                  : [],
              )
            }
          />
          เลือกที่พร้อมทั้งหมด
        </label>
        <div className="confirmation-list">
          {candidates.map((r) => (
            <label key={r.scanId} className="confirmation-row">
              <input
                type="checkbox"
                aria-label={`ยืนยัน ${r.studentCode} ${r.name}`}
                disabled={busy || !r.ready}
                checked={selectedScans.includes(r.scanId)}
                onChange={(e) =>
                  setSelectedScans((old) =>
                    e.target.checked
                      ? [...old, r.scanId]
                      : old.filter((id) => id !== r.scanId),
                  )
                }
              />
              <span>
                <strong>
                  {r.studentCode || "รอตรวจรหัส"} · {r.name}
                </strong>
                <small>{r.reason}</small>
                <small>
                  {r.score} / {r.maxScore} คะแนน
                  {r.blankCount > 0 ? ` · ไม่ตอบ ${r.blankCount}` : ""}
                  {r.multipleCount > 0 ? ` · ฝนหลายวง ${r.multipleCount}` : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
        {batchMessage && <Notice>{batchMessage}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setBatchOpen(false)}
          >
            ปิด
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || readOnly || !selectedScans.length}
            onClick={() => void confirmSelected()}
          >
            {busy ? "กำลังยืนยัน…" : `ยืนยัน ${selectedScans.length} รายการ`}
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
