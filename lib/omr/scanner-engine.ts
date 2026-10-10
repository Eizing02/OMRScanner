import type { Quad } from "./camera-geometry";

export type Detection = { quad: Quad | null; coverage: number };
export interface DocumentDetector {
  readonly engine: "scanic" | "scanic-worker" | "jscanify";
  detect(frame: HTMLCanvasElement): Promise<Detection>;
  warp(
    source: HTMLCanvasElement,
    quad: Quad,
    single: boolean,
  ): Promise<HTMLCanvasElement>;
  dispose(): void;
}
export function paperPixels(single: boolean) {
  const width = single ? 900 : 1800;
  return {
    width,
    height: Math.round(width * (single ? 210 / 148.5 : 210 / 297)),
  };
}
