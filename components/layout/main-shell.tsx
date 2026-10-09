"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  LayoutDashboard,
  Users,
  ScanLine,
  ClipboardCheck,
  FileBarChart2,
  Settings,
  ChevronDown,
  Bell,
  PanelLeftClose,
  Menu,
  X,
  School,
  FileCheck2,
  ArrowUpRight,
  FlaskConical,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { useAuth } from "./auth-provider";
import { Notice, Modal } from "@/components/ui/primitives";
import { AppLogo } from "./app-logo";
const nav = [
  { href: "/dashboard", title: "ภาพรวม", icon: LayoutDashboard },
  { href: "/exams", title: "คลังชุดสอบ", icon: BookOpen },
  { href: "/students", title: "นักเรียนและห้องเรียน", icon: Users },
  {
    href: "/exams/demo-math/omr-generate",
    title: "ออกแบบกระดาษคำตอบ",
    icon: FileCheck2,
  },
  { href: "/scan", title: "สแกนกระดาษคำตอบ", icon: ScanLine },
  { href: "/review", title: "ศูนย์ตรวจสอบ", icon: ClipboardCheck },
  { href: "/export", title: "ผลสอบและรายงาน", icon: FileBarChart2 },
];
export function MainShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [mobileNav, setMobileNav] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const main = useRef<HTMLElement>(null);
  const { mode, error, loading, reviews, exams, branding, notify } =
    useWorkspace();
  const auth = useAuth();
  useEffect(() => {
    const element = main.current;
    if (!element || !element.animate) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const transition = element.animate(
      reduced
        ? [{ opacity: 0.9 }, { opacity: 1 }]
        : [
            { opacity: 0.85, transform: "translateY(3px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
      { duration: reduced ? 80 : 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    return () => transition.cancel();
  }, [path]);
  const pending = reviews.filter((r) => r.status === "needs_review").length;
  const title =
    path === "/settings"
      ? "การตั้งค่า"
      : path.includes("omr-generate")
        ? "ออกแบบกระดาษคำตอบ"
        : path.includes("print")
          ? "ดูตัวอย่างก่อนพิมพ์"
          : (nav.find((n) => path.startsWith(n.href))?.title ?? "ชุดสอบ");
  if (path === "/login") return <>{children}</>;
  if (
    mode === "connected" &&
    (auth.loading ||
      auth.error ||
      !auth.access ||
      auth.access.status !== "approved")
  ) {
    const status = auth.access?.status;
    const message =
      status === "pending"
        ? "บัญชีของคุณกำลังรออนุมัติ"
        : status === "suspended"
          ? "บัญชีนี้ถูกระงับการใช้งาน"
          : status === "rejected"
            ? "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน"
            : "เข้าสู่ระบบเพื่อเปิดพื้นที่ส่วนตัว";
    return (
      <main className="login-page">
        <section className="account-gate panel">
          <AppLogo large />
          <h1>
            {auth.loading
              ? "กำลังตรวจสอบสิทธิ์…"
              : auth.error
                ? "ยังเปิดพื้นที่ทำงานไม่ได้"
                : message}
          </h1>
          {auth.loading ? (
            <p role="status">กำลังตรวจสอบบัญชี…</p>
          ) : (
            <>
              <p>
                {auth.error ||
                  (auth.access
                    ? "รอเจ้าของระบบอนุมัติก่อนใช้งาน"
                    : "ใช้บัญชี Google เพื่อเปิดพื้นที่ของคุณ")}
              </p>
              {auth.access && (
                <p className="small muted">บัญชี: {auth.access.email}</p>
              )}
              <div className="account-actions">
                {auth.access || auth.error ? (
                  <button
                    className="btn btn-primary"
                    onClick={() => void auth.refresh()}
                  >
                    ตรวจสอบสถานะอีกครั้ง
                  </button>
                ) : (
                  <Link className="btn btn-primary" href="/login">
                    เข้าสู่ระบบด้วย Google
                  </Link>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    void auth
                      .signOut()
                      .catch((error: Error) => notify(error.message))
                  }
                >
                  เปลี่ยนบัญชี / ออกจากระบบ
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }
  return (
    <div
      className={`app-shell ${path === "/scan" || path.endsWith("/scan") || path === "/review" || path.endsWith("/review") || path.includes("omr-generate") || path.endsWith("/print") || path === "/export" || path.endsWith("/results") ? "task-shell" : ""}`}
    >
      <a className="skip-link" href="#main">
        ข้ามไปเนื้อหาหลัก
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          onClick={() => setMobileNav(false)}
          aria-label="ปิดเมนู"
        />
      )}
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <div className="brand">
          <AppLogo decorative />
          <div>
            <strong>ScanSob</strong>
            <span>พื้นที่ทำงานของครู</span>
          </div>
          <button
            className="mobile-only icon-button"
            onClick={() => setMobileNav(false)}
            aria-label="ปิดเมนู"
          >
            <X size={20} />
          </button>
        </div>
        <div className="school-context">
          <School size={18} />
          <span>
            {branding.school}
            <small>ปีการศึกษา {branding.settings?.academicYear ?? 2569}</small>
          </span>
        </div>
        <nav aria-label="เมนูหลัก">
          {nav.map((item, i) => {
            const active =
              item.href === "/exams"
                ? path === "/exams" ||
                  path.includes("answer-key") ||
                  path === "/exams/new"
                : item.title === "ออกแบบกระดาษคำตอบ"
                  ? path.includes("omr-generate") || path.endsWith("/print")
                  : path.startsWith(item.href);
            return (
              <Link
                onClick={() => setMobileNav(false)}
                href={
                  item.title === "ออกแบบกระดาษคำตอบ"
                    ? exams[0]
                      ? `/exams/${exams[0].id}/omr-generate`
                      : "/exams"
                    : item.href
                }
                className={`nav-item ${active ? "active" : ""}`}
                key={item.title}
                aria-current={active ? "page" : undefined}
              >
                <item.icon size={20} />
                <span>{item.title}</span>
                {i === 5 && pending > 0 && (
                  <span className="nav-count">{pending}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <Link
            className={`nav-item ${path === "/settings" ? "active" : ""}`}
            aria-current={path === "/settings" ? "page" : undefined}
            href="/settings"
          >
            <Settings size={19} />
            การตั้งค่า
          </Link>
          <Link href="/settings" className="profile">
            <span className="avatar">ค</span>
            <span>
              <strong>
                {mode === "demo"
                  ? "ครูตัวอย่าง"
                  : auth.access?.displayName || auth.access?.email}
              </strong>
              <small>
                {mode === "demo"
                  ? "พื้นที่ทดลองส่วนตัว"
                  : auth.access?.role === "owner"
                    ? "เจ้าของระบบ"
                    : "พื้นที่ส่วนตัว"}
              </small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </aside>
      <div className="shell-body">
        <header className="app-header">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileNav(true)}
            aria-label="เปิดเมนู"
          >
            <Menu size={22} />
          </button>
          <span className="desktop-only header-mark">
            <PanelLeftClose size={19} />
          </span>
          <div className="breadcrumb">
            พื้นที่ทำงาน <span>/</span>
            <strong>{title}</strong>
          </div>
          <div className="header-right">
            <label className="term-select">
              <span className="sr-only">ภาคเรียน</span>
              <select
                value={branding.settings?.term ?? 1}
                onChange={() => undefined}
                aria-label="ภาคเรียนเริ่มต้น เปลี่ยนได้ในการตั้งค่า"
              >
                <option value={branding.settings?.term ?? 1}>
                  ภาคเรียนที่ {branding.settings?.term ?? 1} /{" "}
                  {branding.settings?.academicYear ?? 2569}
                </option>
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="icon-button notification-button"
              aria-label="การแจ้งเตือน"
              onClick={() => setNotifications(true)}
            >
              <Bell size={20} />
              {pending > 0 && <i />}
            </button>
          </div>
        </header>
        {mode === "demo" && (
          <div className="demo-banner">
            <FlaskConical size={15} />
            <span>โหมดตัวอย่าง · ข้อมูลสังเคราะห์</span>
          </div>
        )}
        {auth.readOnly && (
          <div className="inspection-banner" role="status">
            <span>
              กำลังเปิดดูพื้นที่ของ {auth.inspectionLabel} · อ่านอย่างเดียว ·
              ไม่มีสิทธิ์แก้ไข
            </span>
            <button
              className="text-button"
              onClick={() => auth.inspectWorkspace(null)}
            >
              กลับพื้นที่ของฉัน
            </button>
          </div>
        )}
        <main id="main" className="main-content" ref={main}>
          {mode === "unconfigured" && (
            <Notice tone="warning">
              ยังไม่ได้เชื่อม Supabase กรุณาตั้งค่าระบบก่อนบันทึกงานจริง{" "}
              <Link href="/settings">ดูวิธีตั้งค่า</Link>
            </Notice>
          )}
          {error && (
            <Notice tone="error">
              {error}{" "}
              <button
                className="text-button"
                onClick={() => window.location.reload()}
              >
                ลองใหม่
              </button>
            </Notice>
          )}
          {loading ? (
            <div className="loading-state" role="status">
              <span className="spinner" />
              กำลังโหลดข้อมูลโรงเรียน…
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="เมนูด่วนบนมือถือ">
        {[nav[0], nav[1], nav[4], nav[5]].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={path.startsWith(item.href) ? "active" : ""}
          >
            <item.icon size={20} />
            <span>
              {item.title.replace("กระดาษคำตอบ", "").replace("ศูนย์", "")}
            </span>
          </Link>
        ))}
      </nav>
      <Modal
        open={notifications}
        onOpenChange={setNotifications}
        title="การแจ้งเตือน"
      >
        <p>
          {pending
            ? `มี ${pending} รายการที่ต้องตรวจสอบ`
            : "ไม่มีรายการแจ้งเตือนใหม่"}
        </p>
        {pending > 0 && (
          <Link
            className="btn btn-primary"
            href="/review"
            onClick={() => setNotifications(false)}
          >
            เปิดศูนย์ตรวจสอบ
          </Link>
        )}
      </Modal>
    </div>
  );
}
