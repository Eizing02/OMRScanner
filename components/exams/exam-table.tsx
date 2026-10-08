"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Search,
  Plus,
  Copy,
  Archive,
  ArrowUpDown,
  ArrowRight,
  BookOpen,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import {
  Badge,
  PageHeading,
  EmptyState,
  Modal,
} from "@/components/ui/primitives";
import { stageLabels } from "@/components/dashboard/dashboard-cards";
export function ExamLibrary() {
  const { exams, setExams, mode, notify } = useWorkspace();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [actions, setActions] = useState<string | null>(null);
  const rows = exams
    .filter(
      (e) =>
        e.archived === archived &&
        (!query || `${e.title} ${e.subject} ${e.classroom}`.includes(query)) &&
        (!subject || e.subject === subject) &&
        (!status || e.stage === Number(status)),
    )
    .sort((a, b) =>
      sort
        ? a.title.localeCompare(b.title, "th")
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const demoOnly = () => {
    if (mode !== "demo") {
      notify("การคัดลอกและจัดเก็บชุดสอบบนระบบจริงยังอยู่ระหว่างพัฒนา");
      return false;
    }
    return true;
  };
  function duplicate(id: string) {
    if (!demoOnly()) return;
    const exam = exams.find((e) => e.id === id);
    if (!exam) return;
    setExams([
      {
        ...exam,
        id: `demo-${crypto.randomUUID()}`,
        title: `${exam.title} (สำเนา)`,
        stage: 0,
        scanned: 0,
        reviewCount: 0,
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      ...exams,
    ]);
    notify("สร้างสำเนาในพื้นที่ทดลองแล้ว");
    setActions(null);
  }
  return (
    <>
      <PageHeading
        title="คลังชุดสอบ"
        description="จัดการชุดสอบ เฉลย และกระดาษคำตอบในที่เดียว"
        actions={
          <Link href="/exams/new" className="btn btn-primary">
            <Plus size={18} />
            สร้างชุดสอบ
          </Link>
        }
      />
      <div className="library-tabs" role="tablist" aria-label="รายการชุดสอบ">
        <button
          role="tab"
          aria-selected={!archived}
          className={!archived ? "active" : ""}
          onClick={() => {
            setArchived(false);
            setSelected([]);
          }}
        >
          ชุดสอบทั้งหมด <span>{exams.filter((e) => !e.archived).length}</span>
        </button>
        <button
          role="tab"
          aria-selected={archived}
          className={archived ? "active" : ""}
          onClick={() => {
            setArchived(true);
            setSelected([]);
          }}
        >
          จัดเก็บแล้ว
        </button>
      </div>
      <section className="panel library-panel">
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={18} />
            <input
              aria-label="ค้นหาชุดสอบ"
              placeholder="ค้นหาชื่อชุดสอบ วิชา หรือห้องเรียน"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">กรองวิชา</span>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">ทุกวิชา</option>
              {Array.from(new Set(exams.map((e) => e.subject))).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">กรองสถานะ</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">ทุกสถานะ</option>
              {stageLabels.map((s, i) => (
                <option key={s} value={i}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        {selected.length > 0 && (
          <div className="selection-toolbar">
            <span>เลือก {selected.length} ชุดสอบ</span>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirm(true)}
            >
              <Archive size={16} />
              {archived ? "นำกลับมาใช้งาน" : "จัดเก็บชุดสอบ"}
            </button>
          </div>
        )}
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="เลือกชุดสอบทั้งหมดที่แสดง"
                    checked={
                      rows.length > 0 &&
                      rows.every((e) => selected.includes(e.id))
                    }
                    onChange={(e) =>
                      setSelected(e.target.checked ? rows.map((r) => r.id) : [])
                    }
                  />
                </th>
                <th>
                  <button
                    className="sort-button"
                    onClick={() => setSort(!sort)}
                  >
                    ชุดสอบ
                    <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>ชั้น / ห้อง</th>
                <th>กระดาษคำตอบ</th>
                <th>สถานะงาน</th>
                <th>สแกนแล้ว</th>
                <th>
                  <span className="sr-only">การดำเนินการ</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((exam) => (
                <tr key={exam.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`เลือก ${exam.title}`}
                      checked={selected.includes(exam.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, exam.id]
                            : selected.filter((id) => id !== exam.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <div className="table-exam">
                      <span className="table-subject-icon">
                        <BookOpen size={21} />
                      </span>
                      <div>
                        <Link href={`/exams/${exam.id}`}>{exam.title}</Link>
                        <small>
                          {exam.subject} · {exam.examType} ·{" "}
                          {exam.questionCount} ข้อ
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>{exam.classroom}</td>
                  <td>
                    <span>เวอร์ชัน {exam.version}</span>
                    <small>A4 แนวนอน · 2 ใบ</small>
                  </td>
                  <td>
                    <Badge
                      tone={
                        exam.stage === 5
                          ? "green"
                          : exam.stage === 4
                            ? "amber"
                            : "blue"
                      }
                    >
                      {stageLabels[exam.stage]}
                    </Badge>
                  </td>
                  <td>
                    <span className="tabular">
                      {exam.scanned} / {exam.students}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link
                        href={`/exams/${exam.id}/omr-generate`}
                        className="icon-button"
                        aria-label={`เปิด ${exam.title}`}
                      >
                        <ArrowRight size={18} />
                      </Link>
                      <button
                        className="icon-button"
                        aria-label={`ตัวเลือก ${exam.title}`}
                        onClick={() =>
                          setActions(actions === exam.id ? null : exam.id)
                        }
                      >
                        <MoreHorizontal size={20} />
                      </button>
                      {actions === exam.id && (
                        <div className="action-popover">
                          <button onClick={() => duplicate(exam.id)}>
                            <Copy size={16} />
                            สร้างสำเนา
                          </button>
                          <button
                            onClick={() => {
                              setSelected([exam.id]);
                              setConfirm(true);
                              setActions(null);
                            }}
                          >
                            <Archive size={16} />
                            {archived ? "นำกลับมา" : "จัดเก็บ"}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <EmptyState
            title="ไม่พบชุดสอบ"
            description="ลองเปลี่ยนคำค้นหาหรือตัวกรอง"
          >
            <button
              className="btn btn-secondary"
              onClick={() => {
                setQuery("");
                setSubject("");
                setStatus("");
              }}
            >
              <RotateCcw size={16} />
              ล้างตัวกรอง
            </button>
          </EmptyState>
        )}
        <div className="table-footer">
          <span>แสดง {rows.length} รายการ</span>
          <span>หน้า 1 จาก 1</span>
        </div>
      </section>
      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title={archived ? "นำชุดสอบกลับมาใช้งาน" : "จัดเก็บชุดสอบ"}
        description="ประวัติและผลสอบยังคงอยู่ สามารถนำชุดสอบกลับมาได้"
      >
        <p>ดำเนินการกับ {selected.length} ชุดสอบที่เลือก</p>
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setConfirm(false)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (demoOnly()) {
                setExams(
                  exams.map((e) =>
                    selected.includes(e.id) ? { ...e, archived: !archived } : e,
                  ),
                );
                setSelected([]);
                notify("อัปเดตรายการในพื้นที่ทดลองแล้ว");
              }
              setConfirm(false);
            }}
          >
            {archived ? "นำกลับมาใช้งาน" : "ยืนยันการจัดเก็บ"}
          </button>
        </div>
      </Modal>
    </>
  );
}
