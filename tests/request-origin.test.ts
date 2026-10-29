import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { requestBody } from "@/lib/supabase/api";
import {
  isRequestOriginAllowed,
  publicRequestOrigin,
} from "@/lib/supabase/request-origin";

const site = "https://scansob.netlify.app";
const deployment = "https://6ae3351c95c208097f868f58--scansob.netlify.app";
beforeEach(() => {
  vi.stubEnv("SITE_ID", "00000000-0000-4000-8000-000000000001");
  vi.stubEnv("SITE_NAME", "scansob");
  vi.stubEnv("URL", site);
});
afterEach(() => vi.unstubAllEnvs());
const sync = (origin: string, extra: Record<string, string> = {}) =>
  new Request(`${deployment}/api/students`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...extra },
    body: JSON.stringify({ action: "sync" }),
  });

describe("Netlify public site versus immutable deployment origin", () => {
  it("accepts the public site origin for the automatic workspace roster sync", async () => {
    await expect(requestBody(sync(site))).resolves.toEqual({ action: "sync" });
  });
  it("rejects an unrelated origin even with forged forwarded headers", async () => {
    await expect(
      requestBody(
        sync("https://evil.example", {
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "https",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).rejects.toMatchObject({ code: "ORIGIN_DENIED" });
  });
  it.each([
    "null",
    "https://other.netlify.app",
    "https://scansob.netlify.app.evil.example",
    "http://scansob.netlify.app",
    "https://scansob.netlify.app:444",
    "https://scansob.netlify.app/",
    `${site}, https://evil.example`,
    `${site}/@evil.example`,
  ])("rejects an untrusted or malformed browser origin: %s", (origin) => {
    expect(isRequestOriginAllowed(sync(origin))).toBe(false);
  });
  it("keeps exact direct-host and legacy no-Origin requests compatible", async () => {
    await expect(requestBody(sync(deployment))).resolves.toEqual({
      action: "sync",
    });
    const request = new Request(`${deployment}/api/students`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"action":"sync"}',
    });
    await expect(requestBody(request)).resolves.toEqual({ action: "sync" });
  });
  it("does not trust proxy headers or a generic URL variable outside Netlify", () => {
    vi.stubEnv("SITE_ID", "");
    expect(
      isRequestOriginAllowed(
        sync(site, {
          host: "scansob.netlify.app",
          "x-forwarded-host": "scansob.netlify.app",
        }),
      ),
    ).toBe(false);
    expect(publicRequestOrigin(sync(site))).toBe(deployment);
  });
  it.each([
    "invalid",
    "http://scansob.netlify.app",
    "https://user:password@scansob.netlify.app",
    `${site}/path`,
    `${site}?query=one`,
    `${site}#fragment`,
  ])("ignores invalid platform URL metadata: %s", (url) => {
    vi.stubEnv("URL", url);
    expect(isRequestOriginAllowed(sync(site))).toBe(false);
  });
  it("allows the exact owned default domain alongside a custom primary domain", () => {
    vi.stubEnv("URL", "https://exam.school.example");
    expect(isRequestOriginAllowed(sync("https://exam.school.example"))).toBe(
      true,
    );
    expect(isRequestOriginAllowed(sync(site))).toBe(true);
    expect(isRequestOriginAllowed(sync("https://other.netlify.app"))).toBe(
      false,
    );
    expect(
      publicRequestOrigin(
        new Request(`${deployment}/auth/callback`, {
          headers: { "x-forwarded-host": "scansob.netlify.app" },
        }),
      ),
    ).toBe(site);
  });
  it("redirects to the primary public URL and ignores forged unknown hosts", () => {
    expect(
      publicRequestOrigin(new Request(`${deployment}/auth/callback`)),
    ).toBe(site);
    for (const host of [
      "evil.example",
      "scansob.netlify.app.evil.example",
      "scansob.netlify.app, evil.example",
    ])
      expect(
        publicRequestOrigin(
          new Request(`${deployment}/auth/callback`, {
            headers: {
              host,
              "x-forwarded-host": host,
              "x-forwarded-proto": "http",
            },
          }),
        ),
      ).toBe(site);
  });
});
