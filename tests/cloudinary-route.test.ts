import { beforeEach, describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
const mock = vi.hoisted(() => ({
  user: true, status: "approved", role: "teacher", requested: "", targetExists: true,
  school: "20000000-0000-4000-8000-000000000001", userId: "10000000-0000-4000-8000-000000000001",
  revision: "30000000-0000-4000-8000-000000000001", imagePath: null as string | null,
  jobs: [] as { id: string; object_path: string }[],
  upload: vi.fn(), remove: vi.fn(), signed: vi.fn(), rpc: vi.fn(),
  saveError: false, queueError: false, completeError: false,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(mock.requested ? { "x-workspace-id": mock.requested } : {}) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mock.user ? { id: mock.userId } : null }, error: null }) },
    storage: { from: () => ({ upload: mock.upload, remove: mock.remove, createSignedUrl: mock.signed }) },
    from: (table: string) => {
      let countOnly = false;
      const chain = {
        select: (_fields: string, options?: { head?: boolean }) => { countOnly = options?.head === true; return chain; },
        eq: () => chain,
        single: async () => ({ data: { name_th: "โรงเรียนทดสอบ", logo_revision: mock.revision, logo_image_url: null,
          logo_image_public_id: mock.imagePath, settings: { academicYear: 2569, term: 1, subjects: [] } }, error: null }),
        maybeSingle: async () => ({ data: mock.targetExists ? { id: mock.requested } : null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(table === "logo_cleanup_jobs"
          ? { data: countOnly ? null : [...mock.jobs], count: mock.jobs.length, error: null }
          : { data: [], error: null }).then(resolve),
      };
      return chain;
    },
    rpc: mock.rpc,
  }),
}));
import { GET, POST } from "@/app/api/cloudinary/route";
import { POST as retryCleanup } from "@/app/api/settings/logo/cleanup/route";
beforeEach(() => {
  mock.user = true; mock.status = "approved"; mock.role = "teacher"; mock.requested = "";
  mock.targetExists = true; mock.imagePath = null; mock.jobs = [];
  mock.revision = "30000000-0000-4000-8000-000000000001";
  mock.saveError = false; mock.queueError = false; mock.completeError = false;
  mock.upload.mockReset().mockResolvedValue({ data: {}, error: null });
  mock.remove.mockReset().mockResolvedValue({ data: [], error: null });
  mock.signed.mockReset().mockResolvedValue({ data: { signedUrl: "https://example.supabase.co/storage/v1/object/sign/school-logos/file?token=example" }, error: null });
  mock.rpc.mockReset().mockImplementation(async (name: string, args?: { input: Record<string, string> }) => {
    if (name === "get_access_context") return { data: { userId: mock.userId, email: "teacher@example.com", displayName: "ครูทดสอบ",
      role: mock.role, status: mock.status, schoolId: mock.status === "approved" ? mock.school : null }, error: null };
    const input = args!.input;
    if (name === "update_school_logo") {
      if (mock.saveError) return { data: null, error: { message: "STALE_LOGO" } };
      if (mock.imagePath) mock.jobs.push({ id: crypto.randomUUID(), object_path: mock.imagePath });
      mock.imagePath = input.object_path; mock.revision = crypto.randomUUID();
      return { data: {}, error: null };
    }
    if (name === "queue_logo_cleanup") {
      if (mock.queueError || mock.imagePath === input.object_path) return { data: null, error: { message: "INVALID_LOGO" } };
      mock.jobs.push({ id: crypto.randomUUID(), object_path: input.object_path });
      return { data: null, error: null };
    }
    if (name === "complete_logo_cleanup") {
      if (mock.completeError) return { data: null, error: { message: "LOGO_CLEANUP_INCOMPLETE" } };
      mock.jobs = mock.jobs.filter((job) => job.id !== input.job_id);
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
});
async function request(revision = mock.revision, origin = "http://localhost", file?: Blob) {
  const form = new FormData();
  form.set("revision", revision);
  form.set("file", file ?? new Blob([await readFile("public/omr-assets/school-logo.png")], { type: "image/png" }), "arbitrary-name.svg");
  // The server must ignore forged ownership/path fields from multipart input.
  form.set("school_id", "other-school"); form.set("object_path", "other-school/evil.png");
  return new Request("http://localhost/api/cloudinary", { method: "POST", headers: { origin }, body: form });
}
describe("compatibility logo API now uses private Supabase Storage, not Cloudinary", () => {
  it("accepts a public Netlify-origin logo upload when the adapter URL uses the deployment host", async () => {
    vi.stubEnv("SITE_ID", "00000000-0000-4000-8000-000000000001");
    vi.stubEnv("SITE_NAME", "scansob");
    vi.stubEnv("URL", "https://scansob.netlify.app");
    try {
      const original = await request(mock.revision, "https://scansob.netlify.app");
      const response = await POST(new Request("https://6ae3351c95c208097f868f58--scansob.netlify.app/api/settings/logo", original));
      expect(response.status).toBe(201);
      expect(mock.upload).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllEnvs(); }
  });
  it("returns valid 401/403 JSON before uploads for anonymous or unapproved accounts", async () => {
    mock.user = false;
    expect((await GET()).status).toBe(401);
    expect((await POST(await request())).status).toBe(401);
    mock.user = true;
    for (const status of ["pending", "rejected", "suspended"]) {
      mock.status = status;
      const response = await POST(await request());
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe("ACCESS_NOT_APPROVED");
    }
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("lets the owner read others' branding but never change their assets", async () => {
    mock.role = "owner"; mock.requested = "20000000-0000-4000-8000-000000000002";
    expect((await GET()).status).toBe(200);
    expect((await POST(await request())).status).toBe(403);
    expect(mock.upload).not.toHaveBeenCalled();
    mock.role = "teacher";
    expect((await GET()).status).toBe(403);
  });
  it("blocks malformed workspace IDs, cross-origin requests and stale revisions before uploading", async () => {
    mock.requested = "not-a-uuid";
    expect((await GET()).status).toBe(403); mock.requested = "";
    expect((await POST(await request(mock.revision, "http://other.test"))).status).toBe(403);
    const response = await POST(await request("30000000-0000-4000-8000-000000000002"));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("STALE_LOGO");
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("bounds upload bytes and validates actual image headers instead of the filename", async () => {
    expect((await POST(new Request("http://localhost/api/cloudinary", { method: "POST", body: "bad" }))).status).toBe(415);
    expect((await POST(await request(mock.revision, "http://localhost", new Blob(["<svg/>"], { type: "image/png" })))).status).toBe(422);
    expect((await POST(await request(mock.revision, "http://localhost", new Blob([new Uint8Array(5 * 1024 * 1024 + 1)])))).status).toBe(422);
    const streamed = new Request("http://localhost/api/cloudinary", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: new Uint8Array(5 * 1024 * 1024 + 65537) });
    expect((await POST(streamed)).status).toBe(413);
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("uploads original bytes with server-derived school/path, then signs the private original", async () => {
    const revision = mock.revision;
    const response = await POST(await request());
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({ width: 742, height: 763, format: "PNG", cleanupWarning: false });
    expect(Buffer.from(mock.upload.mock.calls[0][1])).toEqual(await readFile("public/omr-assets/school-logo.png"));
    expect(mock.upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${mock.school}/[a-f0-9-]{36}\\.png$`)), expect.any(Uint8Array), { contentType: "image/png", upsert: false, cacheControl: "60" });
    expect(mock.rpc).toHaveBeenCalledWith("update_school_logo", { input: { school_id: mock.school, expected_revision: revision, object_path: mock.imagePath } });
    expect(mock.signed).toHaveBeenCalledWith(mock.imagePath, 600);
  });
  it("never changes the pointer after an upload failure", async () => {
    mock.upload.mockResolvedValue({ data: null, error: { message: "Storage unavailable" } });
    expect((await POST(await request())).status).toBe(503);
    expect(mock.imagePath).toBeNull();
    expect(mock.rpc.mock.calls.map(([name]) => name)).not.toContain("update_school_logo");
  });
  it("queues a stale upload before rollback deletion and retains a failed cleanup for retry", async () => {
    mock.saveError = true;
    mock.remove.mockResolvedValue({ data: null, error: { message: "temporary deletion failure" } });
    expect((await POST(await request())).status).toBe(409);
    const uploadedPath = mock.upload.mock.calls[0][0];
    expect(mock.rpc).toHaveBeenCalledWith("queue_logo_cleanup", { input: { school_id: mock.school, object_path: uploadedPath } });
    expect(mock.jobs).toHaveLength(1);
    expect(mock.remove).toHaveBeenCalledWith([uploadedPath]);
    mock.remove.mockResolvedValue({ data: [], error: null });
    const retry = await retryCleanup(new Request("http://localhost/api/settings/logo/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
    expect(retry.status).toBe(200); expect(mock.jobs).toHaveLength(0);
  });
  it("does not delete a potentially active object when commit acknowledgement was lost", async () => {
    mock.saveError = true; mock.queueError = true;
    const response = await POST(await request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("LOGO_ROLLBACK_CHECK_FAILED");
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it("keeps deletion jobs on a silent Storage no-op and still reports a successfully saved logo", async () => {
    const old = `${mock.school}/30000000-0000-4000-8000-000000000005.png`;
    mock.imagePath = old; mock.completeError = true;
    const response = await POST(await request());
    expect(response.status).toBe(201);
    expect((await response.json()).data).toMatchObject({ cleanupWarning: true, cleanupPending: 1 });
    expect(mock.jobs[0].object_path).toBe(old);
    expect(mock.rpc).toHaveBeenCalledWith("complete_logo_cleanup", { input: { school_id: mock.school, job_id: mock.jobs[0].id } });
  });
});
