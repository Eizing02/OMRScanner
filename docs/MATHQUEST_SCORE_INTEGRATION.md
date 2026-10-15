# ScanSob → MathQuest score publication

Status: implemented locally behind disabled feature flags on 15 October 2026. Migration 010 has **not** been applied to production by this work. No real student data was sent. MathQuest remains a separate project and must implement/verify its receiver before either network flag is enabled.

The user subsequently reported running migration 010 successfully. This is a user-reported installation; the live database has not been independently rechecked. Do not rerun 010 or the base schema when deploying this release. The integration remains disabled until receiver/configuration checks are complete.

## Product boundary

ScanSob remains authoritative for scanning, grading, review and confirmation. MathQuest receives a read-only snapshot only after explicit Workspace pairing and publication consent. A ScanSob `confirmed` result is not automatically “published”. Publication state, monotonic revision and delivery evidence are separate.

The payload permits only:

- source Workspace/exam/event/version/scan identifiers;
- five-character numeric `student_code`, preserving leading zeroes;
- confirmed score, maximum score, percentage, pass state and confirmation time;
- title, subject, exam type, classroom, academic year and term.

It excludes names, email, passwords, images, bubble observations, answers/answer keys, school logos and tokens. Unmatched codes are displayed; neither side may guess identity by name or classroom.

Approved student access policy (15 October 2026): MathQuest keeps Google sign-in and lets students enter their five-digit code, preview the student's name/classroom and confirm personally. They may correct the linked code through another preview/confirmation. Teacher approval or an additional roster-ownership verification is not required for students. Scores stay with their original codes. See the approved policy in [MATHQUEST_RECEIVER_HANDOFF.md](MATHQUEST_RECEIVER_HANDOFF.md). Teacher Workspace pairing approval remains required.

## Files and contract

- Runtime contract and ACK validation: `lib/integrations/mathquest/contract.ts`
- Pairing adapter: `lib/integrations/mathquest/pairing.ts`
- Frozen-event publisher: `lib/integrations/mathquest/publisher.ts`
- Additive database migration: `supabase/migrations/202610150010_score_integrations.sql`
- Teacher endpoints: `/api/integrations/mathquest` and `/api/exams/:id/publication`
- Runner endpoint: `/api/integrations/mathquest/dispatch`

The separate receiver team can use [MATHQUEST_RECEIVER_HANDOFF.md](MATHQUEST_RECEIVER_HANDOFF.md) for exact payload/ACK examples, proposed pairing fields and the staging acceptance matrix.

UI evidence and the independent Impeccable finish/documenter outcomes are recorded in [MATHQUEST_UI_REVIEW.md](MATHQUEST_UI_REVIEW.md). DESIGN.md and its sidecar remain unchanged.

The subsequent **012** update allows explicitly consented historical withdrawals after term closure while retaining publication/auto/delete guards. Install 012 once after 011, before this application version; it is prepared locally, not installed live. MathQuest receiver migration 03/profile 1.1 is the counterpart, with unchanged wire schema 1.0. See [closed-term withdrawal setup, tests and rollback](MATHQUEST_CLOSED_TERM_WITHDRAWAL.md). The owner-reported 011 installation is not a reason to rerun older SQL.

Wire version is `1.0`. One event contains at most 100 results; one revision contains at most 100 batches. `event_id` plus the exact UTF-8 payload hash is the idempotency identity. A revision is a cumulative confirmed snapshot for one source Workspace and exam. Batches in one revision are additive. Missing students are never interpreted as deletion. `withdraw_exam` is the only deletion signal.

The current v1 publisher deliberately blocks:

- confirmed rows from exam versions whose six display metadata fields differ;
- a zero/invalid maximum score;
- more than 10,000 confirmed results for one snapshot.

These blocks affect publication only; they do not change ScanSob scores. Reconciliation of unmatched/invalid rows creates a new revision rather than replaying an already-acknowledged event.

## Pairing profile — locally reviewed, not deployed acceptance

The separate MathQuest implementation at local commit `bb82d6c` was reviewed against `pair-scansob-workspace`. Its protected request/status/revoke, expiring single-use codes, school approval and hash-only token storage match the source profile. That local evidence does not verify deployed endpoints, Google configuration or scheduling. A lost token is handled by protected delivery followed by revoke/re-pair; token rotation UI is future work.

Each ScanSob teacher Workspace pairs independently, even when several teachers target the same destination school. The remote token is encrypted with AES-256-GCM and Workspace/connection associated data. It is never returned to the browser or stored in public tables. Revoke requires a remote acknowledgment; while pending, new sends and mode changes stop. Pending cancellation first checks protected status: an approved token lost during delivery is recovered in memory and used to revoke, without activating locally. Errors/timeouts never clear the local challenge. If the receiver has no request, or its active token-delivery window expired, audited receiver-side recovery is required; ScanSob must not report successful cancellation without proof.

## Migration and configuration

Install database migrations through 009 first. In an isolated staging project, run 010 once:

```text
supabase/migrations/202610150010_score_integrations.sql
```

Do not run `supabase/schema.sql` and individual migrations on the same fresh database. Do not rerun old migrations. Back up first and verify `private.app_installation` contains `202610090009`. The migration is additive but wraps the permanent-delete RPC so an externally published exam cannot be destroyed before withdrawal is acknowledged.

For this recovery update, apply **011 once after 010**, first in isolated staging:

```text
supabase/migrations/202610150011_score_connection_recovery.sql
```

011 is locally tested. The owner subsequently reported running it and authorized pushing this release to `main`; this task has not independently verified the live installation or run production SQL. **Do not rerun 010 or 011.** Deploy 011 before this application version; old application DTOs tolerate the additive fields, but new recovery actions need the new RPC. Keep both feature flags false through rollout. See [recovery upgrade and rollback](MATHQUEST_RECOVERY_UPGRADE.md).

Server environment variable names (values intentionally omitted):

```text
SCORE_INTEGRATION_ENABLED=false
MATHQUEST_RECEIVER_VERIFIED=false
MATHQUEST_RECEIVER_ORIGIN=
SCORE_SYNC_SUPABASE_SECRET_KEY=
SCORE_SYNC_ENCRYPTION_KEYS=
SCORE_SYNC_ENCRYPTION_KEY_VERSION=
SCORE_SYNC_RUNNER_SECRET=
```

None may start with `NEXT_PUBLIC_`. `MATHQUEST_RECEIVER_ORIGIN` accepts only a root HTTPS `*.supabase.co` origin. `SCORE_SYNC_SUPABASE_SECRET_KEY` is a new server-only key used only for service RPCs; never reuse an exposed historical service-role value. Encryption keys are a JSON map of version to 32-byte hex key; keep old key versions available while their ciphertext exists.

Rollout order:

1. Apply migration 010 to an isolated staging database with both flags false.
2. Deploy ScanSob with both flags false; verify normal scan/review/export paths.
3. Implement and security-review the separate MathQuest receiver, student authorization and school isolation.
4. Run shared synthetic conformance tests: duplicate bytes/hash conflict, partial ACK, reverse batches, revision 2 before 1, withdraw before delayed publish, two source Workspaces and revoked tokens.
5. Set `SCORE_INTEGRATION_ENABLED=true` in staging while `MATHQUEST_RECEIVER_VERIFIED=false`; inspect read-only UI/DB state without outbound network.
6. Configure secrets and runner, then set receiver verified only after approval. Pair one synthetic Workspace and publish synthetic five-digit IDs.
7. Validate unmatched/retry/withdraw/permanent-delete and audit records. Obtain explicit approval before real student data or production environment changes.

## Delivery runner and recovery

Teacher commands commit an outbox row before any HTTP call. The authenticated request may attempt that exam immediately, but durable auto/retry delivery requires an external scheduler to POST `{}` to `/api/integrations/mathquest/dispatch` with `Authorization: Bearer <SCORE_SYNC_RUNNER_SECRET>`. Configure the scheduler on the deployed host or Supabase scheduling facility only after receiver verification. A browser timer is never the durable worker.

The runner handles at most five events or approximately 12 seconds per invocation. It leases rows, verifies the lease immediately before HTTP, retries 429/5xx/network failures with bounded backoff, and stops after eight automatic attempts. Manual “ลองส่งใหม่” remains available. Exact frozen bytes and event ID are reused for transport retry.

Observability uses sanitized error codes and audit counts only. Do not log payloads, authorization headers, connection tokens or student codes. Current delivery status is visible per exam; no Storage quota display is added.

## Rollback

1. Set `MATHQUEST_RECEIVER_VERIFIED=false`, then `SCORE_INTEGRATION_ENABLED=false`, and stop the runner.
2. Revoke affected connection tokens at MathQuest if compromise is suspected.
3. Preserve outbox, publication tombstones and audit records; disabling flags does not withdraw already-received MathQuest data.
4. If scores must disappear remotely, re-enable only the controlled withdrawal path or perform an audited receiver-side withdrawal.
5. Roll back application code if necessary. Do not drop 010 tables in production; use a reviewed forward migration.

ScanSob scanning, confirmation and export remain operational throughout. A failed integration never changes a confirmed score.

## Test evidence and remaining gate

Local Vitest/PGlite coverage exercises RLS, server-only secrets, strict schemas, frozen bytes, lease fencing, partial ACK, multi-batch publication, auto opt-in, suspension, withdrawal-before-delete and receiver ordering fixtures. Playwright covers pairing/publication UX and responsive layouts with intercepted synthetic APIs. These tests do not prove a live MathQuest receiver, live Supabase scheduling, real Google authentication or real student authorization.

Observed local checks on 15 October 2026:

| Check                                  | Result                                    | Scope                                                                             |
| -------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------- |
| `npm test`                             | 198 passed, 1 optional skip, 33 files     | Domain/API/image fixtures and isolated PGlite, including 46 integration tests     |
| `npm run typecheck` / `npm run lint`   | Passed                                    | Application and test source                                                       |
| `npm run build`                        | Passed — Next.js 16.4, 30 generated pages | Production compile after final server changes; not cloud deployment               |
| `npm run test:e2e`                     | 25 passed                                 | Existing demo/UI/PDF/scanner regressions                                          |
| `npm run test:accounts`                | 5 passed                                  | Mock Google approval/workspace isolation and camera flow                          |
| `npm run test:integrations`            | 2 passed                                  | Synthetic pairing/publication, desktop 1440×1000, phone 390×844 and iPad 768×1024 |
| Axe and horizontal-overflow assertions | Passed                                    | Both integration surfaces at the three viewports above                            |
| Impeccable finish review               | `ship`, no material fixes                 | Required screenshots, incumbent world, state truth and responsive adaptation      |

The optional skipped test requires a separately generated print-QA raster. No physical device accuracy claim is made. Impeccable kept the incumbent DESIGN.md and scoped this work to the settings section and publication dialog; broad existing CSS token advisories were not converted into a design-system rewrite.

The initial local receiver review inspected MathQuest commit `bb82d6c` and passed 39 source/receiver schema comparisons, its SQL/HTTP fixture suite and disposable PostgreSQL concurrency/batch tests. Its later local migration 03/profile 1.1 fixes old-score visibility on re-pair and bound missing/expired cancellation; source 012 adds the safe closed-term withdrawal path. The optional two-database fixture exercises actual 012/03 payloads, purge evidence, lost ACK/replay and deletion guards. This is not deployed two-project acceptance. Student self-confirmation is the owner-approved policy; adding teacher verification is not a release gate. Receiver 03 deployment, actual authorization/switching, both projects' shared staging matrix and scheduled delivery still need approval/verification. Continuous delivery requires a deployed runner.

## Changed-file summary

New runtime modules are under `lib/integrations/mathquest/`, `components/integrations/` and `types/integration.ts`. New routes are `app/api/integrations/mathquest/route.ts`, its `dispatch/route.ts`, and `app/api/exams/[id]/publication/route.ts`. The optional database additions are 010, additive recovery update 011 and safe closed-term withdrawals 012.

Existing UI/API changes are limited to `app/settings/page.tsx`, `components/export/export-panel.tsx`, `app/globals.css` and the withdrawal-required error in `app/api/exams/route.ts`. No scanner, grading, historical QR/geometry, roster, logo or image-retention module was modified.

Tests add `tests/score-integration-*.ts`, `tests/e2e/score-integration.spec.ts` and `playwright.integrations.config.ts`; existing account fixtures, default Playwright exclusions, package scripts and `.github/workflows/web-checks.yml` include the new coverage. `.env.example` contains names/defaults only, with no secret values.

AGENTS.md, PRODUCT.md, README.md and the implementation/test/architecture documents describe the current optional feature. The scoped Impeccable surface brief records the inherited direction. This document, the receiver handoff and UI evidence describe setup, boundaries, verification and rollback.
