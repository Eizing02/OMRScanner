"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  Printer,
  Download,
  ArrowLeft,
  CheckCircle2,
  FileJson,
  ShieldCheck,
} from "lucide-react";
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
import type { PrintStudent } from "@/types/print";
import {
  PageHeading,
  Notice,
  Badge,
  EmptyState,
} from "@/components/ui/primitives";
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
  } = useWorkspace();
  const exam = exams.find((e) => e.id === examId);
  const [count, setCount] = useState(2);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [personalized, setPersonalized] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [previewId, setPreviewId] = useState("");
  const registrationKey = useRef({ key: "", id: "" });
  if (!exam)
    return (
      <EmptyState title="ไม่พบชุดสอบ" description="กลับไปเลือกชุดสอบในคลัง">
        <Link href="/exams" className="btn btn-primary">
          เปิดคลังชุดสอบ
        </Link>
      </EmptyState>
    );
  const roster: PrintStudent[] = students
    .filter((student) => student.classroom_name === exam.classroom)
    .sort((a, b) => a.student_code.localeCompare(b.student_code))
    .map((student) => ({
      id: student.id,
      student_code: student.student_code,
      full_name: studentFullName(student),
      classroom_name: student.classroom_name,
      number: student.number,
    }));
  const selected = roster.filter(
    (student) => selectedIds === null || selectedIds.includes(student.id),
  );
  const layout = resolvePrintLayout(
    getLayout(exam),
    personalized ? selected : [],
  );
  const printCount = personalized ? selected.length : count;
  const previewStudent = personalized
    ? (selected.find((s) => s.id === previewId) ?? selected[0])
    : undefined;
  const g = resolveGeometry(layout);
  const validation = validateLayout(layout);
  validation.errors.push(
    ...printStudentErrors(layout, personalized ? selected : []),
  );
  const structureChanged =
    layout.questionCount !== exam.questionCount ||
    layout.choiceCount !== exam.choiceCount;
  async function download(manifestOnly = false) {
    setBusy(true);
    setError("");
    try {
      if (readOnly)
        throw new Error(
          "การดูงานผู้ใช้อื่นเป็นแบบอ่านอย่างเดียว กลับพื้นที่ของคุณก่อนสร้างชุดพิมพ์",
        );
      if (structureChanged)
        throw new Error("บันทึกโครงข้อสอบให้ตรงกับเฉลยก่อนพิมพ์");
      if (!printCount || printCount > 200)
        throw new Error("เลือกนักเรียนหรือจำนวนใบสำรอง 1–200 ใบต่อชุดพิมพ์");
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
        throw new Error(
          "บัญชีหรือพื้นที่ทำงานเปลี่ยนแล้ว กรุณาสร้างไฟล์จากพื้นที่ปัจจุบัน",
        );
      if (!manifestOnly) result.pdf.save("กระดาษคำตอบ-ทดสอบ-A4.pdf");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.manifest, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "print-manifest.experimental.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(
        registered
          ? "ลงทะเบียนชุดพิมพ์และสร้างไฟล์แล้ว · QR เดียวกันทั้งชุด · ต้องสอบเทียบสแกนจริง"
          : "สร้างไฟล์ทดลองในเบราว์เซอร์แล้ว · ยังไม่ลงทะเบียนกับฐานข้อมูล",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="ดูตัวอย่างก่อนพิมพ์"
        description="ตรวจหน้ากระดาษจริงและคำแนะนำการพิมพ์ก่อนสร้างไฟล์"
        actions={
          <Link
            className="btn btn-secondary"
            href={`/exams/${examId}/omr-generate`}
          >
            <ArrowLeft size={16} />
            กลับไปออกแบบ
          </Link>
        }
      />
      <div className="print-workspace">
        <section className="print-canvas">
          <div className="preview-top">
            <span>
              <Printer size={18} />
              A4 แนวนอน · 297 × 210 มม.
            </span>
            <Badge>{g.sheetsPerPage} ใบต่อ A4</Badge>
          </div>
          <div
            className={`print-paper ${g.sheetsPerPage === 2 ? "single-half-sheet" : ""}`}
          >
            <SheetPreview layout={layout} single student={previewStudent} />
          </div>
          <p className="muted small text-center">
            แสดงตัวอย่าง 1 ใบ · PDF จัด {g.sheetsPerPage} ใบต่อ A4 ให้แล้ว · QR
            เหมือนกันทั้งชุดและเวอร์ชัน
          </p>
        </section>
        <aside className="panel print-settings">
          <h2>เลือกรายชื่อสำหรับพิมพ์</h2>
          <label>
            รูปแบบกระดาษคำตอบ
            <select
              value={personalized ? "roster" : "blank"}
              disabled={busy}
              onChange={(e) => setPersonalized(e.target.value === "roster")}
            >
              <option value="roster">รายบุคคล · {exam.classroom}</option>
              <option value="blank">ใบสำรองเปล่า · กรอกข้อมูลเอง</option>
            </select>
          </label>
          {personalized ? (
            <>
              {!roster.length ? (
                <Notice>
                  ยังไม่มีนักเรียนชั้น {exam.classroom} ในรายชื่อของคุณ{" "}
                  <Link className="text-link" href="/students/import">
                    นำเข้ารายชื่อก่อนพิมพ์
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
                      {selected.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.student_code} · {student.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <details>
                    <summary>
                      เลือกนักเรียน · {selected.length} / {roster.length} คน
                    </summary>
                    <button
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => setSelectedIds(null)}
                    >
                      เลือกทั้งหมด
                    </button>
                    <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                      {roster.map((student) => (
                        <label className="checkbox-label" key={student.id}>
                          <input
                            type="checkbox"
                            checked={
                              selectedIds === null ||
                              selectedIds.includes(student.id)
                            }
                            disabled={busy}
                            onChange={(e) =>
                              setSelectedIds((current) => {
                                const ids = current ?? roster.map((s) => s.id);
                                return e.target.checked
                                  ? [
                                      ...ids.filter((id) => id !== student.id),
                                      student.id,
                                    ]
                                  : ids.filter((id) => id !== student.id);
                              })
                            }
                          />
                          <span>
                            {student.student_code} · {student.full_name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                  <p className="small muted">
                    พิมพ์ชื่อ ชั้น และฝนรหัส 5 หลักให้แล้ว
                    นักเรียนตรวจชื่อของตนเองและฝนคำตอบเท่านั้น
                  </p>
                </>
              )}
            </>
          ) : (
            <label>
              จำนวนกระดาษคำตอบ
              <input
                type="number"
                min={1}
                max={200}
                value={count}
                disabled={busy}
                onChange={(e) => {
                  setCount(
                    Math.max(
                      1,
                      Math.min(200, Math.trunc(Number(e.target.value) || 1)),
                    ),
                  );
                }}
              />
            </label>
          )}
          <div className="print-stat">
            <span>จำนวนหน้า A4</span>
            <strong>{Math.ceil(printCount / g.sheetsPerPage)} แผ่น</strong>
          </div>
          <div className="print-stat">
            <span>รูปแบบ</span>
            <strong>{g.sheetsPerPage} ใบต่อ A4</strong>
          </div>
          <hr />
          {g.autoExpanded && (
            <Notice tone="warning">
              พื้นที่ครึ่ง A4 ไม่พอ จึงใช้ 1 ใบเต็ม A4 โดยไม่ย่อวงฝน
            </Notice>
          )}
          {g.sheetsPerPage === 2 && printCount % 2 === 1 && (
            <Notice>แผ่นสุดท้ายมี 1 ใบ อีกครึ่งเว้นว่าง</Notice>
          )}
          {structureChanged && (
            <Notice tone="error">
              จำนวนข้อ/ตัวเลือกไม่ตรงกับเฉลย กลับไปออกแบบและบันทึกโครงข้อสอบก่อน
            </Notice>
          )}
          <h3>
            <ShieldCheck size={17} />
            ตรวจความพร้อม
          </h3>
          {validation.checks.map((c) => (
            <p className="check-line" key={c}>
              <CheckCircle2 size={15} />
              {c}
            </p>
          ))}
          {validation.errors.map((c) => (
            <Notice key={c} tone="error">
              {c}
            </Notice>
          ))}
          <Notice tone="warning">
            {mode === "connected"
              ? "ชุดพิมพ์จะลงทะเบียนแม่แบบและรายชื่อในฐานข้อมูลก่อนดาวน์โหลด ยังต้องสอบเทียบการตรวจอ่านจากกระดาษจริง"
              : "พื้นที่ทดลอง: ไฟล์นี้ยังไม่ผูกกับฐานข้อมูลหรือผลคะแนนจริง"}
          </Notice>
          {readOnly && (
            <Notice>
              กำลังเปิดดูงานผู้อื่นแบบอ่านอย่างเดียว ไม่สามารถสร้างชุดพิมพ์ได้
            </Notice>
          )}
          <div className="print-instructions">
            <strong>ตั้งค่าเครื่องพิมพ์</strong>
            <p>
              ขนาดจริง <b>100%</b> · A4 · แนวนอน
            </p>
            <p>ปิด “ปรับพอดีหน้า” และ “ย่อให้พอดี”</p>
            <p>เลือก 1 หน้า PDF ต่อแผ่น ห้ามตั้ง 2 หน้าต่อแผ่นซ้ำ</p>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span>
              เข้าใจว่าแม่แบบนี้ยังต้องทดสอบกับเครื่องพิมพ์และโทรศัพท์จริง
            </span>
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <button
            className="btn btn-primary full-width"
            disabled={
              !checked ||
              structureChanged ||
              validation.errors.length > 0 ||
              busy ||
              readOnly ||
              !printCount ||
              printCount > 200
            }
            onClick={() => download()}
          >
            <Download size={17} />
            {busy ? "กำลังสร้างไฟล์…" : "ดาวน์โหลด PDF ทดสอบ"}
          </button>
          <button
            className="btn btn-ghost full-width"
            disabled={
              !checked ||
              structureChanged ||
              validation.errors.length > 0 ||
              busy ||
              readOnly ||
              !printCount ||
              printCount > 200
            }
            onClick={() => download(true)}
          >
            <FileJson size={16} />
            ดาวน์โหลดข้อมูลแม่แบบทดสอบ
          </button>
        </aside>
      </div>
    </>
  );
}
