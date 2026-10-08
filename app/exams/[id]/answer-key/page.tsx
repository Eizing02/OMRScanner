import { AnswerKey } from "@/components/exams/answer-key-editor";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AnswerKey id={(await params).id} />;
}
