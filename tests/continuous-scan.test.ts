import { describe, expect, it } from "vitest";
import { PaperRearm, scanUploadForm } from "@/lib/omr/scan-batch";
import { batchReviewSchema } from "@/types/scan";
describe("continuous paper capture safety", () => {
  it("cannot re-arm from a shared QR or movement; requires consecutive paper removal", () => {
    const gate = new PaperRearm();
    gate.captured();
    for (let i = 0; i < 20; i++) expect(gate.observe(true)).toBe(false);
    expect(gate.observe(false)).toBe(false);
    expect(gate.observe(false)).toBe(false);
    expect(gate.observe(true)).toBe(false);
    expect(gate.observe(false)).toBe(false);
    expect(gate.observe(false)).toBe(false);
    expect(gate.observe(false)).toBe(true);
    gate.captured();
    expect(gate.blocked).toBe(true);
  });
  it("retries keep the same request identity and send only processed evidence", () => {
    const input = {
      id: crypto.randomUUID(),
      processed: new Blob(["retained-jpeg"], { type: "image/jpeg" }),
      paper: "single" as const,
      examId: crypto.randomUUID(),
    };
    const first = scanUploadForm(input),
      retry = scanUploadForm(input);
    expect(first.get("metadata")).toBe(retry.get("metadata"));
    expect([...first.keys()]).toEqual(["metadata", "processed"]);
    expect(JSON.parse(String(first.get("metadata"))).replacePending).toBe(
      false,
    );
  });
  it("requires bounded, unique, revision-guarded confirmation selections", () => {
    const item = { scanId: crypto.randomUUID(), revision: 1 };
    expect(
      batchReviewSchema.safeParse({ action: "confirm_batch", items: [item] })
        .success,
    ).toBe(true);
    expect(
      batchReviewSchema.safeParse({
        action: "confirm_batch",
        items: [{ scanId: item.scanId }],
      }).success,
    ).toBe(false);
    expect(
      batchReviewSchema.safeParse({
        action: "preview_confirm",
        items: [item, item],
      }).success,
    ).toBe(false);
    expect(
      batchReviewSchema.safeParse({
        action: "preview_confirm",
        items: Array.from({ length: 51 }, () => ({
          scanId: crypto.randomUUID(),
        })),
      }).success,
    ).toBe(false);
  });
});
