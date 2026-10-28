"use client";
import Link from "next/link";
import {
  ArrowRight,
  Plus,
  ScanLine,
  Check,
  FileCheck2,
  Clock3,
  Printer,
  ClipboardCheck,
  ArrowUpRight,
  BookOpen,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Badge, EmptyState, PageHeading } from "@/components/ui/primitives";
import { resolveGeometry } from "@/lib/omr/generate-template";
export const stageLabels = [
  "สร้างชุดสอบ",
  "ออกแบบ",
  "พิมพ์",
  "สแกน",
  "ตรวจสอบ",
  "พร้อมรายงาน",
];
export function ExamRoute({ stage }: { stage: number }) {
  return (
    <ol className="exam-route" aria-label="ความคืบหน้าชุดสอบ">
      {stageLabels.map((label, i) => (
        <li
          key={label}
          className={i < stage ? "complete" : i === stage ? "current" : ""}
        >
          <span className="route-node">
            {i < stage ? <Check size={13} /> : i + 1}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
export function Dashboard() {
  const { exams, recentReviews, reviewCount, getLayout } = useWorkspace();
  const active = exams.filter((e) => !e.archived);
  const pending = recentReviews;
  const focus = active.find((e) => e.stage === 4) ?? active[0];
  return (
    <>
      <PageHeading
        title="ภาพรวมงานตรวจสอบ"
        actions={
          <>
            <Link href="/scan" className="btn btn-secondary">
              <ScanLine size={18} />
              เริ่มสแกน
            </Link>
            <Link href="/exams/new" className="btn btn-primary">
              <Plus size={18} />
              สร้างชุดสอบ
            </Link>
          </>
        }
      />
      <div className="dashboard-summary">
        <span>
          <BookOpen size={18} />
          <strong>{active.length}</strong>ชุดสอบในพื้นที่ทำงาน
        </span>
        <span>
          <ClipboardCheck size={18} />
          <strong>{reviewCount}</strong>รายการรอตรวจสอบ
        </span>
        <span>
          <FileCheck2 size={18} />
          <strong>{active.filter((e) => e.stage === 5).length}</strong>
          ชุดสอบตรวจครบแล้ว
        </span>
        <span className="summary-date">
          {new Date().toLocaleDateString("th-TH", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "Asia/Bangkok",
          })}
        </span>
      </div>
      <div className="dashboard-grid">
        <section className="panel current-exam">
          <div className="section-title">
            <h2>ชุดสอบที่กำลังดำเนินการ</h2>
            <Link href="/exams">
              ดูทั้งหมด <ArrowUpRight size={15} />
            </Link>
          </div>
          {focus ? (
            <>
              <div className="focus-exam-heading">
                <span className="subject-icon">
                  <BookOpen size={26} />
                </span>
                <div>
                  <Badge tone="blue">
                    {focus.subject} · {focus.classroom}
                  </Badge>
                  <h3>{focus.title}</h3>
                  <p>
                    {focus.examType} · {focus.questionCount} ข้อ ·{" "}
                    {focus.answerKey.reduce((sum, key) => sum + key.points, 0)}{" "}
                    คะแนน · กระดาษ v.
                    {focus.version}
                  </p>
                </div>
                <Badge tone={focus.stage === 4 ? "amber" : "blue"}>
                  {stageLabels[focus.stage]}
                </Badge>
              </div>
              <ExamRoute stage={focus.stage} />
              <div className="exam-work-detail">
                <div>
                  <strong>
                    {focus.scanned} / {focus.students}
                  </strong>
                  <span>กระดาษที่สแกนแล้ว</span>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${focus.students ? (focus.scanned / focus.students) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <strong>{reviewCount} รายการ</strong>
                  <span>ต้องตรวจรอยฝนด้วยตา</span>
                </div>
              </div>
              <div className="panel-footer">
                <span>
                  <Clock3 size={15} />
                  {new Date(focus.updatedAt).toLocaleDateString("th-TH", {
                    timeZone: "Asia/Bangkok",
                  })}
                </span>
                <Link
                  href={
                    focus.stage >= 3
                      ? "/review"
                      : `/exams/${focus.id}/omr-generate`
                  }
                  className="btn btn-primary"
                >
                  {focus.stage >= 3 ? "ตรวจสอบผลต่อ" : "ออกแบบกระดาษคำตอบ"}
                  <ArrowRight size={17} />
                </Link>
              </div>
            </>
          ) : (
            <EmptyState
              title="เริ่มต้นด้วยชุดสอบแรก"
              description="สร้างชุดสอบแรกของคุณ"
            >
              <Link className="btn btn-primary" href="/exams/new">
                สร้างชุดสอบ
              </Link>
            </EmptyState>
          )}
        </section>
        <section className="panel priority-panel">
          <div className="section-title">
            <h2>คิวที่ต้องตรวจ</h2>
            <Badge tone="amber">{reviewCount} รายการ</Badge>
          </div>
          {pending.length ? (
            <div className="review-quick-list">
              {pending.slice(0, 3).map((r) => (
                <Link href={`/review?item=${r.id}`} key={r.id}>
                  <span className="paper-mini">
                    <FileCheck2 size={25} />
                    <i />
                  </span>
                  <div>
                    <strong>{r.name}</strong>
                    <span>
                      {r.studentCode} · {r.classroom}
                    </span>
                    <small>{r.reason}</small>
                  </div>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="ตรวจครบแล้ว"
              description="ไม่มีรายการที่ต้องตรวจสอบในตอนนี้"
            />
          )}
          <Link href="/review" className="btn btn-secondary full-width">
            เปิดศูนย์ตรวจสอบ
            <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <section className="panel recent-exams">
        <div className="section-title">
          <h2>ทำงานต่อกับชุดสอบ</h2>
          <Link href="/exams">
            เปิดคลังชุดสอบ
            <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="exam-short-list">
          {active.map((exam) => (
            <div className="exam-short-row" key={exam.id}>
              <span
                className={`subject-dot ${exam.subject === "วิทยาศาสตร์" ? "teal" : exam.subject === "ภาษาไทย" ? "purple" : ""}`}
              />
              <div>
                <Link href={`/exams/${exam.id}`}>{exam.title}</Link>
                <p>
                  {exam.subject} · {exam.classroom} · {exam.examType}
                </p>
              </div>
              <span className="desktop-only small muted">
                v.{exam.version} ·{" "}
                {resolveGeometry(getLayout(exam)).sheetsPerPage} ใบ / A4
              </span>
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
              <Link
                href={`/exams/${exam.id}/print`}
                className="icon-button"
                aria-label={`พิมพ์ ${exam.title}`}
              >
                <Printer size={19} />
              </Link>
              <Link
                href={`/exams/${exam.id}/omr-generate`}
                className="btn btn-secondary"
              >
                เปิดชุดสอบ
                <ArrowRight size={15} />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
