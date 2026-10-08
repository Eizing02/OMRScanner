"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  LockKeyhole,
  Type,
  ImagePlus,
  Grid2X2,
  ScanQrCode,
  CheckCircle2,
  ShieldCheck,
  SlidersHorizontal,
  Layers,
  Eye,
  LayoutTemplate,
  RotateCcw,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import {
  defaultLayout,
  layoutForExam,
  resolveGeometry,
  validateLayout,
  type SheetLayout,
} from "@/lib/omr/generate-template";
import { SheetPreview } from "./omr-sheet-preview";
import { Badge, Notice, EmptyState, Modal } from "@/components/ui/primitives";
import { resizeAnswerKey, examSchema } from "@/types/exam";
export function Designer({ examId }: { examId: string }) {
  const { exams, loading } = useWorkspace();
  if (loading) return <Notice>กำลังโหลดข้อมูลชุดสอบ…</Notice>;
  if (!exams.some((e) => e.id === examId))
    return (
      <EmptyState title="ไม่พบชุดสอบ" description="เปิดชุดสอบจากคลังก่อนออกแบบ">
        <Link href="/exams" className="btn btn-primary">
          เปิดคลังชุดสอบ
        </Link>
      </EmptyState>
    );
  return <DesignerEditor key={examId} examId={examId} />;
}
function DesignerEditor({ examId }: { examId: string }) {
  const { exams, getLayout, setLayout, updateExam, notify } = useWorkspace();
  const exam = exams.find((e) => e.id === examId);
  const [history, setHistory] = useState<SheetLayout[]>([
    exam ? getLayout(exam) : defaultLayout,
  ]);
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState("heading");
  const [zoom, setZoom] = useState(80);
  const [guides, setGuides] = useState(true);
  const [tab, setTab] = useState("elements");
  const [confirmStructure, setConfirmStructure] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const layout = history[index];
  const g = resolveGeometry(layout);
  const structureChanged = Boolean(
    exam &&
    (layout.questionCount !== exam.questionCount ||
      layout.choiceCount !== exam.choiceCount),
  );
  const validation = validateLayout(layout);
  if (!exam)
    return (
      <EmptyState
        title="เลือกชุดสอบก่อนออกแบบ"
        description="เปิดชุดสอบจากคลังเพื่อผูกแม่แบบกับข้อมูลที่ถูกต้อง"
      >
        <Link href="/exams" className="btn btn-primary">
          เปิดคลังชุดสอบ
        </Link>
      </EmptyState>
    );
  function update(patch: Partial<SheetLayout>) {
    const next = { ...layout, ...patch };
    setHistory([...history.slice(0, index + 1), next]);
    setIndex(index + 1);
    setLayout(next);
  }
  function go(nextIndex: number) {
    setIndex(nextIndex);
    setLayout(history[nextIndex]);
  }
  async function saveStructure() {
    if (!exam) return;
    setSaving(true);
    setSaveError("");
    try {
      const input = examSchema.parse({
        ...exam,
        questionCount: layout.questionCount,
        choiceCount: layout.choiceCount,
        answerKey: resizeAnswerKey(
          exam,
          layout.questionCount,
          layout.choiceCount,
        ),
      });
      const nextExam = await updateExam(exam, input);
      const nextLayout = layoutForExam(
        {
          ...layout,
          totalScore: input.answerKey.reduce((sum, a) => sum + a.points, 0),
        },
        nextExam,
      );
      setHistory([nextLayout]);
      setIndex(0);
      setLayout(nextLayout);
      setConfirmStructure(false);
      notify("บันทึกเป็นเวอร์ชันใหม่แล้ว กรุณาตรวจเฉลยก่อนพิมพ์");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }
  async function logo(file: File | undefined) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      notify("ใช้ไฟล์ PNG หรือ JPG ขนาดไม่เกิน 2 MB");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 600 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(image, 0, 0, canvas.width, canvas.height);
      update({ logo: canvas.toDataURL("image/png") });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      notify("เปิดภาพไม่ได้ กรุณาเลือกไฟล์ใหม่");
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }
  return (
    <>
      <div className="designer-heading">
        <div>
          <Link href="/exams" className="text-link">
            คลังชุดสอบ
          </Link>
          <h1>{exam.title}</h1>
          <span className="muted small">
            ออกแบบกระดาษคำตอบ · แบบร่างในเครื่อง
          </span>
        </div>
        <div className="heading-actions">
          <Badge tone="blue">ข้อสอบรุ่น {exam.version} · แม่แบบทดลอง</Badge>
          <Link
            href={`/exams/${examId}/print`}
            className="btn btn-primary"
            onClick={() => setLayout(layout)}
          >
            ดูตัวอย่างก่อนพิมพ์
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
      <p className="small muted">
        เฉลย {exam.questionCount} ข้อ / {exam.choiceCount} ตัวเลือก ·{" "}
        <Link className="text-link" href={`/exams/${examId}/answer-key`}>
          ตรวจหรือแก้เฉลย
        </Link>
      </p>
      <div className="mobile-designer-notice">
        <Notice>
          บนมือถือปรับจำนวนข้อและตัวเลือกได้
          ใช้คอมพิวเตอร์เพื่อแก้หัวกระดาษและโลโก้
        </Notice>
      </div>
      <div className="designer-workspace">
        <aside className="designer-tools">
          <div className="tool-tabs">
            <button
              className={tab === "elements" ? "active" : ""}
              onClick={() => setTab("elements")}
            >
              <Layers size={18} />
              องค์ประกอบ
            </button>
            <button
              className={tab === "templates" ? "active" : ""}
              onClick={() => setTab("templates")}
            >
              <LayoutTemplate size={18} />
              แม่แบบ
            </button>
          </div>
          {tab === "templates" ? (
            <div className="template-option">
              <Grid2X2 size={30} />
              <strong>จัดกระดาษอัตโนมัติ</strong>
              <span>A4 แนวนอน · สูงสุด 60 ข้อ</span>
              <Badge tone="blue">รุ่นอ้างอิง</Badge>
              <p className="small muted">
                เริ่มจาก 2 ใบซ้าย–ขวา และขยายเป็น 1 ใบเต็ม A4 เมื่อพื้นที่ไม่พอ
              </p>
            </div>
          ) : (
            <>
              <div className="tool-section">
                <h2>ข้อมูลบนกระดาษ</h2>
                {[
                  { id: "heading", icon: Type, label: "โรงเรียนและหัวข้อสอบ" },
                  { id: "logo", icon: ImagePlus, label: "โลโก้โรงเรียน" },
                  { id: "fields", icon: Type, label: "ช่องข้อมูลนักเรียน" },
                  { id: "notes", icon: Type, label: "คำชี้แจง" },
                ].map((item) => (
                  <button
                    key={item.id}
                    className={`element-button ${selection === item.id ? "active" : ""}`}
                    onClick={() => setSelection(item.id)}
                  >
                    <item.icon size={18} />
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="tool-section">
                <h2>พื้นที่สำหรับสแกน</h2>
                {[
                  { id: "answers", icon: Grid2X2, label: "ช่องฝนคำตอบ" },
                  { id: "id", icon: Grid2X2, label: "รหัสนักเรียน 5 หลัก" },
                  { id: "qr", icon: ScanQrCode, label: "QR และจุดจัดแนว" },
                ].map((item) => (
                  <button
                    key={item.id}
                    className={`element-button ${selection === item.id ? "active" : ""}`}
                    onClick={() => setSelection(item.id)}
                  >
                    <item.icon size={18} />
                    {item.label}
                    <LockKeyhole size={13} />
                  </button>
                ))}
              </div>
              <div className="safe-note">
                <ShieldCheck size={21} />
                <strong>ออกแบบอย่างมั่นใจ</strong>
                <p>พื้นที่สแกนถูกล็อก เพื่อรักษาตำแหน่งวงฝนและรหัสนักเรียน</p>
              </div>
            </>
          )}
        </aside>
        <section className="canvas-workarea">
          <div className="canvas-toolbar">
            <div className="toolbar-group">
              <button
                className="icon-button"
                disabled={index === 0}
                onClick={() => go(index - 1)}
                aria-label="เลิกทำ"
              >
                <Undo2 size={18} />
              </button>
              <button
                className="icon-button"
                disabled={index === history.length - 1}
                onClick={() => go(index + 1)}
                aria-label="ทำซ้ำ"
              >
                <Redo2 size={18} />
              </button>
              <i />
              <span>A4 แนวนอน</span>
              <Badge>{g.sheetsPerPage} ใบ / A4</Badge>
            </div>
            <button
              className={`btn btn-ghost ${guides ? "selected" : ""}`}
              onClick={() => setGuides(!guides)}
              aria-pressed={guides}
              aria-label="แสดงพื้นที่ปลอดภัย"
            >
              <Eye size={16} />
              <span className="desktop-only">พื้นที่ปลอดภัย</span>
            </button>
          </div>
          <div className="sheet-layout-controls">
            <label>
              จำนวนข้อ
              <input
                type="number"
                min={1}
                max={60}
                value={layout.questionCount}
                onChange={(e) =>
                  update({
                    questionCount: Math.max(
                      1,
                      Math.min(60, Math.trunc(Number(e.target.value) || 1)),
                    ),
                  })
                }
              />
            </label>
            <label>
              ตัวเลือก
              <select
                aria-label="ตัวเลือก"
                value={layout.choiceCount}
                onChange={(e) =>
                  update({ choiceCount: Number(e.target.value) as 4 | 5 })
                }
              >
                <option value={4}>4 · ก ข ค ง</option>
                <option value={5}>5 · ก ข ค ง จ</option>
              </select>
            </label>
            <label>
              ขนาดกระดาษ
              <select
                aria-label="ขนาดกระดาษ"
                value={layout.paperMode}
                onChange={(e) =>
                  update({ paperMode: e.target.value as "auto" | "full" })
                }
              >
                <option value="auto">จัดอัตโนมัติ</option>
                <option value="full">เต็ม A4 · 1 ใบ</option>
              </select>
            </label>
          </div>
          <div className="sheet-layout-status" role="status" aria-live="polite">
            {g.autoExpanded
              ? "พื้นที่ครึ่ง A4 ไม่พอ จึงปรับเป็น 1 ใบเต็ม A4 โดยไม่ย่อวงฝน"
              : `พรีวิว 1 ใบ · พิมพ์จริง ${g.sheetsPerPage} ใบต่อ A4 · ${g.columns} คอลัมน์`}
          </div>
          {structureChanged && (
            <div className="sheet-draft-notice">
              <Notice tone="warning">
                จำนวนข้อ/ตัวเลือกยังไม่ตรงกับเฉลยเดิม
                บันทึกเป็นเวอร์ชันใหม่ก่อนพิมพ์
              </Notice>
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmStructure(true)}
              >
                บันทึกโครงข้อสอบ
              </button>
            </div>
          )}
          <div
            className="canvas-scroll"
            tabIndex={0}
            role="region"
            aria-label="พื้นที่กระดาษคำตอบ เลื่อนด้วยปุ่มลูกศรได้"
          >
            <div
              className="canvas-paper"
              style={{
                width: `${zoom * (g.sheetsPerPage === 2 ? 5 : 9)}px`,
                maxWidth: zoom <= 100 ? "100%" : "none",
              }}
            >
              <div className="ruler-horizontal">
                0 <span>50</span>
                <span>100</span>
                <span>{g.sheetWidth} มม.</span>
              </div>
              <SheetPreview layout={layout} guides={guides} single />
            </div>
          </div>
          <div className="canvas-bottom">
            <span>
              {g.sheetWidth} × 210 มม. <i />
              ตัวอย่างใบเดียว
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="ซูมออก"
                disabled={zoom <= 50}
                onClick={() => setZoom(zoom - 10)}
              >
                <ZoomOut size={17} />
              </button>
              <span>{zoom}%</span>
              <button
                className="icon-button"
                aria-label="ซูมเข้า"
                disabled={zoom >= 130}
                onClick={() => setZoom(zoom + 10)}
              >
                <ZoomIn size={17} />
              </button>
            </div>
          </div>
        </section>
        <aside className="properties-panel">
          <div className="properties-title">
            <SlidersHorizontal size={18} />
            <h2>คุณสมบัติ</h2>
          </div>
          <div className="property-content">
            {selection === "heading" ? (
              <>
                <label>
                  ชื่อโรงเรียน
                  <input
                    value={layout.school}
                    maxLength={60}
                    onChange={(e) => update({ school: e.target.value })}
                  />
                </label>
                <label>
                  ชื่อชุดสอบ
                  <input
                    value={layout.title}
                    maxLength={120}
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
                <label>
                  วิชา
                  <input
                    value={layout.subject}
                    maxLength={80}
                    onChange={(e) => update({ subject: e.target.value })}
                  />
                </label>
                <label>
                  เลื่อนหัวข้อในพื้นที่ปลอดภัย
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    value={layout.headerOffsetMm}
                    onChange={(e) =>
                      update({ headerOffsetMm: Number(e.target.value) })
                    }
                  />
                  <span className="small muted">
                    {layout.headerOffsetMm} มม. · จำกัดไม่ให้ชนพื้นที่สแกน
                  </span>
                </label>
              </>
            ) : selection === "logo" ? (
              <>
                <label className="upload-logo">
                  <ImagePlus size={26} />
                  เลือกโลโก้โรงเรียน
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => logo(e.target.files?.[0])}
                  />
                </label>
                <p className="small muted">
                  PNG / JPG ไม่เกิน 2 MB · รักษาสัดส่วนภาพ
                </p>
                {layout.logo && (
                  <button
                    className="btn btn-secondary full-width"
                    onClick={() => update({ logo: null })}
                  >
                    นำโลโก้ออก
                  </button>
                )}
              </>
            ) : selection === "notes" ? (
              <label>
                คำชี้แจง
                <textarea
                  value={layout.instructions}
                  maxLength={140}
                  onChange={(e) => update({ instructions: e.target.value })}
                  rows={5}
                />
                <small>
                  {layout.instructions.length}/140 ตัวอักษร · จัดบรรทัดอัตโนมัติ
                </small>
              </label>
            ) : selection === "fields" ? (
              <>
                <h3>ข้อมูลนักเรียน</h3>
                <p>
                  ชื่อ สกุล ชั้น เลขที่ และวิชา เป็นช่องว่างสำหรับกรอกด้วยมือ
                </p>
                <label>
                  ชั้น / ห้อง
                  <input
                    value={layout.classroom}
                    maxLength={20}
                    onChange={(e) => update({ classroom: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <>
                <LockKeyhole size={24} className="muted" />
                <h3>ล็อกตำแหน่งสำหรับสแกน</h3>
                <p className="muted">
                  แม่แบบอ้างอิงคงพิกัดเดิมทุกใบ เพื่อให้ PDF
                  และตำแหน่งตรวจอ่านตรงกัน
                </p>
                <div className="property-value">
                  {selection === "id"
                    ? "5 หลัก × 10 ตัวเลข"
                    : selection === "answers"
                      ? `${layout.questionCount} ข้อ · ${layout.choiceCount} ตัวเลือก · ${g.columns} คอลัมน์`
                      : "QR เหมือนกันทั้งชุด/เวอร์ชัน · 4 จุดจัดแนว"}
                </div>
              </>
            )}
          </div>
          <div className="validator-panel">
            <h3>
              <ShieldCheck size={18} />
              ตรวจความพร้อมพิมพ์
            </h3>
            {validation.checks.map((check) => (
              <div className="validator-check" key={check}>
                <CheckCircle2 size={15} />
                {check}
              </div>
            ))}
            {validation.errors.map((error) => (
              <Notice key={error} tone="error">
                {error}
              </Notice>
            ))}
            <Notice tone="warning">
              ต้องพิมพ์ทดสอบและยืนยันความแม่นยำก่อนใช้งานจริง
            </Notice>
          </div>
          <button
            className="btn btn-ghost full-width"
            onClick={() => update(layoutForExam(defaultLayout, exam))}
          >
            <RotateCcw size={15} />
            คืนค่าแม่แบบอ้างอิง
          </button>
        </aside>
      </div>
      <Modal
        open={confirmStructure}
        onOpenChange={setConfirmStructure}
        title="บันทึกโครงข้อสอบเป็นเวอร์ชันใหม่"
        description="เวอร์ชันเดิมจะถูกเก็บไว้ ไม่แก้เฉลยของกระดาษที่พิมพ์ไปแล้ว"
      >
        <p>
          {exam.questionCount} ข้อ / {exam.choiceCount} ตัวเลือก →{" "}
          {layout.questionCount} ข้อ / {layout.choiceCount} ตัวเลือก
        </p>
        <Notice tone="warning">
          ข้อใหม่ตั้งเฉลยเริ่มต้นเป็น ก / 1 คะแนน หากลดตัวเลือก เฉลย จ
          จะเปลี่ยนเป็น ก ในเวอร์ชันใหม่ กรุณาตรวจเฉลยทุกข้อก่อนพิมพ์
        </Notice>
        {saveError && <Notice tone="error">{saveError}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={saving}
            onClick={() => setConfirmStructure(false)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={saveStructure}
          >
            {saving ? "กำลังบันทึก…" : "ยืนยันบันทึกเวอร์ชันใหม่"}
          </button>
        </div>
      </Modal>
    </>
  );
}
