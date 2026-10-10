import { describe, expect, it, vi, afterEach } from "vitest";
import {
  defaultQuad,
  paperPoint,
  smoothQuad,
  type Quad,
} from "@/lib/omr/camera-geometry";
import { normalizedCorners, pixelCorners } from "@/lib/omr/scanic-coordinates";
import { detectionCadence, previewDimension } from "@/lib/omr/camera-loop";
import { paperPixels } from "@/lib/omr/scanner-engine";
import { scannerPhase } from "@/lib/omr/scanner-state";
import { experimentalLocalFill } from "@/lib/omr/experimental-threshold";
import { fillPercentage } from "@/lib/omr/detect-bubbles";

afterEach(() => vi.unstubAllEnvs());
describe("scanner coordinate/pipeline invariants", () => {
  it("normalizes input pixels, never a presumed internal 800px scale", () => {
    for (const [w, h] of [
      [480, 640],
      [640, 480],
      [800, 1200],
      [4032, 3024],
    ]) {
      const pixels = pixelCorners(defaultQuad, w, h);
      const normalized = normalizedCorners(pixels, w, h)!;
      normalized.forEach((p, i) => {
        expect(p.x).toBeCloseTo(defaultQuad[i].x, 12);
        expect(p.y).toBeCloseTo(defaultQuad[i].y, 12);
      });
    }
    expect(normalizedCorners(null, 800, 600)).toBeNull();
    expect(
      normalizedCorners(
        { ...pixelCorners(defaultQuad, 800, 600), topLeft: { x: -2, y: 3 } },
        800,
        600,
      ),
    ).toBeNull();
  });
  it("preserves the existing physical crop dimensions", () => {
    expect(paperPixels(true)).toEqual({ width: 900, height: 1273 });
    expect(paperPixels(false)).toEqual({ width: 1800, height: 1273 });
  });
  it("uses smoothed corners only for display and maps all four overlay corners exactly", () => {
    const quad: Quad = [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.2, y: 0.8 },
    ];
    for (const [i, u, v] of [
      [0, 0, 0],
      [1, 1, 0],
      [2, 1, 1],
      [3, 0, 1],
    ]) {
      const point = paperPoint(quad, u, v);
      expect(point.x).toBeCloseTo(quad[i].x);
      expect(point.y).toBeCloseTo(quad[i].y);
    }
    const raw = structuredClone(quad);
    expect(smoothQuad(defaultQuad, quad)).not.toEqual(quad);
    expect(quad).toEqual(raw);
  });
  it("bounds adaptive cadence and preview size", () => {
    expect(detectionCadence(10)).toBe(120);
    expect(detectionCadence(500)).toBe(400);
    expect(previewDimension(110)).toBe(480);
    expect(previewDimension(60)).toBe(640);
    expect(previewDimension(20)).toBe(800);
  });
  it("keeps saved scores in review, not confirmed/completed", () => {
    const state = {
      busy: false,
      live: false,
      source: false,
      crop: false,
      saved: false,
      error: false,
      progress: 0,
      detected: false,
      capturing: false,
    };
    expect(scannerPhase(state)).toBe("idle");
    expect(scannerPhase({ ...state, live: true, busy: true })).toBe(
      "initializing",
    );
    expect(scannerPhase({ ...state, saved: true })).toBe("needs_review");
    expect(scannerPhase({ ...state, live: true, capturing: true })).toBe(
      "capturing",
    );
  });
  it("benchmarks local normalization without silently activating it", () => {
    const data = new Uint8ClampedArray(60 * 60 * 4).fill(100);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const image = { width: 60, height: 60, data };
    expect(fillPercentage(image, 30, 30, 5)).toBe(100); // Baseline sees the dark background as ink.
    expect(experimentalLocalFill(image, 30, 30, 5).fill).toBe(0);
    for (let y = 25; y <= 35; y++)
      for (let x = 25; x <= 35; x++) {
        const i = (y * 60 + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 30;
      }
    expect(experimentalLocalFill(image, 30, 30, 5).fill).toBe(100);
  });
});
