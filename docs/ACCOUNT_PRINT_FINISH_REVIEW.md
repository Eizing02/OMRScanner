# Account and print extension finish review

Reviewed 9 October 2026 by the independent Impeccable finish reviewer. File-based review only: no browser, rendering, server, detector rerun, or implementation edits by the reviewer. The parent authorized this review artifact.

Scope: the approved supplemental account/settings/roster/print extension of the inherited Operate UI. No new visual world, approved comp, or critique-reference comp. This review does not certify live Google/Supabase installation, production deployment, physical printing, optical reading, grading, or persisted review.

## Initial review

disposition: fix

Inputs not supplied: separate QUALITY BAR card. The inherited Operate bar was used. Truncated detector middle and generated sidecar metadata were not independently audited.

### persistence

Fail: PRODUCT.md, DESIGN.md and the direction contract exist; inherited seed `19bece82` is recorded. This code-led extension requires no approved comp or build-state file. DESIGN.md still describes mobile Designer as preview-only, while the current implementation exposes approved controls. PRODUCT.md references `docs/ACCOUNT_PRINT_IMPLEMENTATION.md`, which was absent during review.

All 14 required UI captures and three PDF renders exist and are valid. Mobile navigation appears at the captured viewport boundary; no recapture is required.

Evidence opened: `.impeccable/review/accounts-login-desktop.png`, `accounts-login-mobile.png`, `accounts-pending-mobile.png`, `accounts-settings-desktop.png`, `accounts-settings-mobile.png`, `accounts-exam-mobile.png`, `accounts-inspection-desktop.png`, `accounts-inspection-mobile.png`, `designer-desktop.png`, `designer-mobile.png`, `print-desktop.png`, `print-mobile.png`, `answer-sheet-60-desktop.png`, `answer-sheet-60-mobile.png`; and `tmp/pdfs/personalized-20-1.png`, `personalized-60-1.png`, `personalized-60-2.png`.

### fidelity

| Element | Verdict | Evidence |
|---|---|---|
| TYPE | match | Inherited Noto Sans Thai, clear heading/body relationships and readable Thai controls. |
| MATERIAL | match | Flat workspace panels and white physical-paper previews; actual logo raster and geometric sheet vectors, without imitation material. |
| GROUND | match | Cool `#f5f7fa` workspace, white surfaces and ink-blue navigation agree with OWN-WORLD and DESIGN.md. |
| Google entry and pending access | match | Direct Google action; pending gate identifies the account, explains the restriction and provides refresh/sign-out actions. |
| Inspected workspace identity | missing | Both inspection captures identify the signed-in owner, but the banner only says “พื้นที่ของผู้ใช้อื่น”; the inspected teacher’s name/email is absent. |
| Read-only restrictions | match | Persistent amber notice, return action and disabled settings/upload controls. |
| Roster-derived choices | match | Exam form derives classroom choices from current students; subject/year/term defaults derive from workspace settings and prior exams. |
| Personalized print | match | Preview and PDF share geometry/text functions. PDF evidence shows different students left/right, preserved leading zeroes, five solid-black ID bubbles and blank answers. |
| 60-question layout | adaptation | Full A4 with four answer columns follows the approved automatic expansion requirement; answer letters remain inside circles. |
| Mobile designer controls | adaptation | Narrow single-sheet composition and accessible controls follow the approved extension; DESIGN.md needs to record this behavior. |
| Operational truth | match | Synthetic/demo labels and explicit unfinished scanning/grading/review TODOs are visible. Mocked connection captures do not establish live Google or Supabase operation. |

### ceiling

The inherited professional Operate ceiling is reached for the captured composition, typography, flat surfaces, semantic notices and responsive controls, subject to the identity fix. No new ornamental device is warranted.

Craft: no introduced gradient text, decorative material effects, glyph icons or heavy side stripes were found. Actual PDF renders preserve readable Thai, marker spacing, QR separation and answer geometry. Physical print/scan accuracy remains outside this verdict.

### material_fixes

1. THESIS/STORY: show the inspected teacher’s name and email in the persistent read-only banner, separately from the signed-in owner; preserve wrapping on mobile and the return action.
2. Persistence/FORM: update DESIGN.md only for the approved account and mobile Designer extension, and deliver the implementation summary referenced by PRODUCT.md with explicit mock/live-installation boundaries.

### keep

Keep the private-account distinction, truthful approval/TODO states, roster-driven selection, shared preview/PDF geometry, solid ID fills and unscaled full-A4 expansion.

## Verdict pass

The parent implemented both ordered fixes in one batch. The reviewer re-opened the same inspection screenshot paths, read the corrected DESIGN.md mobile behavior line and the now-existing implementation summary, and sampled only the relevant inspection label and wrapping changes. All other supplied captures remained unchanged. No new visual hunt or detector pass was performed.

### verdict

1. Resolved: both recaptured inspection views show `ครูบัญชี ข (teacher-b@example.test)` in the persistent amber banner, separately from signed-in owner `ครูบัญชี ก` / `teacher-a@example.test`. The mobile banner wraps without overflow, retains the read-only restriction, and keeps the return action visible.
2. Resolved: DESIGN.md now documents the approved mobile question/choice/paper controls, collapsible logo upload, save/print actions and desktop header editing. `docs/ACCOUNT_PRINT_IMPLEMENTATION.md` exists and distinguishes mocked/local evidence from live setup and unfinished optical grading/review.

### remaining

Clear for the two scored fixes. No regression introduced by the fix batch was observed in the supplied evidence. Ship earned here covers the scored fixes, not the whole surface; the initial review and its operational boundaries remain applicable. Production build status is tracked separately and was not part of this visual verdict.

disposition: ship
