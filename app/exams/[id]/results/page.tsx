import { Results } from "@/components/export/export-panel";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Results initialExamId={id} />;
}
