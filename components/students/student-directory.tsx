"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, RotateCcw, Upload, School } from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Modal, Notice, Badge } from "@/components/ui/primitives";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import type { DirectoryOptions, PersonInput, RosterPlan } from "@/types/roster";
import type { Student } from "@/types/student";
import { useRosterCommands } from "./use-roster";
import { StudentForm } from "./student-form";
type Member = {
  userId: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
};
type DirectoryPage = { students: Student[]; total: number; members: Member[] };
type SubscriptionPreview = {
  revision: number;
  total: number;
  added: number;
  excluded: number;
  conflicts: {
    studentCode: string;
    before: PersonInput;
    after: PersonInput;
    canAdopt: boolean;
  }[];
};

export function SchoolDirectory({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const { mode, request, branding, notify } = useWorkspace(),
    command = useRosterCommands();
  const [options, setOptions] = useState<DirectoryOptions | null>(null),
    [target, setTarget] = useState(""),
    [classes, setClasses] = useState<string[]>([]);
  const [pane, setPane] = useState("subscribe"),
    [page, setPage] = useState(0),
    [status, setStatus] = useState("active"),
    [people, setPeople] = useState<DirectoryPage | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0);
  const [create, setCreate] = useState(false),
    [name, setName] = useState(
      branding.school === "พื้นที่ส่วนตัว" ? "" : branding.school,
    );
  const [year, setYear] = useState(branding.settings?.academicYear ?? 2569),
    [term, setTerm] = useState(branding.settings?.term ?? 1);
  const [editing, setEditing] = useState<Student | "new" | null>(null),
    [seed, setSeed] = useState<RosterPlan | null>(null),
    [subscription, setSubscription] = useState<SubscriptionPreview | null>(
      null,
    );
  const [adopt, setAdopt] = useState(false),
    [restoreExcluded, setRestoreExcluded] = useState(false),
    [account, setAccount] = useState("");
  const [pending, setPending] = useState<{
    operation: "archive" | "restore" | "revoke";
    student?: Student;
    member?: Member;
  } | null>(null);
  const directory = options?.directories.find((d) => d.id === target);
  const reload = useCallback(
    async (chosen?: string) => {
      if (mode !== "connected") {
        setOptions({ canCreate: false, directories: [], accounts: [] });
        setLoading(false);
        return;
      }
      const response = await request("/api/students?view=directory_options");
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.messageTh ?? "โหลดทะเบียนไม่สำเร็จ");
      const result = body.data as DirectoryOptions;
      setOptions(result);
      const id = chosen ?? target ?? result.directories[0]?.id;
      const selected =
        result.directories.find((d) => d.id === id) ?? result.directories[0];
      if (selected) {
        setTarget(selected.id);
        setClasses(selected.selectedClasses);
        setYear(selected.academic_year);
        setTerm(selected.term);
      }
      setTick((v) => v + 1);
    },
    [mode, request, target],
  );
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        await reload();
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "โหลดทะเบียนไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
    // Load once per mounted workspace; explicit reload preserves the selected school.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!target || mode !== "connected" || pane === "subscribe") return;
    const controller = new AbortController();
    let active = true;
    request(
      `/api/students?${new URLSearchParams({ view: "directory", directoryId: target, page: String(page), status })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw new Error(body.error?.messageTh ?? "โหลดรายชื่อไม่สำเร็จ");
        if (active) setPeople(body.data);
      })
      .catch((e) => {
        if (active && !controller.signal.aborted) {
          setPeople(null);
          setError(e instanceof Error ? e.message : "โหลดรายชื่อไม่สำเร็จ");
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [target, page, status, pane, tick, request, mode]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function subscribe() {
    if (!directory || !subscription) return;
    await run(async () => {
      await command({
        action: "subscribe",
        directoryId: directory.id,
        revision: subscription.revision,
        classrooms: classes,
        consent: true,
        includeExcluded: restoreExcluded,
        adoptCodes: adopt
          ? subscription.conflicts
              .filter((c) => c.canAdopt)
              .map((c) => c.studentCode)
          : [],
      });
      setSubscription(null);
      await reload();
      onChanged();
      notify("อัปเดตรายชื่อและติดตามห้องแล้ว");
    });
  }
  async function managePending() {
    if (!pending || !directory) return;
    await run(async () => {
      await command({
        action: "directory_manage",
        directoryId: directory.id,
        revision: directory.revision,
        operation: pending.operation,
        ...(pending.student
          ? { studentId: pending.student.id }
          : { userId: pending.member?.userId }),
      });
      setPending(null);
      await reload();
      onChanged();
    });
  }
  const choose = (id: string) => {
    const d = options?.directories.find((d) => d.id === id);
    setTarget(id);
    setClasses(d?.selectedClasses ?? []);
    setPage(0);
    setPeople(null);
    if (d) {
      setYear(d.academic_year);
      setTerm(d.term);
    }
  };
  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
        title="ทะเบียนโรงเรียน"
      >
        <div className="roster-directory">
          {error && <Notice tone="error">{error}</Notice>}
          {loading ? (
            <p role="status">กำลังโหลดทะเบียน…</p>
          ) : (
            <>
              {options?.directories.length ? (
                <label>
                  โรงเรียน
                  <select
                    disabled={busy}
                    value={target}
                    onChange={(e) => choose(e.target.value)}
                  >
                    {options.directories.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <Notice>
                  {mode === "demo"
                    ? "ทะเบียนโรงเรียนใช้งานเมื่อเข้าสู่ระบบจริง"
                    : "ยังไม่มีทะเบียนโรงเรียนที่คุณมีสิทธิ์เข้าถึง"}
                </Notice>
              )}
              {options?.canCreate && (
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setCreate(!create)}
                >
                  <Plus size={16} />
                  สร้างทะเบียนโรงเรียน
                </button>
              )}
              {create && (
                <form
                  className="roster-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const d = await command<{ id: string }>({
                        action: "directory_create",
                        name,
                        year,
                        term,
                      });
                      setCreate(false);
                      await reload(d.id);
                    });
                  }}
                >
                  <label>
                    ชื่อโรงเรียน
                    <input
                      value={name}
                      maxLength={120}
                      required
                      onChange={(e) => setName(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      ปีการศึกษา
                      <input
                        type="number"
                        min={2500}
                        max={2700}
                        value={year}
                        required
                        onChange={(e) => setYear(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      ภาคเรียน
                      <select
                        value={term}
                        onChange={(e) => setTerm(Number(e.target.value))}
                      >
                        {[1, 2, 3].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button className="btn btn-primary" disabled={busy}>
                    สร้างทะเบียน
                  </button>
                </form>
              )}
              {directory && (
                <>
                  <p className="small muted">
                    ภาคเรียน {directory.term} / {directory.academic_year}
                  </p>
                  {directory.canManage && (
                    <WorkspaceTabs
                      value={pane}
                      onChange={(value) => {
                        setPane(value);
                        setPage(0);
                      }}
                      items={[
                        { id: "subscribe", label: "เลือกห้อง" },
                        { id: "manage", label: "จัดการทะเบียน" },
                        { id: "access", label: "สิทธิ์ครู" },
                      ]}
                    />
                  )}
                  {pane === "subscribe" && (
                    <>
                      <Notice>
                        ติดตามรายชื่อปัจจุบันของห้องที่เลือก
                        ชื่อและชั้นอัปเดตตามโรงเรียน
                      </Notice>
                      <fieldset className="roster-class-options">
                        <legend>ห้องที่ต้องการ</legend>
                        {directory.classrooms.length ? (
                          directory.classrooms.map((c) => (
                            <label className="checkbox-label" key={c.name}>
                              <input
                                type="checkbox"
                                disabled={busy}
                                checked={classes.includes(c.name)}
                                onChange={(e) =>
                                  setClasses((old) =>
                                    e.target.checked
                                      ? [...old, c.name]
                                      : old.filter((v) => v !== c.name),
                                  )
                                }
                              />
                              <span>{c.name}</span>
                              <Badge>{c.count} คน</Badge>
                            </label>
                          ))
                        ) : (
                          <p className="muted">ยังไม่มีรายชื่อในทะเบียนนี้</p>
                        )}
                      </fieldset>
                      <div className="dialog-actions">
                        <button
                          className="btn btn-secondary"
                          onClick={onClose}
                          disabled={busy}
                        >
                          ปิด
                        </button>
                        <button
                          className="btn btn-primary"
                          disabled={busy || !directory.classrooms.length}
                          onClick={() =>
                            void run(async () => {
                              setSubscription(
                                await command<SubscriptionPreview>({
                                  action: "preview_subscribe",
                                  directoryId: directory.id,
                                  classrooms: classes,
                                }),
                              );
                              setAdopt(false);
                              setRestoreExcluded(false);
                            })
                          }
                        >
                          <School size={16} />
                          ตรวจรายชื่อที่จะดึง
                        </button>
                      </div>
                    </>
                  )}
                  {pane === "manage" && directory.canManage && (
                    <>
                      <div className="roster-tools-row">
                        <button
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => setEditing("new")}
                        >
                          <Plus size={16} />
                          เพิ่มนักเรียน
                        </button>
                        <Link
                          className="btn btn-secondary"
                          href={`/students/import?directory=${directory.id}`}
                        >
                          <Upload size={16} />
                          นำเข้าไฟล์
                        </Link>
                        <button
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              setSeed(
                                await command<RosterPlan>({
                                  action: "directory_from_workspace",
                                  directoryId: directory.id,
                                }),
                              );
                            })
                          }
                        >
                          ใช้รายชื่อในพื้นที่ของฉัน
                        </button>
                      </div>
                      <div className="form-grid">
                        <label>
                          ปีการศึกษา
                          <input
                            type="number"
                            min={2500}
                            max={2700}
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                          />
                        </label>
                        <label>
                          ภาคเรียน
                          <select
                            value={term}
                            onChange={(e) => setTerm(Number(e.target.value))}
                          >
                            {[1, 2, 3].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <button
                        className="btn btn-secondary"
                        disabled={
                          busy ||
                          (year === directory.academic_year &&
                            term === directory.term)
                        }
                        onClick={() =>
                          void run(async () => {
                            await command({
                              action: "directory_manage",
                              operation: "period",
                              directoryId: directory.id,
                              revision: directory.revision,
                              year,
                              term,
                            });
                            await reload();
                          })
                        }
                      >
                        บันทึกปีและภาคเรียน
                      </button>
                      <label>
                        รายชื่อ
                        <select
                          value={status}
                          onChange={(e) => {
                            setStatus(e.target.value);
                            setPage(0);
                          }}
                        >
                          <option value="active">ใช้งานอยู่</option>
                          <option value="inactive">นำออกแล้ว</option>
                        </select>
                      </label>
                      <div
                        className="table-scroll"
                        role="region"
                        aria-label="รายชื่อทะเบียนโรงเรียน"
                        tabIndex={0}
                      >
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>รหัส</th>
                              <th>ชื่อ-สกุล</th>
                              <th>ชั้น</th>
                              <th>
                                <span className="sr-only">จัดการ</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {people?.students.map((s) => (
                              <tr key={s.id}>
                                <td>{s.student_code}</td>
                                <td>
                                  {s.prefix}
                                  {s.first_name} {s.last_name}
                                </td>
                                <td>{s.classroom_name}</td>
                                <td>
                                  <div className="roster-row-actions">
                                    <button
                                      className="icon-button"
                                      disabled={busy}
                                      aria-label={`แก้ทะเบียน ${s.student_code}`}
                                      onClick={() => setEditing(s)}
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button
                                      className="icon-button"
                                      disabled={busy}
                                      aria-label={`${status === "active" ? "นำออกจากทะเบียน" : "คืนทะเบียน"} ${s.student_code}`}
                                      onClick={() =>
                                        setPending({
                                          operation:
                                            status === "active"
                                              ? "archive"
                                              : "restore",
                                          student: s,
                                        })
                                      }
                                    >
                                      {status === "active" ? (
                                        <Trash2 size={16} />
                                      ) : (
                                        <RotateCcw size={16} />
                                      )}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="roster-pagination">
                        <span>
                          {people?.total ?? 0} คน · หน้า {page + 1}
                        </span>
                        <button
                          className="btn btn-secondary"
                          disabled={page === 0}
                          onClick={() => setPage((v) => v - 1)}
                        >
                          ก่อนหน้า
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={(page + 1) * 50 >= (people?.total ?? 0)}
                          onClick={() => setPage((v) => v + 1)}
                        >
                          ถัดไป
                        </button>
                      </div>
                    </>
                  )}
                  {pane === "access" && directory.canManage && (
                    <>
                      <Notice>
                        ให้สิทธิ์เฉพาะครูของโรงเรียนนี้ การเข้าสู่ระบบ Google
                        ไม่ได้ให้สิทธิ์ทะเบียนกลางเอง
                      </Notice>
                      {options?.canCreate && (
                        <div className="roster-form">
                          <label>
                            ครูที่ได้รับอนุมัติ
                            <select
                              value={account}
                              onChange={(e) => setAccount(e.target.value)}
                              disabled={busy}
                            >
                              <option value="">เลือกครูของโรงเรียนนี้</option>
                              {options.accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name || a.email} · {a.email}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="btn btn-primary"
                            disabled={busy || !account}
                            onClick={() =>
                              void run(async () => {
                                await command({
                                  action: "directory_manage",
                                  operation: "grant",
                                  directoryId: directory.id,
                                  revision: directory.revision,
                                  userId: account,
                                  role: "teacher",
                                });
                                setAccount("");
                                await reload();
                              })
                            }
                          >
                            ให้สิทธิ์ทะเบียนโรงเรียนนี้
                          </button>
                        </div>
                      )}
                      <ul className="roster-member-list">
                        {people?.members.map((m) => (
                          <li key={m.userId}>
                            <div>
                              <strong>{m.name || m.email}</strong>
                              <span>
                                {m.email} ·{" "}
                                {m.role === "manager" ? "ผู้ดูแล" : "ครู"} ·{" "}
                                {m.active ? "ใช้งาน" : "ยกเลิกสิทธิ์"}
                              </span>
                            </div>
                            {options?.canCreate &&
                              m.active &&
                              m.role !== "manager" && (
                                <button
                                  className="btn btn-ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    setPending({
                                      operation: "revoke",
                                      member: m,
                                    })
                                  }
                                >
                                  ยกเลิกสิทธิ์
                                </button>
                              )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </Modal>
      {editing && directory && (
        <StudentForm
          key={editing === "new" ? "new-directory" : editing.id}
          student={editing === "new" ? undefined : editing}
          directoryId={directory.id}
          classrooms={directory.classrooms.map((c) => c.name)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void run(async () => {
              await reload();
              onChanged();
              notify("บันทึกทะเบียนโรงเรียนแล้ว");
            });
          }}
        />
      )}
      <Modal
        open={Boolean(seed)}
        onOpenChange={(open) => {
          if (!open && !busy) setSeed(null);
        }}
        title="นำรายชื่อเข้าทะเบียนกลาง"
      >
        <Notice tone="warning">
          ครูที่ได้รับสิทธิ์โรงเรียนนี้จะเห็นรายชื่อ
          และรายชื่อที่ผูกไว้จะอัปเดตตามข้อมูลกลาง
        </Notice>
        <p>
          ตรวจแล้ว {seed?.rows.length ?? 0} คน · เพิ่ม{" "}
          {seed?.rows.filter((r) => r.status === "add").length ?? 0} · อัปเดต{" "}
          {seed?.rows.filter(
            (r) => r.status === "update" || r.status === "restore",
          ).length ?? 0}
        </p>
        <ul className="roster-confirm-list">
          {seed?.rows.slice(0, 5).map((r) => (
            <li key={r.after.student_code}>
              {r.after.student_code} · {r.after.prefix}
              {r.after.first_name} {r.after.last_name} ·{" "}
              {r.after.classroom_name}
            </li>
          ))}
        </ul>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setSeed(null)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !seed}
            onClick={() =>
              void run(async () => {
                await command({
                  action: "apply_plan",
                  planId: seed!.planId,
                  directory: true,
                  consent: true,
                });
                setSeed(null);
                await reload();
              })
            }
          >
            ยืนยันนำเข้าทะเบียนกลาง
          </button>
        </div>
      </Modal>
      <Modal
        open={Boolean(subscription)}
        onOpenChange={(open) => {
          if (!open && !busy) setSubscription(null);
        }}
        title="ยืนยันติดตามรายชื่อ"
      >
        <p>{classes.length ? classes.join(" · ") : "ยกเลิกการติดตามทุกห้อง"}</p>
        <Notice>
          รายชื่อปัจจุบันตามทะเบียนโรงเรียน ข้อสอบและคะแนนเก่าไม่เปลี่ยน
        </Notice>
        <p>
          {subscription?.total ?? 0} คน · เพิ่มใหม่ {subscription?.added ?? 0}{" "}
          คน
        </p>
        {!!subscription?.conflicts.length && (
          <>
            <Notice tone="warning">
              มีรหัสตรงกับข้อมูลของคุณ {subscription.conflicts.length} คน
              จะคงข้อมูลของคุณไว้ เว้นแต่เลือกใช้ข้อมูลกลาง
            </Notice>
            <ul className="roster-confirm-list">
              {subscription.conflicts.map((c) => (
                <li key={c.studentCode}>
                  <strong>{c.studentCode}</strong> · {c.before.prefix}
                  {c.before.first_name} {c.before.classroom_name}
                  <br />
                  ข้อมูลกลาง: {c.after.prefix}
                  {c.after.first_name} {c.after.classroom_name}
                </li>
              ))}
            </ul>
            {subscription.conflicts.some((c) => c.canAdopt) && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={adopt}
                  onChange={(e) => setAdopt(e.target.checked)}
                />
                ใช้ข้อมูลกลางแทนรายการส่วนตัวที่รหัสตรงกัน
              </label>
            )}
          </>
        )}
        {!!subscription?.excluded && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={restoreExcluded}
              onChange={(e) => setRestoreExcluded(e.target.checked)}
            />
            คืนรายชื่อที่เคยนำออก {subscription.excluded} คน
          </label>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setSubscription(null)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !subscription}
            onClick={() => void subscribe()}
          >
            {busy ? "กำลังอัปเดต…" : "ยืนยันติดตามห้อง"}
          </button>
        </div>
      </Modal>
      <Modal
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
        title={
          pending?.operation === "revoke"
            ? "ยกเลิกสิทธิ์ทะเบียน"
            : pending?.operation === "restore"
              ? "คืนรายชื่อเข้าทะเบียน"
              : "นำออกจากทะเบียนกลาง"
        }
      >
        <p>
          {pending?.member?.email ??
            `${pending?.student?.student_code ?? ""} ${pending?.student?.first_name ?? ""} ${pending?.student?.last_name ?? ""}`}
        </p>
        <Notice tone="warning">
          มีผลกับการอัปเดตทะเบียนของครูที่เกี่ยวข้อง แต่ไม่ลบข้อสอบหรือคะแนนเก่า
        </Notice>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setPending(null)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() => void managePending()}
          >
            ยืนยัน
          </button>
        </div>
      </Modal>
    </>
  );
}
