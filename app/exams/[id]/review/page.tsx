import { ReviewCenter } from "@/components/review/review-answer-table";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReviewCenter examId={id} />;
}
