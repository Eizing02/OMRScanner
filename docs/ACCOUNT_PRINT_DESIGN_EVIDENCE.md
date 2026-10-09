# Account and print design evidence

Documented 9 October 2026 for `D:/Omr scanner` using the shipped `impeccable_documenter` role and `reference/document.md`. This is an ordinary, code-led extension of the incumbent Operate interface. It records the finished artifact against the approved direction; it does not create a new visual world or regenerate the design system.

## Scope and visual authority

The approved extension covers Google entry and pending access, private teacher workspaces, owner approval and read-only inspection, persistent school/subject settings, original-byte Supabase Storage logos and latest-logo reprints, actual-roster classroom choices, personalized student-ID prefills and an immutable print registry. The direction contract is [ACCOUNT_PRINT_DIRECTION.md](ACCOUNT_PRINT_DIRECTION.md), with inherited world seed `19bece82`.

`PRODUCT.md` supplies product and permission truth. `DESIGN.md` frontmatter remains the normative token source; `.impeccable/design.json` remains its existing extension layer. The finished code and supplied captures establish how this extension applies those rules. No new composition tournament, decision comp, token scale, raster asset or visual identity was introduced by this documentation pass.

## System comparison

| System layer | Confirmed implementation | Comparison with the inherited system |
|---|---|---|
| Palette and ground | `app/globals.css` retains cool canvas `#f5f7fa`, white surface `#fff`, ink `#18263d`, navigation `#15263c` / `#c7d4e4` and action blue `#245bd5` / `#ecf2ff`. | Matches the established light workspace and ink-blue navigation. Account and settings additions use these existing variables. |
| Semantic state | Existing teal `#087c63` / `#e8f5ef`, amber `#96620a` / `#fff4db` and red `#b33d40` / `#fdf0f0` remain. The inspection banner uses amber with explicit read-only text; approval and error states have labels. | Preserves **The Meaning Before Color Rule**. Approval status does not imply teacher-to-teacher sharing or successful optical grading. |
| Thai typography | `app/layout.tsx` still self-hosts Noto Sans Thai at 400 / 500 / 600 / 700; the stylesheet retains body 14px / 1.65, heading 27px / CSS weight 650, section title 17px / 600 and button label 13px / CSS weight 550. | Preserves **The Thai Reading Rule**. CSS 650 and 550 are requested weights, not newly supplied font files. Print uses the existing NotoSansThai-Regular TTF. |
| Controls and shape | Existing controls have 8px corners and at least 42px height; fields use 7px corners and at least 43px height. Panels retain 12px corners and thin borders; the settings extension uses 22px padding, reducing to 17px on phones. | Existing primitives are reused. No added system token is required for the extension. |
| Material and depth | Settings and account panels are flat white. Paper remains rectangular and white on the slightly darker workspace, with the existing paper shadow and geometric sheet vectors. | Preserves **The Flat Seam Rule**. The school logo is an actual asset, not a generated material effect. |
| Responsive composition | Login retains its story/action split and stacks on phones. Settings uses a bounded vertical stack; account actions and fields reflow. Inspection text wraps. Print retains paper-left/settings-right on desktop and stacks on phones. | Matches the inherited shell and responsive form behavior in the supplied states. Mobile Designer controls are the approved behavior extension described below. |

The comparison confirms the incumbent palette, font family, control vocabulary and material treatment. It does not promote every local font size, literal color or corner value found in source into a reusable token.

## Approved behavior and source evidence

| Surface or behavior | Evidence in the finished implementation |
|---|---|
| Google entry and access gate | `app/login/page.tsx` presents a direct Google action and provider/setup/error states. `components/layout/main-shell.tsx` keeps pending, rejected and suspended accounts outside workspace navigation, identifies the account and provides refresh/sign-out actions. |
| Signed-in owner versus inspected teacher | `app/settings/page.tsx` passes the target teacher's display name and email into `inspectWorkspace`. `components/layout/auth-provider.tsx` carries `inspectionLabel`; `main-shell.tsx` displays it in the persistent read-only banner. The account section continues to identify the signed-in owner separately. |
| Read-only settings | Disabled fieldsets and logo actions in `app/settings/page.tsx` agree with the persistent banner and return action. `app/globals.css` supplies wrapping through `min-width: 0`, `overflow-wrap: anywhere` and flexible layout. Source and supplied captures show the restriction; security verification is recorded separately in the implementation report. |
| Actual classroom choices | `components/exams/exam-form.tsx` derives classroom options from current workspace students and blocks creation without an imported classroom. Subject/year/term defaults derive from workspace settings and prior exams. This avoids invented classroom choices. |
| Original logo and latest reprint | `app/api/settings/logo/route.ts` validates and uploads the file's original bytes to Supabase Storage. `lib/supabase/school-logo.ts` reads private branding through a short-lived signed URL and protects the current logo during cleanup. `lib/export/export-pdf.ts` loads original logo bytes and scales only their print frame. `components/export/report-preview.tsx` applies current branding to the registered layout when reprinting. |
| Personalized paper | `components/omr/omr-sheet-preview.tsx` and `lib/export/export-pdf.ts` share geometry, ID positions and `printTexts`. Both preserve the five-character code and fill one ID bubble per digit in solid black, omitting the number inside the filled circle. Answers remain blank in print mode. |
| Print registration | `components/export/report-preview.tsx` registers connected-mode jobs before PDF creation and uses returned student snapshots. `supabase/migrations/202610090005_print_registry.sql` defines immutable template/job records, protected sheet identities and request-ID reuse. The PDF checks agreement with the registered manifest. This is source/local-test evidence, not proof that the migration is installed on the live project. |
| Sheet size | One logical sheet is previewed. The actual PDF imposes different students left/right on A4 for the 20-question case; the 60-question case expands to one student per full A4 with four answer columns. The source resolves print layout before rendering instead of shrinking physical bubbles to force a fit. |

### One approved documentation correction

The parent corrected only the mobile Designer behavior sentence in `DESIGN.md:269`. It now records the approved question/choice/paper controls that update the preview, collapsible logo upload, save/print actions and desktop recommendation for header editing. `components/omr/omr-generate-panel.tsx` and the mobile Designer captures substantiate that sentence. The desktop three-panel tools/properties arrangement still hides on phones.

`git diff -- DESIGN.md .impeccable/design.json` shows that single prose-line replacement and no sidecar diff. The frontmatter, palette, typography, shape, spacing and component tokens were not changed. This documenter did not edit either system file.

The sidecar's existing mobile-preview narrative predates the approved controls and remains unchanged under the scoped write boundary. It is not new evidence that mobile controls are forbidden. The approved behavior correction does not authorize a broader narrative refresh or sidecar regeneration.

## Supplied visual evidence checked

All 14 UI captures and three PDF-page renders were opened and visually inspected. Each file also decoded successfully; dimensions below are the original file dimensions. Inspection captures are the parent's replacement captures after the identity fix. Other supplied captures remain the existing evidence set; this pass took no new screenshots.

| State | Desktop capture | Mobile capture |
|---|---|---|
| Google entry | [accounts-login-desktop.png](../.impeccable/review/accounts-login-desktop.png), 1440 × 1000 | [accounts-login-mobile.png](../.impeccable/review/accounts-login-mobile.png), 390 × 844 |
| Pending access | — | [accounts-pending-mobile.png](../.impeccable/review/accounts-pending-mobile.png), 390 × 844 |
| Settings and logo | [accounts-settings-desktop.png](../.impeccable/review/accounts-settings-desktop.png), 1440 × 1498 | [accounts-settings-mobile.png](../.impeccable/review/accounts-settings-mobile.png), 390 × 1989 |
| Actual-roster exam form | — | [accounts-exam-mobile.png](../.impeccable/review/accounts-exam-mobile.png), 390 × 1415 |
| Owner inspection | [accounts-inspection-desktop.png](../.impeccable/review/accounts-inspection-desktop.png), 1440 × 1611 | [accounts-inspection-mobile.png](../.impeccable/review/accounts-inspection-mobile.png), 390 × 2190 |
| 20-question Designer | [designer-desktop.png](../.impeccable/review/designer-desktop.png), 1440 × 1184 | [designer-mobile.png](../.impeccable/review/designer-mobile.png), 390 × 1389 |
| Personalized print preview | [print-desktop.png](../.impeccable/review/print-desktop.png), 1440 × 1268 | [print-mobile.png](../.impeccable/review/print-mobile.png), 390 × 1981 |
| 60-question full-sheet Designer | [answer-sheet-60-desktop.png](../.impeccable/review/answer-sheet-60-desktop.png), 1440 × 1115 | [answer-sheet-60-mobile.png](../.impeccable/review/answer-sheet-60-mobile.png), 390 × 1160 |

The inspection views explicitly show target `ครูบัญชี ข (teacher-b@example.test)` in the amber banner, while the account section identifies owner `ครูบัญชี ก` / `teacher-a@example.test`. The mobile banner wraps and keeps the return action. Demo settings, exam and sheet captures show their synthetic/local-data notices; connected-looking account states use mocked Auth/API fixtures.

| Actual PDF render | Dimensions | Observable paper evidence |
|---|---|---|
| [personalized-20-1.png](../tmp/pdfs/personalized-20-1.png) | 1404 × 993 | Two different students, `02074` and `00005`, share one A4 page; five solid ID fills per sheet, blank answers, separate QR/score regions and a center cut guide. |
| [personalized-60-1.png](../tmp/pdfs/personalized-60-1.png) | 1404 × 993 | Student `02074`, full A4, 60 questions in four columns, five choices and five solid ID fills. |
| [personalized-60-2.png](../tmp/pdfs/personalized-60-2.png) | 1404 × 993 | Different student `00005` on the second full page; matching layout/QR appearance and preserved leading zeroes. |

These existing PDF renders show readable Thai and the visual agreement of preview/print content. They do not measure physical printer scale, QR decoding reliability, optical reading accuracy or camera performance.

## Confirmed, inferred and not canonized

**Confirmed:** the source values in the comparison table; reuse of inherited primitives; all 17 supplied image files; the inspection identity distinction; the approved mobile controls; the single `DESIGN.md` behavior correction; and no `.impeccable/design.json` diff. Source confirms the original-logo, current-branding reprint and immutable-registry implementation paths. Local functional results are reported in [ACCOUNT_PRINT_IMPLEMENTATION.md](ACCOUNT_PRINT_IMPLEMENTATION.md).

**Inferred from the supplied visual evidence:** these captured states apply the established calm, readable Operate world consistently. This is a bounded comparison of the supplied screens, not a computed-style audit of every route, a new creative direction, or a claim that every possible state has been reviewed.

**Not canonized or repaired:** existing small 8–10px details, incidental palette/type/radius differences and older sidecar mobile narrative. The parent reported one detector run with exit code 0 and truncated advisory output, largely concerning incumbent values; the missing middle was not independently audited. This pass did not rerun the detector or repair unrelated drift. A detector success does not erase its advisories or establish whole-app compliance.

The parent's provenance scan reported one shipping raster and zero missing provenance records. This extension creates no new shipping raster; the attached school logo remains the existing actual asset. Screenshots and PDF renders are verification artifacts. No provenance scan or asset generation was repeated in this documentation pass.

## Review verdict and operational limits

[ACCOUNT_PRINT_FINISH_REVIEW.md](ACCOUNT_PRINT_FINISH_REVIEW.md) initially returned `disposition: fix`. The parent implemented the inspected-teacher identity fix and the persistence/documentation fix in one batch. The reviewer's verdict pass returned `disposition: ship`, limited to those two scored fixes. It did not review the whole surface again or certify production readiness. The verdict sampled the replacement inspection images, the corrected behavior sentence and the delivered implementation summary; no additional visual hunt or detector pass occurred.

The implementation report records 81 unit tests, 15 general E2E tests and four account tests passing, plus lint, typecheck, production build and whitespace checks. This documenter did not rerun them. PostgreSQL uses PGlite/stubs, API tests mock the SDK, and account browser tests mock Auth/endpoints. Existing camera/crop checks use synthetic fixtures. GitHub CI, push and deployment were not run in this handoff.

Live SQL installation remains pending confirmation; Google Provider is not installed/enabled for live use. This pass does not establish real Google sign-in, live Supabase/Storage isolation, physical printing, optical grading, persisted manual review or actual score reports. Their unfinished status stays explicit; implementation evidence is not a claim that the complete OMR workflow is ready for student scores.

## Files preserved by this pass

Only `docs/ACCOUNT_PRINT_DESIGN_EVIDENCE.md` was written. `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, source code, tests, screenshots, PDF artifacts and the logo were read or inspected without edits.

System-file SHA-256 at documenter entry and exit:

- `DESIGN.md`: `9E171C7ACA2A25D0FC5C9839F186D45C8A28A2B9E55ED6EE279496CBE3C43DF7`.
- `.impeccable/design.json`: `1BA40063E066C64B0010407C6D2F6AAE2838A13FC4EBE26D5F0C27CD740D1801`.
