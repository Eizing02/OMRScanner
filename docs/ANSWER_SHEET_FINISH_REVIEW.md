# Adaptive answer-sheet finish review — 8 October 2026

## Scope and authority

Ordinary extension of the incumbent Thai-first Operate interface, governed by PRODUCT.md, DESIGN.md and ANSWER_SHEET_LAYOUT.md. Approved two-up landscape A4, one-sheet preview, 1–60 questions, 4/5 choices and shared set QR; no new visual world or comp. Global DESIGN.md/sidecar preserved.

## Independent review

Fresh reviewer inspected the eight valid desktop/mobile/PDF captures and sampled printable geometry. Initial disposition: **fix**, with exactly one material issue: the average 0.72-em width estimate could place wide Latin school/title text inside score and QR regions.

At 3.3-mm font size, school 31 W measured 95.139 mm despite the old estimate fitting within a 76-mm heading region. Title 60 W also overlapped. All other reviewed identity/composition/preview/imposition relationships matched the approved experimental extension.

## One correction batch

- Replaced average width with a shared 1-em glyph upper bound; retained zero-advance combining marks and conservative space width.
- Added tests against actual embedded-font metrics: all glyph advances ≤ 1 em, supported combining marks zero, space ≤ 0.32 em; measured wrapped lines stay in bounds.
- Added real-browser SVG text-bound assertions and downloaded/rasterized the wide-heading PDF.
- Recaptured the same eight files, plus wide-heading desktop/PDF evidence. Main agent validated every image before the verdict handoff.

## Verdict pass

The same reviewer scored the single listed text-fit fix **resolved**, returned **disposition: ship**, and found no visible material regression from that fix in default two-up or 60/5 layouts. All ten recaptures were valid.

This is the verdict's actual scope: the scored text-fit fix within the experimental layout extension. It is not a new full-product audit or production-readiness certification.

## Evidence

- `.impeccable/review/{designer,print}-{desktop,mobile}.png`
- `.impeccable/review/answer-sheet-60-{desktop,mobile}.png`
- `.impeccable/review/answer-sheet-two-up-pdf.png`
- `.impeccable/review/answer-sheet-60-pdf.png`
- `.impeccable/review/answer-sheet-wide-heading-desktop.png`
- `.impeccable/review/answer-sheet-wide-heading-pdf.png`
- `tests/pdf.test.ts`, `tests/e2e/answer-sheets.spec.ts`; all 26 unit/database/PDF tests, 6 E2E tests, typecheck/lint/build passed.

Detector ran exactly once: zero primary findings, existing token/style advisories reported without global repair. No second detector or extra aesthetic polishing round. No new shipping raster assets; screenshots are evidence only.

## Remaining release boundary

SQL migration 002 is prepared and locally tested, not applied to live Supabase. Connected layout persistence/immutable QR lookup are TODO; QR generation does not implement scanning or real grading. Physical printer/phone/OMR calibration, including letters inside bubbles and 3.6-mm bubble diameter, is still required before student scores may rely on this output.
