import { ImportStudents } from "@/components/students/import-preview-table";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ directory?: string }>;
}) {
  const { directory } = await searchParams;
  return <ImportStudents directoryId={directory} />;
}
