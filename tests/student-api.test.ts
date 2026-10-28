import { afterEach, describe, it, expect, vi } from "vitest";
const mock = vi.hoisted(() => ({ ready: true, rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api")>();
  return {
    ...actual,
    context: async () => ({
      schoolId: "school",
      db: {
        rpc: mock.rpc,
        from: () => {
          let fields = "";
          const chain = {
            select: (value: string) => {
              fields = value;
              return chain;
            },
            eq: () => chain,
            limit: async () => ({
              error: mock.ready ? null : { code: "42703" },
            }),
            order: async () =>
              !mock.ready && fields.includes("prefix")
                ? { data: null, error: { code: "42703" } }
                : {
                    data: [
                      {
                        id: "student",
                        student_code: "00001",
                        first_name: "มณี",
                        last_name: "ตัวอย่าง",
                        classroom_name: "ม.1",
                        number: null,
                      },
                    ],
                    error: null,
                  },
          };
          return chain;
        },
      },
    }),
  };
});
import { GET, POST } from "@/app/api/students/route";
afterEach(() => {
  mock.ready = true;
  mock.rpc.mockReset();
});
const student = {
  student_code: "00001",
  prefix: "เด็กหญิง",
  first_name: "มณี",
  last_name: "ตัวอย่าง",
  classroom_name: "ม.1",
};
const request = (students: unknown[]) =>
  new Request("http://localhost/api/students", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ students, filename: "class.csv" }),
  });
describe("student API migration compatibility", () => {
  const command = (body: unknown) =>
    new Request("http://localhost/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  it("scopes upsert previews to authenticated workspace and preserves omitted number semantics", async () => {
    mock.rpc.mockResolvedValue({ data: { planId: "plan" }, error: null });
    const response = await POST(
      command({
        action: "preview_import",
        school_id: "another-workspace",
        filename: "promotion.xlsx",
        students: [
          { ...student, numberProvided: false, password: "discard-me" },
        ],
      }),
    );
    expect(response.status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("preview_student_import", {
      input: expect.objectContaining({
        school_id: "school",
        students: [
          expect.objectContaining({
            student_code: "00001",
            numberProvided: false,
          }),
        ],
      }),
    });
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain("discard-me");
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain(
      "another-workspace",
    );
  });
  it("requires commit consent and revision guards before calling RPC", async () => {
    const planId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(
      (await POST(command({ action: "apply_plan", planId, consent: false })))
        .status,
    ).toBe(422);
    expect(
      (await POST(command({ action: "update", id: planId, student }))).status,
    ).toBe(422);
    expect(
      (
        await POST(
          command({
            action: "preview_selection",
            operation: "archive",
            ids: [],
          }),
        )
      ).status,
    ).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("returns actionable conflicts/setup errors without leaking database detail", async () => {
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "STALE_DIRECTORY internal private table info" },
    });
    let response = await POST(command({ action: "sync" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({
      code: "STALE_DIRECTORY",
    });
    mock.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "function public.sync_student_directory does not exist",
      },
    });
    response = await POST(command({ action: "sync" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ROSTER_SETUP_REQUIRED");
  });
  it("uses complete filtered export rather than the visible page and rejects invalid paging", async () => {
    mock.rpc.mockResolvedValue({
      data: { students: [], total: 0 },
      error: null,
    });
    expect(
      (
        await GET(
          new Request(
            "http://localhost/api/students?view=export&classroom=%E0%B8%A1.4&page=2&limit=50",
          ),
        )
      ).status,
    ).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("get_student_roster", {
      input: expect.objectContaining({
        school_id: "school",
        export: true,
        classroom: "ม.4",
        page: 2,
      }),
    });
    mock.rpc.mockClear();
    expect(
      (
        await GET(
          new Request("http://localhost/api/students?view=page&page=-1"),
        )
      ).status,
    ).toBe(422);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("still reads legacy rosters without inventing a prefix or room", async () => {
    mock.ready = false;
    const response = await GET(new Request("http://localhost/api/students"));
    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).toMatchObject({
      student_code: "00001",
      prefix: "",
      full_name: "มณี ตัวอย่าง",
      grade_level: "ม.1",
      room: null,
    });
  });
  it("refuses import until new fields exist, before old RPC can lose prefixes", async () => {
    mock.ready = false;
    const response = await POST(request([student]));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(
      "ROSTER_MIGRATION_REQUIRED",
    );
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("validates codes/classes and duplicates before RPC", async () => {
    expect(
      (await POST(request([{ ...student, student_code: 1 }]))).status,
    ).toBe(422);
    expect(
      (await POST(request([{ ...student, classroom_name: "ม.7" }]))).status,
    ).toBe(422);
    expect((await POST(request([student, student]))).status).toBe(409);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("sends normalized names/classes and optional null number, ignoring passwords", async () => {
    mock.rpc.mockResolvedValue({ data: [], error: null });
    const response = await POST(
      request([
        { ...student, classroom_name: "ม 1 / 02", password: "never-store" },
      ]),
    );
    expect(response.status).toBe(201);
    const input = mock.rpc.mock.calls[0][1].input;
    expect(input.students[0]).toMatchObject({
      prefix: "เด็กหญิง",
      full_name: "เด็กหญิงมณี ตัวอย่าง",
      classroom_name: "ม.1/2",
      room: 2,
      number: null,
    });
    expect(JSON.stringify(input)).not.toContain("never-store");
  });
});
