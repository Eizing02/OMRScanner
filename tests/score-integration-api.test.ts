import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({
  authenticated: true,
  readOnly: false,
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/api", async (original) => {
  const actual = await original<typeof import("@/lib/supabase/api")>();
  return {
    ...actual,
    context: async (write = false) => {
      if (!mock.authenticated)
        throw new actual.ApiError("UNAUTHENTICATED", "เข้าสู่ระบบ", 401);
      if (write && mock.readOnly)
        throw new actual.ApiError("READ_ONLY_WORKSPACE", "อ่านอย่างเดียว", 403);
      return {
        schoolId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        readOnly: mock.readOnly,
        user: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
        db: { rpc: mock.rpc },
      };
    },
  };
});
import { GET, POST } from "@/app/api/exams/[id]/publication/route";
import { POST as RUNNER } from "@/app/api/integrations/mathquest/dispatch/route";
import {
  POST as PAIR,
  PATCH as CONNECTION,
} from "@/app/api/integrations/mathquest/route";
const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  params = { params: Promise.resolve({ id }) };
const request = (body: unknown) =>
  new Request(`http://localhost/api/exams/${id}/publication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  mock.authenticated = true;
  mock.readOnly = false;
  mock.rpc.mockReset();
  vi.stubEnv("SCORE_INTEGRATION_ENABLED", "true");
  vi.stubEnv("MATHQUEST_RECEIVER_VERIFIED", "false");
  mock.rpc.mockImplementation(async (name) => ({
    data:
      name === "get_mathquest_status"
        ? {
            connection: null,
            publication: {
              state: "active",
              revision: 1,
              confirmed: 1,
              pending: 1,
              delivered: 0,
              unmatched: [],
              invalid: [],
              lastError: null,
              lastSyncAt: null,
            },
          }
        : { revision: 1 },
    error: null,
  }));
});
afterEach(() => vi.unstubAllEnvs());
describe("publication HTTP tenant and feature boundaries", () => {
  it("requires owner, explicit consent and a verified receiver for recovery", async () => {
    for (const input of [
      { action: "recover" },
      { action: "recover", consent: false },
      { action: "recover", consent: true, school_id: "spoof" },
    ])
      expect((await CONNECTION(request(input))).status).toBe(422);
    mock.readOnly = true;
    expect(
      (await CONNECTION(request({ action: "recover", consent: true }))).status,
    ).toBe(403);
    mock.readOnly = false;
    expect(
      (await CONNECTION(request({ action: "recover", consent: true }))).status,
    ).toBe(503);
    mock.authenticated = false;
    expect(
      (await CONNECTION(request({ action: "recover", consent: true }))).status,
    ).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("derives workspace from session, commits a job and never calls a not-ready receiver", async () => {
    const requestId = crypto.randomUUID();
    const response = await POST(
      request({ action: "publish", requestId, consent: true }),
      params,
    );
    expect(response.status).toBe(202);
    expect(mock.rpc).toHaveBeenCalledWith("command_mathquest_publication", {
      input: {
        school_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        exam_id: id,
        request_id: requestId,
        action: "publish",
        consent: true,
      },
    });
    expect((await response.json()).data.publication.pending).toBe(1);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("refuses client-supplied tenant/scores, missing consent and cross-origin bodies", async () => {
    const base = {
      action: "publish",
      requestId: crypto.randomUUID(),
      consent: true,
    };
    for (const input of [
      { ...base, school_id: "spoof" },
      { ...base, score: 999 },
      { ...base, consent: false },
    ])
      expect((await POST(request(input), params)).status).toBe(422);
    const foreign = new Request(
      `http://localhost/api/exams/${id}/publication`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://other.example.test",
        },
        body: JSON.stringify(base),
      },
    );
    expect((await POST(foreign, params)).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("blocks read-only owner writes and anonymous requests", async () => {
    mock.readOnly = true;
    expect(
      (
        await POST(
          request({
            action: "withdraw",
            requestId: crypto.randomUUID(),
            consent: true,
          }),
          params,
        )
      ).status,
    ).toBe(403);
    const status = await GET(request({}), params);
    expect((await status.json()).data).toMatchObject({
      readOnly: true,
      connection: null,
      publication: null,
    });
    mock.authenticated = false;
    expect((await GET(request({}), params)).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("disabled deployments read no integration tables and refuse mutations/pairing", async () => {
    vi.stubEnv("SCORE_INTEGRATION_ENABLED", "false");
    expect((await GET(request({}), params)).status).toBe(200);
    expect((await POST(request({}), params)).status).toBe(503);
    expect((await PAIR(request({}))).status).toBe(503);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("does not expose database messages, returns JSON for malformed input", async () => {
    mock.rpc.mockResolvedValue({
      error: { message: "secret-credential-and-personal-data" },
      data: null,
    });
    const response = await POST(
      request({
        action: "publish",
        requestId: crypto.randomUUID(),
        consent: true,
      }),
      params,
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "secret-credential",
    );
  });
  it("runner requires its separate credential; browser sessions cannot trigger global dispatch", async () => {
    vi.stubEnv("SCORE_SYNC_RUNNER_SECRET", "r".repeat(40));
    const response = await RUNNER(
      new Request("http://localhost/api/integrations/mathquest/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
