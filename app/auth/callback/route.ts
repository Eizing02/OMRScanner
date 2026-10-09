import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/supabase/redirect";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = new URL(safeNextPath(url.searchParams.get("next")), url.origin);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const db = await createClient();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = NextResponse.redirect(destination);
        response.headers.set("Cache-Control", "private, no-store");
        return response;
      }
    } catch { /* Recover with a fresh OAuth attempt, never print tokens/errors. */ }
  }
  const response = NextResponse.redirect(new URL("/login?error=oauth", url.origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
