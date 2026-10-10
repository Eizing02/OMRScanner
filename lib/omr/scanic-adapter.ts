import { polygonArea, type Quad } from "./camera-geometry";
import { normalizedCorners, pixelCorners } from "./scanic-coordinates";
import {
  paperPixels,
  type Detection,
  type DocumentDetector,
} from "./scanner-engine";

export async function createScanicAdapter(
  useWorker = true,
): Promise<DocumentDetector> {
  const api = await import("scanic");
  let worker: Worker | null = null;
  let serial = 0;
  let disposed = false;
  let pending: {
    id: number;
    resolve: (value: Detection) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  function cancel() {
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("SCANNER_CLOSED"));
      pending = null;
    }
    worker?.terminate();
    worker = null;
  }
  function run(width: number, height: number, buffer?: ArrayBuffer) {
    return new Promise<Detection>((resolve, reject) => {
      if (!worker || disposed || pending) {
        reject(new Error("SCANNER_UNAVAILABLE"));
        return;
      }
      const id = ++serial;
      const timer = setTimeout(() => {
        cancel();
      }, 10_000);
      pending = { id, resolve, reject, timer };
      worker.postMessage({ id, width, height, buffer }, buffer ? [buffer] : []);
    });
  }
  if (
    useWorker &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined"
  ) {
    try {
      worker = new Worker(new URL("./scanic.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (
        event: MessageEvent<Detection & { id: number; error?: string }>,
      ) => {
        if (!pending || event.data.id !== pending.id) return;
        const task = pending;
        pending = null;
        clearTimeout(task.timer);
        if (event.data.error) task.reject(new Error(event.data.error));
        else task.resolve(event.data);
      };
      worker.onerror = () => cancel();
      await run(0, 0);
    } catch {
      cancel();
    }
  }
  // No ML/CDN model. Without OffscreenCanvas use the same classical engine on the main thread.
  const scanner = worker
    ? null
    : new api.Scanner({
        detector: "classical",
        mode: "detect",
        maxProcessingDimension: 800,
      });
  await scanner?.initialize();
  const preview = document.createElement("canvas");
  return {
    engine: worker ? "scanic-worker" : "scanic",
    async detect(frame) {
      if (disposed) throw new Error("SCANNER_CLOSED");
      if (Math.max(frame.width, frame.height) > 800) {
        const scale = 800 / Math.max(frame.width, frame.height);
        preview.width = Math.round(frame.width * scale);
        preview.height = Math.round(frame.height * scale);
        preview
          .getContext("2d")
          ?.drawImage(frame, 0, 0, preview.width, preview.height);
        frame = preview;
      }
      if (worker) {
        const ctx = frame.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("อ่านภาพไม่ได้");
        const pixels = ctx.getImageData(0, 0, frame.width, frame.height);
        return run(
          frame.width,
          frame.height,
          pixels.data.buffer as ArrayBuffer,
        );
      }
      if (!scanner) throw new Error("SCANNER_UNAVAILABLE");
      const result = await scanner.scan(frame);
      const quad = normalizedCorners(result.corners, frame.width, frame.height);
      return { quad, coverage: quad ? polygonArea(quad) : 0 };
    },
    async warp(source, quad: Quad, single) {
      if (disposed) throw new Error("SCANNER_CLOSED");
      const result = await api.extractDocument(
        source,
        pixelCorners(quad, source.width, source.height),
        { output: "canvas" },
      );
      if (!result.success || !(result.output instanceof HTMLCanvasElement))
        throw new Error("ปรับมุมภาพไม่ได้ กรุณาปรับมุมใหม่");
      const output = document.createElement("canvas");
      Object.assign(output, paperPixels(single));
      const ctx = output.getContext("2d");
      if (!ctx) throw new Error("อ่านภาพไม่ได้");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.drawImage(result.output, 0, 0, output.width, output.height);
      // Preserve the existing physical OMR aspect ratio, not Scanic's estimated aspect.
      result.output.width = result.output.height = 0;
      return output;
    },
    dispose() {
      disposed = true;
      cancel();
      preview.width = preview.height = 0;
    },
  };
}
