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

`revoke` returns exactly `{ "schema_version": "1.0", "request_id": "<same UUID>", "status": "revoked" }` only after invalidating the scope/token. A never-active source request can cancel locally after best-effort notification; its remote request/code must expire. A connection that ever became active needs remote revocation acknowledgment before ScanSob clears its secret.

Receiver work still required: expiring single-use pairing codes, explicit school-admin approval, idempotent request replay, protected status/revoke, and recovery when a token response is lost before source activation. Because MathQuest stores token hashes, lost delivery should issue a replacement token under the original authenticated approved request and invalidate the previous token, or use an agreed encrypted-delivery scheme. Never expose a stored plaintext token or silently share a global teacher secret. ScanSob clears its request secret after activation and supports revoke/re-pair; a dedicated rotate UI/handshake remains a TODO until both projects agree its contract.

## Acceptance before live scores

Use synthetic student IDs and two source Workspaces pointing to the same test school. Test unauthorized/other-school requests, revoked tokens, duplicate simultaneous events, lost ACK/retry, reverse batches, new revision before old, withdrawal before delayed publish, unmatched reconciliation and more than 1,000 scores. Then verify student authorization against actual receiver policies and endpoints. The source feature flags and deployed scheduler may be enabled only after this matrix passes and production changes are approved.
