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
  Trash2,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import {
  Badge,
  PageHeading,
  EmptyState,
  Modal,
  Notice,
} from "@/components/ui/primitives";
import { stageLabels } from "@/components/dashboard/dashboard-cards";
type DeletePreview = {
  id: string;
  title: string;
  scans: number;
  confirmed: number;
  sheets: number;
  images: number;
  deleting: boolean;
};
export function ExamLibrary() {
  const {
    exams,
    reviews,
    setExams,
    removeExam,
    mode,
    notify,
    request,
    readOnly,
    isCurrentWorkspace,
  } = useWorkspace();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [actions, setActions] = useState<string | null>(null);
  const [deletion, setDeletion] = useState<DeletePreview | null>(null),
    [deletionId, setDeletionId] = useState<string | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const actionExam = exams.find((e) => e.id === actions);
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
      notify("การคัดลอกชุดสอบบนระบบจริงยังอยู่ระหว่างพัฒนา");
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
  async function archiveSelected() {
    if (readOnly || busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "connected") {
        const response = await request(
          "/api/exams",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "archive",
              ids: selected,
              archived: !archived,
            }),
          },
          true,
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.messageTh ?? "จัดเก็บไม่สำเร็จ");
      } else if (mode !== "demo") throw new Error("ยังไม่เชื่อมต่อระบบ");
      if (!isCurrentWorkspace()) return;
      setExams(
        exams.map((e) =>
          selected.includes(e.id) ? { ...e, archived: !archived } : e,
        ),
      );
      setSelected([]);
      setConfirm(false);
      notify(
        archived ? "นำชุดสอบกลับมาแล้ว" : "จัดเก็บชุดสอบแล้ว คะแนนยังคงอยู่",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function previewDelete(id: string) {
    setActions(null);
    setDeletionId(id);
    setDeletion(null);
    setConfirmation("");
    setError("");
    setBusy(true);
    try {
      if (mode === "connected") {
        const response = await request(
          `/api/exams?deletePreview=${encodeURIComponent(id)}`,
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error?.messageTh ?? "โหลดรายละเอียดไม่สำเร็จ");
        if (isCurrentWorkspace()) setDeletion(body.data);
      } else if (mode === "demo") {
        const exam = exams.find((e) => e.id === id)!;
        const related = reviews.filter((r) => r.examId === id);
        setDeletion({
          id,
          title: exam.title,
          scans: related.length,
          confirmed: related.filter((r) => r.status === "verified").length,
          sheets: exam.students,
          images: related.length,
          deleting: false,
        });
      } else throw new Error("ยังไม่เชื่อมต่อระบบ");
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function deleteExam() {
    if (!deletion || confirmation !== deletion.title || busy || readOnly)
      return;
    setBusy(true);
    setError("");
    try {
      if (mode === "connected") {
        let done = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          const response = await request(
            "/api/exams",
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: deletion.id, confirmation }),
            },
            true,
          );
          const body = await response.json();
          if (!response.ok)
            throw new Error(
              body.error?.messageTh ?? "ลบไม่สำเร็จ กดลบอีกครั้งเพื่อทำต่อ",
            );
          if (body.data?.deleted) {
            done = true;
            break;
          }
        }
        if (!done)
          throw new Error("ยังลบภาพไม่ครบ กดลบอีกครั้งเพื่อดำเนินการต่อ");
      } else if (mode !== "demo") throw new Error("ยังไม่เชื่อมต่อระบบ");
      if (!isCurrentWorkspace()) return;
      removeExam(deletion.id);
      setSelected((old) => old.filter((id) => id !== deletion.id));
      setDeletionId(null);
      setDeletion(null);
      notify("ลบชุดสอบ คะแนน และภาพที่เกี่ยวข้องแล้ว รายชื่อนักเรียนยังคงอยู่");
    } catch (e) {
      if (mode === "connected" && isCurrentWorkspace()) {
        const response = await request("/api/exams").catch(() => null);
        if (response?.ok) {
          const body = await response.json();
          setExams(body.data);
        }
      }
      setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="คลังชุดสอบ"
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
              disabled={
                readOnly ||
                busy ||
                selected.some((id) => exams.find((e) => e.id === id)?.deleting)
              }
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
                    {exam.deleting && <Badge tone="red">กำลังลบ</Badge>}
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
        open={Boolean(actionExam)}
        onOpenChange={(open) => !open && setActions(null)}
        title={actionExam?.title ?? "ตัวเลือกชุดสอบ"}
      >
        {actionExam && (
          <div className="exam-action-list">
            <button
              className="btn btn-secondary"
              disabled={
                readOnly || Boolean(actionExam.deleting) || mode !== "demo"
              }
              onClick={() => duplicate(actionExam.id)}
            >
              <Copy size={17} />
              สร้างสำเนา
            </button>
            <button
              className="btn btn-secondary"
              disabled={readOnly || Boolean(actionExam.deleting)}
              onClick={() => {
                setSelected([actionExam.id]);
                setConfirm(true);
                setActions(null);
                setError("");
              }}
            >
              <Archive size={17} />
              {archived ? "นำกลับมาใช้งาน" : "จัดเก็บชุดสอบ"}
            </button>
            <button
              className="btn btn-danger"
              disabled={readOnly}
              onClick={() => void previewDelete(actionExam.id)}
            >
              <Trash2 size={17} />
              {actionExam.deleting ? "ดำเนินการลบต่อ" : "ลบชุดสอบถาวร"}
            </button>
          </div>
        )}
      </Modal>
      <Modal
        open={deletionId !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDeletionId(null);
            setDeletion(null);
          }
        }}
        title="ลบชุดสอบถาวร"
        description="ลบข้อสอบ เฉลย คะแนน และภาพสแกน กู้คืนจากระบบไม่ได้ รายชื่อนักเรียนและโลโก้ยังคงอยู่"
      >
        {busy && !deletion && <p role="status">กำลังโหลดรายละเอียด…</p>}
        {deletion && (
          <>
            <p className="exam-delete-title">{deletion.title}</p>
            <dl className="exam-delete-counts">
              <div>
                <dt>กระดาษที่พิมพ์</dt>
                <dd>{deletion.sheets}</dd>
              </div>
              <div>
                <dt>ผลสแกน</dt>
                <dd>{deletion.scans}</dd>
              </div>
              <div>
                <dt>คะแนนยืนยันแล้ว</dt>
                <dd>{deletion.confirmed}</dd>
              </div>
              <div>
                <dt>ไฟล์ภาพ</dt>
                <dd>{deletion.images}</dd>
              </div>
            </dl>
            {deletion.confirmed > 0 && (
              <p>
                <Link
                  className="text-button"
                  href={`/exams/${deletion.id}/results`}
                >
                  ส่งออกคะแนนก่อนลบ
                </Link>
              </p>
            )}
            {deletion.deleting && (
              <Notice tone="warning">
                การลบครั้งก่อนยังไม่เสร็จ ดำเนินการต่อได้โดยไม่เริ่มใหม่
              </Notice>
            )}
            <label>
              พิมพ์ชื่อชุดสอบเพื่อยืนยัน
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                disabled={busy}
              />
            </label>
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setDeletionId(null)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-danger"
            disabled={
              !deletion || busy || readOnly || confirmation !== deletion.title
            }
            onClick={() => void deleteExam()}
          >
            <Trash2 size={17} />
            {busy && deletion ? "กำลังลบ…" : "ลบถาวร"}
          </button>
        </div>
      </Modal>
      <Modal
        open={confirm}
        onOpenChange={(open) => !busy && setConfirm(open)}
        title={archived ? "นำชุดสอบกลับมาใช้งาน" : "จัดเก็บชุดสอบ"}
        description="ประวัติและผลสอบยังคงอยู่ สามารถนำชุดสอบกลับมาได้"
      >
        <p>ดำเนินการกับ {selected.length} ชุดสอบที่เลือก</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || readOnly}
            onClick={() => void archiveSelected()}
          >
            {busy
              ? "กำลังบันทึก…"
              : archived
                ? "นำกลับมาใช้งาน"
                : "ยืนยันการจัดเก็บ"}
          </button>
        </div>
      </Modal>
    </>
  );
}
