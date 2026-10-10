import type { DocumentDetector } from "./scanner-engine";

/** Lazy, one active engine. A normal "no document" is NOT an engine failure. */
export async function createDocumentDetector(
  options: { engine?: "scanic" | "legacy"; worker?: boolean } = {},
): Promise<DocumentDetector> {
  let closed = false;
  async function legacy(): Promise<DocumentDetector> {
    const raw = await (
      await import("./legacy-detector")
    ).createLegacyDetector();
    return {
      ...raw,
      detect: async (frame) => raw.detect(frame),
      warp: async (source, quad, single) => raw.warp(source, quad, single),
    };
  }
  let active: DocumentDetector;
  try {
    active =
      options.engine === "legacy" ||
      process.env.NEXT_PUBLIC_SCANNER_ENGINE === "legacy"
        ? await legacy()
        : await (
            await import("./scanic-adapter")
          ).createScanicAdapter(options.worker);
  } catch {
    active = await legacy();
  }
  let tail: Promise<unknown> = Promise.resolve();
  function operation<T>(
    run: (engine: DocumentDetector) => Promise<T>,
  ): Promise<T> {
    const task = tail.then(() => execute(run));
    tail = task.catch(() => undefined);
    return task;
  }
  async function execute<T>(
    run: (engine: DocumentDetector) => Promise<T>,
  ): Promise<T> {
    if (closed) throw new Error("SCANNER_CLOSED");
    try {
      return await run(active);
    } catch (error) {
      if (closed || active.engine === "jscanify") throw error;
      active.dispose();
      active = await legacy();
      if (closed) {
        active.dispose();
        throw new Error("SCANNER_CLOSED");
      }
      return run(active);
    }
  }
  return {
    get engine() {
      return active.engine;
    },
    detect: (frame) => operation((engine) => engine.detect(frame)),
    warp: (source, quad, single) =>
      operation((engine) => engine.warp(source, quad, single)),
    dispose() {
      closed = true;
      active.dispose();
    },
  };
}
