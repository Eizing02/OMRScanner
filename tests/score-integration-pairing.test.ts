import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  initiatePairing,
  refreshPairing,
  revokePairing,
} from "@/lib/integrations/mathquest/pairing";
import {
  openSecret,
  pairingBinding,
  sealSecret,
  tokenBinding,
} from "@/lib/integrations/mathquest/security";

const workspace = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const destination = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const remoteConnection = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const token = "t".repeat(43);

function fakeDb(
  handler: (name: string, input: Record<string, unknown>) => unknown,
) {
  return {
    rpc: vi.fn(
      async (name: string, args: { input: Record<string, unknown> }) => ({
        data: handler(name, args.input),
        error: null,
      }),
    ),
  } as unknown as SupabaseClient;
}

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
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("server-only MathQuest pairing adapter", () => {
  it("does not revoke an active connection locally if its credential is missing", async () => {
    const db = fakeDb((name) =>
      name === "mathquest_service_credentials"
        ? {
            id: requestId,
            status: "active",
            connection_id: remoteConnection,
            secrets: { pairing_secret: null, token_secret: null },
          }
        : null,
    );
    vi.stubGlobal("fetch", vi.fn());
    await expect(revokePairing(db, workspace, actor)).rejects.toMatchObject({
      code: "INTEGRATION_SECRET_UNAVAILABLE",
    });
    expect(db.rpc).not.toHaveBeenCalledWith("mathquest_service_revoke", {
      input: expect.objectContaining({ finish: true }),
    });
  });
  it("keeps pairing and connection secrets out of browser/database responses", async () => {
    let encryptedPairing: unknown,
      completed: Record<string, unknown> | undefined;
    const db = fakeDb((name, input) => {
      if (name === "mathquest_service_start_pairing") {
        encryptedPairing = input.pairing_secret;
        return { id: requestId, secret: encryptedPairing };
      }
      if (name === "mathquest_service_complete_pairing") {
        completed = input;
        return null;
      }
      throw new Error(`unexpected ${name}`);
    });
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      expect(request).toMatchObject({
        action: "request",
        request_id: requestId,
        source_workspace_id: workspace,
        pairing_code: "PAIR_1234",
      });
      expect(request.request_secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return new Response(
        JSON.stringify({
          schema_version: "1.0",
          request_id: requestId,
          status: "active",
          connection: {
            id: remoteConnection,
            destination_school_id: destination,
            destination_label: "โรงเรียนจำลอง",
            scope: "score:write",
            token,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    await initiatePairing(
      db,
      workspace,
      actor,
      requestId,
      "PAIR_1234",
      "พื้นที่ครูจำลอง",
    );
    expect(JSON.stringify(encryptedPairing)).not.toContain("PAIR_1234");
    expect(completed).toMatchObject({
      school_id: workspace,
      actor_id: actor,
      id: requestId,
      status: "active",
      scope: "score:write",
    });
    expect(JSON.stringify(completed)).not.toContain(token);
    expect(
      openSecret(completed!.token_secret, tokenBinding(workspace, requestId)),
    ).toBe(token);
  });

  it("polls a pending request with its bound secret and rejects a cross-workspace swap", async () => {
    const challenge = "p".repeat(43);
    const credential = {
      id: requestId,
      status: "pending_approval",
      secrets: {
        pairing_secret: sealSecret(
          challenge,
          pairingBinding(workspace, requestId),
        ),
      },
    };
    const db = fakeDb((name) =>
      name === "mathquest_service_credentials" ? credential : null,
    );
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toMatchObject({
        action: "status",
        request_secret: challenge,
      });
      return new Response(
        JSON.stringify({
          schema_version: "1.0",
          request_id: requestId,
          status: "pending_approval",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    await refreshPairing(db, workspace, actor);
    credential.secrets.pairing_secret = sealSecret(
      challenge,
      pairingBinding("ffffffff-ffff-4fff-8fff-ffffffffffff", requestId),
    );
    await expect(refreshPairing(db, workspace, actor)).rejects.toMatchObject({
      code: "INTEGRATION_SECRET_UNAVAILABLE",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requires the remote revoke acknowledgment before clearing local credentials", async () => {
    const calls: string[] = [];
    const credential = {
      id: requestId,
      status: "active",
      connection_id: remoteConnection,
      secrets: {
        pairing_secret: null,
        token_secret: sealSecret(token, tokenBinding(workspace, requestId)),
      },
    };
    const db = fakeDb((name, input) => {
      calls.push(`${name}:${String(input.finish ?? "")}`);
      return name === "mathquest_service_credentials" ? credential : null;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              schema_version: "1.0",
              request_id: requestId,
              status: "revoked",
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    await revokePairing(db, workspace, actor);
    expect(
      calls.filter((call) => call.startsWith("mathquest_service_revoke")),
    ).toEqual([
      "mathquest_service_revoke:false",
      "mathquest_service_revoke:true",
    ]);

    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              schema_version: "1.0",
              request_id: requestId,
              status: "pending_approval",
            }),
            { headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    await expect(revokePairing(db, workspace, actor)).rejects.toMatchObject({
      code: "INVALID_ACK",
    });
    expect(
      calls.filter((call) => call.startsWith("mathquest_service_revoke")),
    ).toEqual(["mathquest_service_revoke:false"]);
  });

  it("can cancel a never-active request when the proposed receiver never received it", async () => {
    const calls: string[] = [];
    const challenge = "p".repeat(43);
    const db = fakeDb((name, input) => {
      calls.push(`${name}:${String(input.finish ?? "")}`);
      return name === "mathquest_service_credentials"
        ? {
            id: requestId,
            status: "pending_approval",
            connection_id: null,
            secrets: {
              pairing_secret: sealSecret(
                challenge,
                pairingBinding(workspace, requestId),
              ),
              token_secret: null,
            },
          }
        : null;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    await revokePairing(db, workspace, actor);
    expect(
      calls.filter((call) => call.startsWith("mathquest_service_revoke")),
    ).toEqual([
      "mathquest_service_revoke:false",
      "mathquest_service_revoke:true",
    ]);
  });
});
