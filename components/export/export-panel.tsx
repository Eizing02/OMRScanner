"use client";
import { useRef, useState } from "react";
import {
  Check,
  Download,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { scoreRow } from "@/lib/grading/recalculate";
import {
  scoreExportFormats,
  type ScoreExportFormat,
  type ScoreExportRow,
  type ScoreReportDetails,
} from "@/types/export";
import { ExamPublication } from "@/components/integrations/exam-publication";
import { useReviewPage } from "@/components/review/use-review-data";
import {
  Badge,
  EmptyState,
  Modal,
  Notice,
  PageHeading,
} from "@/components/ui/primitives";
const formatLabels: Record<ScoreExportFormat, string> = {
  xlsx: "Excel",
  pdf: "PDF",
  csv: "CSV",
  docx: "Word",
};
export function Results({ initialExamId }: { initialExamId?: string } = {}) {
  const {
    reviews,
    exams,
    getExamVersion,
    mode,
    notify,
    branding,
    request,
    readOnly,
    isCurrentWorkspace,
  } = useWorkspace();
  const [examId, setExamId] = useState(initialExamId ?? ""),
    [onlyVerified, setOnlyVerified] = useState(true),
    [format, setFormat] = useState<ScoreExportFormat>("xlsx"),
    [exportOpen, setExportOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(0);
  const exportTrigger = useRef<HTMLButtonElement>(null);
  const selected = exams.find((e) => e.id === examId) ?? exams[0];
  const remote = useReviewPage({
    view: "results",
    examId: selected?.id,
    status: onlyVerified ? "verified" : "all",
    page,
    limit: 20,
  });
  const demoItems = reviews
    .filter(
      (r) =>
        r.examId === selected?.id &&
        r.status !== "voided" &&
        (!onlyVerified || r.status === "verified") &&
        getExamVersion(r.examId, r.examVersion),
    )
    .sort((a, b) => a.studentCode.localeCompare(b.studentCode));
  const items = mode === "connected" ? (remote.data?.items ?? []) : demoItems;
  const rows: ScoreExportRow[] =
    mode === "connected"
      ? items.map((item) => ({
          รหัสนักเรียน: item.studentCode,
          "ชื่อ-สกุล": item.name,
          "ชั้น/ห้อง": item.classroom,
          คะแนนที่ได้: "score" in item ? item.score : 0,
          คะแนนเต็ม: "maxScore" in item ? item.maxScore : 0,
          "ผ่าน/ไม่ผ่าน": "passed" in item && item.passed ? "ผ่าน" : "ไม่ผ่าน",
          สถานะ: item.status === "verified" ? "ยืนยันแล้ว" : "รอตรวจสอบ",
        }))
      : demoItems.map((item) => ({
          ...scoreRow(item, getExamVersion(item.examId, item.examVersion)!),
          สถานะ: item.status === "verified" ? "ยืนยันแล้ว" : "รอตรวจสอบ",
        }));
  const total = mode === "connected" ? (remote.data?.total ?? 0) : rows.length;
  const pages = Math.max(1, Math.ceil(total / 20)),
    current = Math.min(page, pages - 1),
    start = current * 20;
  const visibleRows =
    mode === "connected" ? rows : rows.slice(start, start + 20);
  const visibleItems =
    mode === "connected" ? items : items.slice(start, start + 20);
  const confirmedCount =
    mode === "connected"
      ? (remote.data?.counts.verified ?? 0)
      : items.filter((item) => item.status === "verified").length;
  const exportDisabled = busy || readOnly || remote.loading || !confirmedCount;

  async function download(
    actualFormat: ScoreExportFormat,
    individualId?: string,
  ) {
    if (!selected || readOnly || busy) return;
    setBusy(true);
    setError("");
    try {
      let exportRows: ScoreExportRow[];
      if (mode === "connected") {
        const response = await request(
          "/api/export",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              examId: selected.id,
              format: actualFormat,
              ...(individualId ? { scanIds: [individualId] } : {}),
            }),
          },
          true,
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.messageTh ?? "ส่งออกไม่สำเร็จ");
        exportRows = body.data.rows;
      } else if (mode === "demo")
        exportRows = demoItems
          .filter(
            (r) =>
              r.status === "verified" &&
              (!individualId || r.id === individualId),
          )
          .map((r) => scoreRow(r, getExamVersion(r.examId, r.examVersion)!));
      else throw new Error("ยังไม่ได้เชื่อมต่อระบบ");
      if (!isCurrentWorkspace()) return;
      const report: ScoreReportDetails = {
        school: branding.school,
        title: selected.title,
        subject: selected.subject,
        classroom: selected.classroom,
        term: selected.term,
        year: selected.year,
      };
      let file: Blob;
      let name = "ผลคะแนน";
      switch (actualFormat) {
        case "pdf": {
          const { buildScoreReportPdf } =
            await import("@/lib/export/report-template");
          file = await buildScoreReportPdf(
            exportRows,
            report,
            Boolean(individualId),
          );
          name = individualId ? "ผลคะแนนรายบุคคล" : "รายงานคะแนน";
          break;
        }
        case "docx": {
          const { buildScoreReportWord } =
            await import("@/lib/export/export-word");
          file = await buildScoreReportWord(exportRows, report);
          name = "รายงานคะแนน";
          break;
        }
        default: {
          const { buildScoreTable } = await import("@/lib/export/export-excel");
          file = buildScoreTable(exportRows, actualFormat);
        }
      }
      if (!isCurrentWorkspace()) return;
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name}.${actualFormat}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (!individualId) setExportOpen(false);
      notify("ส่งออกคะแนนที่ยืนยันแล้วเรียบร้อย");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="task-workspace results-task">
      <PageHeading
        title="ผลสอบและรายงาน"
        actions={
          selected && (
            <ExamPublication
              key={selected.id}
              examId={selected.id}
              title={selected.title}
            />
          )
        }
      />
      <div className="results-filters">
        <label>
          ชุดสอบ
          <select
            value={selected?.id ?? ""}
            onChange={(e) => {
              setExamId(e.target.value);
              setPage(0);
            }}
          >
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} · {e.classroom}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={onlyVerified}
            onChange={(e) => {
              setOnlyVerified(e.target.checked);
              setPage(0);
            }}
          />
          เฉพาะที่ยืนยันแล้ว
        </label>
      </div>
      {error && !exportOpen && <Notice tone="error">{error}</Notice>}
      {remote.error && <Notice tone="error">{remote.error}</Notice>}
      {remote.loading && <Notice>กำลังโหลดผลสอบ…</Notice>}
      <section className="panel scorebook">
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="ตารางผลสอบ"
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ชื่อ-สกุล</th>
                <th>ชั้น</th>
                <th>คะแนน</th>
                <th>ผล</th>
                <th>สถานะ</th>
                <th>
                  <span className="sr-only">รายงานรายบุคคล</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => (
                <tr key={visibleItems[i].id}>
                  <td>{row["รหัสนักเรียน"] || "รอตรวจ"}</td>
                  <td>{row["ชื่อ-สกุล"]}</td>
                  <td>{row["ชั้น/ห้อง"]}</td>
                  <td>
                    {row["คะแนนที่ได้"]} / {row["คะแนนเต็ม"]}
                  </td>
                  <td>{row["ผ่าน/ไม่ผ่าน"]}</td>
                  <td>
                    <Badge
                      tone={row.สถานะ === "ยืนยันแล้ว" ? "green" : "amber"}
                    >
                      {row.สถานะ}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`ดาวน์โหลดรายงาน ${row["รหัสนักเรียน"]}`}
                      disabled={row.สถานะ !== "ยืนยันแล้ว" || busy || readOnly}
                      onClick={() => void download("pdf", visibleItems[i].id)}
                    >
                      <FileText size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !remote.loading && !remote.error && (
            <EmptyState
              title="ยังไม่มีคะแนนในรายการนี้"
              description="ตรวจและยืนยันผลในศูนย์ตรวจสอบก่อนส่งออก"
            />
          )}
        </div>
        <div className="table-pagination">
          <span>
            {total} รายการ · หน้า {current + 1} / {pages}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="หน้าก่อนหน้า"
              disabled={!current || remote.loading}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="หน้าถัดไป"
              disabled={current >= pages - 1 || remote.loading}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      <footer className="workspace-actionbar">
        <button
          ref={exportTrigger}
          className="btn btn-primary"
          disabled={exportDisabled}
          onClick={() => {
            setError("");
            setExportOpen(true);
          }}
        >
          <Download size={17} />
          ส่งออกคะแนน
        </button>
      </footer>
      <Modal
        open={exportOpen && Boolean(selected)}
        onOpenChange={setExportOpen}
        returnFocusRef={exportTrigger}
        title="ส่งออกคะแนน"
        description={
          selected ? `${selected.title} · ${selected.classroom}` : undefined
        }
      >
        <form
          className="score-export-form"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            if (!exportDisabled) void download(format);
          }}
        >
          <p className="muted">
            ยืนยันแล้ว {confirmedCount} คน
          </p>
          <fieldset className="score-export-fieldset" disabled={busy}>
            <legend className="sr-only">รูปแบบไฟล์</legend>
            <div className="score-export-formats">
              {scoreExportFormats.map((kind) => (
                <label key={kind} className="score-export-format">
                  <input
                    className="sr-only"
                    type="radio"
                    name="score-export-format"
                    value={kind}
                    checked={format === kind}
                    onChange={() => setFormat(kind)}
                  />
                  <Check size={15} aria-hidden="true" />
                  {formatLabels[kind]}
                </label>
              ))}
            </div>
          </fieldset>
          {error && exportOpen && <Notice tone="error">{error}</Notice>}
          <div className="score-export-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={exportDisabled}
            >
              <Download size={17} aria-hidden="true" />
              {busy ? "กำลังดาวน์โหลด…" : "ดาวน์โหลด"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
