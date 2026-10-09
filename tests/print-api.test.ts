import { afterEach, describe, it, expect, vi } from "vitest";
import { defaultLayout } from "@/lib/omr/generate-template";
const mock = vi.hoisted(() => ({
  denied: false,
  previous: null as unknown,
  students: [] as unknown[],
  studentReads: 0,
  rpc: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/api")>();
  return {
    ...actual,
    context: async (write = false) => {
      if (mock.denied && write)
        throw new actual.ApiError("READ_ONLY_WORKSPACE", "อ่านอย่างเดียว", 403);
      return {
        schoolId: "20000000-0000-4000-8000-000000000099",
        db: {
          rpc: mock.rpc,
          from: (table: string) => {
            const chain = {
              select: () => chain,
              eq: (...args: unknown[]) => {
                mock.eq(...args);
                return chain;
              },
              maybeSingle: async () => ({ data: mock.previous, error: null }),
              in: async () => {
                if (table === "students") mock.studentReads++;
                return { data: mock.students, error: null };
              },
              order: () => chain,
              limit: async () => ({ data: [], error: null }),
            };
            return chain;
          },
        },
      };
    },
  };
});
import { GET, POST } from "@/app/api/omr-sheets/route";
const studentId = "20000000-0000-4000-8000-000000000001";
const examId = "20000000-0000-4000-8000-000000000022";
const requestId = "20000000-0000-4000-8000-000000000033";
const request = (overrides: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/omr-sheets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      layout: { ...defaultLayout, examId },
      requestId,
      studentIds: [studentId],
      ...overrides,
    }),
  });
afterEach(() => {
  mock.denied = false;
  mock.previous = null;
  mock.students = [];
  mock.studentReads = 0;
  mock.rpc.mockReset();
  mock.eq.mockReset();
});
describe("print registry HTTP boundary", () => {
  it("uses authoritative database names and expands all papers before registering", async () => {
    const fullName = "ก".repeat(100);
    mock.students = [
      {
        id: studentId,
        student_code: "02074",
        prefix: "",
        first_name: fullName,
        last_name: "ทดสอบ",
        classroom_name: "ม.3/1",
        number: null,
      },
    ];
    mock.rpc.mockImplementation(
      async (_name: string, args: { input: { identity_json: string } }) => {
        const identity = JSON.parse(args.input.identity_json);
        return {
          error: null,
          data: {
            jobId: requestId,
            templateUuid: examId,
            layoutHash: "a".repeat(64),
            setToken: `SAS2:${"a".repeat(64)}`,
            layout: identity.layout,
            omr: identity.omr,
            sheets: [
              {
                instanceId: studentId,
                studentId,
                studentCode: "02074",
                fullName: `${fullName} ทดสอบ`,
                classroom: "ม.3/1",
                number: null,
                page: 1,
                slot: 0,
              },
            ],
          },
        };
      },
    );
    const response = await POST(
      request({ students: [{ full_name: "FORGED", student_code: "99999" }] }),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.students[0].full_name).toBe(`${fullName} ทดสอบ`);
    expect(body.data.students[0].student_code).toBe("02074");
    expect(body.data.layout.paperMode).toBe("full");
    expect(body.data.manifest.print.sheetsPerPage).toBe(1);
    expect(mock.eq).toHaveBeenCalledWith(
      "school_id",
      "20000000-0000-4000-8000-000000000099",
    );
  });
  it("replays name-expanded full layouts from immutable snapshots, not a changed roster", async () => {
    const fullName = "ก".repeat(100) + " ทดสอบ";
    mock.previous = {
      id: requestId,
      omr_sheets: [
        {
          student_id: studentId,
          student_code: "02074",
          full_name: fullName,
          classroom_name: "ม.3/1",
          number: null,
          page_number: 1,
          slot: 0,
        },
      ],
    };
    mock.students = [
      {
        id: studentId,
        student_code: "99999",
        prefix: "",
        first_name: "เปลี่ยน",
        last_name: "ชื่อ",
        classroom_name: "ม.2/1",
        number: null,
      },
    ];
    mock.rpc.mockImplementation(
      async (_name: string, args: { input: { identity_json: string } }) => {
        const identity = JSON.parse(args.input.identity_json);
        expect(identity.layout.paperMode).toBe("full");
        return {
          error: null,
          data: {
            jobId: requestId,
            templateUuid: examId,
            layoutHash: "a".repeat(64),
            setToken: `SAS2:${"a".repeat(64)}`,
            layout: identity.layout,
            omr: identity.omr,
            sheets: [
              {
                instanceId: studentId,
                studentId,
                studentCode: "02074",
                fullName,
                classroom: "ม.3/1",
                number: null,
                page: 1,
                slot: 0,
              },
            ],
          },
        };
      },
    );
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mock.studentReads).toBe(0);
    expect((await response.json()).data.students[0].full_name).toBe(fullName);
  });
  it("rejects duplicate IDs, malformed query IDs, unauthorized students and inspection writes", async () => {
    expect(
      (await POST(request({ studentIds: [studentId, studentId] }))).status,
    ).toBe(422);
    expect(
      (
        await GET(
          new Request("http://localhost/api/omr-sheets?examId=not-uuid"),
        )
      ).status,
    ).toBe(422);
    expect((await POST(request())).status).toBe(422);
    mock.denied = true;
    expect((await POST(request())).status).toBe(403);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
