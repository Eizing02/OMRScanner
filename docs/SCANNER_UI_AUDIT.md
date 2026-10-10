# Impeccable UI audit — 10 October 2026

## Implementation integrity verdict

Pass for the inspected scope: this is a coherent Thai teacher workflow, not a generic dashboard reskin. The scanner has a real paper polygon, shaded surroundings, registered exam QR, locked-template regions, manual/automatic shutter, recoverable errors and teacher confirmation. Existing ScanSob branding, pastel semantic palette and printable OMR geometry were preserved. No decorative metrics, quota dashboard, fake accuracy figures or new navigation were introduced.

Impeccable `context` was run once; optimize/layout/audit and craft-floor references guided the work. The deterministic detector returned **0 primary findings and 188 advisory findings** in its confirmation run. Advisories predominantly concern repeated literal font sizes/colors/radii versus the sidecar. They are not 188 proven defects, nor does a zero-primary result mean the UI is defect-free. Visual inspection found clipped local controls that document-overflow checks alone missed.

## Audit health score

| Dimension                |     Score | Evidence / limit                                                                                                                           |
| ------------------------ | --------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Accessibility            |       3/4 | axe checks, labelled controls, keyboard corners, reduced-motion alternatives; not a complete WCAG or screen-reader certification           |
| Performance              |       3/4 | reusable canvas, bounded async loop, worker detection, lazy fallback; extraction/QR remain main-thread work                                |
| Responsive design        |       3/4 | phone portrait/landscape, both iPad orientations and desktop tested; real Safari, text scaling and physical touch remain pending           |
| Theming                  |       2/4 | shared pastel roles and new camera tokens; existing literals still occur; light-only UI is the approved design, not a missing dark feature |
| Implementation integrity |       4/4 | product-specific controls, evidence-led copy and preserved exam/score boundaries                                                           |
| **Total**                | **15/20** | **Good — address remaining weak dimensions before broader rollout**                                                                        |

Scores are implementation judgments, not measured accuracy or conformance percentages. Verified open findings: **P0: 0, P1: 0, P2: 2, P3: 0** in this inspected scope. Physical-device verification gaps are listed separately, not presented as discovered defects.

## Findings and authorized refinement

Initial inspection was recorded first. A bounded refinement batch then addressed these findings; one confirmation round checked the result. A subsequent functional scanner regression exposed the asynchronous manual-corner race, which was repaired and retested.

| Severity | Finding / location                                                                                        | Impact                                                    | Result                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P0       | Scanner controls clipped on 844×390, `app/globals.css` short landscape layout                             | Shutter could not be reached without changing orientation | Side control rail; ≥44px shutter and controls-above-navigation browser assertions passed                        |
| P0       | Review question pane collapsed on short landscape, `app/globals.css` task sizing                          | Answer inspection/correction became impractical           | Minimum usable panel and bounded content scrolling; question pane ≥100px and confirmation reachable in viewport |
| P1       | Late edge detection replaced manual corners, `components/scanner/scanner-camera.tsx` accept/move handlers | Teacher adjustment could silently be undone               | Manual edit wins; keyboard, mouse and synthesized touch regression passed                                       |
| P2       | Global `0.01ms` reduced-motion kill, `app/globals.css`                                                    | Removed meaningful state feedback                         | Spatial animation disabled; brief color feedback and slower loading indicator retained                          |
| P2       | Above-fold school preview image used lazy loading, `app/settings/page.tsx`                                | Delayed visible content/LCP warning                       | Eager above-fold preview; no extra image service or source recompression                                        |

The scanner shows a compact processing timer only during work on a captured image. Its state is isolated in a small component, updates twice per second, is not an announcing live region, and is removed when work ends. It adds no timer to the live camera loop. Failed scans retain the original locally for recovery; pending scores are not labelled final.

## Remaining actionable findings

### [P2] Existing literals bypass camera/theme roles

- Location: `app/globals.css:16` corner-handle color/focus rules and existing camera surface/copy rules.
- Category: Theming / implementation integrity.
- Impact: Future palette changes can leave old blue focus/corner treatments behind. Current inspected light-theme controls remain recognizable; this is not a verified contrast failure.
- Standard: project token consistency; no WCAG violation asserted from literals alone.
- Recommendation: consolidate in a narrowly scoped token pass, checking actual focus/corner contrast against photographs rather than blindly accepting detector values.
- Suggested command: `$impeccable colorize`.

### [P2] Full-resolution extraction is still main-thread work

- Location: `lib/omr/scanic-adapter.ts` `warp`, and `lib/omr/scan-qr.ts` QR decoding.
- Category: Performance.
- Impact: Large still images require a source-resolution extraction canvas before the locked-size output; low-memory phones may experience a pause. Worker detection does not eliminate this allocation or QR work. Actual peak RAM/long-task duration was not measured.
- Standard: responsive input/feedback performance; not a measured Core Web Vitals failure.
- Recommendation: profile representative Android/iPad/iPhone still captures first. Consider a proven bounded extraction/resampling path without losing ID/mark detail; do not add another codec or lower evidence quality solely to hit a byte target.
- Suggested command: `$impeccable optimize`.

## Evidence and boundaries

- Chromium emulated layouts: desktop 1440×1000 and phone 390×844 for nine routes; Designer, Print, Scanner and Review also at 768×1024, 1024×768 and 844×390 — 30 route/viewport combinations. Document horizontal overflow and axe WCAG A/AA checks passed in those states.
- Browser artifacts: ignored `.impeccable/review/` screenshots, including scanner/review phone landscape, both tablet orientations, manual corners and synthetic automatic capture. These are local evidence, not production/student photos.
- Manual corners: 48×48 targets, visible focus, ArrowRight increments, mouse drag and Chromium CDP synthesized touch. This proves those synthetic gestures, not physical iOS touch behavior.
- Connected browser tests use mocked Google/access/Storage responses and a canvas media stream. Scanic worker was exercised by the compiled application without requesting OpenCV; a deliberately different still FOV required fresh detection. Actual Google consent, camera permissions/lenses, network/RLS services are not certified by mocks.
- Existing reduced-motion test verifies absence of spatial movement. Physical motion sensitivity and screen-reader journeys require human/device acceptance.
- No extra aesthetic polish loop was run after the bounded confirmation. The upgrade did not redesign unrelated pages or alter printable bubble/marker coordinates.

## Patterns and positive findings

Whole-page overflow is necessary but insufficient: bounded workspaces need explicit tests for reachable controls and usable internal scroll areas. Literal-token advisories also require contextual verification rather than wholesale replacement of an established design system.

Preserve the local Thai font, dark readable text on pastel surfaces, semantic status labels, keyboard/pointer recovery, reduced-motion alternatives, exact five-digit identity and teacher-review boundaries. Camera geometry is functional SVG, not illustrative decoration. The lack of fabricated performance or quota content supports trust.

## Recommended next actions

1. **[P2] `$impeccable optimize`**: physical large-still profiling and extraction/QR bottleneck investigation.
2. **[P2] `$impeccable colorize`**: narrow focus/corner token consolidation with photographic contrast checks.
3. **`$impeccable polish`**: final targeted pass only after physical issues and tokens are settled.

You can ask to run these one at a time, together, or in another order. Re-run `$impeccable audit` after future fixes; do not treat this score as production readiness.
