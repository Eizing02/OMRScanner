# MathQuest receiver handoff — ScanSob source implementation

15 October 2026. Implement MathQuest in its own project. This document describes the proposed adapter and source constraints; it does not approve a live deployment or imply agreement from an implemented receiver.

## Score endpoint and schema

Proposed endpoint: `POST /functions/v1/ingest-scansob-results`, HTTPS, JSON, `Authorization: Bearer <workspace-specific opaque token>`. The complete executable schemas are in `lib/integrations/mathquest/contract.ts`. A synthetic source fixture is in `tests/score-integration-event-fixture.ts`.

```json
{
  "schema_version": "1.0",
  "event_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "connection_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "source_workspace_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "source_exam_id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  "publication_revision": 1,
  "action": "publish_results",
  "batch_index": 0,
  "batch_count": 1,
  "occurred_at": "2026-10-15T00:00:00.000Z",
  "exam": {
    "title": "ข้อสอบจำลอง",
    "subject": "คณิตศาสตร์",
    "exam_type": "เก็บคะแนน",
    "classroom": "ม.1",
    "academic_year": 2569,
    "term": 1
  },
  "results": [
    {
      "source_scan_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "source_exam_version_id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
      "student_code": "00123",
      "score": 17.5,
      "max_score": 25,
      "percent": 70,
      "passed": true,
      "confirmed_at": "2026-10-15T00:00:00.000Z"
    }
  ]
}
```

No extra fields are accepted. A batch contains 1–100 results; a withdrawal has no results and uses batch 0 of 1. The source currently bounds a revision to 100 batches. Retain five-digit codes as text, including `00123`. Source scores are DB-authoritative, with percentage rounded to two decimals. Source maximum must be positive; zero-total exams remain valid in ScanSob but cannot be published with this profile.

An HTTP 200 acknowledgment follows a committed receiver transaction:

```json
{
  "schema_version": "1.0",
  "event_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "status": "processed",
  "accepted": 1,
  "unmatched": [],
  "invalid": []
}
```

Issue entries contain exactly `student_code` and `reason`. Reason enum: `STUDENT_NOT_FOUND`, `STUDENT_NOT_ELIGIBLE`, `INVALID_SCORE`, `IDENTITY_MAPPING_REQUIRED`. All codes must occur in that event, with no duplicates across arrays. `accepted + unmatched.length + invalid.length` equals the event result count. A `stale_ignored` ACK has accepted 0 and empty arrays. ScanSob will not mark a current revision successful merely because a receiver reports it stale.

Return 400 for schema rejection, 401/403 for invalid/revoked scope, 409 for event/hash or revision manifest conflict, 429 with optional numeric `Retry-After` for throttling, and 5xx for transient failure. ScanSob sanitizes response bodies, retries network/429/5xx, and blocks invalid ACKs.

## Transactional ordering rules

1. Verify token hash and bind it to the connection, destination school and exact source Workspace before reading/upserting anything. Do not accept destination identity from a browser.
2. Deduplicate by `event_id` and SHA-256 of the exact received UTF-8 bytes. A byte-identical replay returns its saved ACK. The same ID with different bytes conflicts.
3. Maintain the highest revision per `(destination_school_id, source_workspace_id, source_exam_id)`, including after withdrawal. Older events are ignored. Source revision counters survive exam deletion and re-pairing.
4. For a revision, record action, metadata, batch count and batch indexes. Different batches of the same revision are allowed; contradictory manifests or replacement of one batch by another event conflict. Duplicate requests must not create duplicate results.
5. Upsert only included student rows. Neither a missing batch nor a missing student means deletion, even in a newer publication. Reject older events before upserting. A higher `withdraw_exam` revision removes/hides the exam's imported scores and keeps its tombstone; delayed publish cannot restore it.
6. Resolve students only within the connection's authorized destination school. No name/classroom guessing and no MathCoins/XP side effects. Student reads expose only their own authorized school identity.
7. Commit writes, saved hash/ACK and revision changes atomically. A timeout after commit must be safe to retry.

The local `tests/score-integration-receiver-model.test.ts` is a contract fixture, not a replacement for real PostgreSQL transaction/concurrency tests in MathQuest.

## Pairing endpoint profile to agree before enabling

Proposed endpoint: `POST /functions/v1/pair-scansob-workspace`. Browser users never call it with integration secrets. Request and status use a 43-character random request secret bound to a source Workspace/request UUID. MathQuest stores a hash, not its plaintext value.

| Action    | Request fields in addition to `schema_version: "1.0"`                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `request` | `request_id`, `source_workspace_id`, `workspace_label`, `request_secret`, `pairing_code`                                                  |
| `status`  | `request_id`, `source_workspace_id`, `request_secret`                                                                                     |
| `revoke`  | `request_id`, `source_workspace_id`, optional `connection_id`, optional `request_secret`; active connections also send their Bearer token |

`request`/`status` return exactly `schema_version`, `request_id`, `status`; status is `pending_approval`, `active`, `rejected` or `expired`. Only `active` includes a `connection` object containing `id`, `destination_school_id`, `destination_label`, `scope: "score:write"` and `token`. Tokens use 43–256 base64url characters and are specific to one approved source Workspace and school. Pending/rejected/expired replies contain no token.

`revoke` returns exactly `{ "schema_version": "1.0", "request_id": "<same UUID>", "status": "revoked" }` only after invalidating the scope/token. ScanSob requires this acknowledgment even for a pending request: local pending status does not prove remote approval never happened. It first retrieves protected status and, if active, uses the recovered token only in memory to revoke. Receiver 03 also supports bound challenge cancellation after expired delivery or an unknown-request terminal status, so this existing handshake works without new fields. An arbitrary 403/404, expiry response alone, invalid ACK or timeout never clears the source challenge. Loss of the original challenge/token or encryption keys still needs operator recovery.

Local receiver commit `bb82d6c` implements expiring codes, administrator approval, idempotent delivery and protected status/revoke. Its HMAC delivery key must stay stable during the approved delivery window; no source-side token derivation is used. Never expose stored plaintext tokens or silently share a global teacher secret. A dedicated rotate UI/handshake remains future work.

## Recovery follow-up for the MathQuest project

**Latest local follow-up:** MathQuest's `20261015-scansob-recovery-handoff.md` and migration 03/profile 1.1 implement publishing-connection visibility, bound cancellation including unknown/expired requests, and audited purge-backed processed withdrawal ACKs. The earlier four items below record the 02 review, not unresolved defects in the new local receiver. Source SQL 012 and its UI now implement the required closed-term scheduler/retry exception; see [MATHQUEST_CLOSED_TERM_WITHDRAWAL.md](MATHQUEST_CLOSED_TERM_WITHDRAWAL.md). Neither counterpart's local implementation is proof of deployment. Wire schema remains 1.0; no new endpoint/action/ACK fields are required.

Source SQL 011 and its UI implement paused-connection recovery using the existing authenticated revoke endpoint. The exact revoke ACK closes only the connection: it does **not** prove retained scores were withdrawn. ScanSob preserves historical publication/delete guards. After re-pairing to the **same destination school**, it requires a higher-revision withdrawal before publishing that exam again. Wrong-school activation is rejected while unresolved historical scores remain.

Required receiver follow-ups before real data:

1. **Old-score visibility on re-pair:** the reviewed receiver authorizes retained scores through any active connection for the Workspace. Re-pairing therefore makes old scores visible before a new event. Bind visibility to the score's approved publication/connection lifecycle, or perform an explicit audited reconciliation before reapproval. Do not treat a new connection as permission to resurface old retained data. ScanSob cannot close the gap between remote approval and token delivery.
2. **Missing/expired request recovery:** absent protected status currently returns generic `403 UNAUTHORIZED`; after approval, delivery can expire while the actual connection remains active. Specify a secure idempotent cancellation/recovery contract that works in these states without leaking request existence. Do not tell ScanSob to treat every 403/404 as cancellation success. The current source deliberately retains the challenge and needs retry or destination-admin assistance.
3. **Closed terms:** ingest already returns `403 application/json` with exactly `{ "error": "TERM_CLOSED" }`. Source 011 recognizes only this bounded, allowlisted code. It blocks that Workspace/destination/year/term, not the connection or other terms. No automatic reopening is provided. After receiver term reset/purge, agree an audited closure/withdrawal acknowledgment before clearing source historical delete guards; this update never pretends old scores were withdrawn after a rejection.
4. Re-run the shared synthetic matrix: approval before cancellation, approval between status and revoke, lost revoke ACK/replay, receiver admin revocation with retained scores, wrong-school re-pair, historical higher-revision withdrawal, delayed old jobs and one closed term alongside an open term. Confirm deployed student self-link/switch isolation under the owner-approved policy.

No MathQuest source, database, production environment or feature flags were changed by this ScanSob task. See [MATHQUEST_RECOVERY_UPGRADE.md](MATHQUEST_RECOVERY_UPGRADE.md).

## Approved student-code linking policy — 15 October 2026

The owner explicitly chose student self-confirmation, without teacher approval or an additional ownership-verification gate:

1. Keep the Google sign-in flow. The student enters an existing five-digit roster code.
2. Show that code, the student's name and classroom before saving the link.
3. The student confirms the displayed information. Before confirmation, allow editing the code and repeating the lookup.
4. After linking, offer a change-code action: enter the new code, preview the corresponding student information and confirm again.
5. Keep scores/history tied to student codes. Switching the Google link must discard old profile/score caches and display the newly selected student's data, without moving scores between students.

Do not introduce teacher approval or OTP as a condition for this student-link flow. Workspace pairing still requires the MathQuest administrator's approval. Student self-confirmation is the accepted account-link policy, not a claim that Google certifies ownership of a school roster code.

The inspected MathQuest `google-auth.js` already provides lookup → preview → claim/switch and a fresh-page reload after changing the link. Existing MathQuest SQL additionally limits changes to two in 24 hours, prevents changes during an active relevant class and prevents two Google accounts claiming one code. Those restrictions remain implementation details to reconcile in the MathQuest project; this ScanSob documentation update does not remove them or change its database.

## Acceptance before live scores

Use synthetic student IDs and two source Workspaces pointing to the same test school. Test unauthorized/other-school requests, revoked tokens, duplicate simultaneous events, lost ACK/retry, reverse batches, new revision before old, withdrawal before delayed publish, unmatched reconciliation and more than 1,000 scores. Then verify student authorization against actual receiver policies and endpoints. The source feature flags and deployed scheduler may be enabled only after this matrix passes and production changes are approved.
