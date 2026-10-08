import { context, failure, json } from "@/lib/supabase/api";
export async function GET() {
  try {
    const { schoolId, role, user } = await context();
    return json({ schoolId, role, userId: user.id });
  } catch (e) {
    return failure(e);
  }
}
