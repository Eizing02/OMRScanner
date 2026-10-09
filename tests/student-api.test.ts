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
  it("still reads legacy rosters without inventing a prefix or room", async () => {
    mock.ready = false;
    const response = await GET();
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
