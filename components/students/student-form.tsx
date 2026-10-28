"use client";
import { useState } from "react";
import { Modal, Notice } from "@/components/ui/primitives";
import { studentSchema, type Student } from "@/types/student";
import { namePrefixes } from "@/lib/import/normalize-name";
import { useRosterCommands } from "./use-roster";

export function StudentForm({
  student,
  classrooms,
  onClose,
  onSaved,
  directoryId,
}: {
  student?: Student;
  classrooms: string[];
  onClose: () => void;
  onSaved: () => void;
  directoryId?: string;
}) {
  const [code, setCode] = useState(student?.student_code ?? ""),
    [prefix, setPrefix] = useState(student?.prefix ?? "");
  const [first, setFirst] = useState(student?.first_name ?? ""),
    [last, setLast] = useState(student?.last_name ?? "");
  const [classroom, setClassroom] = useState(student?.classroom_name ?? ""),
    [newClass, setNewClass] = useState("");
  const [number, setNumber] = useState(student?.number?.toString() ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const command = useRosterCommands();
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const parsed = studentSchema.safeParse({
      student_code: code.trim(),
      prefix,
      first_name: first,
      last_name: last,
      classroom_name: classroom === "__new" ? newClass : classroom,
      number: number === "" ? null : Number(number),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" · "));
      return;
    }
    setBusy(true);
    try {
      if (directoryId) {
        const plan = await command<{ planId: string }>({
          action: "preview_import",
          directoryId,
          filename: "เพิ่มหรือแก้นักเรียนทะเบียนกลาง",
          students: [
            { ...parsed.data, expectedRevision: student?.revision ?? 0 },
          ],
        });
        await command({
          action: "apply_plan",
          planId: plan.planId,
          directory: true,
          consent: true,
        });
      } else
        await command({
          action: student ? "update" : "create",
          ...(student
            ? { id: student.id, revision: student.revision ?? 1 }
            : {}),
          student: parsed.data,
        });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={student ? "แก้ไขข้อมูลนักเรียน" : "เพิ่มนักเรียน"}
    >
      <form onSubmit={(e) => void save(e)} className="roster-form">
        {error && <Notice tone="error">{error}</Notice>}
        {directoryId && (
          <Notice tone="warning">
            บันทึกลงทะเบียนกลางและอัปเดตให้ครูที่ติดตามห้องนี้
          </Notice>
        )}
        <div className="form-grid">
          <label>
            รหัสประจำตัว
            <input
              autoFocus={!student}
              inputMode="numeric"
              maxLength={5}
              pattern="[0-9]{5}"
              value={code}
              disabled={Boolean(student) || busy}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <label>
            คำนำหน้า
            <select
              value={prefix}
              disabled={busy}
              onChange={(e) => setPrefix(e.target.value as typeof prefix)}
            >
              <option value="">ไม่ระบุ</option>
              {namePrefixes.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            ชื่อ
            <input
              value={first}
              maxLength={80}
              disabled={busy}
              onChange={(e) => setFirst(e.target.value)}
              required
            />
          </label>
          <label>
            นามสกุล
            <input
              value={last}
              maxLength={80}
              disabled={busy}
              onChange={(e) => setLast(e.target.value)}
              required
            />
          </label>
          <label>
            ชั้น / ห้อง
            <select
              value={classroom}
              disabled={busy}
              onChange={(e) => setClassroom(e.target.value)}
              required
            >
              <option value="">เลือกชั้น / ห้อง</option>
              {[
                ...new Set([
                  ...classrooms,
                  ...(student ? [student.classroom_name] : []),
                ]),
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
              <option value="__new">เพิ่มชั้น / ห้อง</option>
            </select>
          </label>
          <label>
            เลขที่ (ไม่บังคับ)
            <input
              inputMode="numeric"
              type="number"
              min={1}
              max={100}
              value={number}
              disabled={busy}
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>
          {classroom === "__new" && (
            <label>
              ชั้น / ห้องใหม่
              <input
                placeholder="ม.1 หรือ ม.1/2"
                value={newClass}
                maxLength={30}
                disabled={busy}
                onChange={(e) => setNewClass(e.target.value)}
                required
              />
            </label>
          )}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
