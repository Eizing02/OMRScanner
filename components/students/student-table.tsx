"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  Upload,
  Search,
  Users,
  Plus,
  Download,
  School,
  Pencil,
  Trash2,
  RotateCcw,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import {
  PageHeading,
  EmptyState,
  Badge,
  Notice,
  Modal,
} from "@/components/ui/primitives";
import type { Student } from "@/types/student";
import type { RosterFilters, RosterPage, SelectionPlan } from "@/types/roster";
import { useRosterCommands, useRosterPage } from "./use-roster";
import { StudentForm } from "./student-form";
import { SchoolDirectory } from "./student-directory";

export function Students() {
  const downloads = useRef<HTMLDetailsElement>(null);
  const { mode, students, request, readOnly, notify, isCurrentWorkspace } =
    useWorkspace();
  const [filters, setFilters] = useState<RosterFilters>({
    query: "",
    grade: "",
    classroom: "",
    status: "active",
    page: 0,
    limit: 50,
  });
  const [refreshKey, setRefreshKey] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [allMatching, setAllMatching] = useState(false),
    [excluded, setExcluded] = useState<string[]>([]);
  const [editing, setEditing] = useState<Student | "new" | null>(null),
    [directory, setDirectory] = useState(false),
    [linked, setLinked] = useState<Student | null>(null);
  const [plan, setPlan] = useState<SelectionPlan | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    command = useRosterCommands();
  const {
    data,
    error: loadError,
    loading,
  } = useRosterPage(filters, refreshKey);
  const rows = data?.students ?? [],
    total = data?.total ?? 0,
    pages = Math.max(1, Math.ceil(total / 50));
  const selectedCount = allMatching
    ? Math.max(0, total - excluded.length)
    : selected.length;
  const inactive = filters.status === "inactive",
    classroomNames = data?.classrooms.map((c) => c.name) ?? [];
  const checked = (id: string) =>
    allMatching ? !excluded.includes(id) : selected.includes(id);
  function clearSelection() {
    setSelected([]);
    setAllMatching(false);
    setExcluded([]);
  }
  function change(patch: Partial<RosterFilters>) {
    setFilters((old) => ({ ...old, ...patch, page: 0 }));
    clearSelection();
  }
  function reload() {
    setRefreshKey((v) => v + 1);
    setFilters((old) => ({ ...old, page: 0 }));
    clearSelection();
    setPlan(null);
    setEditing(null);
    setLinked(null);
  }
  async function preview(ids?: string[]) {
    if (readOnly || busy) return;
    setBusy(true);
    setError("");
    try {
      setPlan(
        await command<SelectionPlan>({
          action: "preview_selection",
          operation: inactive ? "restore" : "archive",
          filters,
          ...(ids
            ? { ids }
            : allMatching
              ? { allMatching: true, excludedIds: excluded }
              : { ids: selected }),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "ตรวจรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!plan || busy) return;
    setBusy(true);
    setError("");
    try {
      await command({
        action: "apply_plan",
        planId: plan.planId,
        consent: true,
      });
      notify(
        inactive
          ? "คืนรายชื่อแล้ว"
          : "นำออกจากรายชื่อแล้ว ประวัติข้อสอบยังอยู่",
      );
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function detach() {
    if (!linked || busy) return;
    setBusy(true);
    setError("");
    try {
      await command({
        action: "detach",
        id: linked.id,
        revision: linked.revision,
        consent: true,
      });
      notify("แยกรายชื่อมาจัดการเองแล้ว");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function download(format: "xlsx" | "csv", template = false) {
    setBusy(true);
    setError("");
    try {
      let people: Student[] = [];
      if (!template) {
        if (mode === "demo")
          people = students.filter(
            (s) =>
              (s.active !== false) === !inactive &&
              (!filters.classroom || s.classroom_name === filters.classroom) &&
              (!filters.grade ||
                s.classroom_name.split("/")[0] === filters.grade) &&
              (!filters.query ||
                `${s.student_code} ${s.prefix ?? ""}${s.first_name} ${s.last_name}`.includes(
                  filters.query,
                )),
          );
        else {
          const query = new URLSearchParams({
            ...Object.fromEntries(
              Object.entries(filters)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, String(v)]),
            ),
            view: "export",
          });
          const response = await request(`/api/students?${query}`);
          const body = await response.json();
          if (!response.ok)
            throw new Error(body.error?.messageTh ?? "โหลดรายชื่อไม่สำเร็จ");
          const batch = body.data as RosterPage;
          if (batch.students.length !== batch.total)
            throw new Error("รายชื่อที่ได้รับไม่ครบ กรุณาลองใหม่");
          people = batch.students;
        }
        if (selectedCount) people = people.filter((s) => checked(s.id));
      }
      if (!isCurrentWorkspace()) return;
      const { downloadStudentFile } =
        await import("@/lib/import/student-files");
      downloadStudentFile(people, format, template);
      if (downloads.current) downloads.current.open = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="task-workspace roster-workspace">
      <PageHeading
        title="นักเรียนและห้องเรียน"
        actions={
          <button
            ref={trigger}
            className="btn btn-primary"
            disabled={readOnly || busy}
            onClick={() => setEditing("new")}
          >
            <Plus size={17} />
            เพิ่มนักเรียน
          </button>
        }
      />
      <div className="roster-tools-row">
        <Link href="/students/import" className="btn btn-secondary">
          <Upload size={17} />
          นำเข้ารายชื่อ
        </Link>
        <button
          className="btn btn-secondary"
          disabled={readOnly || busy}
          onClick={() => setDirectory(true)}
        >
          <School size={17} />
          ทะเบียนโรงเรียน
        </button>
        <details
          ref={downloads}
          className="roster-download"
          onKeyDown={(event) => {
            if (event.key === "Escape" && downloads.current) {
              downloads.current.open = false;
              downloads.current.querySelector("summary")?.focus();
            }
          }}
          onBlur={(event) => {
            if (
              event.relatedTarget &&
              !event.currentTarget.contains(event.relatedTarget as Node)
            )
              event.currentTarget.open = false;
          }}
        >
          <summary className="btn btn-ghost">
            <Download size={17} />
            ดาวน์โหลด
          </summary>
          <div>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void download("xlsx", true)}
            >
              แม่แบบ Excel
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void download("csv", true)}
            >
              แม่แบบ CSV
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy || !total || loading}
              onClick={() => void download("xlsx")}
            >
              {selectedCount ? "รายชื่อที่เลือก" : "รายชื่อตามตัวกรอง"} · Excel
            </button>
            <button
              className="btn btn-ghost"
              disabled={busy || !total || loading}
              onClick={() => void download("csv")}
            >
              {selectedCount ? "รายชื่อที่เลือก" : "รายชื่อตามตัวกรอง"} · CSV
            </button>
          </div>
        </details>
        <button
          className="icon-button"
          aria-label="โหลดรายชื่อใหม่"
          disabled={busy || loading}
          onClick={reload}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {readOnly && (
        <Notice tone="warning">
          พื้นที่ของผู้ใช้อื่นเป็นแบบอ่านอย่างเดียว
        </Notice>
      )}
      {(error || loadError) && (
        <Notice tone="error">{error || loadError}</Notice>
      )}
      <section className="panel roster-panel" aria-busy={loading}>
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder="ค้นหาชื่อ รหัส หรือห้องเรียน"
              aria-label="ค้นหานักเรียน"
              value={filters.query}
              onChange={(e) => change({ query: e.target.value })}
            />
          </label>
          <label>
            ระดับชั้น
            <select
              value={filters.grade}
              onChange={(e) => change({ grade: e.target.value, classroom: "" })}
            >
              <option value="">ทุกระดับชั้น</option>
              {[...new Set(classroomNames.map((c) => c.split("/")[0]))].map(
                (g) => (
                  <option key={g}>{g}</option>
                ),
              )}
            </select>
          </label>
          <label>
            ชั้น / ห้อง
            <select
              value={filters.classroom}
              onChange={(e) => change({ classroom: e.target.value })}
            >
              <option value="">ทุกห้อง</option>
              {classroomNames
                .filter(
                  (c) => !filters.grade || c.split("/")[0] === filters.grade,
                )
                .map((c) => (
                  <option key={c}>{c}</option>
                ))}
            </select>
          </label>
          <label>
            รายชื่อ
            <select
              value={filters.status}
              onChange={(e) =>
                change({ status: e.target.value as "active" | "inactive" })
              }
            >
              <option value="active">ใช้งานอยู่</option>
              <option value="inactive">นำออกแล้ว</option>
            </select>
          </label>
          <Badge>
            <Users size={14} />
            {loading ? "กำลังโหลด…" : `${total} คน`}
          </Badge>
        </div>
        {selectedCount > 0 && (
          <div className="roster-selection">
            <span>
              เลือก {selectedCount} คน{allMatching ? " ตามตัวกรอง" : ""}
            </span>
            {!allMatching && total > selected.length && (
              <button
                className="btn btn-ghost"
                disabled={readOnly || busy || loading}
                onClick={() => {
                  setAllMatching(true);
                  setExcluded([]);
                }}
              >
                เลือกทั้งหมด {total} คนตามตัวกรอง
              </button>
            )}
            <button className="btn btn-ghost" onClick={clearSelection}>
              ยกเลิกเลือก
            </button>
            <button
              className={`btn ${inactive ? "btn-secondary" : "btn-danger"}`}
              disabled={readOnly || busy || loading}
              onClick={() => void preview()}
            >
              {inactive ? <RotateCcw size={16} /> : <Trash2 size={16} />}
              {inactive ? "คืนรายชื่อที่เลือก" : "นำออกที่เลือก"}
            </button>
          </div>
        )}
        <div
          className="table-scroll"
          role="region"
          aria-label="รายชื่อนักเรียน เลื่อนดูได้"
          tabIndex={0}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="เลือกทั้งหน้านี้"
                    disabled={readOnly || loading || !rows.length}
                    checked={
                      rows.length > 0 && rows.every((s) => checked(s.id))
                    }
                    onChange={(e) => {
                      if (allMatching)
                        setExcluded((old) =>
                          e.target.checked
                            ? old.filter((id) => !rows.some((s) => s.id === id))
                            : [...new Set([...old, ...rows.map((s) => s.id)])],
                        );
                      else
                        setSelected((old) =>
                          e.target.checked
                            ? [...new Set([...old, ...rows.map((s) => s.id)])]
                            : old.filter(
                                (id) => !rows.some((s) => s.id === id),
                              ),
                        );
                    }}
                  />
                </th>
                <th>รหัสประจำตัว</th>
                <th>ชื่อ</th>
                <th>นามสกุล</th>
                <th>ระดับชั้น</th>
                <th>
                  <span className="sr-only">จัดการนักเรียน</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`เลือก ${s.student_code}`}
                      disabled={readOnly || loading}
                      checked={checked(s.id)}
                      onChange={(e) => {
                        if (allMatching)
                          setExcluded((old) =>
                            e.target.checked
                              ? old.filter((id) => id !== s.id)
                              : [...old, s.id],
                          );
                        else
                          setSelected((old) =>
                            e.target.checked
                              ? [...old, s.id]
                              : old.filter((id) => id !== s.id),
                          );
                      }}
                    />
                  </td>
                  <td className="tabular">{s.student_code}</td>
                  <td>
                    {s.prefix ?? ""}
                    {s.first_name}
                    {s.directory_student_id && (
                      <span className="roster-source">ทะเบียนโรงเรียน</span>
                    )}
                  </td>
                  <td>{s.last_name}</td>
                  <td>{s.classroom_name}</td>
                  <td>
                    <div className="roster-row-actions">
                      <button
                        className="icon-button"
                        aria-label={`แก้ไข ${s.student_code}`}
                        disabled={readOnly || busy || loading}
                        onClick={() =>
                          s.directory_student_id ? setLinked(s) : setEditing(s)
                        }
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`${inactive ? "คืนรายชื่อ" : "นำออก"} ${s.student_code}`}
                        disabled={readOnly || busy || loading}
                        onClick={() => void preview([s.id])}
                      >
                        {inactive ? (
                          <RotateCcw size={17} />
                        ) : (
                          <Trash2 size={17} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <p className="roster-loading" role="status">
            กำลังโหลดรายชื่อ…
          </p>
        )}
        {!loading && !rows.length && !loadError && (
          <EmptyState
            title={inactive ? "ไม่มีรายชื่อที่นำออก" : "ไม่พบรายชื่อ"}
            description={
              filters.query || filters.classroom || filters.grade
                ? "ลองเปลี่ยนคำค้นหรือตัวกรอง"
                : "เพิ่มนักเรียน นำเข้าไฟล์ หรือเลือกจากทะเบียนโรงเรียน"
            }
          />
        )}
        <div className="roster-pagination">
          <span className="small muted">
            {total} คน · หน้า {(filters.page ?? 0) + 1} / {pages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={loading || !filters.page}
            onClick={() =>
              setFilters((old) => ({ ...old, page: (old.page ?? 0) - 1 }))
            }
          >
            ก่อนหน้า
          </button>
          <button
            className="btn btn-secondary"
            disabled={loading || (filters.page ?? 0) >= pages - 1}
            onClick={() =>
              setFilters((old) => ({ ...old, page: (old.page ?? 0) + 1 }))
            }
          >
            ถัดไป
          </button>
        </div>
      </section>
      {editing && (
        <StudentForm
          key={editing === "new" ? "new" : editing.id}
          student={editing === "new" ? undefined : editing}
          classrooms={classroomNames}
          onClose={() => setEditing(null)}
          onSaved={() => {
            notify("บันทึกข้อมูลนักเรียนแล้ว");
            reload();
          }}
        />
      )}
      {directory && (
        <SchoolDirectory
          onClose={() => setDirectory(false)}
          onChanged={reload}
        />
      )}
      <Modal
        open={Boolean(plan)}
        onOpenChange={(open) => {
          if (!open && !busy) setPlan(null);
        }}
        title={inactive ? "คืนรายชื่อ" : "นำออกจากรายชื่อ"}
        returnFocusRef={trigger}
      >
        <p>
          {inactive ? "คืน" : "นำออก"} {plan?.count ?? plan?.rows.length ?? 0}{" "}
          คน{filters.classroom ? ` · ${filters.classroom}` : ""}
        </p>
        <Notice tone="warning">
          {inactive
            ? "คืนเฉพาะรายชื่อที่เลือก ไม่เปลี่ยนคะแนนเดิม"
            : "คะแนน กระดาษคำตอบ และประวัติข้อสอบยังอยู่"}
        </Notice>
        <ul className="roster-confirm-list">
          {plan?.rows.slice(0, 5).map((r) => (
            <li key={r.studentId}>
              {r.before?.student_code} · {r.before?.prefix}
              {r.before?.first_name} {r.before?.last_name}
            </li>
          ))}
        </ul>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setPlan(null)}
          >
            ยกเลิก
          </button>
          <button
            className={`btn ${inactive ? "btn-primary" : "btn-danger"}`}
            disabled={busy || !plan}
            onClick={() => void apply()}
          >
            {busy
              ? "กำลังบันทึก…"
              : inactive
                ? "ยืนยันคืนรายชื่อ"
                : "ยืนยันนำออก"}
          </button>
        </div>
      </Modal>
      <Modal
        open={Boolean(linked)}
        onOpenChange={(open) => {
          if (!open && !busy) setLinked(null);
        }}
        title="รายชื่อจากทะเบียนโรงเรียน"
      >
        <p>
          {linked?.student_code} · {linked?.prefix}
          {linked?.first_name} {linked?.last_name}
        </p>
        <Notice>
          ชื่อ ชั้น และเลขที่อัปเดตตามโรงเรียน หากต้องแก้เองให้แยกการอัปเดตก่อน
        </Notice>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setLinked(null)}
          >
            ปิด
          </button>
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void detach()}
          >
            <Unlink size={16} />
            {busy ? "กำลังบันทึก…" : "แยกมาจัดการเอง"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
