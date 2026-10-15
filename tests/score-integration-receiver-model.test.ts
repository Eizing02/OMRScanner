import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { payloadHash } from "@/lib/integrations/mathquest/security";
import {
  scoreEventSchema,
  type ScoreEvent,
} from "@/lib/integrations/mathquest/contract";
import { syntheticScoreEvent } from "./score-integration-event-fixture";

/** Contract fixture only. MathQuest must implement and test equivalent transactional behavior. */
class ReceiverModel {
  private events = new Map<string, string>();
  private revisions = new Map<string, number>();
  private results = new Map<string, number>();

  ingest(raw: string) {
    const event = scoreEventSchema.parse(JSON.parse(raw));
    const hash = payloadHash(raw),
      seen = this.events.get(event.event_id);
    if (seen && seen !== hash) throw new Error("EVENT_HASH_CONFLICT");
    if (seen) return "duplicate";
    const key = `${event.source_workspace_id}:${event.source_exam_id}`;
    const current = this.revisions.get(key) ?? 0;
    if (event.publication_revision < current) {
      this.events.set(event.event_id, hash);
      return "stale_ignored";
    }
    if (event.publication_revision > current) {
      this.revisions.set(key, event.publication_revision);
    }
    if (event.action === "withdraw_exam") {
      for (const resultKey of this.results.keys())
        if (resultKey.startsWith(`${key}:`)) this.results.delete(resultKey);
    }
    if (event.action === "publish_results")
      for (const result of event.results)
        this.results.set(`${key}:${result.student_code}`, result.score);
    this.events.set(event.event_id, hash);
    return "processed";
  }

  score(event: ScoreEvent, student: string) {
    return this.results.get(
      `${event.source_workspace_id}:${event.source_exam_id}:${student}`,
    );
  }
}

describe("shared receiver ordering fixture", () => {
  it("is idempotent by event id and rejects changed bytes", () => {
    const receiver = new ReceiverModel(),
      event = scoreEventSchema.parse(syntheticScoreEvent()),
      raw = JSON.stringify(event);
    expect(receiver.ingest(raw)).toBe("processed");
    expect(receiver.ingest(raw)).toBe("duplicate");
    expect(() =>
      receiver.ingest(
        JSON.stringify({ ...event, occurred_at: "2026-10-15T01:01:01.000Z" }),
      ),
    ).toThrow("EVENT_HASH_CONFLICT");
  });

  it("does not resurrect an older publish after a newer revision or withdrawal", () => {
    const receiver = new ReceiverModel(),
      base = scoreEventSchema.parse(syntheticScoreEvent());
    const revision2 = {
      ...base,
      event_id: crypto.randomUUID(),
      publication_revision: 2,
    };
    expect(receiver.ingest(JSON.stringify(revision2))).toBe("processed");
    expect(
      receiver.ingest(
        JSON.stringify({
          ...base,
          event_id: crypto.randomUUID(),
          publication_revision: 1,
        }),
      ),
    ).toBe("stale_ignored");
    const withdrawal = {
      ...base,
      event_id: crypto.randomUUID(),
      publication_revision: 3,
      action: "withdraw_exam" as const,
      batch_index: 0,
      batch_count: 1,
      results: [],
    };
    expect(receiver.ingest(JSON.stringify(withdrawal))).toBe("processed");
    expect(receiver.score(base, "00123")).toBeUndefined();
    expect(
      receiver.ingest(
        JSON.stringify({ ...revision2, event_id: crypto.randomUUID() }),
      ),
    ).toBe("stale_ignored");
  });

  it("keeps additive batches from one revision regardless of arrival order", () => {
    const receiver = new ReceiverModel(),
      base = scoreEventSchema.parse(syntheticScoreEvent());
    const second = { ...base.results[0], student_code: "00124" };
    const batch1 = {
      ...base,
      event_id: crypto.randomUUID(),
      publication_revision: 4,
      batch_index: 1,
      batch_count: 2,
      results: [second],
    };
    const batch0 = {
      ...base,
      event_id: crypto.randomUUID(),
      publication_revision: 4,
      batch_index: 0,
      batch_count: 2,
    };
    expect(receiver.ingest(JSON.stringify(batch1))).toBe("processed");
    expect(receiver.ingest(JSON.stringify(batch0))).toBe("processed");
    expect(receiver.score(base, "00123")).toBe(base.results[0].score);
    expect(receiver.score(base, "00124")).toBe(base.results[0].score);
  });

  it("never treats a missing student in a newer publish as a deletion", () => {
    const receiver = new ReceiverModel(),
      base = scoreEventSchema.parse(syntheticScoreEvent());
    receiver.ingest(JSON.stringify(base));
    receiver.ingest(
      JSON.stringify({
        ...base,
        event_id: crypto.randomUUID(),
        publication_revision: 2,
        results: [{ ...base.results[0], student_code: "00124" }],
      }),
    );
    expect(receiver.score(base, "00123")).toBe(base.results[0].score);
    expect(receiver.score(base, "00124")).toBe(base.results[0].score);
  });
});
