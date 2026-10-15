# MathQuest connection recovery — SQL 011

15 October 2026. ScanSob-only implementation and local verification. The owner subsequently reported running SQL 011 and authorized pushing this release to GitHub `main`. This is a user-reported installation, not an independently verified live database check. Do not rerun 011. No production SQL, environment changes or real score delivery were performed by this task; Git push is not proof of a successful cloud deployment.

## Behavior

- Pause sending, then choose **กู้คืนการเชื่อมต่อ** and explicitly confirm. ScanSob validates the existing receiver's bound revoke ACK before clearing the token. A timeout/invalid ACK leaves a frozen recoverable connection. Retrying is safe. Normal revoke still requires withdrawn publications.
- Recovery supersedes unsent/in-flight source jobs and fences their later responses. Confirmed ScanSob scores do not change. Historical publications remain `error / REMOTE_REVOKED`, not falsely `withdrawn`; exam deletion stays blocked.
- Pair again to the original destination school. Historical exams display **ต้องถอนคะแนนเดิม**. Send a higher-revision `withdraw_exam`; only its committed processed ACK marks older publications at that same school withdrawn. Then republish confirmed scores if desired. Both manual and automatic publication obey this gate, including pre-existing automatic drafts.
- Cancelling a pending pairing performs protected status → optional in-memory token recovery → revoke → local finish. Approval racing after status fails safely and can be retried. No arbitrary 403/404, expired code, malformed ACK or network error is considered proof of revocation.
- Exact bounded ingest `403 {"error":"TERM_CLOSED"}` blocks all jobs for that Workspace/destination/year/term, consumes auto requests and prevents new publish/retry for that term. Other terms and the connection remain enabled. The closure survives re-pairing to the same school and has no public reopening/delete RPC.

## Migration

1. Keep `SCORE_INTEGRATION_ENABLED=false` and `MATHQUEST_RECEIVER_VERIFIED=false`, stop the runner and back up first.
2. On a database with 010 installed, run `supabase/migrations/202610150011_score_connection_recovery.sql` **once**, first in staging. Existing installations must not rerun 010 or `schema.sql`. An installation without 010 must apply that prerequisite once first.
3. Verify marker `202610150011`, owner-only closed-term SELECT, no authenticated writes, no authenticated service RPC execution and no execution of retained `_v010` entrypoints. This task tests those permissions in isolated PGlite; it does not claim a live check.
4. Deploy the application after the migration, with both flags still false. No new environment variables or external service are introduced.
5. Complete the receiver follow-ups in [MATHQUEST_RECEIVER_HANDOFF.md](MATHQUEST_RECEIVER_HANDOFF.md), shared synthetic and deployed authorization checks. Obtain approval before changing production flags, installing SQL live or sending real data.

## Operational limits and rollback

The current receiver can resurface old retained scores immediately on reapproval. Source withdrawal cannot prevent that pre-token visibility gap: fix receiver visibility before enabling real re-pairing. Missing requests and active requests past the delivery window still require destination-admin recovery. Closed-term reset/purge does not automatically prove source withdrawals. These are explicit cross-project TODOs, not successful local fallback paths.

Rollback by disabling receiver verification, then the integration flag, and stopping the runner. Roll back application code if needed; keep 011 tables, encrypted challenges, historical rows, revisions and audit logs. Never drop them or mark publications withdrawn manually to bypass deletion. Revoked credentials cannot be restored by a code rollback. Receiver data stays governed by its own audited lifecycle; use a reviewed forward migration if reconciliation is needed.

## Changed files and evidence

Runtime changes are limited to integration HTTP/pairing/error helpers, connection API/DTOs, the settings section and publication dialog. SQL 011 wraps 010 service/command functions, adds recovery state and owner-scoped term closures, and preserves the existing wire schema, score authority, QR and geometry. Tests cover SQL roles, late workers, strict ACKs, re-pair destination binding, historical withdrawal, closed-term isolation and cancellation races. Browser QA uses synthetic intercepted responses, not a deployed receiver or physical mobile device.

Changed runtime files: `lib/integrations/mathquest/{http,pairing,errors}.ts`, `app/api/integrations/mathquest/route.ts`, `types/integration.ts`, both integration components, and optional focus return in `components/ui/primitives.tsx`. New SQL and regression: `202610150011_score_connection_recovery.sql`, `tests/score-integration-recovery.test.ts`; the existing integration fixture, pairing/publisher/API and browser tests were extended. README and integration/handoff/UI-review documents describe installation and remaining gates. The earlier owner-approved student policy in PRODUCT.md and handoff is preserved. DESIGN.md and its sidecar are unchanged.

Local verification: full Vitest suite 209 passed / 1 optional skipped; changed SQL, pairing and HTTP subsets rerun successfully after final edits. Playwright: 25 existing app flows, 5 account/workspace flows and 3 integration flows passed. Typecheck, ESLint and final Next.js production build passed. The scoped Impeccable detector returned no findings; fresh finish review and documenter both returned `ship` for the integration UI. None of these results substitutes for production migration or deployed receiver acceptance.
