import { ExamSummary } from "@/components/exams/exam-summary-card";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExamSummary id={id} />;
}
