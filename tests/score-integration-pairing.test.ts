import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

import {
  initiateSignedPairing,
  signedPairingAvailability,
  refreshPairing,
  revokePairing,
  recoverPairing,
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
  it("activates an existing legacy request while keeping its token encrypted", async () => {
    const challenge = "p".repeat(43);
    const encryptedPairing = sealSecret(
      challenge,
      pairingBinding(workspace, requestId),
    );
    let completed: Record<string, unknown> | undefined;
    const db = fakeDb((name, input) => {
      if (name === "mathquest_service_credentials")
        return {
          id: requestId,
          status: "pending_approval",
          secrets: { pairing_secret: encryptedPairing },
        };
      if (name === "mathquest_service_complete_pairing") {
        completed = input;
        return null;
      }
      throw new Error(`unexpected ${name}`);
    });
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      expect(request).toMatchObject({
        action: "status",
        request_id: requestId,
        source_workspace_id: workspace,
        request_secret: challenge,
      });
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
    await refreshPairing(db, workspace, actor, requestId);
    expect(JSON.stringify(encryptedPairing)).not.toContain(challenge);
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

  it.each(["rejected", "expired"])(
    "closes a confirmed %s request so a new one can be created",
    async (stage) => {
      const db = fakeDb((name) =>
        name === "mathquest_service_credentials"
          ? {
              id: requestId,
              status: "error",
              last_error_code: "CONNECTION_DENIED",
              connection_id: null,
              secrets: { pairing_secret: null, token_secret: null },
              signed_attempt: { stage },
            }
          : null,
      );
      const fetcher = vi.fn();
      vi.stubGlobal("fetch", fetcher);
      await revokePairing(db, workspace, actor, requestId);
      expect(fetcher).not.toHaveBeenCalled();
      expect(db.rpc).toHaveBeenNthCalledWith(2, "mathquest_service_revoke", {
        input: {
          school_id: workspace,
          actor_id: actor,
          id: requestId,
          finish: false,
        },
      });
      expect(db.rpc).toHaveBeenNthCalledWith(3, "mathquest_service_revoke", {
        input: {
          school_id: workspace,
          actor_id: actor,
          id: requestId,
          finish: true,
        },
      });
    },
  );

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

  it("preserves a pending request when the receiver cannot prove cancellation", async () => {
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
    await expect(revokePairing(db, workspace, actor)).rejects.toMatchObject({
      code: "RECEIVER_REJECTED",
    });
    expect(
      calls.filter((call) => call.startsWith("mathquest_service_revoke")),
    ).toEqual(["mathquest_service_revoke:false"]);
  });
  it("recovers a remotely approved token in memory to cancel without activating locally", async () => {
    const challenge = "p".repeat(43);
    const db = fakeDb((name) =>
      name === "mathquest_service_credentials"
        ? {
            id: requestId,
            status: "pending_approval",
            connection_id: null,
            secrets: {
              token_secret: null,
              pairing_secret: sealSecret(
                challenge,
                pairingBinding(workspace, requestId),
              ),
            },
          }
        : null,
    );
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body));
      if (input.action === "status")
        return Response.json({
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
        });
      expect(input).toMatchObject({
        action: "revoke",
        connection_id: remoteConnection,
      });
      expect(init.headers).toMatchObject({ Authorization: `Bearer ${token}` });
      return Response.json({
        schema_version: "1.0",
        request_id: requestId,
        status: "revoked",
      });
    });
    vi.stubGlobal("fetch", fetcher);
    await revokePairing(db, workspace, actor);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(db.rpc).not.toHaveBeenCalledWith(
      "mathquest_service_complete_pairing",
      expect.anything(),
    );
    expect(db.rpc).toHaveBeenLastCalledWith("mathquest_service_revoke", {
      input: {
        school_id: workspace,
        actor_id: actor,
        id: requestId,
        finish: true,
      },
    });
    expect(JSON.stringify(vi.mocked(db.rpc).mock.calls)).not.toContain(token);
  });
  it.each(["pending", "timeout", "invalid"])(
    "does not clear cancellation credentials after %s failure",
    async (scenario) => {
      const db = fakeDb((name) =>
        name === "mathquest_service_credentials"
          ? {
              id: requestId,
              status: "pending_approval",
              connection_id: null,
              secrets: {
                token_secret: null,
                pairing_secret: sealSecret(
                  "p".repeat(43),
                  pairingBinding(workspace, requestId),
                ),
              },
            }
          : null,
      );
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          if (scenario === "timeout") throw new Error("timeout");
          if (JSON.parse(String(init.body)).action === "status")
            return Response.json({
              schema_version: "1.0",
              request_id: scenario === "invalid" ? actor : requestId,
              status: "pending_approval",
            });
          // Approval races after the status check: challenge-only revocation is denied.
          return Response.json({ error: "UNAUTHORIZED" }, { status: 403 });
        }),
      );
      await expect(revokePairing(db, workspace, actor)).rejects.toThrow();
      expect(db.rpc).not.toHaveBeenCalledWith("mathquest_service_revoke", {
        input: expect.objectContaining({ finish: true }),
      });
    },
  );
  it("passes a verified bound revoke ACK to recovery and retains failure for retry", async () => {
    const db = fakeDb((name) =>
      name === "mathquest_service_credentials"
        ? {
            id: requestId,
            status: "active",
            connection_id: remoteConnection,
            secrets: {
              token_secret: sealSecret(
                token,
                tokenBinding(workspace, requestId),
              ),
            },
          }
        : null,
    );
    const fetcher = vi.fn(async () =>
      Response.json({
        schema_version: "1.0",
        request_id: requestId,
        status: "revoked",
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await recoverPairing(db, workspace, actor);
    expect(db.rpc).toHaveBeenLastCalledWith("mathquest_service_recover", {
      input: {
        school_id: workspace,
        actor_id: actor,
        id: requestId,
        finish: true,
        ack: {
          schema_version: "1.0",
          request_id: requestId,
          status: "revoked",
        },
      },
    });
    vi.mocked(db.rpc).mockClear();
    fetcher.mockImplementation(async () =>
      Response.json({
        schema_version: "1.0",
        request_id: actor,
        status: "revoked",
      }),
    );
    await expect(recoverPairing(db, workspace, actor)).rejects.toMatchObject({
      code: "INVALID_ACK",
    });
    expect(db.rpc).not.toHaveBeenCalledWith("mathquest_service_recover", {
      input: expect.objectContaining({ finish: true }),
    });
  });
});

describe("signed pairing readiness", () => {
  const email = "teacher@example.test";
  const user: User = {
    id: actor,
    email,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-11-17T01:00:00.000Z",
    email_confirmed_at: "2026-11-17T01:00:00.000Z",
    identities: [
      {
        id: actor,
        user_id: actor,
        identity_id: actor,
        provider: "google",
        identity_data: { email, email_verified: true },
      },
    ],
  };

  beforeEach(() => {
    vi.stubEnv("MATHQUEST_CODE_FREE_PAIRING_ENABLED", "true");
    vi.stubEnv("MATHQUEST_CODE_FREE_PAIRING_RECEIVER_VERIFIED", "true");
    vi.stubEnv("MATHQUEST_DESTINATION_SCHOOL_ID", destination);
    vi.stubEnv("MATHQUEST_DESTINATION_LABEL", "โรงเรียนจำลอง");
    vi.stubEnv("MATHQUEST_CODE_FREE_SIGNING_KEY_ID", "fixture");
    vi.stubEnv(
      "MATHQUEST_CODE_FREE_SIGNING_KEY",
      Buffer.alloc(32, 1).toString("base64url"),
    );
  });

  it.each([
    [503, "SIGNED_PAIRING_DISABLED", "closed"],
    [502, "UNAVAILABLE", "unavailable"],
    [403, "UNAUTHORIZED", "unavailable"],
  ] as const)(
    "handles receiver status %s and code %s",
    async (status, error, availability) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ error }, { status })),
      );
      await expect(signedPairingAvailability(workspace, user)).resolves.toBe(
        availability,
      );
    },
  );

  it.each([destination, actor])(
    "validates the prepare acknowledgment for school %s",
    async (replySchool) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          const request = JSON.parse(String(init.body));
          expect(request).toMatchObject({
            action: "prepare_signed",
            source_workspace_id: workspace,
            sender_verified_email: email,
          });
          return Response.json({
            schema_version: "1.0",
            action: "prepare_signed",
            request_id: request.request_id,
            destination_school_id: replySchool,
            pairing_window_id: requestId,
          });
        }),
      );
      await expect(signedPairingAvailability(workspace, user)).resolves.toBe(
        replySchool === destination ? "ready" : "unavailable",
      );
    },
  );

  it("does not contact the receiver without a verified Google identity", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      signedPairingAvailability(workspace, { ...user, identities: [] }),
    ).resolves.toBe("google_required");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("replays the frozen submission before status and can revoke during an intake pause", async () => {
    vi.stubEnv("MATHQUEST_CODE_FREE_PAIRING_ENABLED", "false");
    vi.stubEnv("MATHQUEST_CODE_FREE_PAIRING_RECEIVER_VERIFIED", "false");
    vi.stubEnv("MATHQUEST_DESTINATION_LABEL", "");
    const challenge = "p".repeat(43);
    const window = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const origin = "https://aaaaaaaaaaaaaaaaaaaa.supabase.co";
    const body = JSON.stringify({
      schema_version: "1.0",
      action: "request_signed",
      request_id: requestId,
      source_workspace_id: workspace,
      destination_school_id: destination,
      sender_auth_id: actor,
      sender_verified_email: email,
      workspace_label: "พื้นที่จำลอง",
      requested_at: new Date().toISOString(),
      request_secret: challenge,
      pairing_window_id: window,
    });
    const signed = {
      stage: "submit",
      window_id: window,
      receiver_origin: origin,
      destination_school_id: destination,
      wire_secret: sealSecret(
        body,
        `scansob:mathquest:signed-wire:${workspace}:${requestId}`,
      ),
    };
    let active = false;
    let tokenSecret: unknown;
    const db = fakeDb((name, input) => {
      if (name === "mathquest_service_credentials") {
        expect(input.expected_request_id).toBe(requestId);
        return {
          id: requestId,
          status: active ? "active" : "pending_approval",
          connection_id: active ? remoteConnection : null,
          signed_attempt: signed,
          secrets: {
            pairing_secret: active
              ? null
              : sealSecret(challenge, pairingBinding(workspace, requestId)),
            token_secret: tokenSecret,
          },
        };
      }
      if (name === "mathquest_service_complete_pairing") {
        expect(input.signed_origin).toBe(origin);
        expect(input.signed_destination).toBe(destination);
        active = input.status === "active";
        tokenSecret = input.token_secret;
        signed.stage = active ? "active" : "waiting";
      }
      return null;
    });
    const actions: string[] = [];
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body));
      actions.push(payload.action);
      expect(payload.request_id).toBe(requestId);
      expect(payload.source_workspace_id).toBe(workspace);
      const reply = { schema_version: "1.0", request_id: requestId };
      if (payload.action === "request_signed") {
        expect(init.body).toBe(body);
        expect(payload.pairing_window_id).toBe(window);
        expect(
          new Headers(init.headers).get("X-ScanSob-Signature"),
        ).toBeTruthy();
        return Response.json({ ...reply, status: "pending_approval" });
      }
      if (payload.action === "status") {
        expect(payload.request_secret).toBe(challenge);
        return Response.json({
          ...reply,
          status: "active",
          connection: {
            id: remoteConnection,
            destination_school_id: destination,
            destination_label: "MathQuest",
            scope: "score:write",
            token,
          },
        });
      }
      expect(payload.action).toBe("revoke");
      expect(new Headers(init.headers).get("authorization")).toBe(
        `Bearer ${token}`,
      );
      return Response.json({ ...reply, status: "revoked" });
    });
    vi.stubGlobal("fetch", fetcher);
    await refreshPairing(db, workspace, actor, requestId, email);
    await refreshPairing(db, workspace, actor, requestId, email);
    await revokePairing(db, workspace, actor, requestId);
    expect(actions).toEqual(["request_signed", "status", "revoke"]);
    expect(db.rpc).not.toHaveBeenCalledWith(
      "mathquest_service_start_signed_pairing",
      expect.anything(),
    );
    expect(db.rpc).toHaveBeenLastCalledWith("mathquest_service_revoke", {
      input: {
        school_id: workspace,
        actor_id: actor,
        id: requestId,
        finish: true,
      },
    });
  });

  it("does not start or prepare an unpublished draft during an intake pause", async () => {
    vi.stubEnv("MATHQUEST_CODE_FREE_PAIRING_ENABLED", "false");
    const db = fakeDb(() => ({
      id: requestId,
      status: "pending_approval",
      signed_attempt: { stage: "prepare" },
      secrets: {
        pairing_secret: sealSecret(
          "p".repeat(43),
          pairingBinding(workspace, requestId),
        ),
      },
    }));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      initiateSignedPairing(db, workspace, user, requestId, "พื้นที่จำลอง"),
    ).rejects.toMatchObject({ code: "SIGNED_PAIRING_DISABLED" });
    await expect(
      refreshPairing(db, workspace, actor, requestId, email),
    ).rejects.toMatchObject({ code: "SIGNED_PAIRING_DISABLED" });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
