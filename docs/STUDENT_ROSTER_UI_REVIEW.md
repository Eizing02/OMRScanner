# Student roster UI review — 28 October 2026

This records the finished student-management extension in Operate mode. It extends the existing ScanSob interface: it does not replace the visual identity or establish new system tokens. The authority is [PRODUCT.md](../PRODUCT.md), the incumbent [DESIGN.md](../DESIGN.md) and [design sidecar](../.impeccable/design.json), and the [student-management direction contract](../.impeccable/surfaces/components-students-import-preview-table-tsx.md).

## Scope and product boundary

The reviewed implementation is [student-table.tsx](../components/students/student-table.tsx), [student-form.tsx](../components/students/student-form.tsx), [student-directory.tsx](../components/students/student-directory.tsx), [import-preview-table.tsx](../components/students/import-preview-table.tsx), and their rules in [globals.css](../app/globals.css). The four captured surfaces are the roster list, manual form, expanded import comparison, and school-class subscription dialog.

The owner-approved behavior includes exact five-digit-code preview/upsert, manual add/edit, templates, complete filtered/selected downloads, and archive/restore. Existing UUIDs and historical print/review/export identity and confirmed scores must survive roster edits. File absence never means removal. The school directory is an explicit school-membership exception: authorized managers maintain the central records, approved teachers subscribe to current classroom cohorts, and central fields control linked copies. Private/manual records, detached records, and local exclusions remain protected. This is not general teacher sharing. The implementation and migration boundary is documented in [STUDENT_ROSTER_IMPLEMENTATION.md](STUDENT_ROSTER_IMPLEMENTATION.md); this review does not authorize production SQL, data/environment changes, push, or deployment.

## Comparison with the incumbent system

The extension retains the “ทะเบียนตรวจข้อสอบสีอ่อน” world, Noto Sans Thai, Lucide line icons, mint navigation, cool canvas, white panels, plum actions and lavender selection. The direction contract's legacy phrase “ink-blue shell” does not introduce a blue replacement: the actual inherited `blue` token remains plum.

| Inherited element | Actual implementation used here |
| --- | --- |
| Palette | Canvas `#f6f8fc`, surface `#fff`, ink `#29263f`, muted `#5f5a73`, line `#dedde9`, control border `#8a829f`; action `#534095`, action hover `#44317f`, light action background `#eeebfb`, focus `#6653a4`. Shell mint/lavender remain `#defcf9` / `#c3bef0`. |
| Status | Existing neutral, plum, green, amber and red badges/notices; Thai text identifies the state as well as color. Directory-controlled imports carry a warning and cannot be committed from this preview. |
| Type | Noto Sans Thai with the existing 14px body, 13px/550 buttons, 11px badges and 12px notices. Task headings inherit 24px, 21px at ≤900px and 19px at ≤640px. Phone fields inherit the existing 16px treatment. These are observed uses, not additions to the recorded type ramp. |
| Buttons and focus | Existing primary/secondary/ghost variants: 8px corners, 9px 15px padding, 42px minimum height, 130ms feedback and visible 3px focus outline. Roster phone actions receive 44px minimum targets where defined. |
| Fields and containers | Labelled native inputs/selects, 7px field corners and 43px minimum field height; flat white panels with thin borders and 12px corners. Existing Radix-backed modal and Notice components carry form, warning, error and confirmation states. |
| Named rules | The Readable Pastel Rule, Thai Reading Rule and Flat Seam Rule remain applicable: pale backgrounds support dark readable text, Thai type keeps its established spacing, and ordinary panels separate with seams rather than added shadows. |

The list keeps the four familiar data columns—code, first name including prefix, surname, class—with selection and row controls around them. “เพิ่มนักเรียน” is the primary action; import, school directory, download and refresh remain secondary tools. Native grade, actual-class and active/archive filters sit beside search. A linked row identifies “ทะเบียนโรงเรียน”; its edit action explains central control and offers explicit detachment instead of presenting central fields as private edits. Manual forms separate prefix, first name and surname, retain a string code, lock the code during edit, and permit an optional student number. Archive/restore confirmations show the affected count and state that historical records remain.

## Compact layout and responsive behavior

The roster workspace uses a column layout with a 16px gap. The list panel has `min-height: 0` and an internally scrolling table with a 100px minimum height; toolbar, selection actions and pagination do not shrink into that scrolling region. List pagination uses server totals and 50-row pages. Selection and downloads cover the requested complete set rather than assuming the visible page is the whole roster.

The import panel similarly keeps the preview in its own scroll region with a 120px minimum height. File/mapping setup is collapsible and bounded to 48% height, with its own scrolling when open. Result filter, count, page statement and confirmation actions remain outside the preview scroller. Preview paging displays up to 100 rows at a time; the commit copy refers to the complete checked plan. Existing three-column combined-name mapping remains available in a disclosure alongside the current four-column mapping.

At ≤1100px, roster search spans the toolbar above the filter row. At ≤640px the tools wrap, the toolbar uses three flexible filter columns, and form/directory action rows can wrap. Directory class options have at least 44px rows, counts and explicit labels. Dialogs retain the incumbent constrained width and internal vertical scrolling; short landscape viewports inherit a usable minimum workspace height instead of compressing the work area away.

The only finish-review repair was the import comparison at phone width. Previously the final result/difference column sat outside the visible width of the desktop table, and the expanded row produced excessive empty height. The local adaptation at ≤640px renders each existing table row as a compact two-column grid: a 72px code/class column and a flexible name column, followed by a full-width result/difference area. The table heading remains visually hidden, the redundant row index is hidden, names can wrap, and expanded “เดิม” / “ใหม่” text uses the available width. Desktop/iPad retain the table; the difference disclosure has a useful 240–360px width and cells align to the top. This is a targeted comparison pattern, not a new global table rule.

## Finish-review disposition

The fresh finish reviewer inspected all 12 final captures, including the recaptures after the repair. Its single material finding was the hidden phone comparison/tall empty row described above. That finding is **resolved**. The reviewer returned **ship at the single-fix scope**, with no visible regression from that repair. This is not a whole-product claim of no material findings, nor a production release approval.

The directory screenshots show the subscription/class-selection surface. Directory administration, teacher-access management, and error/empty/loading branches were source-reviewed; they are not represented as screenshot-validated states. The form screenshot likewise records the captured form state, not every validation or nested-dialog permutation.

## Screenshot and validation evidence

The final files below were recaptured and opened/validated during the finish review. Desktop is 1440×1000, phone 390×844, and iPad 768×1024; these are browser viewport simulations.

| Surface | Desktop | Phone | iPad |
| --- | --- | --- | --- |
| Roster list | [Capture](../.impeccable/review/student-management-list-desktop.png) | [Capture](../.impeccable/review/student-management-list-phone.png) | [Capture](../.impeccable/review/student-management-list-ipad.png) |
| Manual form | [Capture](../.impeccable/review/student-management-form-desktop.png) | [Capture](../.impeccable/review/student-management-form-phone.png) | [Capture](../.impeccable/review/student-management-form-ipad.png) |
| Expanded import comparison | [Capture](../.impeccable/review/student-management-import-diff-desktop.png) | [Capture](../.impeccable/review/student-management-import-diff-phone.png) | [Capture](../.impeccable/review/student-management-import-diff-ipad.png) |
| School-class subscription | [Capture](../.impeccable/review/student-management-directory-desktop.png) | [Capture](../.impeccable/review/student-management-directory-phone.png) | [Capture](../.impeccable/review/student-management-directory-ipad.png) |

The implementation pass reported eight passing account/connected-roster browser tests, including axe checks, page-overflow checks and SQL-backed fixtures. The capture helper in [roster-management.spec.ts](../tests/e2e/roster-management.spec.ts) waits for fonts, resets the relevant scrollers, checks page overflow within 1px and requires no WCAG 2 A/AA or WCAG 2.1 AA axe violations before saving each viewport. Related account coverage is in [accounts.spec.ts](../tests/e2e/accounts.spec.ts), and SQL-backed request routing is in [roster-fixtures.ts](../tests/e2e/roster-fixtures.ts). The unit suite reported **228 passed, 2 skipped**. These recorded results are evidence for the tested scenarios, not a substitute for physical-device or deployment acceptance.

Physical phones/tablets, live production Supabase, and Safari were not validated in this pass. Source review of bounded synchronization on open/visibility return, visible intervals and before exam/print creation does not establish an always-online realtime guarantee. No camera, print geometry, server OMR or grading acceptance is claimed by this UI review.

## Drift and documentation boundary

A later nonvisual queue-loading guard was corrected in `review-answer-table.tsx`. The additional connected-review browser scenario passed with zero page errors, loaded one detail and confirmed through the existing database RPC. The student captures and the single-fix visual verdict above are unchanged; this functional check does not broaden that verdict.

The detector ran once. Its retained [JSON report](../.impeccable/review/student-management-detector.json) contains **0 primary findings and 188 advisory findings**: 56 palette findings, 121 type-ramp findings and 11 radius findings. These chiefly reflect incumbent literal colors and compact type uses that differ from the recorded palette/type metadata. They are disclosed rather than treated as 188 newly introduced defects or evidence that the whole application is clean.

DESIGN.md and `.impeccable/design.json` are preserved. Pre-existing ramp/metadata drift is neither repaired nor canonized by this ordinary extension. In particular, compact 11–12px helper/status uses are reported as actual implementation; they are not promoted into a new system-wide reading scale. No shipping raster asset changed, so this work required no new raster provenance entry. The PNGs linked above are review evidence. This documentation pass creates only this review record.
