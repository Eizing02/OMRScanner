import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  authenticated: true,
  readOnly: false,
  rpc: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("server-only", () => ({}));
const school = "20000000-0000-4000-8000-000000000099",
  exam = "20000000-0000-4000-8000-000000000022";
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
        schoolId: "20000000-0000-4000-8000-000000000099",
        db: {
          rpc: mock.rpc,
          storage: { from: () => ({ remove: mock.remove }) },
        },
      };
    },
  };
});
import { GET, PATCH, DELETE } from "@/app/api/exams/route";
const deletion = (input: unknown = { id: exam, confirmation: "ชุดสอบทดสอบ" }) =>
  new Request("http://localhost/api/exams", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
beforeEach(() => {
  mock.authenticated = true;
  mock.readOnly = false;
  mock.rpc.mockReset();
  mock.remove.mockReset();
  mock.remove.mockResolvedValue({ error: null });
  mock.rpc.mockImplementation(async (name) => ({
    data:
      name === "begin_exam_deletion"
        ? {
            id: exam,
            status: "pending",
            paths: [`${school}/request/processed.jpg`],
          }
        : { deleted: true },
    error: null,
  }));
});
describe("exam lifecycle HTTP boundary", () => {
  it("uses private Storage API first, finalizes only after removal, and scopes all RPCs", async () => {
    const response = await DELETE(deletion());
    expect(response.status).toBe(200);
    expect(mock.remove).toHaveBeenCalledWith([
      `${school}/request/processed.jpg`,
    ]);
    expect(mock.rpc).toHaveBeenCalledWith("finish_exam_deletion", {
      input: { school_id: school, job_id: exam },
    });
    expect(mock.remove.mock.invocationCallOrder[0]).toBeLessThan(
      mock.rpc.mock.invocationCallOrder[1],
    );
  });
  it("never purges scores after a Storage failure, and reports a recoverable error", async () => {
    mock.remove.mockResolvedValue({ error: { message: "network" } });
    const response = await DELETE(deletion());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("EXAM_CLEANUP_PENDING");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it("returns pending rather than false success if RLS silently leaves objects", async () => {
    mock.rpc.mockImplementation(async (name) =>
      name === "begin_exam_deletion"
        ? { data: { id: exam, status: "pending", paths: [] }, error: null }
        : { data: null, error: { message: "EXAM_CLEANUP_PENDING" } },
    );
    const response = await DELETE(deletion());
    expect(response.status).toBe(202);
    expect((await response.json()).data).toEqual({ deleting: true });
  });
  it("supports a completed deletion retry without repeating Storage writes", async () => {
    mock.rpc.mockResolvedValue({ data: { status: "complete" }, error: null });
    expect((await DELETE(deletion())).status).toBe(200);
    expect(mock.remove).not.toHaveBeenCalled();
  });
  it("refuses foreign paths, unauthenticated/read-only writes, wrong names and malformed requests", async () => {
    mock.rpc.mockResolvedValue({
      data: { status: "pending", paths: ["other-school/file.jpg"] },
      error: null,
    });
    expect((await DELETE(deletion())).status).toBe(409);
    expect(mock.remove).not.toHaveBeenCalled();
    mock.authenticated = false;
    expect((await DELETE(deletion())).status).toBe(401);
    mock.authenticated = true;
    mock.readOnly = true;
    expect((await DELETE(deletion())).status).toBe(403);
    mock.readOnly = false;
    mock.rpc.mockResolvedValue({
      data: null,
      error: { message: "DELETE_CONFIRMATION_REQUIRED" },
    });
    expect((await DELETE(deletion())).status).toBe(422);
    expect(
      (await DELETE(deletion({ id: "bad", confirmation: "x" }))).status,
    ).toBe(422);
  });
  it("persists archive/restore through the transactional RPC and allows read-only preview", async () => {
    const patch = (input: unknown) =>
      new Request("http://localhost/api/exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    expect(
      (await PATCH(patch({ action: "archive", ids: [exam], archived: true })))
        .status,
    ).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("set_exam_archived", {
      input: {
        school_id: school,
        action: "archive",
        ids: [exam],
        archived: true,
      },
    });
    mock.readOnly = true;
    expect(
      (
        await GET(
          new Request(`http://localhost/api/exams?deletePreview=${exam}`),
        )
      ).status,
    ).toBe(200);
    expect(
      (await GET(new Request("http://localhost/api/exams?deletePreview=bad")))
        .status,
    ).toBe(422);
  });
  it("returns explicit setup error until the additive migration is installed", async () => {
    mock.rpc.mockResolvedValue({
      data: null,
      error: { message: "function begin_exam_deletion does not exist" },
    });
    const response = await DELETE(deletion());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("EXAM_SETUP_REQUIRED");
  });
});
