# Closed-term withdrawals — ScanSob SQL 012

15 October 2026. Local implementation only, based on MathQuest's `20261015-scansob-recovery-handoff.md` and receiver migration 03/profile 1.1. No production SQL, environment changes, real score delivery, Git push or cloud deployment were performed for this update. The owner reported installing 011 in the previous release; do not rerun it.

## Authorized behavior

Closing a term still forbids manual/automatic publication and publication retry. It does not automatically certify withdrawal, reopen a term, alter ScanSob grades or lift exam deletion guards.

An owner can explicitly confirm a historical `withdraw_exam` to the same original school through an active connection, even while normal sending is paused. A matching committed private `withdraw` command, current publication revision, connection/Workspace identity, frozen payload action/metadata and empty results authorize the job. A browser cannot turn a publication into a withdrawal by changing an action field. No new wire fields, secrets, services or tables are introduced.

Transport failures retry the original event ID, bytes and hash with a new lease. Existing blocked work is not revived by migration; an owner may explicitly retry a previously consented frozen withdrawal. Superseded jobs/leases never revive. `TERM_CLOSED` cleanup blocks publications only and cannot cancel a different exam's withdrawal.

Only the receiver's validated committed `processed` ACK, accepted 0 and empty issue arrays can mark current and same-school historical publications withdrawn. Revoke ACK, stale_ignored, timeout, malformed ACK, denial or a closed-term marker never prove deletion. If a withdrawal receives TERM_CLOSED, only that withdrawal is blocked with `WITHDRAWAL_PROOF_REQUIRED`; the UI names destination-admin recovery and offers no automatic/frozen retry. After reconciliation, a fresh explicit withdrawal can create a higher revision. A stale current withdrawal similarly requires a fresh confirmation, not endless replay.

The publication DTO adds fail-closed `canWithdraw`, `canRetryWithdrawal` and `withdrawalBlocked` booleans. Labels distinguish “รอถอน”, “ลองถอนอีกครั้ง” and “รอตรวจสอบการถอน”. The confirmation states that success awaits MathQuest acknowledgment. Scores in ScanSob stay unchanged.

## Install boundary and rollout

1. Back up, stop the runner and keep both integration flags false. Do not change production configuration without approval.
2. In the **MathQuest project**, apply its migration `20261015_03_scansob_recovery_hardening.sql` after 02 and deploy `scansob.js`/`scansob.css`. Do not rerun 02 over 03. Existing Edge Function signatures/wire version stay unchanged. Verify receiver profile 1.1 and deployment separately; local files are not live acceptance.
3. In **ScanSob**, with 011 installed, apply `supabase/migrations/202610150012_closed_term_withdrawals.sql` once in isolated staging first. Do not rerun 010/011 or schema.sql. SQL 012 changes functions/permissions, indexes withdrawal-command lookups and adds installation marker `202610150012`; it does not reset scores or replay the queue.
4. Deploy this ScanSob application after 012. Older DTOs ignore additive fields; this application fails closed without the new permission flags. Never expose `_v010`/`_v011` entrypoints or private authorization helpers.
5. Test both deployed projects with synthetic IDs: re-pair/old-score visibility, pending/expired/missing cancellation, closed publication with another term open, purge-backed withdrawal, missing proof, lost ACK/replay, wrong school/Workspace, late leases and withdrawal-before-delete.
6. Obtain approval before enabling real delivery/runner. Do not automatically reopen closed terms or clear historical guards after a receiver reset.

## Tests and scope

`tests/score-integration-closed-term.test.ts` checks 012 ACLs, consent, frozen retry, late lease fencing, malformed/stale ACKs, proof rejection, other-exam isolation, paused connections, forged job types and an upgrade from installed 011 without automatic revival.

`tests/score-integration-purge-receiver.test.ts` optionally reads the independent MathQuest project's real fixture/03 migration and runs two isolated in-memory databases. It uses the actual source contract, event payloads and receiver HTTP handler/SQL, including re-pair, purge, missing evidence, lost committed ACK, exact replay and source deletion guards. It sends no network requests and does not edit MathQuest. Standard CI skips this optional cross-project test when that repository is absent.

The local cross-project test passed against receiver 03 SHA-256 `3de10a7967dda397b4df55bf0041c6cf2efeb767568255614dedf2008ed0493c` (the MathQuest checkout has that recovery work uncommitted over `bb82d6c`). This fingerprint identifies inspected local code, not a deployed release.

To run locally, set `MATHQUEST_SOURCE_DIR` to the MathQuest checkout, `SCANSOB_SOURCE_DIR` to this checkout, and `SQL_QA_MODULE_ROOT` to this checkout's `node_modules`, then run `npx vitest run tests/score-integration-purge-receiver.test.ts`. These are test-process variables only, not deployment settings.

Changed runtime files: SQL 012, `types/integration.ts`, `lib/integrations/mathquest/errors.ts`, and `components/integrations/exam-publication.tsx`. Existing API contracts, scanner/grading/QR geometry and private Storage are unchanged. Shared integration fixtures and browser coverage are extended; product, README and integration/handoff documents describe the approved exception. DESIGN.md and its sidecar are preserved.

Local checks: standard Vitest 214 passed / 2 skipped (the pre-existing optional print raster and the absent-by-default independent receiver checkout). The cross-project receiver test was explicitly enabled and passed separately; after the final SQL index addition, all five new SQL tests and that cross-project test passed again. Four integration Playwright flows passed with Axe and horizontal-containment checks at desktop 1440×1000, phone 390×844 and iPad 768×1024, explicit confirmation, retry/operator states and keyboard focus restoration. Typecheck, ESLint and the final Next.js production build passed. The scoped Impeccable detector returned no findings. These are synthetic/Chromium checks, not physical mobile or deployed Auth/RLS acceptance.

## Rollback and remaining gates

Disable receiver verification, then the integration flag, and stop the runner. Roll back application code if necessary; retain 012, historical revisions/commands, frozen outbox records, closed-term markers and audit evidence. Older UI may again hide closed-term withdrawal, but that is not permission to delete evidence or manually mark history withdrawn. Any database reversal needs a reviewed forward migration, not re-execution of 011.

The separate receiver's local 03 implementation solves the previously identified visibility/cancellation gaps, but its deployment, real Google identity switching, production RLS, secret configuration and scheduler have not been certified here. Approval to implement this source update is not approval to change those systems or send student data.
