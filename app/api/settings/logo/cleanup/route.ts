import { context, failure, json, requestBody } from "@/lib/supabase/api";
import { cleanupOldLogos, readBranding } from "@/lib/supabase/school-logo";
export async function POST(request: Request) {
  try {
    const { db, schoolId } = await context(true);
    await requestBody(request);
    const complete = await cleanupOldLogos(db, schoolId);
    return json({ ...await readBranding(db, schoolId), cleanupWarning: !complete });
  } catch (error) { return failure(error); }
}
