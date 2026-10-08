"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { UploadCloud, ArrowRight, Download, Check } from "lucide-react";
import {
  columnAliases,
  inferMapping,
  previewStudents,
  type ColumnMapping,
} from "@/lib/import/parse-students";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Notice, PageHeading, Badge } from "@/components/ui/primitives";
export function ImportStudents() {
  const { mode, students, setStudents, notify } = useWorkspace();
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(inferMapping([]));
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = previewStudents(rows, mapping);
  const invalid = preview.filter((r) => r.errors.length);
  const existingConflict = preview.some((r) =>
    students.some((s) => s.student_code === r.data.student_code),
  );
  async function read(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!/\.(xlsx|csv)$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      setError("ใช้ XLSX / CSV ขนาดไม่เกิน 5 MB");
      return;
    }
    try {
      const book = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellText: true,
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
    }
  }
  async function commit() {
    if (invalid.length || existingConflict || !preview.length) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "connected") {
        const response = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            students: preview.map((r) => r.data),
            filename,
          }),
        });
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
        description="จับคู่คอลัมน์และตรวจทุกแถว ก่อนบันทึกเข้าสู่ห้องเรียน"
      />
      {error && <Notice tone="error">{error}</Notice>}
      <section className="panel import-panel">
        <label className="file-drop">
          <UploadCloud size={34} />
          <strong>{filename || "เลือกไฟล์รายชื่อนักเรียน"}</strong>
          <span>XLSX / CSV · UTF-8 · ไม่เกิน 5 MB</span>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => read(e.target.files?.[0])}
          />
        </label>
        <Notice>
          รหัสต้องมี 5 หลัก และเก็บเป็นข้อความ เช่น 04217
          ระบบไม่เติมศูนย์ให้รหัสที่สั้นเอง
        </Notice>
        <button
          className="btn btn-ghost"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  "\uFEFFรหัสนักเรียน,ชื่อ,สกุล,ชั้น,เลขที่\n04217,ณัฐภัทร,ตัวอย่าง,ม.3/1,1\n",
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
            <div className="mapping-grid">
              {Object.keys(columnAliases).map((key) => (
                <label key={key}>
                  {
                    (
                      {
                        student_code: "รหัสนักเรียน",
                        first_name: "ชื่อ",
                        last_name: "สกุล",
                        full_name: "ชื่อ-สกุลรวม (ถ้ามี)",
                        classroom_name: "ชั้น / ห้อง",
                        number: "เลขที่",
                      } as Record<string, string>
                    )[key]
                  }
                  <select
                    value={mapping[key as keyof ColumnMapping]}
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
            <div className="section-title">
              <h2>ตัวอย่างข้อมูล</h2>
              <Badge tone={invalid.length ? "red" : "green"}>
                {preview.length} แถว · ผิด {invalid.length} แถว
              </Badge>
            </div>
            {existingConflict && (
              <Notice tone="error">
                มีรหัสซ้ำกับรายชื่อที่มีอยู่ กรุณาแก้ไขไฟล์ก่อนนำเข้า
              </Notice>
            )}
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>แถว</th>
                    <th>รหัส</th>
                    <th>ชื่อ-สกุล</th>
                    <th>ห้อง</th>
                    <th>ผลตรวจ</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 100).map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      <td>{r.data.student_code}</td>
                      <td>
                        {r.data.first_name} {r.data.last_name}
                      </td>
                      <td>{r.data.classroom_name}</td>
                      <td>
                        {r.errors.length ? (
                          <span className="error-text">
                            {r.errors.join(" · ")}
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
              แสดงสูงสุด 100 แถว · การตรวจและบันทึกใช้ทุกแถวในไฟล์
            </p>
            <div className="dialog-actions">
              <button
                className="btn btn-primary"
                disabled={invalid.length > 0 || existingConflict || busy}
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
