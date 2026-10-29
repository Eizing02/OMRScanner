import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const exchange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));
import { GET } from "@/app/auth/callback/route";
const site = "https://scansob.netlify.app";
const deploy = "https://6ae3351c95c208097f868f58--scansob.netlify.app";
beforeEach(() => {
  vi.stubEnv("SITE_ID", "00000000-0000-4000-8000-000000000001");
  vi.stubEnv("SITE_NAME", "scansob");
  vi.stubEnv("URL", site);
  exchange.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("OAuth callback keeps session navigation on the public Netlify site", () => {
  it("returns to the public dashboard after exchanging the code", async () => {
    const response = await GET(
      new Request(`${deploy}/auth/callback?code=synthetic-test-code`),
    );
    expect(exchange).toHaveBeenCalledWith("synthetic-test-code");
    expect(response.headers.get("location")).toBe(`${site}/dashboard`);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("preserves a safe in-app path and rejects an external redirect", async () => {
    const safe = await GET(
      new Request(
        `${deploy}/auth/callback?code=synthetic&next=${encodeURIComponent("/students?query=test")}`,
      ),
    );
    expect(safe.headers.get("location")).toBe(`${site}/students?query=test`);
    const unsafe = await GET(
      new Request(
        `${deploy}/auth/callback?code=synthetic&next=${encodeURIComponent("//evil.example")}`,
        { headers: { "x-forwarded-host": "evil.example" } },
      ),
    );
    expect(unsafe.headers.get("location")).toBe(`${site}/dashboard`);
  });
  it("offers a fresh login on the public site if a code is missing or invalid", async () => {
    const missing = await GET(new Request(`${deploy}/auth/callback`));
    expect(exchange).not.toHaveBeenCalled();
    expect(missing.headers.get("location")).toBe(`${site}/login?error=oauth`);
    exchange.mockResolvedValue({ error: { message: "test code expired" } });
    const invalid = await GET(
      new Request(`${deploy}/auth/callback?code=synthetic`),
    );
    expect(invalid.headers.get("location")).toBe(`${site}/login?error=oauth`);
  });
  it("retains normal local-server redirects without platform metadata", async () => {
    vi.stubEnv("SITE_ID", "");
    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=synthetic&next=/students",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/students",
    );
  });
});
