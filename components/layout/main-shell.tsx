"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
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
  CircleHelp,
  School,
  FileCheck2,
  ArrowUpRight,
  FlaskConical,
} from "lucide-react";
import { useWorkspace } from "./workspace-provider";
import { Notice, Modal } from "@/components/ui/primitives";
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
  const [help, setHelp] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const { mode, error, loading, reviews, exams } = useWorkspace();
  const pending = reviews.filter((r) => r.status === "needs_review").length;
  const title = path.includes("omr-generate")
    ? "ออกแบบกระดาษคำตอบ"
    : path.includes("print")
      ? "ดูตัวอย่างก่อนพิมพ์"
      : (nav.find((n) => path.startsWith(n.href))?.title ?? "ชุดสอบ");
  if (path === "/login") return <>{children}</>;
  return (
    <div className={`app-shell ${path === "/scan" ? "scanner-shell" : ""}`}>
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
          <span className="brand-icon">
            <FileCheck2 size={25} />
          </span>
          <div>
            <strong>Smart Answer Sheet</strong>
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
            {mode === "demo"
              ? "โรงเรียนตัวอย่างวิทยา"
              : "พื้นที่โรงเรียนของคุณ"}
            <small>ปีการศึกษา 2569</small>
          </span>
        </div>
        <nav aria-label="เมนูหลัก">
          {nav.map((item, i) => {
            const active =
              item.href === "/exams"
                ? path === "/exams" ||
                  path.includes("answer-key") ||
                  path === "/exams/new"
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
          <button className="nav-item" onClick={() => setHelp(true)}>
            <CircleHelp size={19} />
            คู่มือใช้งาน
          </button>
          <Link className="nav-item" href="/settings">
            <Settings size={19} />
            การตั้งค่า
          </Link>
          <Link href="/login" className="profile">
            <span className="avatar">ค</span>
            <span>
              <strong>
                {mode === "demo" ? "ครูตัวอย่าง" : "บัญชีผู้ใช้งาน"}
              </strong>
              <small>
                {mode === "demo"
                  ? "พื้นที่ทดลองส่วนตัว"
                  : "เข้าสู่ระบบ / บัญชี"}
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
              <select defaultValue="1">
                <option value="1">ภาคเรียนที่ 1 / 2569</option>
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
            <span>
              พื้นที่ทดลอง · ข้อมูลนักเรียนสังเคราะห์ ·
              บันทึกเฉพาะเบราว์เซอร์นี้
            </span>
            <Link href="/settings">ตั้งค่าระบบจริง</Link>
          </div>
        )}
        <main id="main" className="main-content">
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
      <Modal open={help} onOpenChange={setHelp} title="เริ่มงานตรวจข้อสอบ">
        <ol className="help-steps">
          <li>สร้างชุดสอบและกำหนดเฉลยครบทุกข้อ สูงสุด 60 ข้อ</li>
          <li>ดูพรีวิวใบเดียว ระบบจัด 2 ใบต่อ A4 หรือเต็ม A4 ตามพื้นที่</li>
          <li>พิมพ์ทดสอบที่ขนาดจริง 100% ก่อนพิมพ์ทั้งห้อง</li>
          <li>สแกนและตรวจรายการที่ระบบอ่านไม่ชัด</li>
          <li>ยืนยันคะแนนก่อนส่งออก</li>
        </ol>
        <Notice>
          ระบบสแกนและการพิมพ์ยังต้องผ่านการทดสอบกับเครื่องพิมพ์และโทรศัพท์จริง
        </Notice>
      </Modal>
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
