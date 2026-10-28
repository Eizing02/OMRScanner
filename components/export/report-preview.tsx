"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download, ArrowLeft } from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { SheetPreview } from "@/components/omr/omr-sheet-preview";
import {
  printStudentErrors,
  resolveGeometry,
  resolvePrintLayout,
  validateLayout,
} from "@/lib/omr/generate-template";
import { buildPrintPdf } from "@/lib/export/export-pdf";
import { studentFullName } from "@/types/student";
import type { Student } from "@/types/student";
import type { PrintStudent } from "@/types/print";
import {
  PageHeading,
  Notice,
  Badge,
  EmptyState,
} from "@/components/ui/primitives";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
export function PrintPreview({ examId }: { examId: string }) {
  const {
    exams,
    students,
    getLayout,
    notify,
    mode,
    readOnly,
    registerPrint,
    isCurrentWorkspace,
    branding,
    request,
    reviewRevision,
  } = useWorkspace();
  const exam = exams.find((e) => e.id === examId);
  const examVersion = exam?.version;
  const [count, setCount] = useState(2),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [personalized, setPersonalized] = useState(true),
    [selectedIds, setSelectedIds] = useState<string[] | null>(null),
    [previewId, setPreviewId] = useState("");
  const [pane, setPane] = useState("preview");
  const [scopedStudents, setScopedStudents] = useState<Student[]>([]),
    [rosterLoading, setRosterLoading] = useState(mode === "connected"),
    [rosterError, setRosterError] = useState("");
  useEffect(() => {
    if (mode !== "connected" || !examVersion) return;
    let active = true;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (active) setRosterLoading(true);
    });
    request(
      `/api/scan-records?${new URLSearchParams({ view: "exam_roster", examId, version: String(examVersion) })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw new Error(body.error?.messageTh ?? "โหลดรายชื่อไม่สำเร็จ");
        if (active) {
          setScopedStudents(body.data.students);
          setRosterError("");
        }
      })
      .catch((e) => {
        if (active && !controller.signal.aborted) {
          setScopedStudents([]);
          setRosterError(
            e instanceof Error ? e.message : "โหลดรายชื่อไม่สำเร็จ",
          );
        }
      })
      .finally(() => {
        if (active) setRosterLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [mode, request, examId, examVersion, reviewRevision]);
  const registrationKey = useRef({ key: "", id: "" });
  if (!exam)
    return (
      <EmptyState title="ไม่พบชุดสอบ" description="เลือกชุดสอบจากคลัง">
        <Link href="/exams" className="btn btn-primary">
          เปิดคลังชุดสอบ
        </Link>
      </EmptyState>
    );
  const roster: PrintStudent[] = (
    mode === "connected" ? scopedStudents : students
  )
    .filter(
      (s) =>
        mode === "connected" ||
        (s.active !== false && s.classroom_name === exam.classroom),
    )
    .sort((a, b) => a.student_code.localeCompare(b.student_code))
    .map((s) => ({
      id: s.id,
      student_code: s.student_code,
      full_name: s.full_name ?? studentFullName(s),
      classroom_name: s.classroom_name,
      number: s.number,
    }));
  const selected = roster.filter(
    (s) => selectedIds === null || selectedIds.includes(s.id),
  );
  const layout = resolvePrintLayout(
      getLayout(exam),
      personalized ? selected : [],
    ),
    g = resolveGeometry(layout);
  const printCount = personalized ? selected.length : count,
    previewStudent = personalized
      ? (selected.find((s) => s.id === previewId) ?? selected[0])
      : undefined;
  const validation = validateLayout(layout);
  validation.errors.push(
    ...printStudentErrors(layout, personalized ? selected : []),
  );
  const structureChanged =
    layout.questionCount !== exam.questionCount ||
    layout.choiceCount !== exam.choiceCount;
  async function download() {
    if (personalized && (rosterLoading || rosterError)) return;
    setBusy(true);
    setError("");
    try {
      if (readOnly) throw new Error("กลับพื้นที่ของคุณก่อนสร้างชุดพิมพ์");
      if (structureChanged)
        throw new Error("บันทึกโครงข้อสอบให้ตรงกับเฉลยก่อนพิมพ์");
      if (!printCount || printCount > 200)
        throw new Error("เลือก 1–200 ใบต่อชุดพิมพ์");
      const key = JSON.stringify({
        layout: { ...layout, logo: null },
        selection: personalized ? selected.map((s) => s.id) : count,
      });
      if (registrationKey.current.key !== key)
        registrationKey.current = { key, id: crypto.randomUUID() };
      const registered =
        mode === "connected"
          ? await registerPrint({
              layout,
              requestId: registrationKey.current.id,
              ...(personalized
                ? { studentIds: selected.map((s) => s.id) }
                : { blankCount: count }),
            })
          : null;
      const result = await buildPrintPdf(
        registered
          ? { ...registered.layout, logo: branding.image_url }
          : layout,
        registered
          ? personalized
            ? registered.students
            : registered.manifest.sheets.length
          : personalized
            ? selected
            : count,
        registered?.manifest,
      );
      if (!isCurrentWorkspace())
        throw new Error("พื้นที่ทำงานเปลี่ยนแล้ว กรุณาสร้างไฟล์ใหม่");
      result.pdf.save("กระดาษคำตอบ-A4.pdf");
      // JSON remains an internal registered template, never a second download.
      notify("ดาวน์โหลด PDF กระดาษคำตอบแล้ว");
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="task-workspace print-task" data-pane={pane}>
      <PageHeading
        title="ดูตัวอย่างก่อนพิมพ์"
        actions={
          <Link
            className="btn btn-secondary"
            href={`/exams/${examId}/omr-generate`}
          >
            <ArrowLeft size={16} />
            ออกแบบ
          </Link>
        }
      />
      <WorkspaceTabs
        value={pane}
        onChange={setPane}
        items={[
          { id: "preview", label: "ตัวอย่างกระดาษ" },
          { id: "options", label: `รายชื่อ · ${printCount} ใบ` },
        ]}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {rosterError && <Notice tone="error">{rosterError}</Notice>}
      {rosterLoading && <Notice>กำลังโหลดรายชื่อของชุดสอบ…</Notice>}
      <div className="print-workspace">
        <section className="print-canvas" data-work-pane="preview">
          <div className="preview-top">
            <span>{exam.title}</span>
            <Badge>{g.sheetsPerPage} ใบ / A4</Badge>
          </div>
          <div className="paper-fit">
            <div
              className={`print-paper ${g.sheetsPerPage === 2 ? "single-half-sheet" : ""}`}
            >
              <SheetPreview layout={layout} single student={previewStudent} />
            </div>
          </div>
        </section>
        <aside className="panel print-settings" data-work-pane="options">
          <h2>เลือกกระดาษคำตอบ</h2>
          <label>
            รูปแบบ
            <select
              value={personalized ? "roster" : "blank"}
              disabled={busy}
              onChange={(e) => setPersonalized(e.target.value === "roster")}
            >
              <option value="roster">รายบุคคล · {exam.classroom}</option>
              <option value="blank">ใบสำรองเปล่า</option>
            </select>
          </label>
          {personalized ? (
            <>
              {!roster.length ? (
                <Notice>
                  ยังไม่มีรายชื่อชั้น {exam.classroom}{" "}
                  <Link href="/students/import" className="text-link">
                    นำเข้ารายชื่อ
                  </Link>
                </Notice>
              ) : (
                <>
                  <label>
                    ตัวอย่างนักเรียน
                    <select
                      value={previewStudent?.id ?? ""}
                      disabled={busy || !selected.length}
                      onChange={(e) => setPreviewId(e.target.value)}
                    >
                      {selected.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.student_code} · {s.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <details>
                    <summary>
                      เลือกรายชื่อ · {selected.length} / {roster.length} คน
                    </summary>
                    <button
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => setSelectedIds(null)}
                    >
                      เลือกทั้งหมด
                    </button>
                    <div className="print-roster-list">
                      {roster.map((s) => (
                        <label className="checkbox-label" key={s.id}>
                          <input
                            type="checkbox"
                            checked={
                              selectedIds === null || selectedIds.includes(s.id)
                            }
                            disabled={busy}
                            onChange={(e) =>
                              setSelectedIds((current) => {
                                const ids = current ?? roster.map((r) => r.id);
                                return e.target.checked
                                  ? [...ids.filter((id) => id !== s.id), s.id]
                                  : ids.filter((id) => id !== s.id);
                              })
                            }
                          />
                          <span>
                            {s.student_code} · {s.full_name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </>
          ) : (
            <label>
              จำนวนใบสำรอง
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                disabled={busy}
                onChange={(e) =>
                  setCount(
                    Math.max(
                      1,
                      Math.min(200, Math.trunc(Number(e.target.value) || 1)),
                    ),
                  )
                }
              />
            </label>
          )}
          <div className="print-stat">
            <span>กระดาษที่ใช้</span>
            <strong>{Math.ceil(printCount / g.sheetsPerPage)} แผ่น A4</strong>
          </div>
          {g.autoExpanded && (
            <Notice>ใช้ A4 เต็มใบเพื่อให้วงฝนมีขนาดเท่าเดิม</Notice>
          )}
          {structureChanged && (
            <Notice tone="error">
              จำนวนข้อ/ตัวเลือกไม่ตรงกับเฉลย กลับไปบันทึกโครงข้อสอบก่อน
            </Notice>
          )}
          {validation.errors.map((message) => (
            <Notice key={message} tone="error">
              {message}
            </Notice>
          ))}
          <details className="print-instructions">
            <summary>ตั้งค่าเครื่องพิมพ์</summary>
            <p>A4 แนวนอน · ขนาดจริง 100%</p>
            <p>1 หน้า PDF ต่อแผ่น · ปิด “ปรับพอดีหน้า”</p>
          </details>
        </aside>
      </div>
      <footer className="workspace-actionbar">
        <span>
          {printCount} ใบ · {Math.ceil(printCount / g.sheetsPerPage)} แผ่น
        </span>
        <button
          className="btn btn-primary"
          disabled={
            structureChanged ||
            validation.errors.length > 0 ||
            busy ||
            (personalized && (rosterLoading || Boolean(rosterError))) ||
            readOnly ||
            !printCount ||
            printCount > 200 ||
            mode === "unconfigured"
          }
          onClick={() => void download()}
        >
          <Download size={17} />
          {busy ? "กำลังสร้าง PDF…" : "ดาวน์โหลด PDF"}
        </button>
      </footer>
    </div>
  );
}
