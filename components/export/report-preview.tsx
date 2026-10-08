"use client";
import { useState } from "react";
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
import { resolveGeometry, validateLayout } from "@/lib/omr/generate-template";
import { buildPrintPdf } from "@/lib/export/export-pdf";
import {
  PageHeading,
  Notice,
  Badge,
  EmptyState,
} from "@/components/ui/primitives";
export function PrintPreview({ examId }: { examId: string }) {
  const { exams, getLayout, notify } = useWorkspace();
  const exam = exams.find((e) => e.id === examId);
  const [count, setCount] = useState(2);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!exam)
    return (
      <EmptyState title="ไม่พบชุดสอบ" description="กลับไปเลือกชุดสอบในคลัง">
        <Link href="/exams" className="btn btn-primary">
          เปิดคลังชุดสอบ
        </Link>
      </EmptyState>
    );
  const layout = getLayout(exam);
  const g = resolveGeometry(layout);
  const validation = validateLayout(layout);
  const structureChanged =
    layout.questionCount !== exam.questionCount ||
    layout.choiceCount !== exam.choiceCount;
  async function download(manifestOnly = false) {
    setBusy(true);
    setError("");
    try {
      if (structureChanged)
        throw new Error("บันทึกโครงข้อสอบให้ตรงกับเฉลยก่อนพิมพ์");
      const result = await buildPrintPdf(layout, count);
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
      notify("สร้าง PDF และข้อมูลแม่แบบทดสอบแล้ว · QR เหมือนกันทั้งชุด");
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
            <SheetPreview layout={layout} single />
          </div>
          <p className="muted small text-center">
            แสดงตัวอย่าง 1 ใบ · PDF จัด {g.sheetsPerPage} ใบต่อ A4 ให้แล้ว · QR
            เหมือนกันทั้งชุดและเวอร์ชัน
          </p>
        </section>
        <aside className="panel print-settings">
          <h2>ตั้งค่าการพิมพ์ทดสอบ</h2>
          <label>
            จำนวนกระดาษคำตอบ
            <input
              type="number"
              min={1}
              max={200}
              value={count}
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
          <div className="print-stat">
            <span>จำนวนหน้า A4</span>
            <strong>{Math.ceil(count / g.sheetsPerPage)} แผ่น</strong>
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
          {g.sheetsPerPage === 2 && count % 2 === 1 && (
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
            ใช้พิมพ์ทดสอบเท่านั้น ยังไม่สร้างกระดาษสอบที่ผูกกับฐานข้อมูล
          </Notice>
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
              busy
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
              busy
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
