/// <reference lib="webworker" />
import { Scanner } from "scanic";
import { normalizedCorners } from "./scanic-coordinates";
import { polygonArea } from "./camera-geometry";

const scanner = new Scanner({
  detector: "classical",
  mode: "detect",
  maxProcessingDimension: 800,
});
const ready = scanner.initialize();
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    width: number;
    height: number;
    buffer?: ArrayBuffer;
  }>,
) => {
  const { id, width, height, buffer } = event.data;
  try {
    await ready;
    if (!buffer) {
      self.postMessage({ id, ready: true });
      return;
    }
    const result = await scanner.scan(
      new ImageData(new Uint8ClampedArray(buffer), width, height),
    );
    const quad = normalizedCorners(result.corners, width, height);
    self.postMessage({ id, quad, coverage: quad ? polygonArea(quad) : 0 });
  } catch {
    self.postMessage({ id, error: "SCANNER_WORKER_FAILED" });
  }
};
