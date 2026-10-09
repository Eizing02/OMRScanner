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
export function ImportStudents() {
  const { mode, students, setStudents, notify, request, readOnly } =
    useWorkspace();
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(inferMapping([]));
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const preview = useMemo(
    () => previewStudents(rows, mapping),
    [rows, mapping],
  );
  const invalid = preview.filter((r) => r.errors.length);
  const existingCodes = new Set(students.map((s) => s.student_code));
  const conflicts = preview.filter((r) =>
    existingCodes.has(r.data.student_code),
  );
  const existingConflict = conflicts.length > 0;
  async function read(file: File | undefined) {
    if (!file) return;
    setRows([]);
    setHeaders([]);
    setFilename("");
    setPreviewPage(0);
    setError("");
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
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        raw: false,
        defval: "",
      });
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
      existingConflict ||
      !preview.length
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (mode === "connected") {
        const response = await request(
          "/api/students",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              students: preview.map((r) => r.data),
              filename,
            }),
          },
          true,
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.messageTh ?? "นำเข้าไม่สำเร็จ");
        setStudents([...students, ...body.data]);
      } else if (mode === "demo")
        setStudents([
          ...students,
          ...preview.map((r) => ({
            ...r.data,
            id: `demo-${crypto.randomUUID()}`,
          })),
        ]);
      else throw new Error("ตั้งค่า Supabase ก่อนนำเข้ารายชื่อ");
      notify(
        mode === "demo"
          ? "นำเข้าในพื้นที่ทดลองแล้ว"
          : "นำเข้ารายชื่อบนระบบแล้ว",
      );
      router.push("/students");
    } catch (e) {
      setError(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="นำเข้ารายชื่อนักเรียน"
        description="ใช้ 4 คอลัมน์: รหัสประจำตัว · ชื่อ · นามสกุล · ระดับชั้น แล้วตรวจข้อมูลก่อนบันทึก"
      />
      {error && <Notice tone="error">{error}</Notice>}
      {readOnly && (
        <Notice tone="warning">
          พื้นที่ของผู้ใช้อื่นเป็นแบบอ่านอย่างเดียว กลับพื้นที่ของคุณก่อนนำเข้า
        </Notice>
      )}
      <section className="panel import-panel">
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
          รหัสต้องมี 5 หลัก และเก็บเป็นข้อความ เช่น 04217
          ระบบไม่เติมศูนย์ให้รหัสที่สั้นเอง
          <br />
          ใส่คำนำหน้าในช่องชื่อ เช่น เด็กชายกิตติกร · ระดับชั้น ม.1–ม.6 เช่น ม.1
          หรือ ม.1/2 · ไม่จำเป็นต้องมีเลขที่
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
                      setMapping({ ...mapping, [key]: e.target.value })
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
                        setMapping({ ...mapping, [key]: e.target.value })
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
            <div className="section-title">
              <h2>ตัวอย่างข้อมูล</h2>
              <Badge tone={invalid.length ? "red" : "green"}>
                {preview.length} แถว · ผิด {invalid.length} แถว
              </Badge>
            </div>
            {existingConflict && (
              <Notice tone="error">
                มีรหัสซ้ำกับรายชื่อที่มีอยู่ {conflicts.length} แถว:{" "}
                {conflicts
                  .slice(0, 10)
                  .map((r) => r.data.student_code)
                  .join(", ")}{" "}
                กรุณาแก้ไขไฟล์ ระบบจะไม่เขียนทับรายชื่อเดิม
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
                  {preview
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
                          {r.errors.length ||
                          existingCodes.has(r.data.student_code) ? (
                            <span className="error-text">
                              {[
                                ...r.errors,
                                ...(existingCodes.has(r.data.student_code)
                                  ? ["รหัสมีอยู่ในระบบแล้ว"]
                                  : []),
                              ].join(" · ")}
                            </span>
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
              {Math.min((previewPage + 1) * 100, preview.length)} จาก{" "}
              {preview.length} · ตรวจและบันทึกทุกแถว
            </p>
            {preview.length > 100 && (
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
                  disabled={(previewPage + 1) * 100 >= preview.length}
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
                  readOnly ||
                  invalid.length > 0 ||
                  existingConflict ||
                  busy ||
                  reading
                }
                onClick={commit}
              >
                {busy ? "กำลังนำเข้า…" : `นำเข้า ${preview.length} รายชื่อ`}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </section>
    </>
  );
}
