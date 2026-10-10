import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as ts from "typescript";
import { gzipSync } from "node:zlib";
import { captureFixture } from "../capture-fixture";
import sharp from "sharp";
import { readOpticalMarks } from "../../lib/omr/detect-bubbles";
import { readLockedQr, qrAlignmentError } from "../../lib/omr/scan-qr";

/** Test-only module bridge. No benchmark/debug route is shipped in the application. */
test("repeatable classical/legacy browser detection benchmark", async ({
  page,
  context,
}, testInfo) => {
  const allowed = new Set([
    "document-edge-detector",
    "scanner-engine",
    "scanic-coordinates",
    "scanic-adapter",
    "scanic.worker",
    "camera-geometry",
    "legacy-detector",
    "compress-image",
  ]);
  await context.route("**/__scanner_modules/**", async (route) => {
    const name = new URL(route.request().url()).pathname
      .split("/")
      .pop()!
      .replace(/\.ts$/, "");
    let body: string;
    if (name === "scanic.js")
      body = await readFile(
        resolve("node_modules/scanic/dist/scanic.js"),
        "utf8",
      );
    else if (name === "jscanify.js")
      body = `const module={exports:{}}; const exports=module.exports;\n${await readFile(resolve("node_modules/jscanify/src/jscanify.js"), "utf8")}\nexport default module.exports;`;
    else {
      if (!allowed.has(name)) return route.abort();
      body = ts
        .transpileModule(
          await readFile(resolve(`lib/omr/${name}.ts`), "utf8"),
          {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          },
        )
        .outputText.replaceAll(
          'from "scanic"',
          'from "/__scanner_modules/scanic.js"',
        )
        .replaceAll(
          'import("scanic")',
          'import("/__scanner_modules/scanic.js")',
        )
        .replaceAll('"jscanify/client"', '"/__scanner_modules/jscanify.js"')
        .replaceAll("process.env.NEXT_PUBLIC_SCANNER_ENGINE", '"scanic"');
    }
    await route.fulfill({ body, contentType: "text/javascript" });
  });
  const { image, template } = await captureFixture();
  await page.goto("/scan");
  const report = await page.evaluate(
    async (png) => {
      // Runtime import is served by the bounded test-only bridge above.
      const engineUrl = "/__scanner_modules/document-edge-detector",
        compressionUrl = "/__scanner_modules/compress-image";
      const { createDocumentDetector } = (await import(
        /* webpackIgnore: true */ engineUrl
      )) as typeof import("../../lib/omr/document-edge-detector");
      const { compressScanBlob } = (await import(
        /* webpackIgnore: true */ compressionUrl
      )) as typeof import("../../lib/omr/compress-image");
      const image = new Image();
      image.src = png;
      await image.decode();
      type NativeQr = {
        new (options: { formats: string[] }): {
          detect: (image: HTMLImageElement) => Promise<{ rawValue: string }[]>;
        };
        getSupportedFormats: () => Promise<string[]>;
      };
      const Native = (globalThis as unknown as { BarcodeDetector?: NativeQr })
        .BarcodeDetector;
      const nativeQr: {
        available: boolean;
        qrSupported: boolean;
        tokens: string[];
        elapsedMs: number | null;
        error: string | null;
      } = {
        available: Boolean(Native),
        qrSupported: false,
        tokens: [],
        elapsedMs: null,
        error: null,
      };
      if (Native) {
        try {
          nativeQr.qrSupported = (await Native.getSupportedFormats()).includes(
            "qr_code",
          );
          if (nativeQr.qrSupported) {
            const native = new Native({ formats: ["qr_code"] });
            const started = performance.now();
            nativeQr.tokens = (await native.detect(image)).map(
              (qr) => qr.rawValue,
            );
            nativeQr.elapsedMs = performance.now() - started;
          }
        } catch (error) {
          nativeQr.error =
            error instanceof Error ? error.message : "NATIVE_QR_FAILED";
        }
      }
      const rows: Record<string, unknown>[] = [];
      const evidence: {
        candidate: string;
        quality: number;
        bytes: number[];
      }[] = [];
      const source = document.createElement("canvas");
      source.width = 1200;
      source.height = 1600;
      const ctx = source.getContext("2d")!;
      ctx.fillStyle = "#273642";
      ctx.fillRect(0, 0, 1200, 1600);
      ctx.drawImage(image, 150, 160, 900, 1273);
      const median = (numbers: number[]) =>
        [...numbers].sort((a, b) => a - b)[Math.floor(numbers.length / 2)];
      for (const candidate of [
        "legacy",
        "scanic-main",
        "scanic-worker",
      ] as const) {
        const opened = performance.now();
        const engine = await createDocumentDetector({
          engine: candidate === "legacy" ? "legacy" : "scanic",
          worker: candidate === "scanic-worker",
        });
        const initMs = performance.now() - opened;
        for (const size of [480, 640, 800]) {
          const frame = document.createElement("canvas");
          frame.height = size;
          frame.width = Math.round((size * 1200) / 1600);
          frame
            .getContext("2d")!
            .drawImage(source, 0, 0, frame.width, frame.height);
          const samples: number[] = [];
          let found = 0;
          let error = 0;
          for (let i = 0; i < 15; i++) {
            const start = performance.now();
            const result = await engine.detect(frame);
            const elapsed = performance.now() - start;
            if (i < 3) continue;
            samples.push(elapsed);
            if (result.quad) {
              found++;
              const expected = [
                { x: 0.125, y: 0.1 },
                { x: 0.875, y: 0.1 },
                { x: 0.875, y: 1433 / 1600 },
                { x: 0.125, y: 1433 / 1600 },
              ];
              error += Math.max(
                ...result.quad.map((p: { x: number; y: number }, j: number) =>
                  Math.hypot(
                    (p.x - expected[j].x) * source.width,
                    (p.y - expected[j].y) * source.height,
                  ),
                ),
              );
            }
          }
          rows.push({
            candidate,
            engine: engine.engine,
            longEdge: size,
            initMs,
            medianMs: median(samples),
            p95Ms: [...samples].sort((a, b) => a - b)[
              Math.ceil(samples.length * 0.95) - 1
            ],
            detected: found,
            samples: samples.length,
            meanMaxCornerErrorSourcePx: found ? error / found : null,
          });
        }
        const result = await engine.detect(source);
        if (result.quad) {
          const start = performance.now();
          const rectified = await engine.warp(source, result.quad, true);
          const warpMs = performance.now() - start;
          for (const quality of [0.9, 0.85, 0.8, 0.75]) {
            const start = performance.now();
            const blob = await compressScanBlob(rectified, 1800, quality);
            rows.push({
              candidate,
              operation: "compression",
              quality,
              bytes: blob.size,
              encodeMs: performance.now() - start,
              warpMs,
            });
            evidence.push({
              candidate,
              quality,
              bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
            });
          }
        }
        engine.dispose();
      }
      return {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        nativeQr,
        fixture:
          "synthetic half-A4, straight edges, same pixels for all engines",
        rows,
        evidence,
      };
    },
    `data:image/png;base64,${image.toString("base64")}`,
  );
  const assets = await Promise.all(
    [
      "node_modules/scanic/dist/scanic.js",
      "public/omr-assets/opencv.js",
      "node_modules/jscanify/src/jscanify.js",
    ].map(async (path) => {
      const bytes = await readFile(resolve(path));
      return { path, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
    }),
  );
  const optical = [];
  for (const evidence of report.evidence) {
    const start = performance.now();
    const { data, info } = await sharp(Buffer.from(evidence.bytes))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const decodeMs = performance.now() - start;
    const raster = {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data),
    };
    const qrStart = performance.now(),
      qr = readLockedQr(raster, template),
      qrMs = performance.now() - qrStart;
    const omrStart = performance.now(),
      read = readOpticalMarks(raster, template),
      omrMs = performance.now() - omrStart;
    expect(qr?.token).toBe(template.set_token);
    expect(qrAlignmentError(raster, template, qr!)).toBeNull();
    expect(read.studentCode).toBe("02074");
    expect(
      read.answers.every(
        (answer) => answer.choice === "A" && answer.state === "valid",
      ),
    ).toBe(true);
    optical.push({
      candidate: evidence.candidate,
      quality: evidence.quality,
      bytes: evidence.bytes.length,
      decodeMs,
      qrMs,
      omrMs,
      id: "02074",
      validAnswers: read.answers.filter((answer) => answer.state === "valid")
        .length,
    });
  }
  const { evidence: _evidence, ...measurements } = report;
  if (report.nativeQr.tokens.length)
    expect(report.nativeQr.tokens).toContain(template.set_token);
  void _evidence;
  await testInfo.attach("scanner-benchmark.json", {
    body: JSON.stringify({ ...measurements, optical, assets }, null, 2),
    contentType: "application/json",
  });
  console.log(JSON.stringify({ ...measurements, optical, assets }, null, 2));
  expect(
    report.rows
      .filter((row) => row.longEdge)
      .every((row) => row.detected === 12),
  ).toBe(true);
  expect(
    report.rows.find((row) => row.candidate === "scanic-worker")?.engine,
  ).toBe("scanic-worker");
});
