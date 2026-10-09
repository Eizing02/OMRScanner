import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "@/types/result";
const mock = vi.hoisted(() => ({
  readOnly: false,
  reviews: [] as ReviewItem[],
  versions: [] as unknown[],
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/api", async (original) => {
  const actual = await original<typeof import("@/lib/supabase/api")>();
  return {
    ...actual,
    context: async () => {
      if (mock.readOnly)
        throw new actual.ApiError("READ_ONLY_WORKSPACE", "อ่านอย่างเดียว", 403);
      const chain = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: mock.versions, error: null }).then(resolve),
      };
      return {
        schoolId: "20000000-0000-4000-8000-000000000099",
        db: { rpc: mock.rpc, from: () => chain },
      };
    },
  };
});
import { POST } from "@/app/api/export/route";
const examId = "20000000-0000-4000-8000-000000000022",
  scanId = "20000000-0000-4000-8000-000000000044";
const request = (extra: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ examId, format: "xlsx", ...extra }),
  });
beforeEach(() => {
  mock.readOnly = false;
  mock.rpc.mockReset();
  mock.reviews = [
    {
      id: scanId,
      examId,
      examVersion: 1,
      studentCode: "02074",
      name: "เด็กชายทดสอบ ระบบ",
      classroom: "ม.1/1",
      number: null,
      reason: "",
      status: "verified",
      rawAnswers: Array.from({ length: 20 }, (_, i) => ({
        question: i + 1,
        choice: "A",
        state: "valid",
      })),
      corrections: {},
      resolved: [],
      audit: [],
    },
  ];
  mock.versions = [1, 2].map((version_no) => ({
    version_no,
    config_json: {
      title: "ข้อสอบ",
      subject: "คณิตศาสตร์",
      classroom: "ม.1/1",
      examType: "เก็บคะแนน",
      year: 2569,
      term: 1,
      questionCount: 20,
      choiceCount: 4,
      passingPercent: 50,
      answerKey: Array.from({ length: 20 }, (_, i) => ({
        question: i + 1,
        correct: version_no === 1 ? "A" : "B",
        points: 1,
      })),
    },
  }));
  mock.rpc.mockImplementation(async (name) => ({
    data: name === "get_scan_reviews" ? mock.reviews : crypto.randomUUID(),
    error: null,
  }));
});
describe("authoritative confirmed-score export", () => {
  it("uses the scanned key version and preserves leading-zero codes; ignores forged scores", async () => {
    const response = await POST(request({ rows: [{ score: 999 }] }));
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.rows[0]).toMatchObject({
      รหัสนักเรียน: "02074",
      คะแนนที่ได้: 20,
      คะแนนเต็ม: 20,
      สถานะ: "ยืนยันแล้ว",
    });
    expect(mock.rpc).toHaveBeenCalledWith("get_scan_reviews", {
      tenant: "20000000-0000-4000-8000-000000000099",
      exam_filter: examId,
    });
    expect(mock.rpc).toHaveBeenCalledWith("register_score_export", {
      input: expect.objectContaining({ scan_ids: [scanId], format: "xlsx" }),
    });
  });
  it("does not export or audit unconfirmed/mismatched selected scans", async () => {
    mock.reviews[0].status = "needs_review";
    expect((await POST(request())).status).toBe(422);
    expect(
      mock.rpc.mock.calls.some((c) => c[0] === "register_score_export"),
    ).toBe(false);
    mock.reviews[0].status = "verified";
    expect(
      (await POST(request({ scanIds: [crypto.randomUUID()] }))).status,
    ).toBe(422);
  });
  it("requires a historical key and rejects read-only owner exports", async () => {
    mock.versions = [];
    expect((await POST(request())).status).toBe(409);
    mock.readOnly = true;
    expect((await POST(request())).status).toBe(403);
  });
  it("requires a valid format and returns JSON for malformed requests", async () => {
    const response = await POST(request({ format: "json" }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("INVALID_EXPORT");
  });
});
