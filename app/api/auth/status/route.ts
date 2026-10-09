import { json } from "@/lib/supabase/api";
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return json({ configured: false, googleEnabled: false });
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const body = await response.json();
    return json({ configured: response.ok, googleEnabled: response.ok && body.external?.google === true });
  } catch { return json({ configured: true, googleEnabled: null }); }
}
