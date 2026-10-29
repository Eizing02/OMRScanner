# Student management and school directory — 28 October 2026

Locally implemented and validated. On 28 October 2026 the user reported completing SQL 013–016 and explicitly authorized publishing this work to GitHub `main`. Database installation is user-reported, not independently verified against the live project. This release does not change production data/environment or manually trigger a deployment.

Approved: five-digit string upsert within a private teacher workspace; manual creation/editing; Excel/CSV preview and templates; archive/restore with safe selections; school-directory access explicitly assigned to approved teachers of that school; automatic current-class subscriptions, central fields authoritative, manually managed students protected. Historical exam identities, QR geometry, grades, confirmations and frozen MathQuest events must not change.

## Behavior

School removal added in the next local release: owner-only 14-day trash/restore, frozen authorized copies while trashed, then scheduled central-only purge with safe detachment. This requires prepared SQL 019/020 after 018; see [installation and operations](SCHOOL_DIRECTORY_LIFECYCLE.md). These files have not been installed in production in this task.

- `/students`: manual add/edit, search, actual grade/class options, active/removed filter and server pages of 50. Selection supports one/page/all filtered rows with explicit exclusions. Bulk confirmation previews the exact rows. Removal archives; restore preserves UUID and historical references. Student code cannot be renamed in place.
- `/students/import`: existing four-column and combined-name legacy formats remain supported. First validate/compare, then explicitly commit. Match code only in the current workspace. Preview add/update/unchanged/restore; a linked central record requires central editing or explicit detach. File absence never deletes. Missing optional number retains the current number; an explicitly mapped blank clears it. Plans expire after 20 minutes, require the creating actor/workspace, reject changed row/source revisions, apply atomically and replay a committed receipt safely.
- Downloads: blank Excel input sheet with text-formatted codes and a separate synthetic example/instruction sheet; UTF-8 CSV; complete selected/filtered roster export. Excel is dynamically loaded. Never export only the visible page or turn a code into a number.
- School directory: owner creates a school directory and explicitly grants approved accounts as teacher/manager. School names or email domains do not imply membership. School managers edit/seed/import central records. Teachers subscribe to actual classrooms with a change preview. Current cohort follows those rooms; linked fields are central-authoritative. Same-code private records are reported as conflicts and require explicit adoption. Local removal records an exclusion; whole-room removal also stops following the room. A detached student is private and will not be relinked silently. Restoring a central student requires valid school access and a current subscribed class. Revoke/suspend removes central access and deactivates linked active roster copies on synchronization, preserving history.
- Synchronization: initial workspace load, return to a visible page, every 60 seconds while visible (one request in flight), before creating an exam and registering a print. No Realtime service/worker/queue is added. This is bounded eventual synchronization; an already open preview rejects stale commits rather than silently overwriting newer data.
- Historical identity: first registered print freezes the exam-version roster; explicit later selection can enroll an active new student without mutating previous snapshots. Scan identity freezes on insert or teacher identification. Promotion/name edit/archive cannot change previous sheet/review/result/export names or confirmed grades. Backfill prefers existing personalized print evidence, otherwise records current-roster provenance; missing historical truth cannot be reconstructed.
- Loading: shell gets exam metadata/settings/small count summary. Students, queue and results page on the server; selected review detail/answers/image and exam roster load only when needed. Designer layouts load only for the chosen exam. True aggregate counts and full exam/export selections remain server-authoritative. Existing token/private Storage and scoring/review paths remain intact.

## Installation after approval

Check `private.app_installation` in the Supabase SQL editor first. Existing installations must have marker `202610150012`. Do not rerun old files or `schema.sql`. Take a database backup and use staging first.

Run each **complete file** in this order, once:

1. `supabase/migrations/202610280013_student_history.sql` — identity snapshots and eligibility; backfill before any roster editing.
2. `supabase/migrations/202610280014_student_management.sql` — safe roster commands/plans and student pages.
3. `supabase/migrations/202610280015_school_directory.sql` — explicit school grants, central roster and subscriptions.
4. `supabase/migrations/202610280016_scoped_workspace_reads.sql` — summary, queue/detail, result and exam-roster reads.

Each file is transactional and checks its predecessor. A failed transaction must be rolled back before retry. Verify all four installation markers and no SQL errors, then deploy the matching code. New UI fails with a setup error when required RPCs are missing; it does not silently switch to demo or unsafe legacy writes. For a fresh DB, install existing schema/migrations through 012 first, following the existing setup documents.

No new environment variables, public buckets or service-role keys are required. Keep existing Google approval, RLS and private Storage. School directories start empty; no real student data is seeded by migrations. In the UI the owner explicitly creates a directory, previews copying their own existing roster, commits it, then grants the appropriate approved school teachers. Each teacher chooses classrooms and confirms. Check two approved accounts plus an unrelated/pending account on staging before using real student data.

## Changed implementation areas

- Student UI: `components/students/student-table.tsx`, `student-form.tsx`, `student-directory.tsx`, `use-roster.ts`, `import-preview-table.tsx`; route `app/students/import/page.tsx`; scoped layout rules in `app/globals.css`.
- Validation/files: `types/student.ts`, `types/roster.ts`, `lib/import/roster-api.ts`, `student-files.ts`, `parse-students.ts`; API `app/api/students/route.ts`.
- Scoped loading: `components/layout/workspace-provider.tsx`, `main-shell.tsx`, `components/review/use-review-data.ts`, `review-answer-table.tsx`, dashboard counts, exam form, results/print panels; scan-record and layout read endpoints plus exam/print synchronization boundaries.
- Database: the four new migration files listed above. Earlier migrations and the historical consolidated schema are unchanged.
- Compatibility evidence: student API/file/database tests, SQL fixture, connected browser fixture/spec, existing account/import/print/integration browser mocks and Windows-compatible Playwright commands.
- Documentation/security: approved roster rules in PRODUCT/AGENTS, README, this guide, Impeccable surface/review record, compatible package/lockfile patches. DESIGN/sidecar and shipping logos/images are unchanged.

## Rollback and limits

Prefer a forward fix. Do not drop historical roster/scan snapshots, clear directory references, delete students or restore a DB backup over newer confirmed grades. Stop roster edits/central synchronization if a migration or smoke test fails; keep the previous app release available and retain the backup for controlled recovery. Old insert-only clients remain compatible but do not implement new directory synchronization/active-only semantics; do not expose their student management while rolling back. There is no destructive automated down migration.

Current import limit remains 2,000 rows per file. PDF print jobs retain the existing 200-sheet limit. Full filtered export is an explicit one-time read, separate from paged browsing. Directory classes are not inferred or invented. Removed records retain identity/history and therefore are not a disk-erasure feature. No live Google/Supabase/physical-camera acceptance is implied by local tests.

## Security patches

User approved including compatible patches: Next.js/eslint-config-next 16.4.1, Zod 4.6.6, DOMPurify 3.4.17 and Undici 7.30.1 (the latter two transitive lockfile updates). `npm audit --omit=dev --json` reported zero known vulnerabilities after installation. No `--force`, major upgrade, environment change or install-script approval was used. Windows application control blocked the new native SWC; local browser/build verification uses supported Webpack/WASM fallback. `npm audit` is evidence of known advisory status at this run, not a security certification.

## Validation

Tests use synthetic students and PGlite PostgreSQL with auth stubs, plus browser HTTP fixtures invoking the actual new SQL/RLS/RPC and actual command mapper. They do not contact the production project. UI review is recorded separately in `docs/STUDENT_ROSTER_UI_REVIEW.md`.

- Unit/API/database suite: 228 passed, 2 explicitly skipped; additional upgraded-history checks cover frozen MathQuest retry bytes and subscribed rooms remaining manageable at zero current students.
- Connected account/roster browser coverage: 8 passed together, plus the new connected-review scenario passed independently with zero page errors. The latter loads one queue/detail, displays 20 answers and confirms via the existing `review_scan` RPC. It caught and repaired a null-detail guard on first queue load.
- Existing demo browser coverage: 23 passed in the main run; the two failures passed on clean rerun. One was a dev HMR/loading interruption, one exhausted the old 90-second budget for a 30-route/viewport matrix. That matrix now has a 240-second budget for Windows Webpack/WASM compilation; assertions are unchanged.
- MathQuest browser coverage: 3 passed in the main run, the closed-term scenario passed on clean rerun after an auth-loading/dev interruption. No real receiver or publication was enabled.
- TypeScript, lint and `npm run build -- --webpack` passed. Production compilation, generated route-handler types, static page generation and build traces completed. The build exposed optional `Request` route-handler parameters; these were made required according to the installed Next.js guide and their affected API/database tests passed (22 checks). Both full and production-only npm audits reported zero known vulnerabilities at this run.

Browser captures exercise desktop, phone and iPad sizes with no document overflow and zero axe violations for the tested states. The Impeccable detector ran once (zero primary findings; 188 mostly incumbent metadata advisories); a fresh reviewer required one phone-comparison repair and scored it resolved, with `ship` at that single-fix scope. DESIGN.md and its sidecar are preserved. These are local simulated-browser results, not live Supabase staging, mobile Safari, physical camera or school acceptance.
