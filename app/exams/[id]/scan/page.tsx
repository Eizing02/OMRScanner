import { Scanner } from "@/components/scanner/scanner-camera";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Scanner examId={id} />;
}
