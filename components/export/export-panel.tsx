"use client";
import { useState } from "react";
import { Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { scoreRow } from "@/lib/grading/recalculate";
import { downloadScores } from "@/lib/export/export-excel";
import { downloadScoreReport } from "@/lib/export/report-template";
import { ExamPublication } from "@/components/integrations/exam-publication";
import {
  Badge,
  EmptyState,
  Notice,
  PageHeading,
} from "@/components/ui/primitives";
type Format = "csv" | "xlsx" | "pdf";
export function Results({ initialExamId }: { initialExamId?: string } = {}) {
  const {
    reviews,
    exams,
    getExamVersion,
    mode,
    notify,
    request,
    readOnly,
    isCurrentWorkspace,
  } = useWorkspace();
  const [examId, setExamId] = useState(initialExamId ?? ""),
    [onlyVerified, setOnlyVerified] = useState(true),
    [format, setFormat] = useState<Format>("xlsx"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [page, setPage] = useState(0);
  const selected = exams.find((e) => e.id === examId) ?? exams[0];
  const items = reviews
    .filter(
      (r) =>
        r.examId === selected?.id &&
        r.status !== "voided" &&
        (!onlyVerified || r.status === "verified") &&
        getExamVersion(r.examId, r.examVersion),
    )
    .sort((a, b) => a.studentCode.localeCompare(b.studentCode));
  const rows: Record<string, string | number>[] = items.map((item) => ({
    ...scoreRow(item, getExamVersion(item.examId, item.examVersion)!),
    สถานะ: item.status === "verified" ? "ยืนยันแล้ว" : "รอตรวจสอบ",
  }));
  const pages = Math.max(1, Math.ceil(rows.length / 20)),
    current = Math.min(page, pages - 1),
    start = current * 20;
  async function download(individualId?: string) {
    if (!selected || readOnly) return;
    setBusy(true);
    setError("");
    try {
      const actualFormat = individualId ? "pdf" : format;
      let exportRows: Record<string, string | number>[];
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
        exportRows = items
          .filter(
            (r) =>
              r.status === "verified" &&
              (!individualId || r.id === individualId),
          )
          .map((r) => scoreRow(r, getExamVersion(r.examId, r.examVersion)!));
      else throw new Error("ยังไม่ได้เชื่อมต่อระบบ");
      if (!isCurrentWorkspace()) return;
      if (actualFormat === "pdf")
        await downloadScoreReport(
          exportRows,
          selected.title,
          Boolean(individualId),
        );
      else downloadScores(exportRows, actualFormat);
      notify("ส่งออกคะแนนที่ยืนยันแล้วเรียบร้อย");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งออกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="task-workspace results-task">
      <PageHeading title="ผลสอบและรายงาน" />
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
      {error && <Notice tone="error">{error}</Notice>}
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
              {rows.slice(start, start + 20).map((row, i) => (
                <tr key={items[start + i].id}>
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
                      onClick={() => void download(items[start + i].id)}
                    >
                      <FileText size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <EmptyState
              title="ยังไม่มีคะแนนในรายการนี้"
              description="ตรวจและยืนยันผลในศูนย์ตรวจสอบก่อนส่งออก"
            />
          )}
        </div>
        <div className="table-pagination">
          <span>
            {rows.length} รายการ · หน้า {current + 1} / {pages}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="หน้าก่อนหน้า"
              disabled={!current}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              className="icon-button"
              aria-label="หน้าถัดไป"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </section>
      <footer className="workspace-actionbar">
        {selected && (
          <ExamPublication
            key={selected.id}
            examId={selected.id}
            title={selected.title}
          />
        )}
        <label>
          <span className="sr-only">รูปแบบรายงาน</span>
          <select
            aria-label="รูปแบบรายงาน"
            value={format}
            onChange={(e) => setFormat(e.target.value as Format)}
          >
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV</option>
            <option value="pdf">PDF ทั้งห้อง</option>
          </select>
        </label>
        <button
          className="btn btn-primary"
          disabled={
            busy || readOnly || !items.some((r) => r.status === "verified")
          }
          onClick={() => void download()}
        >
          <Download size={17} />
          {busy ? "กำลังส่งออก…" : "ส่งออกคะแนน"}
        </button>
      </footer>
    </div>
  );
}
