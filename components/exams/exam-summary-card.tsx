"use client";
import Link from "next/link";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { PageHeading, EmptyState, Badge } from "@/components/ui/primitives";
import { ExamRoute } from "@/components/dashboard/dashboard-cards";
export function ExamSummary({ id }: { id: string }) {
  const { exams } = useWorkspace();
  const exam = exams.find((e) => e.id === id);
  if (!exam)
    return (
      <EmptyState
        title="ไม่พบชุดสอบ"
        description="เลือกชุดสอบที่มีอยู่ในพื้นที่ทำงาน"
      >
        <Link href="/exams" className="btn btn-primary">
          กลับคลังชุดสอบ
        </Link>
      </EmptyState>
    );
  return (
    <>
      <PageHeading
        title={exam.title}
        description={`${exam.subject} · ${exam.classroom} · ${exam.examType}`}
        actions={
          <Link className="btn btn-primary" href={`/exams/${id}/omr-generate`}>
            ออกแบบกระดาษคำตอบ
          </Link>
        }
      />
      <section className="panel form-panel">
        <Badge tone="blue">เวอร์ชัน {exam.version}</Badge>
        <ExamRoute stage={exam.stage} />
        <div className="detail-links">
          <Link href={`/exams/${id}/answer-key`}>ดูเฉลยและคะแนน</Link>
          <Link href={`/exams/${id}/print`}>ดูตัวอย่างก่อนพิมพ์</Link>
          <Link href="/scan">เริ่มสแกน</Link>
          <Link href="/review">ตรวจสอบผล</Link>
          <Link href="/export">ส่งออกคะแนน</Link>
        </div>
      </section>
    </>
  );
}
