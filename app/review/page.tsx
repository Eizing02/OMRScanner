import { ReviewCenter } from "@/components/review/review-answer-table";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item } = await searchParams;
  return <ReviewCenter key={item ?? "all"} initialItemId={item} />;
}
