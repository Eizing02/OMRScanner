"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, RefreshCw, Save, Upload, Eye } from "lucide-react";
import { z } from "zod";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { useAuth } from "@/components/layout/auth-provider";
import {
  PageHeading,
  Notice,
  Badge,
  Modal,
  EmptyState,
} from "@/components/ui/primitives";
import {
  accessContextSchema,
  accessDecisionSchema,
  type AccessStatus,
  type ManagedUser,
} from "@/types/access";
import {
  defaultWorkspaceSettings,
  updateWorkspaceSchema,
  type SchoolBranding,
} from "@/types/school";
import { DEFAULT_SCHOOL_LOGO } from "@/lib/omr/logo-image";

const statusLabels: Record<AccessStatus, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
  suspended: "ระงับการใช้งาน",
};
const statusTones = {
  pending: "amber",
  approved: "green",
  rejected: "red",
  suspended: "red",
} as const;
const decisionLabels = {
  approved: "อนุมัติการใช้งาน",
  rejected: "ไม่อนุมัติการใช้งาน",
  suspended: "ระงับการใช้งาน",
} as const;
const managedUsersSchema = z.array(
  accessContextSchema.extend({
    createdAt: z.string(),
    reviewedAt: z.string().nullable(),
  }),
);

export default function Settings() {
  const workspace = useWorkspace();
  const auth = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState("");
  const { branding, mode, readOnly } = workspace;
  const settings = branding.settings ?? defaultWorkspaceSettings;
  return (
    <>
      <PageHeading title="การตั้งค่าระบบ" />
      <div className="settings-stack">
        <section
          className="panel settings-section"
          aria-labelledby="account-settings-title"
        >
          <div className="section-title">
            <h2 id="account-settings-title">บัญชีที่เข้าสู่ระบบ</h2>
            <Badge tone={mode === "connected" ? "blue" : "amber"}>
              {mode === "connected"
                ? "บัญชีของคุณ"
                : mode === "demo"
                  ? "ข้อมูลทดลองในเครื่อง"
                  : "ยังไม่ตั้งค่าการเชื่อมต่อ"}
            </Badge>
          </div>
          {accountError && <Notice tone="error">{accountError}</Notice>}
          {auth.access ? (
            <div className="settings-account-row">
              <div className="settings-account-details">
                <strong>{auth.access.displayName || auth.access.email}</strong>
                <span>{auth.access.email}</span>
                <div>
                  <Badge tone={statusTones[auth.access.status]}>
                    {statusLabels[auth.access.status]}
                  </Badge>
                  {auth.access.role === "owner" && (
                    <Badge tone="blue">เจ้าของระบบ</Badge>
                  )}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  setAccountError("");
                  try {
                    await auth.signOut();
                    router.replace("/login");
                  } catch (error) {
                    setAccountError(
                      error instanceof Error
                        ? error.message
                        : "ออกจากระบบไม่สำเร็จ กรุณาลองใหม่",
                    );
                  } finally {
                    setSigningOut(false);
                  }
                }}
              >
                <LogOut size={16} />
                {signingOut ? "กำลังออกจากระบบ…" : "ออกจากระบบ"}
              </button>
            </div>
          ) : (
            <p className="muted">
              โหมดทดลองไม่มีบัญชีผู้ใช้ ข้อมูลนี้ไม่ได้บันทึกใน Supabase
              และไม่ใช้ตรวจสิทธิ์จริง
            </p>
          )}
        </section>
        <WorkspaceSettingsEditor
          key={`${branding.school}:${JSON.stringify(settings)}`}
          branding={branding}
        />
        {auth.access?.role === "owner" && mode === "connected" && !readOnly && (
          <UserAccessManager />
        )}
      </div>
    </>
  );
}

function WorkspaceSettingsEditor({ branding }: { branding: SchoolBranding }) {
  const {
    mode,
    readOnly,
    saveSettings,
    notify,
    uploadSchoolLogo,
    canUploadLogo,
    brandingError,
    refreshBranding,
    cleanupLogos,
  } = useWorkspace();
  const { access } = useAuth();
  const settings = branding.settings ?? defaultWorkspaceSettings;
  const [school, setSchool] = useState(branding.school);
  const [academicYear, setAcademicYear] = useState(settings.academicYear);
  const [term, setTerm] = useState(settings.term);
  const [subjectsText, setSubjectsText] = useState(
    settings.subjects.join("\n"),
  );
  const [busy, setBusy] = useState<
    "save" | "upload" | "bundled" | "cleanup" | "refresh" | null
  >(null);
  const [error, setError] = useState("");
  const disabled = readOnly || mode === "unconfigured" || Boolean(busy);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const subjects = [
      ...new Set(
        subjectsText
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const parsed = updateWorkspaceSchema.safeParse({
      school,
      settings: { academicYear, term, subjects },
    });
    if (!parsed.success) {
      setError(
        "ตรวจสอบชื่อโรงเรียน ปีการศึกษา 2500–2700 และวิชาไม่เกิน 50 รายการ (รายการละไม่เกิน 80 ตัวอักษร)",
      );
      return;
    }
    setBusy("save");
    try {
      await saveSettings(parsed.data);
      notify(
        mode === "demo"
          ? "บันทึกการตั้งค่าในพื้นที่ทดลองแล้ว"
          : "บันทึกการตั้งค่าพื้นที่ของคุณแล้ว",
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่",
      );
    } finally {
      setBusy(null);
    }
  }
  async function upload(file: File, source: "upload" | "bundled" = "upload") {
    setBusy(source);
    setError("");
    try {
      await uploadSchoolLogo(file);
      notify("ใช้โลโก้ต้นฉบับแล้ว · พิมพ์ใหม่จะใช้ภาพล่าสุด");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "อัปโหลดโลโก้ไม่สำเร็จ กรุณาเลือกภาพใหม่",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section
      className="panel settings-section"
      aria-labelledby="workspace-settings-title"
    >
      <div className="section-title">
        <h2 id="workspace-settings-title">โรงเรียนและค่าเริ่มต้นชุดสอบ</h2>
        {readOnly && <Badge tone="amber">อ่านอย่างเดียว</Badge>}
      </div>
      {(error || brandingError) && (
        <Notice tone="error">{error || brandingError}</Notice>
      )}
      <form onSubmit={save}>
        <fieldset className="settings-fields" disabled={disabled}>
          <div className="form-grid">
            <label className="span-two">
              ชื่อโรงเรียน
              <input
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                maxLength={60}
                required
              />
            </label>
            <label>
              ปีการศึกษาเริ่มต้น
              <input
                type="number"
                value={academicYear}
                onChange={(e) => setAcademicYear(Number(e.target.value))}
                min={2500}
                max={2700}
                required
              />
            </label>
            <label>
              ภาคเรียนเริ่มต้น
              <select
                value={term}
                onChange={(e) => setTerm(Number(e.target.value))}
              >
                <option value={1}>ภาคเรียนที่ 1</option>
                <option value={2}>ภาคเรียนที่ 2</option>
                <option value={3}>ภาคฤดูร้อน</option>
              </select>
            </label>
            <label className="span-two">
              วิชาที่ใช้บ่อย
              <textarea
                aria-label="วิชาที่ใช้บ่อย"
                value={subjectsText}
                onChange={(e) => setSubjectsText(e.target.value)}
                rows={4}
                placeholder="พิมพ์หนึ่งวิชาต่อบรรทัด เช่น ภาษาไทย"
                aria-describedby="subjects-settings-help"
              />
              <small id="subjects-settings-help">
                ไม่เกิน 50 วิชา ใช้เป็นตัวเลือกตอนสร้างชุดสอบ ชั้น /
                ห้องจะมาจากรายชื่อนักเรียนที่นำเข้าเท่านั้น
              </small>
            </label>
          </div>
          <div className="settings-form-actions">
            <button className="btn btn-primary" type="submit">
              <Save size={16} />
              {busy === "save" ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
            </button>
          </div>
        </fieldset>
      </form>
      <div className="settings-logo-section">
        <h3>โลโก้โรงเรียน</h3>
        <div className="settings-logo-row">
          <div className="settings-logo-preview">
            {branding.image_url ? (
              <Image
                src={branding.image_url}
                width={104}
                height={104}
                unoptimized
                alt="โลโก้โรงเรียนปัจจุบัน"
              />
            ) : (
              <span className="muted">ยังไม่มีโลโก้</span>
            )}
          </div>
          <div className="settings-logo-controls">
            <p>
              เก็บไฟล์ PNG / JPG ต้นฉบับใน Supabase Storage ไม่บีบอัดหรือย่อไฟล์
              ปรับเฉพาะขนาดที่แสดงบนกระดาษ
            </p>
            <label className="settings-logo-upload">
              <Upload size={16} aria-hidden="true" />
              {busy === "upload" || busy === "bundled"
                ? "กำลังอัปโหลด…"
                : "อัปโหลดโลโก้โรงเรียน"}
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={disabled || !canUploadLogo}
                aria-label="อัปโหลดโลโก้โรงเรียน"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </label>
            <p className="settings-help">
              ไม่เกิน 5 MB และ 20 ล้านพิกเซล เมื่อเปลี่ยนภาพ
              ระบบจะลบภาพเก่าหลังบันทึกภาพใหม่สำเร็จ
              ข้อสอบชุดเดิมที่พิมพ์ใหม่ใช้โลโก้ล่าสุด แต่ PDF
              ที่ดาวน์โหลดไว้ไม่เปลี่ยน
            </p>
            {access?.role === "owner" && !readOnly && (
              <button
                className="btn btn-secondary"
                disabled={disabled || !canUploadLogo}
                onClick={async () => {
                  setBusy("bundled");
                  setError("");
                  try {
                    const response = await fetch(DEFAULT_SCHOOL_LOGO);
                    if (!response.ok)
                      throw new Error(
                        "อ่านไฟล์โลโก้ที่แนบไม่สำเร็จ กรุณาอัปโหลดจากเครื่อง",
                      );
                    await upload(
                      new File([await response.blob()], "school-logo.png", {
                        type: "image/png",
                      }),
                      "bundled",
                    );
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "อ่านโลโก้ไม่สำเร็จ",
                    );
                    setBusy(null);
                  }
                }}
              >
                ใช้โลโก้โรงเรียนที่แนบไว้
              </button>
            )}
            {brandingError && !readOnly && (
              <button
                className="btn btn-secondary"
                disabled={Boolean(busy)}
                onClick={async () => {
                  setBusy("refresh");
                  setError("");
                  try {
                    await refreshBranding();
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "โหลดข้อมูลโรงเรียนไม่สำเร็จ",
                    );
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <RefreshCw size={16} />
                โหลดข้อมูลโรงเรียนอีกครั้ง
              </button>
            )}
          </div>
        </div>
        {Boolean(branding.cleanupPending) && (
          <Notice tone="warning">
            มีภาพเก่ารอลบ {branding.cleanupPending} ไฟล์ ภาพล่าสุดยังใช้งานได้{" "}
            {!readOnly && (
              <button
                className="btn btn-secondary"
                disabled={Boolean(busy)}
                onClick={async () => {
                  setBusy("cleanup");
                  setError("");
                  try {
                    await cleanupLogos();
                    notify("ตรวจสอบรายการลบภาพเก่าแล้ว");
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "ลบภาพเก่าไม่สำเร็จ กรุณาลองใหม่",
                    );
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "cleanup"
                  ? "กำลังลบภาพเก่า…"
                  : "ลองลบภาพเก่าอีกครั้ง"}
              </button>
            )}
          </Notice>
        )}
      </div>
    </section>
  );
}

function UserAccessManager() {
  const { request, notify } = useWorkspace();
  const { access, inspectWorkspace } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [decision, setDecision] = useState<{
    user: ManagedUser;
    status: "approved" | "rejected" | "suspended";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [saving, setSaving] = useState(false);
  const fetchUsers = useCallback(async () => {
    const response = await request("/api/admin/users");
    const body = await response.json();
    if (!response.ok)
      throw new Error(
        body.error?.messageTh ?? "โหลดบัญชีไม่สำเร็จ กรุณาลองใหม่",
      );
    return managedUsersSchema.parse(body.data);
  }, [request]);
  useEffect(() => {
    let active = true;
    queueMicrotask(async () => {
      if (!active) return;
      setLoading(true);
      setError("");
      try {
        const next = await fetchUsers();
        if (active) setUsers(next);
      } catch (error) {
        if (active)
          setError(
            error instanceof Error ? error.message : "โหลดบัญชีไม่สำเร็จ",
          );
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [fetchUsers]);
  async function reload() {
    setLoading(true);
    setError("");
    try {
      setUsers(await fetchUsers());
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "โหลดบัญชีไม่สำเร็จ กรุณาลองใหม่",
      );
    } finally {
      setLoading(false);
    }
  }
  async function confirmDecision(event: FormEvent) {
    event.preventDefault();
    if (!decision) return;
    const parsed = accessDecisionSchema.safeParse({
      userId: decision.user.userId,
      status: decision.status,
      reason,
    });
    if (!parsed.success) {
      setDecisionError(
        "กรุณาระบุเหตุผล 3–300 ตัวอักษรเพื่อเก็บประวัติการเปลี่ยนสิทธิ์",
      );
      return;
    }
    setSaving(true);
    setDecisionError("");
    try {
      const response = await request(
        "/api/admin/users",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
        true,
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.messageTh ?? "เปลี่ยนสิทธิ์ไม่สำเร็จ กรุณาลองใหม่",
        );
      setDecision(null);
      notify(`เปลี่ยนสิทธิ์เป็น “${statusLabels[decision.status]}” แล้ว`);
      await reload();
    } catch (error) {
      setDecisionError(
        error instanceof Error ? error.message : "เปลี่ยนสิทธิ์ไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }
  const visibleUsers = users.filter(
    (user) => filter === "all" || user.status === filter,
  );
  function chooseDecision(
    user: ManagedUser,
    status: "approved" | "rejected" | "suspended",
  ) {
    setDecision({ user, status });
    setReason("");
    setDecisionError("");
  }
  return (
    <section
      className="panel settings-section settings-user-access"
      aria-labelledby="user-access-title"
    >
      <div className="section-title">
        <h2 id="user-access-title">อนุมัติและจัดการผู้ใช้</h2>
        <Badge tone="blue">สำหรับเจ้าของระบบ</Badge>
      </div>
      <p className="settings-help">
        บัญชี Google ใหม่เริ่มที่รออนุมัติ
        จนกว่าจะอนุมัติจะสร้างชุดสอบหรือเข้าถึงข้อมูลไม่ได้
        การระงับไม่ลบงานเดิมของผู้ใช้
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="settings-users-toolbar">
        <label>
          สถานะบัญชี
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-secondary"
          disabled={loading}
          onClick={reload}
        >
          <RefreshCw size={16} />
          {loading ? "กำลังโหลด…" : "โหลดรายชื่ออีกครั้ง"}
        </button>
      </div>
      {loading ? (
        <div
          className="settings-users-loading"
          aria-busy="true"
          aria-label="กำลังโหลดบัญชีผู้ใช้"
        >
          <div />
          <div />
          <div />
        </div>
      ) : !visibleUsers.length ? (
        <EmptyState
          title="ไม่มีบัญชีในสถานะนี้"
          description="บัญชีที่เข้าสู่ระบบด้วย Google จะปรากฏที่นี่เพื่อรอการอนุมัติ"
        />
      ) : (
        <div className="table-scroll">
          <table className="settings-users-table">
            <thead>
              <tr>
                <th scope="col">บัญชี Google</th>
                <th scope="col">สถานะ</th>
                <th scope="col">สิทธิ์และพื้นที่งาน</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.userId}>
                  <td>
                    <strong>{user.displayName || user.email}</strong>
                    <span className="settings-user-email">{user.email}</span>
                  </td>
                  <td>
                    <Badge tone={statusTones[user.status]}>
                      {statusLabels[user.status]}
                    </Badge>
                    {user.role === "owner" && (
                      <span className="settings-user-email">เจ้าของระบบ</span>
                    )}
                  </td>
                  <td>
                    {user.role === "owner" || user.userId === access?.userId ? (
                      <span className="muted">
                        ไม่สามารถเปลี่ยนสิทธิ์เจ้าของระบบ
                      </span>
                    ) : (
                      <div className="settings-user-actions">
                        {user.status !== "approved" && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => chooseDecision(user, "approved")}
                          >
                            อนุมัติ
                          </button>
                        )}
                        {user.status === "pending" && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => chooseDecision(user, "rejected")}
                          >
                            ไม่อนุมัติ
                          </button>
                        )}
                        {user.status === "approved" && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => chooseDecision(user, "suspended")}
                          >
                            ระงับการใช้งาน
                          </button>
                        )}
                        {user.schoolId ? (
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              inspectWorkspace(
                                user.schoolId,
                                `${user.displayName || "บัญชีผู้ใช้"} (${user.email})`,
                              );
                              router.push("/dashboard");
                            }}
                          >
                            <Eye size={16} />
                            เปิดดูงาน
                          </button>
                        ) : (
                          <span className="settings-help">
                            {user.status === "approved"
                              ? "พื้นที่งานจะสร้างเมื่อผู้ใช้เข้าสู่ระบบอีกครั้ง"
                              : "ยังไม่มีพื้นที่งาน"}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={Boolean(decision)}
        onOpenChange={(open) => {
          if (!open && !saving) setDecision(null);
        }}
        title={
          decision
            ? `${decisionLabels[decision.status]}บัญชีผู้ใช้`
            : "เปลี่ยนสิทธิ์บัญชี"
        }
        description="ตรวจสอบบัญชีและระบุเหตุผลก่อนยืนยัน การเปลี่ยนสิทธิ์จะบันทึกในประวัติระบบ"
      >
        {decision && (
          <form onSubmit={confirmDecision}>
            <p className="settings-decision-account">
              <strong>
                {decision.user.displayName || decision.user.email}
              </strong>
              <span>{decision.user.email}</span>
            </p>
            {decision.status === "suspended" && (
              <Notice tone="warning">
                บัญชีนี้จะเข้าใช้งานและบันทึกข้อมูลไม่ได้จนกว่าจะอนุมัติอีกครั้ง
                งานเดิมจะไม่ถูกลบ
              </Notice>
            )}
            {decisionError && <Notice tone="error">{decisionError}</Notice>}
            <label className="settings-reason-field">
              เหตุผล
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={3}
                maxLength={300}
                rows={3}
                required
                disabled={saving}
                placeholder="เช่น ตรวจสอบว่าเป็นครูของโรงเรียนแล้ว"
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => setDecision(null)}
              >
                ยกเลิก
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving || reason.trim().length < 3}
              >
                {saving
                  ? "กำลังบันทึก…"
                  : `ยืนยัน${decisionLabels[decision.status]}`}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
