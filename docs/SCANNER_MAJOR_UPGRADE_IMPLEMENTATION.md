# Scanner major upgrade — 10 October 2026

## Scope and truth

Implemented against clean baseline `05a05444a44d0636b6f8eaa9303345fd27f928df`, on `codex/scanner-major-upgrade`. This is an incremental upgrade, not a rewrite. No production SQL, student records, scores, Google configuration or live Storage objects were changed. No push/deploy is implied by local tests.

The attached MASTER IMPLEMENTATION PROMPT supersedes obsolete Cloudinary/Python/portrait/student-QR passages. AGENTS/PRODUCT/README now describe the approved Next.js monolith, private Supabase Storage, shared SAS2 QR and server TypeScript optical reader. Historical documentation remains labelled history; it is not proof of the current deployment.

## Implemented pipeline

Camera → reusable small detection canvas → Scanic classical worker (when available) → raw normalized corners for stability → smoothed display corners → registered shared QR → stable/full-resolution capture → fresh still detection when ImageCapture is used → perspective correction → QR/marker/lighting/sharpness gates → JPEG Blob → authenticated bounded multipart API → exact retained JPEG decoding → QR direction/position → five-digit ID/answer reading → private Storage → existing idempotent grading transaction → teacher review/confirmation.

Manual shutter, upload, four-corner touch/keyboard adjustment, retake and next-paper remain available. A detector/worker failure loads legacy OpenCV+jscanify lazily; a mere detection miss does not load the 13MB asset. An explicit engine setting provides rollback. If both detectors fail, the existing Canvas manual warp still works.

## Phase status

| Phase             | Delivered                                                                                                                                                                                     | Boundary / remaining work                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Audit/baseline  | Actual source, lockfile, existing tests and library API inspected; repeatable comparison command and recorded baseline                                                                        | Physical startup, live upload/DB latency, peak RAM/CPU and accuracy dataset not measured                                                          |
| 1 Scanic          | Exact 1.6.0 pin, async adapter, reusable instance, input-pixel normalization, classical-only worker/main/legacy fallbacks                                                                     | Do not remove legacy before physical acceptance                                                                                                   |
| 2 Camera          | One in-flight engine operation, reusable canvases, rVFC/timer fallback, adaptive 480/640/800 preview and cadence, cancellation/session guards                                                 | Extraction and QR remain main-thread work; real Safari thermal/long-task measurements pending                                                     |
| 3 Overlay/capture | Display-only smoothing, real polygon/outside shade, locked-template QR/ID/answer/marker overlays, conservative gates; green only after quality passes                                         | Glare/weak-pencil thresholds still need real paper calibration                                                                                    |
| 4 Still capture   | Feature-detected ImageCapture with timeout/video fallback; decoded still gets fresh corners instead of reusing video FOV                                                                      | Actual Android/iPhone/iPad orientation/FOV tests pending                                                                                          |
| 5 Images          | toBlob/object URLs, bounded authenticated multipart, JSON compatibility, safe JPEG retention, conditional normalization, exact stored bytes used for OMR, Storage metadata processing version | No Pica/jSquash installed: no evidence they justify extra runtime cost; physical compression sweep pending                                        |
| 6 QR/OMR          | Locked QR ROI/fallback, no repeated live QR decoding after lock, no repeated server decode of each region, fresh final-image validation, orientation/position rejection                       | Native BarcodeDetector/ZXing not enabled without comparative evidence; local-background threshold candidate is benchmark-only, not grading code   |
| 7 Supabase/API    | Existing auth/approval/RLS/workspace/duplicate/confirmed-score/cleanup guards retained; Server-Timing stages; no DB changes                                                                   | Full queue/roster fetches and staging-orphan cleanup remain known scaling work; measure real cardinality/query plans before pagination/migrations |
| 8 UI              | Thai compact scanner and current branding preserved; Impeccable technical audit and responsive browser evidence                                                                               | Emulated Chromium is not physical Safari/Android acceptance                                                                                       |
| 9 Validation      | Domain/API/PGlite, engine lifecycle/scheduler, JPEG evidence, QR rotation rejection and browser regression coverage                                                                           | No real-pencil golden dataset; no 99.5% or production-ready accuracy claim                                                                        |
| 10 Delivery       | Implementation/benchmark/rollback/license docs; legacy assets intentionally retained                                                                                                          | Cloud deployment and physical pilot remain separate                                                                                               |

## Compatibility and security

- QR protocol stays SAS2, same opaque token for copies of an exam/key/layout version. No student PII or new SAS3 identity. Geometry versions 2/3/4 and print coordinates stay unchanged.
- Five ID digits remain strings, including `02074`/`00005`; unclear IDs are not guessed from roster similarity. New/ambiguous scores still require teacher review.
- The browser sends metadata and image only, not authoritative answers/scores. Origin, actual streamed size, metadata Zod schema, file signature/decoded dimensions and authenticated write scope are checked server-side. Malformed inputs return JSON.
- Binary JPEG policy `binary-v2-retained`: bounded JPEG without orientation/metadata changes is retained byte-for-byte; otherwise `binary-v2-normalized` uses one server normalization at quality 85. Old JSON clients keep `legacy-v1` normalization for retry compatibility. Processing policy is stored in Storage object metadata and returned in `X-Scan-Processing`.
- Images remain private and immutable (`upsert: false`); request ID/content hash, reservation and save RPCs are unchanged. Duplicate warning/reason and confirmed-score protections remain in force. Existing record/image cleanup is unchanged and reference-safe for two-up scans.
- Workspace/account providers remount on identity/scope changes. Scanner resources/caches belong to that mount; old asynchronous callbacks check session/mounted state. Hidden pages stop tracks and scheduling; object URLs and worker are released.
- Manual corner edits win over a late asynchronous detector result. A scanner-owned upload controller cancels on unmount; a small isolated timer shows processing duration without adding a timer to the live detection loop.
- Rectified upside-down, sideways or misplaced QR is refused before ID/answer processing. Current behavior asks the teacher to rotate/re-crop; it does not silently rotate uncertain evidence.

## Dependency decision

Added only `scanic@1.6.0` (MIT). No runtime package removed. Optional ML/ONNX code is not activated and no model CDN is used. OpenCV asset/jscanify remain only fallback and comparison. TypeScript is already a dev dependency and transpiles the test-only benchmark bridge; no debug route ships to users. Third-party original notices are retained.

Dead-code/import review found the old exported `compressScanCanvas` and `readPageQrs` helpers no longer called by the shipped scanner/API. They are intentionally kept for source compatibility; the active path uses Blob compression and cached/ROI QR details, not both paths. Legacy OpenCV/jscanify assets are still used by rollback and must not be deleted as "unused". No duplicate encoder/QR dependency was added.

## Database/API review

The current migrations already index scan queue `(school_id, scan_status, created_at)`, cleanup uploads `(school_id, status, created_at)`, exam results `(school_id, exam_id, status)` and roster class/code lookups. RLS/private workspace checks, reservation/content-hash retry, immutable upload, audited review and confirmed-result guards were retained and exercised with mocks/PGlite. Signed scan URLs are generated on media selection with a 300-second lifetime, not for every queue record.

The review RPC still returns full observations for the workspace and the API still fetches all version configurations. This is a known scaling risk, not a benchmarked live bottleneck; per-exam cursor pagination and a staging-upload expiry job require measured cardinality/query plans and a separate additive migration. No index/RLS/cleanup migration was guessed or applied. New upload timing headers expose processing stages only, never student data. Actual Supabase network, query plans and Storage metadata acceptance require preview/live-service acceptance.

## Important results

See [benchmark](SCANNER_PERFORMANCE_BENCHMARK.md), [rollback](SCANNER_MIGRATION_AND_ROLLBACK.md) and [UI audit](SCANNER_UI_AUDIT.md). Scanic is lighter to load in the local comparison, but is not faster at every per-frame detection size. Default selection follows the approved migration, with safety gates and rollback; it is not a claim of better physical accuracy.

## Files

- Scanner: `components/scanner/scanner-camera.tsx`; engine facade, Scanic adapter/worker/coordinates, legacy detector, scheduler, capture, state and template-overlay modules in `lib/omr/`.
- Evidence/API: `lib/omr/compress-image.ts`, `scan-request.ts`, `scan-image.ts`, `scan-qr.ts`, `capture-quality.ts`, `camera-geometry.ts`; `app/api/scan-records/route.ts`, `types/scan.ts`.
- Experiment/tests: `experimental-threshold.ts`, scanner engine/fallback/scheduler/capture unit tests, synthetic golden v2/3/4 rasters (20×4 cut/two-up and 60×5 full), scan API tests, account/browser responsive tests, `scanner-performance.spec.ts`, benchmark config/script.
- Docs/config: AGENTS/PRODUCT/DESIGN/README, `.env.example`, package/lockfile, notices/full Scanic license, implementation/benchmark/rollback/UI audit and current status/test summaries.

## Release checklist

Complete changed-file manifest for this delivery (generated files, local environment values and browser artifacts are excluded):

```text
.env.example
AGENTS.md
DESIGN.md
PRODUCT.md
README.md
app/api/scan-records/route.ts
app/globals.css
app/settings/page.tsx
components/scanner/scanner-camera.tsx
docs/IMPLEMENTATION_STATUS.md
docs/SCANNER_MAJOR_UPGRADE_IMPLEMENTATION.md
docs/SCANNER_MIGRATION_AND_ROLLBACK.md
docs/SCANNER_PERFORMANCE_BENCHMARK.md
docs/SCANNER_UI_AUDIT.md
docs/TEST_RESULTS.md
docs/THIRD_PARTY_NOTICES.md
docs/licenses/SCANIC-LICENSE.txt
lib/omr/camera-capture.ts
lib/omr/camera-geometry.ts
lib/omr/camera-loop.ts
lib/omr/capture-quality.ts
lib/omr/compress-image.ts
lib/omr/document-edge-detector.ts
lib/omr/experimental-threshold.ts
lib/omr/legacy-detector.ts
lib/omr/scan-image.ts
lib/omr/scan-qr.ts
lib/omr/scan-request.ts
lib/omr/scanic-adapter.ts
lib/omr/scanic-coordinates.ts
lib/omr/scanic.worker.ts
lib/omr/scanner-engine.ts
lib/omr/scanner-state.ts
lib/omr/template-overlay.ts
package-lock.json
package.json
playwright.config.ts
playwright.scanner-benchmark.config.ts
tests/camera-capture.test.ts
tests/camera-loop.test.ts
tests/capture-fixture.ts
tests/e2e/accounts.spec.ts
tests/e2e/scanner-performance.spec.ts
tests/e2e/workspace.spec.ts
tests/scan-api.test.ts
tests/scanner-engine.test.ts
tests/scanner-fallback.test.ts
tests/scanner-golden-synthetic.test.ts
types/scan.ts
```

Before using real scores: deploy a preview, sign in to a non-production test workspace, print known-answer sheets for geometry 2/3/4 at 100%, photograph full A4/cut half with Android/iPhone/iPad, test 0/90/180/270° orientations, normal/faint/erased/multiple/blank marks, low/uneven light, glare, blur and missing markers. Compare every digit/answer to ground truth, review unknowns and test retry/duplicate/confirmed result protections. Measure real upload/DB/thermal/memory behavior. Do not use production students as a test dataset.
