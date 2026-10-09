import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  userId: "10000000-0000-4000-8000-000000000001", schoolId: "20000000-0000-4000-8000-000000000001",
  user: true, role: "teacher", status: "approved", accessError: false, wrongUser: false,
  requested: "", targetExists: true, rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(mock.requested ? { "x-workspace-id": mock.requested } : {}) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: mock.user ? { id: mock.userId, user_metadata: { role: "owner", status: "approved" } } : null }, error: null }) },
  rpc: mock.rpc,
  from: (table: string) => {
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: mock.targetExists ? { id: mock.requested } : null, error: null }),
      single: async () => ({ data: { name_th: "โรงเรียนทดสอบ", logo_image_url: null, logo_image_public_id: null,
        logo_revision: "30000000-0000-4000-8000-000000000001", settings: { academicYear: 2569, term: 1, subjects: [] } }, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "user_access"
        ? [{ user_id: mock.userId, email: "teacher@example.com", display_name: "ครู", role: "teacher", status: "pending", created_at: "2026-10-09", reviewed_at: null }]
        : table === "schools" ? [{ id: mock.schoolId, created_by: mock.userId }] : [], count: 0, error: null }).then(resolve),
    };
    return chain;
  },
}) }));
import { context, ownerContext, requestBody } from "@/lib/supabase/api";
import { GET as getContext } from "@/app/api/me/context/route";
import { GET as getUsers, PATCH as decideUser } from "@/app/api/admin/users/route";
import { GET as getSettings, PATCH as saveSettings } from "@/app/api/settings/route";
const target = "10000000-0000-4000-8000-000000000002";
const request = (body: unknown, origin = "http://localhost") => new Request("http://localhost/api/admin/users", {
  method: "PATCH", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  mock.user = true; mock.role = "teacher"; mock.status = "approved"; mock.accessError = false; mock.wrongUser = false;
  mock.requested = ""; mock.targetExists = true;
  mock.rpc.mockReset().mockImplementation(async (name: string) => name === "get_access_context"
    ? { data: { userId: mock.wrongUser ? target : mock.userId, email: "teacher@example.com", displayName: "ครู",
      role: mock.role, status: mock.status, schoolId: mock.status === "approved" ? mock.schoolId : null }, error: mock.accessError ? { message: "missing function" } : null }
    : { data: { userId: target, status: "approved" }, error: null });
});
describe("fresh authenticated API authorization", () => {
  it("returns the pending state without leaking a workspace, then refuses workspace APIs", async () => {
    mock.status = "pending";
    const response = await getContext();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ status: "pending", role: "teacher", schoolId: null });
    expect((await getSettings()).status).toBe(403);
    expect((await getUsers()).status).toBe(403);
  });
  it("rejects anonymous, missing setup and mismatched access profiles with JSON", async () => {
    mock.user = false;
    expect((await getContext()).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.user = true; mock.accessError = true;
    const missing = await getContext();
    expect(missing.status).toBe(503); expect((await missing.json()).error.code).toBe("ACCESS_SETUP_REQUIRED");
    mock.accessError = false; mock.wrongUser = true;
    expect((await getContext()).status).toBe(403);
  });
  it("does not grant owner powers from user_metadata and refreshes suspension on every request", async () => {
    await expect(ownerContext()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await context()).schoolId).toBe(mock.schoolId);
    mock.status = "suspended";
    await expect(context()).rejects.toMatchObject({ code: "ACCESS_NOT_APPROVED" });
    expect(mock.rpc.mock.calls.filter(([name]) => name === "get_access_context")).toHaveLength(3);
  });
  it("requires owner approval, validated reason/status and same-origin JSON", async () => {
    const decision = { userId: target, status: "approved", reason: "อนุมัติการใช้งาน" };
    expect((await decideUser(request(decision))).status).toBe(403);
    mock.role = "owner";
    expect((await decideUser(request({ ...decision, status: "owner" }))).status).toBe(422);
    expect((await decideUser(request({ ...decision, reason: "" }))).status).toBe(422);
    expect((await decideUser(request(decision, "https://attacker.example"))).status).toBe(403);
    const response = await decideUser(request(decision));
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("decide_user_access", { input: decision });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const users = await getUsers();
    expect(users.status).toBe(200);
    expect((await users.json()).data[0]).toMatchObject({ userId: mock.userId, schoolId: mock.schoolId });
  });
  it("restricts owner inspection to existing read-only workspaces, including settings writes", async () => {
    mock.role = "owner"; mock.requested = "20000000-0000-4000-8000-000000000002";
    expect((await context()).readOnly).toBe(true);
    await expect(context(true)).rejects.toMatchObject({ code: "READ_ONLY_WORKSPACE" });
    const input = { school: "โรงเรียน", settings: { academicYear: 2569, term: 1, subjects: [] } };
    expect((await saveSettings(request(input))).status).toBe(403);
    mock.targetExists = false;
    await expect(context()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("validates settings and supplies tenant identity from the session, not JSON", async () => {
    const input = { school: "โรงเรียน", school_id: "forged", settings: { academicYear: 2569, term: 2, subjects: ["คณิตศาสตร์"] } };
    expect((await saveSettings(request({ ...input, settings: { ...input.settings, term: 0 } }))).status).toBe(422);
    expect((await saveSettings(request(input))).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("update_workspace_settings", { input: { school_id: mock.schoolId, school: input.school, settings: input.settings } });
  });
  it("bounds streaming JSON and distinguishes bad JSON/content type before RPCs", async () => {
    await expect(requestBody(new Request("http://localhost/api", { method: "POST", body: "text" }))).rejects.toMatchObject({ code: "INVALID_CONTENT_TYPE" });
    await expect(requestBody(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }))).rejects.toMatchObject({ code: "INVALID_JSON" });
    await expect(requestBody(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: new Uint8Array(1024 * 1024 + 1) }))).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});
