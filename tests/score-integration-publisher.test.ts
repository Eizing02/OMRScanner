import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
import { dispatchScores } from "@/lib/integrations/mathquest/publisher";
import { receiverRequest } from "@/lib/integrations/mathquest/http";
import { receiverOrigin } from "@/lib/integrations/mathquest/config";
import {
  payloadHash,
  sealSecret,
  tokenBinding,
} from "@/lib/integrations/mathquest/security";
import { syntheticScoreEvent } from "./score-integration-event-fixture";
let event: ReturnType<typeof syntheticScoreEvent>,
  job: Record<string, unknown>,
  rpc: ReturnType<typeof vi.fn>,
  fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("SCORE_INTEGRATION_ENABLED", "true");
  vi.stubEnv("MATHQUEST_RECEIVER_VERIFIED", "true");
  vi.stubEnv(
    "MATHQUEST_RECEIVER_ORIGIN",
    "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
  );
  vi.stubEnv(
    "SCORE_SYNC_ENCRYPTION_KEYS",
    JSON.stringify({ fixture: "c".repeat(64) }),
  );
  vi.stubEnv("SCORE_SYNC_ENCRYPTION_KEY_VERSION", "fixture");
  event = syntheticScoreEvent();
  const localId = crypto.randomUUID(),
    text = JSON.stringify(event);
  job = {
    event_id: event.event_id,
    source_workspace_id: event.source_workspace_id,
    local_connection_id: localId,
    lease_token: crypto.randomUUID(),
    attempt_count: 1,
    payload_text: text,
    payload_hash: payloadHash(text),
    token_secret: sealSecret(
      "t".repeat(43),
      tokenBinding(event.source_workspace_id, localId),
    ),
  };
  let claimed = false;
  rpc = vi.fn(async (name: string) => ({
    data:
      name === "mathquest_service_claim"
        ? claimed
          ? null
          : ((claimed = true), job)
        : true,
    error: null,
  }));
  fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          schema_version: "1.0",
          event_id: event.event_id,
          status: "processed",
          accepted: 1,
          unmatched: [],
          invalid: [],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const db = () => ({ rpc }) as unknown as SupabaseClient;
describe("server-only score publisher with a mock receiver", () => {
  it("recognizes only the bounded documented 403 closed-term code without exposing response data", async () => {
    fetcher.mockResolvedValue(
      Response.json({ error: "TERM_CLOSED" }, { status: 403 }),
    );
    await dispatchScores({}, db());
    expect(rpc).toHaveBeenCalledWith("mathquest_service_finish", {
      input: expect.objectContaining({
        error_code: "TERM_CLOSED",
        retryable: false,
      }),
    });
    for (const body of [
      "not json",
      JSON.stringify({ error: "TERM_CLOSED", secret: "untrusted" }),
      JSON.stringify({ error: "unknown" }),
      "x".repeat(2049),
    ]) {
      fetcher.mockResolvedValue(
        new Response(body, {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      );
      await expect(
        receiverRequest("ingest-scansob-results", "{}", "synthetic"),
      ).rejects.toMatchObject({ code: "CONNECTION_DENIED", retryable: false });
    }
    fetcher.mockResolvedValue(
      Response.json({ error: "TERM_CLOSED" }, { status: 403 }),
    );
    await expect(
      receiverRequest("pair-scansob-workspace", "{}"),
    ).rejects.toMatchObject({ code: "CONNECTION_DENIED" });
    fetcher.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("connection lost"));
          },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(
      receiverRequest("ingest-scansob-results", "{}", "synthetic"),
    ).rejects.toMatchObject({ code: "RECEIVER_UNAVAILABLE", retryable: true });
  });
  it("retries network timeouts and response-body failures using the original event", async () => {
    fetcher.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    await dispatchScores({}, db());
    expect(
      rpc.mock.calls.find(([name]) => name === "mathquest_service_finish")![1]
        .input,
    ).toMatchObject({
      error_code: "RECEIVER_UNAVAILABLE",
      retryable: true,
      event_id: job.event_id,
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("connection lost"));
      },
    });
    fetcher.mockResolvedValueOnce(
      new Response(stream, { headers: { "Content-Type": "application/json" } }),
    );
    await expect(
      receiverRequest(
        "ingest-scansob-results",
        String(job.payload_text),
        "synthetic",
      ),
    ).rejects.toMatchObject({ code: "RECEIVER_UNAVAILABLE", retryable: true });
  });
  it("sends exact frozen bytes over HTTPS and finishes only after a valid committed acknowledgment", async () => {
    expect(
      await dispatchScores({ schoolId: event.source_workspace_id }, db()),
    ).toEqual({ attempted: 1 });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      body: job.payload_text,
      redirect: "error",
      headers: { Authorization: `Bearer ${"t".repeat(43)}` },
    });
    expect(rpc).toHaveBeenCalledWith("mathquest_service_validate_lease", {
      input: expect.objectContaining({ lease_token: job.lease_token }),
    });
    expect(rpc).toHaveBeenCalledWith("mathquest_service_finish", {
      input: expect.objectContaining({
        ack: expect.objectContaining({ accepted: 1 }),
      }),
    });
  });
  it.each([429, 500, 503])(
    "queues a bounded retry on receiver %s without storing its response body",
    async (status) => {
      fetcher.mockResolvedValue(
        new Response("secret should not escape", { status }),
      );
      await dispatchScores({}, db());
      const result = rpc.mock.calls.find(
        ([name]) => name === "mathquest_service_finish",
      )![1];
      expect(result.input).toMatchObject({
        retryable: true,
        error_code: "RECEIVER_UNAVAILABLE",
      });
      expect(JSON.stringify(result)).not.toContain("secret should not escape");
    },
  );
  it.each([400, 401, 403, 409])(
    "blocks non-retryable receiver %s",
    async (status) => {
      fetcher.mockResolvedValue(new Response("untrusted message", { status }));
      await dispatchScores({}, db());
      expect(
        rpc.mock.calls.find(([name]) => name === "mathquest_service_finish")![1]
          .input.retryable,
      ).toBe(false);
    },
  );
  it("does not send with invalid hashes or revoked/fenced leases", async () => {
    job.payload_hash = "a".repeat(64);
    await dispatchScores({}, db());
    expect(fetcher).not.toHaveBeenCalled();
    rpc.mockClear();
    fetcher.mockClear();
    let claimed = false;
    rpc.mockImplementation(async (name: string) => ({
      data:
        name === "mathquest_service_claim"
          ? claimed
            ? null
            : ((claimed = true), job)
          : name === "mathquest_service_validate_lease"
            ? false
            : true,
      error: null,
    }));
    job.payload_hash = payloadHash(String(job.payload_text));
    await dispatchScores({}, db());
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects mismatched acknowledgments and secret cross-tenant swaps", async () => {
    fetcher.mockResolvedValue(
      new Response(
        JSON.stringify({
          schema_version: "1.0",
          event_id: crypto.randomUUID(),
          status: "processed",
          accepted: 1,
          unmatched: [],
          invalid: [],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    await dispatchScores({}, db());
    expect(
      rpc.mock.calls.find(([name]) => name === "mathquest_service_finish")![1]
        .input.error_code,
    ).toBe("INVALID_ACK");
    rpc.mockClear();
    fetcher.mockClear();
    let claimed = false;
    job.token_secret = sealSecret(
      "t".repeat(43),
      tokenBinding(
        "ffffffff-ffff-4fff-8fff-ffffffffffff",
        String(job.local_connection_id),
      ),
    );
    rpc.mockImplementation(async (name: string) => ({
      data:
        name === "mathquest_service_claim"
          ? claimed
            ? null
            : ((claimed = true), job)
          : true,
      error: null,
    }));
    await dispatchScores({}, db());
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      rpc.mock.calls.find(([name]) => name === "mathquest_service_finish")![1]
        .input.error_code,
    ).toBe("INTEGRATION_SECRET_UNAVAILABLE");
  });
  it("feature/security gates prevent any network or database sending", async () => {
    vi.stubEnv("MATHQUEST_RECEIVER_VERIFIED", "false");
    await expect(dispatchScores({}, db())).rejects.toMatchObject({
      code: "RECEIVER_NOT_READY",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("allowlists receiver hosts and rejects redirects/oversized acknowledgments", async () => {
    for (const url of [
      "http://localhost/",
      "https://user:secret@aaaaaaaaaaaaaaaaaaaa.supabase.co/",
      "https://example.com/",
      "https://aaaaaaaaaaaaaaaaaaaa.supabase.co/path",
      "https://aaaaaaaaaaaaaaaaaaaa.supabase.co:8443/",
    ]) {
      vi.stubEnv("MATHQUEST_RECEIVER_ORIGIN", url);
      expect(() => receiverOrigin()).toThrow();
    }
    vi.stubEnv(
      "MATHQUEST_RECEIVER_ORIGIN",
      "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
    );
    fetcher.mockResolvedValue(
      new Response("x".repeat(70000), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      receiverRequest("ingest-scansob-results", "{}", "synthetic-token"),
    ).rejects.toMatchObject({ code: "INVALID_ACK" });
  });
});
