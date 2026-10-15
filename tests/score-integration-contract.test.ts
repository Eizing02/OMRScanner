import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import {
  scoreEventSchema,
  validateAcknowledgment,
} from "@/lib/integrations/mathquest/contract";
import {
  sealSecret,
  openSecret,
  tokenBinding,
  payloadHash,
} from "@/lib/integrations/mathquest/security";
import { retrySeconds } from "@/lib/integrations/mathquest/publisher";
export const syntheticEvent = () => ({
  schema_version: "1.0",
  event_id: crypto.randomUUID(),
  connection_id: crypto.randomUUID(),
  source_workspace_id: crypto.randomUUID(),
  source_exam_id: crypto.randomUUID(),
  publication_revision: 1,
  action: "publish_results",
  batch_index: 0,
  batch_count: 1,
  occurred_at: "2026-10-15T00:00:00.000Z",
  exam: {
    title: "ข้อสอบจำลอง",
    subject: "คณิตศาสตร์",
    exam_type: "เก็บคะแนน",
    classroom: "ม.1",
    academic_year: 2569,
    term: 1,
  },
  results: [
    {
      source_scan_id: crypto.randomUUID(),
      source_exam_version_id: crypto.randomUUID(),
      student_code: "00123",
      score: 17.5,
      max_score: 25,
      percent: 70,
      passed: true,
      confirmed_at: "2026-10-15T00:00:00.000Z",
    },
  ],
});
afterEach(() => vi.unstubAllEnvs());
describe("score contract and secret boundaries", () => {
  it("preserves leading zeros and decimals, without answers, photos or names", () => {
    const event = scoreEventSchema.parse(syntheticEvent());
    expect(event.results[0]).toMatchObject({
      student_code: "00123",
      score: 17.5,
    });
    for (const extra of [
      { name: "forged" },
      { image_url: "private" },
      { answers: [] },
      { token: "secret" },
    ])
      expect(
        scoreEventSchema.safeParse({
          ...event,
          results: [{ ...event.results[0], ...extra }],
        }).success,
      ).toBe(false);
  });
  it("rejects wrong codes, non-finite/negative/zero-total/inconsistent scores and duplicate IDs", () => {
    const event = syntheticEvent();
    for (const invalid of [
      { student_code: 123 },
      { student_code: "123" },
      { score: -1 },
      { score: NaN },
      { score: 26 },
      { max_score: 0 },
      { percent: 91 },
    ])
      expect(
        scoreEventSchema.safeParse({
          ...event,
          results: [{ ...event.results[0], ...invalid }],
        }).success,
      ).toBe(false);
    expect(
      scoreEventSchema.safeParse({
        ...event,
        results: [event.results[0], event.results[0]],
      }).success,
    ).toBe(false);
  });
  it("validates withdrawal, batch indices and version literals", () => {
    const event = syntheticEvent();
    expect(
      scoreEventSchema.safeParse({
        ...event,
        action: "withdraw_exam",
        results: [],
      }).success,
    ).toBe(true);
    for (const invalid of [
      { batch_index: 1 },
      { batch_count: 101 },
      { schema_version: "2" },
      { action: "withdraw_exam" },
      { results: [] },
    ])
      expect(scoreEventSchema.safeParse({ ...event, ...invalid }).success).toBe(
        false,
      );
  });
  it("validates response identity/counts and refuses unrelated student identifiers", () => {
    const event = scoreEventSchema.parse(syntheticEvent());
    const ack = {
      schema_version: "1.0",
      event_id: event.event_id,
      status: "processed",
      accepted: 0,
      unmatched: [{ student_code: "00123", reason: "STUDENT_NOT_FOUND" }],
      invalid: [],
    };
    expect(validateAcknowledgment(ack, event).unmatched[0].student_code).toBe(
      "00123",
    );
    for (const invalid of [
      { event_id: crypto.randomUUID() },
      { accepted: 1 },
      { unmatched: [{ student_code: "99999", reason: "STUDENT_NOT_FOUND" }] },
    ])
      expect(() =>
        validateAcknowledgment({ ...ack, ...invalid }, event),
      ).toThrow();
  });
  it("encrypts with authentication and tenant-bound AAD, supports old key versions", () => {
    vi.stubEnv(
      "SCORE_SYNC_ENCRYPTION_KEYS",
      JSON.stringify({ first: "a".repeat(64), second: "b".repeat(64) }),
    );
    vi.stubEnv("SCORE_SYNC_ENCRYPTION_KEY_VERSION", "first");
    const binding = tokenBinding("workspace-a", "connection-a"),
      sealed = sealSecret("synthetic-token", binding);
    expect(JSON.stringify(sealed)).not.toContain("synthetic-token");
    vi.stubEnv("SCORE_SYNC_ENCRYPTION_KEY_VERSION", "second");
    expect(openSecret(sealed, binding)).toBe("synthetic-token");
    expect(() =>
      openSecret(sealed, tokenBinding("workspace-b", "connection-a")),
    ).toThrow();
    expect(() => openSecret({ ...sealed, tag: "invalid" }, binding)).toThrow();
    expect(payloadHash("fixed payload")).toBe(payloadHash("fixed payload"));
  });
  it("bounds exponential backoff and retry-after without unlimited retries", () => {
    expect(retrySeconds(1, 0, () => 0)).toBe(30);
    expect(retrySeconds(2, 0, () => 0)).toBe(60);
    expect(retrySeconds(30, 10000, () => 1)).toBe(3600);
  });
});
