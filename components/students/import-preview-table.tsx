"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { UploadCloud, ArrowRight, Download, Check } from "lucide-react";
import {
  inferMapping,
  previewStudents,
  type ColumnMapping,
} from "@/lib/import/parse-students";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Notice, PageHeading, Badge } from "@/components/ui/primitives";
import { useRosterCommands } from "./use-roster";
import type { RosterPlan } from "@/types/roster";
export function ImportStudents({ directoryId }: { directoryId?: string } = {}) {
  const { mode, notify, readOnly } = useWorkspace();
  const command = useRosterCommands();
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(inferMapping([]));
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [plan, setPlan] = useState<RosterPlan | null>(null);
  const [resultFilter, setResultFilter] = useState("all");
  const preview = useMemo(
    () => previewStudents(rows, mapping),
    [rows, mapping],
  );
  const invalid = preview.filter((r) => r.errors.length);
  const managed = plan?.rows.some((r) => r.status === "managed") ?? false;
  const labels = {
    add: "เพิ่มใหม่",
    update: "อัปเดต",
    unchanged: "ไม่เปลี่ยน",
    restore: "คืนรายชื่อ",
    managed: "ข้อมูลกลางควบคุม",
  };
  const display = preview
    .map((row, index) => ({ ...row, change: plan?.rows[index] }))
    .filter((r) => resultFilter === "all" || r.change?.status === resultFilter);
  function remap(value: ColumnMapping) {
    setMapping(value);
    setPlan(null);
    setResultFilter("all");
    setPreviewPage(0);
  }
  async function read(file: File | undefined) {
    if (!file) return;
    setRows([]);
    setHeaders([]);
    setFilename("");
    setPreviewPage(0);
    setError("");
    setPlan(null);
    setResultFilter("all");
    if (!/\.(xlsx|csv)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setError("ใช้ XLSX / CSV ขนาดไม่เกิน 5 MB");
      return;
    }
    setReading(true);
    try {
      const buffer = await file.arrayBuffer();
      const csv = /\.csv$/i.test(file.name);
      let input: string | ArrayBuffer = buffer;
      if (csv) {
        try {
          input = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
          throw new Error(
            "CSV ต้องเป็น UTF-8 กรุณาบันทึกไฟล์ด้วย UTF-8 แล้วลองใหม่",
          );
        }
      }
      const book = XLSX.read(input, {
        type: csv ? "string" : "array",
        cellText: true,
        raw: true, // CSV values stay strings; XLSX uses its formatted cell text.
        sheetRows: 2002,
      });
      const sheet = book.Sheets[book.SheetNames[0]];
      const data = XLSX.utils
        .sheet_to_json<Record<string, unknown>>(sheet, {
          raw: false,
          defval: "",
        })
        .filter((row) =>
          Object.values(row).some((value) => String(value ?? "").trim() !== ""),
        );
      if (data.length > 2000)
        throw new Error("นำเข้าได้ครั้งละไม่เกิน 2,000 แถว");
      if (!data.length)
        throw new Error("ไฟล์ไม่มีข้อมูล กรุณาตรวจหัวตารางและแถวข้อมูล");
      const keys = Object.keys(data[0]);
      setRows(data);
      setHeaders(keys);
      setMapping(inferMapping(keys));
      setFilename(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดไฟล์ไม่ได้");
    } finally {
      setReading(false);
    }
  }
  async function commit() {
    if (
      readOnly ||
      busy ||
      reading ||
      invalid.length ||
      managed ||
      !preview.length
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (!plan) {
        setPlan(
          await command<RosterPlan>({
            action: "preview_import",
            students: preview.map((r) => ({
              ...r.data,
              numberProvided: Boolean(mapping.number),
            })),
            filename,
            ...(directoryId ? { directoryId } : {}),
          }),
        );
        setResultFilter("all");
        setPreviewPage(0);
        return;
      }
      await command({
        action: "apply_plan",
        planId: plan.planId,
        directory: Boolean(directoryId),
        consent: true,
      });
      notify(
        mode === "demo"
          ? "นำเข้าในพื้นที่ทดลองแล้ว"
          : directoryId
            ? "อัปเดตทะเบียนโรงเรียนแล้ว"
            : "เพิ่มและอัปเดตรายชื่อแล้ว",
      );
      router.push("/students");
    } catch (e) {
      setError(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="task-workspace roster-import-workspace">
      <PageHeading
        title={directoryId ? "นำเข้าทะเบียนโรงเรียน" : "นำเข้ารายชื่อนักเรียน"}
        description="รหัสประจำตัว · ชื่อ · นามสกุล · ระดับชั้น"
      />
      {error && <Notice tone="error">{error}</Notice>}
      {directoryId && (
        <Notice tone="warning">
          ข้อมูลกลางจะอัปเดตให้ครูที่ติดตามห้องนี้ ข้อสอบและคะแนนเก่าไม่เปลี่ยน
        </Notice>
      )}
      {readOnly && (
        <Notice tone="warning">
          พื้นที่ของผู้ใช้อื่นเป็นแบบอ่านอย่างเดียว กลับพื้นที่ของคุณก่อนนำเข้า
        </Notice>
      )}
      <section className="panel import-panel">
        <details className="roster-import-setup" open={!plan}>
          <summary>ไฟล์และคอลัมน์{plan ? ` · ${filename}` : ""}</summary>
          <label className="file-drop">
            <UploadCloud size={34} />
            <strong>
              {reading
                ? "กำลังอ่านไฟล์…"
                : filename || "เลือกไฟล์รายชื่อนักเรียน"}
            </strong>
            <span>XLSX / CSV · UTF-8 · ไม่เกิน 5 MB</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              aria-label="เลือกไฟล์รายชื่อนักเรียน"
              disabled={busy || reading}
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <Notice>
            รหัส 5 หลัก เช่น 04217 · ชื่อพร้อมคำนำหน้า · ชั้น เช่น ม.1 หรือ
            ม.1/2
          </Notice>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [
                    "\uFEFFรหัสประจำตัว,ชื่อ,นามสกุล,ระดับชั้น\n04217,เด็กชายกิตติกร,ตัวอย่าง,ม.1\n02074,เด็กหญิงมณี,ตัวอย่าง,ม.1/2\n",
                  ],
                  { type: "text/csv;charset=utf-8" },
                ),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "ตัวอย่างนำเข้านักเรียน.csv";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download size={16} />
            ดาวน์โหลดตัวอย่าง CSV
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              void import("@/lib/import/student-files")
                .then(({ downloadStudentFile }) =>
                  downloadStudentFile([], "xlsx", true),
                )
                .catch(() => setError("ดาวน์โหลดแม่แบบไม่สำเร็จ กรุณาลองใหม่"));
            }}
          >
            <Download size={16} />
            ดาวน์โหลดแม่แบบ Excel
          </button>
          {rows.length > 0 && (
            <>
              <h2>จับคู่คอลัมน์</h2>
              <div className="mapping-grid roster-mapping">
                {(
                  [
                    "student_code",
                    "first_name",
                    "last_name",
                    "classroom_name",
                  ] as const
                ).map((key) => (
                  <label key={key}>
                    {
                      (
                        {
                          student_code: "รหัสประจำตัว",
                          first_name: "ชื่อ",
                          last_name: "นามสกุล",
                          full_name: "ชื่อ-สกุล",
                          classroom_name: "ระดับชั้น",
                          number: "เลขที่",
                        } as Record<string, string>
                      )[key]
                    }
                    <select
                      value={mapping[key]}
                      disabled={busy}
                      onChange={(e) =>
                        remap({ ...mapping, [key]: e.target.value })
                      }
                    >
                      <option value="">ไม่เลือก</option>
                      {headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <details
                className="legacy-mapping"
                open={Boolean(mapping.full_name)}
              >
                <summary>ไฟล์ชื่อ–สกุลรวม หรือมีเลขที่</summary>
                <p className="small muted">
                  ยังรองรับไฟล์ 3 คอลัมน์ที่ใช้ชื่อ-สกุลรวม หากเลือกทั้งสองแบบ
                  ระบบใช้ชื่อ-สกุลรวมก่อน เลขที่เว้นว่างได้
                </p>
                <div className="mapping-grid">
                  {(["full_name", "number"] as const).map((key) => (
                    <label key={key}>
                      {
                        {
                          full_name: "ชื่อ-สกุล (รวมคอลัมน์)",
                          number: "เลขที่ (ไม่บังคับ)",
                        }[key]
                      }
                      <select
                        value={mapping[key]}
                        disabled={busy}
                        onChange={(e) =>
                          remap({ ...mapping, [key]: e.target.value })
                        }
                      >
                        <option value="">ไม่เลือก</option>
                        {headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </details>
            </>
          )}
        </details>
        {rows.length > 0 && (
          <>
            <div className="section-title">
              <h2>ตัวอย่างข้อมูล</h2>
              <Badge tone={invalid.length ? "red" : "green"}>
                {preview.length} แถว · ผิด {invalid.length} แถว
              </Badge>
            </div>
            {plan && (
              <div className="roster-import-results">
                <label>
                  ผลตรวจ
                  <select
                    value={resultFilter}
                    onChange={(e) => {
                      setResultFilter(e.target.value);
                      setPreviewPage(0);
                    }}
                  >
                    <option value="all">ทั้งหมด {plan.rows.length} คน</option>
                    {Object.entries(labels).map(([key, text]) => (
                      <option key={key} value={key}>
                        {text}{" "}
                        {plan.rows.filter((r) => r.status === key).length} คน
                      </option>
                    ))}
                  </select>
                </label>
                <Notice>
                  รหัสเดิมอัปเดตคนเดิม รายชื่อที่ไม่อยู่ในไฟล์จะไม่ถูกลบ
                </Notice>
              </div>
            )}
            {managed && (
              <Notice tone="warning">
                มีรายชื่อที่ทะเบียนกลางควบคุม กรุณาแก้ที่ทะเบียนกลาง
                หรือแยกรายชื่อมาจัดการเองก่อนนำเข้า
              </Notice>
            )}
            <div
              className="table-scroll"
              role="region"
              aria-label="ตารางตรวจข้อมูลนำเข้า เลื่อนดูได้"
              tabIndex={0}
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th>แถว</th>
                    <th>รหัสประจำตัว</th>
                    <th>ชื่อ</th>
                    <th>นามสกุล</th>
                    <th>ระดับชั้น</th>
                    <th>ผลตรวจ</th>
                  </tr>
                </thead>
                <tbody>
                  {display
                    .slice(previewPage * 100, (previewPage + 1) * 100)
                    .map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td>{r.data.student_code}</td>
                        <td>
                          {r.data.prefix}
                          {r.data.first_name}
                        </td>
                        <td>{r.data.last_name}</td>
                        <td>{r.data.classroom_name}</td>
                        <td>
                          {r.errors.length ? (
                            <span className="error-text">
                              {[...r.errors].join(" · ")}
                            </span>
                          ) : r.change ? (
                            <div>
                              <Badge
                                tone={
                                  r.change.status === "managed"
                                    ? "amber"
                                    : r.change.status === "unchanged"
                                      ? "neutral"
                                      : "blue"
                                }
                              >
                                {labels[r.change.status]}
                              </Badge>
                              {r.change.before &&
                                r.change.status !== "unchanged" && (
                                  <details className="roster-diff">
                                    <summary>ดูการเปลี่ยนแปลง</summary>
                                    <p>
                                      เดิม: {r.change.before.prefix}
                                      {r.change.before.first_name}{" "}
                                      {r.change.before.last_name} ·{" "}
                                      {r.change.before.classroom_name} · เลขที่{" "}
                                      {r.change.before.number ?? "—"}
                                    </p>
                                    <p>
                                      ใหม่: {r.change.after.prefix}
                                      {r.change.after.first_name}{" "}
                                      {r.change.after.last_name} ·{" "}
                                      {r.change.after.classroom_name} · เลขที่{" "}
                                      {r.change.after.number ?? "—"}
                                    </p>
                                  </details>
                                )}
                            </div>
                          ) : (
                            <span className="success-text">
                              <Check size={15} />
                              ถูกต้อง
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">
              แสดงแถว {previewPage * 100 + 1}–
              {Math.min((previewPage + 1) * 100, display.length)} จาก{" "}
              {display.length} · บันทึกตามรายการที่ตรวจทั้งหมด
            </p>
            {display.length > 100 && (
              <div className="roster-pagination">
                <button
                  className="btn btn-secondary"
                  disabled={previewPage === 0}
                  onClick={() => setPreviewPage(previewPage - 1)}
                >
                  ก่อนหน้า
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={(previewPage + 1) * 100 >= display.length}
                  onClick={() => setPreviewPage(previewPage + 1)}
                >
                  ถัดไป
                </button>
              </div>
            )}
            <div className="dialog-actions">
              <button
                className="btn btn-primary"
                disabled={
                  readOnly || invalid.length > 0 || managed || busy || reading
                }
                onClick={commit}
              >
                {busy
                  ? "กำลังตรวจและบันทึก…"
                  : plan
                    ? `ยืนยันบันทึก ${preview.length} รายชื่อ`
                    : `ตรวจ ${preview.length} รายชื่อ`}
                <ArrowRight size={16} />
              </button>
              {plan && (
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setPlan(null);
                    setError("");
                  }}
                >
                  ตรวจใหม่
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
