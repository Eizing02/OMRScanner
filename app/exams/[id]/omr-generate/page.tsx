import { Designer } from "@/components/omr/omr-generate-panel";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Designer examId={(await params).id} />;
}
