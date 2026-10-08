import { PrintPreview } from "@/components/export/report-preview";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <PrintPreview examId={(await params).id} />;
}
