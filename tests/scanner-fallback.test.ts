import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ scanic: vi.fn(), legacy: vi.fn() }));
vi.mock("@/lib/omr/scanic-adapter", () => ({
  createScanicAdapter: mock.scanic,
}));
vi.mock("@/lib/omr/legacy-detector", () => ({
  createLegacyDetector: mock.legacy,
}));
import { createDocumentDetector } from "@/lib/omr/document-edge-detector";
const frame = {} as HTMLCanvasElement;
beforeEach(() => {
  mock.scanic.mockReset();
  mock.legacy.mockReset();
});
function engine(name: "scanic" | "jscanify") {
  return {
    engine: name,
    detect: vi.fn().mockResolvedValue({ quad: null, coverage: 0 }),
    warp: vi.fn(),
    dispose: vi.fn(),
  };
}
describe("document-engine fallback and lifecycle", () => {
  it("does not download OpenCV for an ordinary detection miss", async () => {
    const raw = engine("scanic");
    mock.scanic.mockResolvedValue(raw);
    const detector = await createDocumentDetector();
    expect((await detector.detect(frame)).quad).toBeNull();
    expect(mock.legacy).not.toHaveBeenCalled();
    detector.dispose();
    expect(raw.dispose).toHaveBeenCalledOnce();
  });
  it("loads legacy only after an actual runtime failure, then keeps it", async () => {
    const raw = engine("scanic"),
      legacy = engine("jscanify");
    raw.detect.mockRejectedValue(new Error("WASM_FAILED"));
    mock.scanic.mockResolvedValue(raw);
    mock.legacy.mockResolvedValue(legacy);
    const detector = await createDocumentDetector();
    await detector.detect(frame);
    await detector.detect(frame);
    expect(detector.engine).toBe("jscanify");
    expect(mock.legacy).toHaveBeenCalledOnce();
    expect(raw.dispose).toHaveBeenCalledOnce();
  });
  it("supports explicit rollback without initializing Scanic", async () => {
    mock.legacy.mockResolvedValue(engine("jscanify"));
    const detector = await createDocumentDetector({ engine: "legacy" });
    await detector.detect(frame);
    expect(mock.scanic).not.toHaveBeenCalled();
  });
  it("serializes capture and preview, and will not fallback after disposal", async () => {
    const raw = engine("scanic");
    let release!: () => void;
    raw.detect.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ quad: null, coverage: 0 });
        }),
    );
    mock.scanic.mockResolvedValue(raw);
    const detector = await createDocumentDetector();
    const first = detector.detect(frame),
      second = detector.detect(frame);
    await Promise.resolve();
    expect(raw.detect).toHaveBeenCalledOnce();
    detector.dispose();
    release();
    await first;
    await expect(second).rejects.toThrow("SCANNER_CLOSED");
    expect(mock.legacy).not.toHaveBeenCalled();
  });
});
