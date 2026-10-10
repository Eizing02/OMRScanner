# Scanner migration and rollback

## Deployment

1. Install with `npm ci` (Scanic 1.6.0 pinned). Run typecheck/lint/unit/API/PGlite/browser/account/benchmark suites and build.
2. Deploy a preview with the existing Supabase configuration. No SQL migration is needed for this upgrade. Do not rerun the snapshot or SQL 001–009.
3. Leave `NEXT_PUBLIC_SCANNER_ENGINE` unset or set `scanic`. It is a browser build-time variable: changing it requires rebuild/redeploy.
4. Validate in an approved non-production workspace. Google approval, private Storage buckets and existing migrations must already be configured. No service-role key is needed for scan requests.
5. Test physical full-A4/half sheets, legacy geometry, rotation, still/video fallback, uploads/retries/duplicates and teacher confirmation before treating scores as usable.

## Detector-only rollback

Set `NEXT_PUBLIC_SCANNER_ENGINE=legacy`, then rebuild/redeploy. The facade loads only OpenCV+jscanify; Scanic is not initialized. Keep the existing `/omr-assets/opencv.js` and license available. Binary uploads and old JSON clients still work with the same server API and schema. No record/template/QR/score conversion is needed. This is the preferred response to a Scanic-specific physical detection regression.

Without rVFC, timers are used; without Worker/OffscreenCanvas, Scanic runs on the main thread; a Scanic engine error triggers lazy legacy fallback. A normal miss does not trigger engine swapping. If automatic detection remains unsuitable, manual shutter/upload/corner adjustment remain available.

## Full release rollback

Redeploy the pre-upgrade Git commit `05a05444a44d0636b6f8eaa9303345fd27f928df` through the normal deployment provider. Do not reset/delete the working directory or restore a database snapshot. The prior API accepts JSON, and all stored scans/paths/scores/QRs use the existing schema. Existing processing metadata on Storage objects can remain; old code does not need it.

Avoid serving a mixed old server/new browser during rollout: an old server does not understand new multipart clients. Deploy frontend/server atomically; refresh/reopen the browser after rollback. New server continues to accept old JSON clients, so forward deployment is backward-compatible.

## Safety and acceptance

- Never delete images/scores to roll back code. Never replay a confirmed result as a new scan or disable RLS/approval to troubleshoot.
- Geometry 2/3/4 and SAS2 token registry are unchanged. A rollback does not alter printed papers or mutate answer keys.
- Upload request IDs/content hashes and immutable paths remain unchanged; a timeout retry must reuse the exact prepared image.
- New JPEGs retain their original bytes when safe. Storage `scan_processing_version` values: `binary-v2-retained`, `binary-v2-normalized`, `legacy-v1`.
- Extraction remains on the main thread; do not claim full worker offloading. Keep legacy packages/assets until representative physical devices and golden marks pass.
- Future DB pagination/cleanup/processing-record changes require a separate additive migration, backup and rollback review; none were applied here.
