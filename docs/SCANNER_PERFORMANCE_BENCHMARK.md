# Scanner performance evidence — 10 October 2026

## Reproduce

```powershell
npm ci
npx playwright install chromium
npm run test:scanner-benchmark
```

Uses a separate local demo server and test-only module bridge, not Supabase production. JSON measurements appear in the console and Playwright attachment `scanner-benchmark.json`. Run it without simultaneous build/tests for cleaner comparisons. No benchmark route is part of the application. Warm-up 3 detections, then 12 samples per engine/size, same synthetic half-A4 pixels (1200×1600 surrounding frame, paper 900×1273, dark desk, QR/markers, ID `02074`, 20 A marks).

## Baseline before source changes

HEAD `05a05444a44d0636b6f8eaa9303345fd27f928df`: typecheck/lint/build passed; 130 unit/API/database tests passed, 1 optional PDF-raster skipped; 25 main browser tests and 5 mock-account browser tests passed; production dependency audit 0. These were local synthetic/PGlite tests, not cloud/physical certification. Old camera used 250ms interval, new canvases, 960px-wide detection, QR about every 750ms, no Worker/ImageCapture and JSON Base64 followed by server JPEG re-encoding.

## Measured local comparison

Chromium 156 headless on Windows, reported 8 logical cores. Final confirmation with optical JPEG validation and native QR probe passed in 12.1s. Initialization figures are within this local run, not cold-network/mobile camera startup. Engines are initialized sequentially; worker runs after Scanic module caching. The legacy detector remains the same implementation as baseline.

| Engine          | Init ms | 480 median / p95 ms | 640 median / p95 ms | 800 median / p95 ms | Warp ms (one sample) |
| --------------- | ------: | ------------------: | ------------------: | ------------------: | -------------------: |
| OpenCV/jscanify |   798.1 |           5.4 / 6.0 |           5.9 / 6.4 |         10.7 / 15.4 |                 96.5 |
| Scanic main     |    39.0 |           7.9 / 8.6 |         14.7 / 23.6 |         21.3 / 24.1 |                 58.7 |
| Scanic worker   |    35.8 |          9.2 / 12.0 |         15.4 / 19.1 |         24.4 / 28.0 |                 37.2 |

All 9 combinations found the synthetic document 12/12 times. This is not a detection/accuracy rate for real papers. Mean maximum corner distance in original-source pixels at 480/640/800: legacy 4.48/3.91/2.24px; Scanic both modes 7.45/5.59/5.66px. **Scanic was slower per detection and had larger corner error on this fixture.** Its load/warp advantages do not establish improved accuracy. The worker's wall time includes transfer/scheduling; it moves detection off the UI thread but CPU/peak RAM savings were not measured.

Earlier valid runs varied (for example worker 800px median 32.9ms/p95 44.3ms versus 24.4ms/28.0ms in this confirmation). Do not convert one local run into a throughput or speedup promise.

| Asset, installed source              |    Bytes | Gzip bytes |
| ------------------------------------ | -------: | ---------: |
| Scanic classical ESM (embedded WASM) |   106590 |      42629 |
| OpenCV local runtime                 | 13298869 |    3763192 |
| jscanify client                      |     7585 |       2054 |

These are package/asset bytes, not the full Next.js route bundle or actual Netlify transfer sizes. Optional ML chunks are not used. The production-path account test also checks that default Scanic does not request `opencv.js`.

## JPEG sweep and optical validation

Each engine's rectified output was encoded at 0.90/0.85/0.80/0.75, then decoded from those exact JPEG bytes in Node. All 12 combinations retained QR, correct ID `02074` and 20 valid A answers, including markers/QR alignment. Blank Thai letters/weak real-pencil/erasure cases are covered only by other synthetic tests or pending physical data, not this sweep.

| Quality           | Legacy JPEG bytes | Scanic JPEG bytes (same both modes) |
| ----------------- | ----------------: | ----------------------------------: |
| .90               |             68339 |                               71353 |
| .85 (new default) |             59386 |                               62433 |
| .80               |             54025 |                               56883 |
| .75               |             49785 |                               52387 |

At .85 in the worker row, encode 7.0ms (single sample), decode 12.96ms, locked QR ROI 3.42ms, OMR 0.38ms. Single-sample timing varies substantially with scheduling; use repeated measurements before an SLO. .85 is a conservative starting policy, not an empirically certified optimum for real pencils. It deliberately produces larger JPEGs than .75 rather than lowering quality to satisfy a byte target.

For **the same** 62433-byte JPEG, Base64 alone is 83244 characters (33.3% encoding overhead); binary avoids that overhead but multipart adds a small boundary/metadata envelope. Compared with the old lower-quality/double-encoded path, total upload bytes are not guaranteed smaller. New safe JPEGs have one encode and are retained byte-for-byte; legacy JSON and necessary normalization remain supported.

## Instrumentation and unmeasured acceptance

The test-only native QR probe checks `BarcodeDetector`/`getSupportedFormats` and attempts the same raster when QR support exists. In this Chromium build `available=false`, so native QR latency/accuracy could not be measured; this is not a claim that every Chrome device lacks it. jsQR remains the production reader, and ZXing was not installed without a demonstrated benefit. API verification: [MDN BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector); candidate upstream: [ZXing browser](https://github.com/zxing-js/browser). No source was copied from either.

Synthetic golden regression additionally covers geometry 2/3/4, 20×4 cut/two-up A4 and 60×5 full A4, QR alignment, exact retained JPEGs and IDs `02074`/`00005`. Those tests do not supply physical faint-pencil/erasure/glare ground truth.

Successful scan POST adds `Server-Timing` for auth/parse/image/QR/template/OMR/reservation/Storage/transaction without PII. `X-Scan-Processing` and private Storage metadata identify the image policy. Capture loop cadence is bounded 120–400ms (up to ~8 detections/s on fast devices, less on slow devices), with one in-flight operation. Scheduler tests verify skipped frames and cleanup; these are not CPU measurements.

Still **not measured**: real camera startup/focus, iOS/Android FOV/EXIF, cold mobile download, actual Next route compressed transfer, live Supabase upload/query latency, p95 scan-to-result under concurrency, peak JS/WASM/native RAM, main-thread long tasks/thermal behavior, real-paper wrong/no-read/review rates. No speedup percentage, 99.5% accuracy or free-tier capacity guarantee follows from this report. Add physical golden fixtures before changing production thresholds or removing legacy.
