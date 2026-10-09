import { accessContext, failure, json } from "@/lib/supabase/api";
export async function GET() {
  try {
    const { access } = await accessContext();
    return json(access);
  } catch (e) {
    return failure(e);
  }
}
