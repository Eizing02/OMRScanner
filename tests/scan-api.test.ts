import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import QRCode from "qrcode";
import {
  defaultLayout,
  compileOmrTemplate,
  resolveGeometry,
} from "@/lib/omr/generate-template";
import { createSetIdentity } from "@/lib/omr/qr";
const mock = vi.hoisted(() => ({
  authenticated: true,
  readOnly: false,
  templates: [] as unknown[],
  rpc: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/api", async (original) => {
  const actual = await original<typeof import("@/lib/supabase/api")>();
  return {
    ...actual,
    context: async (write = false) => {
      if (!mock.authenticated)
        throw new actual.ApiError("UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ", 401);
      if (write && mock.readOnly)
        throw new actual.ApiError("READ_ONLY_WORKSPACE", "อ่านอย่างเดียว", 403);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: mock.templates[0] ?? null,
          error: null,
        }),
        in: async () => ({ data: mock.templates, error: null }),
      };
      return {
        schoolId: "20000000-0000-4000-8000-000000000099",
        db: {
          from: () => chain,
          rpc: mock.rpc,
          storage: {
            from: () => ({ upload: mock.upload, download: mock.download }),
          },
        },
      };
    },
  };
});
import { GET, POST, PATCH } from "@/app/api/scan-records/route";
const examId = "20000000-0000-4000-8000-000000000022";
let single: string, double: string, blank: string, template: unknown;
const post = (overrides: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/scan-records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      original: single,
      processed: single,
      paper: "single",
      expectedExamId: examId,
      ...overrides,
    }),
  });
beforeAll(async () => {
  const layout = { ...defaultLayout, examId },
    g = resolveGeometry(layout),
    omr = compileOmrTemplate(layout),
    identity = await createSetIdentity(layout);
  template = {
    id: crypto.randomUUID(),
    exam_id: examId,
    exam_version_id: crypto.randomUUID(),
    set_token: identity.token,
    layout_json: layout,
    omr_json: omr,
  };
  const qr = await QRCode.toDataURL(identity.token, { width: 300, margin: 4 });
  async function sheet(code: string) {
    const circles =
      omr.centersMm.id
        .filter((b) => code[b.digit] === String(b.value))
        .map((b) => `<circle cx="${b.x}" cy="${b.y}" r="1.8"/>`)
        .join("") +
      omr.centersMm.answers
        .filter((b) => b.option === 0)
        .map((b) => `<circle cx="${b.x}" cy="${b.y}" r="1.8"/>`)
        .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1273" viewBox="0 0 148.5 210"><rect width="148.5" height="210" fill="white"/>${g.markers.map((m) => `<rect x="${m.x}" y="${m.y}" width="3" height="3"/>`).join("")}<image href="${qr}" x="${g.qr.x}" y="${g.qr.y}" width="${g.qr.width}" height="${g.qr.width}"/>${circles}</svg>`;
    return await sharp(Buffer.from(svg)).png().toBuffer();
  }
  const a = await sheet("02074"),
    b = await sheet("00005");
  single = `data:image/png;base64,${a.toString("base64")}`;
  double = `data:image/png;base64,${(
    await sharp({
      create: { width: 1800, height: 1273, channels: 3, background: "white" },
    })
      .composite([
        { input: a, left: 0, top: 0 },
        { input: b, left: 900, top: 0 },
      ])
      .png()
      .toBuffer()
  ).toString("base64")}`;
  blank = `data:image/png;base64,${(
    await sharp({
      create: { width: 900, height: 1273, channels: 3, background: "white" },
    })
      .png()
      .toBuffer()
  ).toString("base64")}`;
});
beforeEach(() => {
  mock.authenticated = true;
  mock.readOnly = false;
  mock.templates = [template];
  mock.rpc.mockReset();
  mock.upload.mockReset();
  mock.download.mockReset();
  mock.upload.mockResolvedValue({ data: {}, error: null });
  mock.rpc.mockImplementation(async (name) =>
    name === "reserve_scan_upload"
      ? {
          data: {
            id: crypto.randomUUID(),
            original_path: "school/request/original.jpg",
            processed_path: "school/request/processed.jpg",
            status: "staging",
          },
          error: null,
        }
      : { data: [{ id: crypto.randomUUID() }], error: null },
  );
});
describe("scan HTTP boundary with real compressed QR/OMR pixels", () => {
  it("derives student/answers from pixels, ignores forged client scores, stores private JPEGs", async () => {
    const response = await POST(post({ score: 999, studentCode: "99999" }));
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(
      201,
    );
    const call = mock.rpc.mock.calls.find((c) => c[0] === "save_scan_batch")!;
    expect(call[1].input.records[0].student_code).toBe("02074");
    expect(call[1].input.records[0].answers).toHaveLength(20);
    expect(call[1].input.records[0].answers[0]).toMatchObject({
      choice: "A",
      state: "valid",
    });
    expect(call[1].input).not.toHaveProperty("score");
    expect(mock.upload).toHaveBeenCalledTimes(2);
    expect(mock.upload.mock.calls[0][2]).toEqual({
      contentType: "image/jpeg",
      upsert: false,
    });
  });
  it("reads both leaves of a two-up A4 without mixing student identities", async () => {
    const response = await POST(
      post({ original: double, processed: double, paper: "a4" }),
    );
    expect(response.status).toBe(201);
    const records = mock.rpc.mock.calls.find(
      (c) => c[0] === "save_scan_batch",
    )![1].input.records;
    expect(
      records.map((r: { student_code: string; slot: number }) => [
        r.student_code,
        r.slot,
      ]),
    ).toEqual([
      ["02074", 0],
      ["00005", 1],
    ]);
  });
  it("rejects a QR-less photo before reserving or uploading anything", async () => {
    const response = await POST(post({ original: blank, processed: blank }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("QR_NOT_FOUND");
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("rejects an exam mismatch and missing QR registration", async () => {
    expect(
      (await POST(post({ expectedExamId: crypto.randomUUID() }))).status,
    ).toBe(422);
    mock.templates = [];
    const missing = await POST(post());
    expect(missing.status).toBe(422);
    expect((await missing.json()).error.code).toBe("QR_NOT_REGISTERED");
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("returns JSON for malformed images and unauthorized/read-only access", async () => {
    expect(
      (
        await POST(
          post({ processed: "data:image/png;base64,bm90IGFuIGltYWdl" }),
        )
      ).status,
    ).toBe(422);
    mock.authenticated = false;
    expect((await POST(post())).status).toBe(401);
    mock.authenticated = true;
    mock.readOnly = true;
    expect((await POST(post())).status).toBe(403);
    expect(mock.upload).not.toHaveBeenCalled();
  });
  it("requires replacement reason and audits a refused duplicate in a separate RPC", async () => {
    expect((await POST(post({ replacePending: true }))).status).toBe(422);
    mock.rpc.mockImplementation(async (name) =>
      name === "reserve_scan_upload"
        ? {
            data: {
              id: examId,
              original_path: "a",
              processed_path: "b",
              status: "staging",
            },
            error: null,
          }
        : name === "save_scan_batch"
          ? { data: null, error: { message: "DUPLICATE_SCAN" } }
          : { data: null, error: null },
    );
    const response = await POST(post());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("DUPLICATE_SCAN");
    expect(mock.rpc).toHaveBeenCalledWith("record_duplicate_scan", {
      input: expect.objectContaining({
        code: "DUPLICATE_SCAN",
        upload_id: examId,
      }),
    });
  });
  it("rejects stale edits and requires correction/rejection reasons", async () => {
    const patch = (input: unknown) =>
      new Request("http://localhost/api/scan-records", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
    expect(
      (await PATCH(patch({ scanId: examId, revision: 1, action: "reject" })))
        .status,
    ).toBe(422);
    mock.rpc.mockResolvedValue({
      data: null,
      error: { message: "STALE_REVIEW" },
    });
    expect(
      (
        await PATCH(
          patch({
            scanId: examId,
            revision: 1,
            action: "correct",
            question: 2,
            choice: "A",
            reason: "ตรวจภาพแล้ว",
          }),
        )
      ).status,
    ).toBe(409);
  });
  it("validates public QR payloads without accepting unrelated QR links", async () => {
    expect(
      (
        await GET(
          new Request(
            "http://localhost/api/scan-records?token=https://example.com",
          ),
        )
      ).status,
    ).toBe(422);
    const t = template as { set_token: string };
    expect(
      (
        await GET(
          new Request(`http://localhost/api/scan-records?token=${t.set_token}`),
        )
      ).status,
    ).toBe(200);
  });
});
