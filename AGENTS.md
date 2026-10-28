# AGENTS.md

Permanent instructions for all future Codex tasks in this repository.

## Approved current implementation — 15 October 2026

These rules supersede the original blueprint where noted. One Next.js modular monolith, private Supabase Storage, Google approval/private workspaces, shared SAS2 exam/template QR, five-digit student OMR, and immutable geometry versions 2/3/4 are the current system. Scanic 1.6.0 is the default classical document detector; OpenCV/jscanify are lazy legacy fallback. Browser edge detection is not answer grading. The server reads the exact retained JPEG and the grading/review RPC remains authoritative. The optional MathQuest score-publication module uses a PostgreSQL outbox inside the same Supabase project; this is not an external broker or new service. It is disabled by default and cannot send real data until the independent receiver is verified. No production schema/data/env changes without approval. No Python, external queue or microservice. See docs/SCANNER_MAJOR_UPGRADE_IMPLEMENTATION.md, docs/MATHQUEST_SCORE_INTEGRATION.md and the migration/rollback documents.

## Approved roster extension — 28 October 2026

Approved print/scanning extension (28 October 2026): new school-v2 print jobs use immutable geometry 5; retain readers for 2/3/4 and four existing corner marks. Extra/coded markers are deferred. Continuous capture uses a bounded in-memory queue, serial idempotent uploads, paper-removal re-arming and failed-image recovery; no automatic score confirmation. Batch confirmation delegates to revision-guarded review_scan with per-result audit and workspace checks. Migrations 017/018 are prepared, not production installation approval. See docs/CONTINUOUS_SCAN_PRINT_V5.md.

Student management is now exact five-digit-code preview/upsert with stable UUIDs, revision/expiry/idempotency guards, manual forms, templates, complete exports and archive/restore. Never delete a student because a file omitted them. Migrations 013–016 preserve exam/scan identity before enabling edits. Keep historical print/review/export snapshots and confirmed scores immutable during roster changes.

The owner approved one narrow sharing exception: explicit school-directory grants to approved teachers of that school. Directory managers maintain central records; classroom subscriptions follow the current classroom cohort and central fields overwrite linked copies. Private/manual/detached records and local exclusions are protected. Owner workspace inspection remains read-only. No general teacher-to-teacher sharing. Synchronize on open/visibility return, at bounded visible intervals, and before exam/print creation. Use paged list summaries and selected detail reads; never derive complete counts/print/export sets from the loaded page. See docs/STUDENT_ROSTER_IMPLEMENTATION.md. Prepared migrations do not authorize installing them in production.

## Project Overview

This project is **Smart OMR & Exam Management System**, a Smart OMR MVP for Thai school teachers.

It is a Thai school web application for teachers to manage students, create exams, generate OMR answer sheets, scan answer sheets, read QR codes, detect filled bubbles, grade exams, manually review results, and export Excel/PDF reports.

Main workflow:

Import students
-> Create exam
-> Create answer key
-> Generate OMR sheets
-> Scan answer sheets
-> Read QR code
-> Detect bubbles
-> Grade automatically
-> Manual review/correction
-> Confirm result
-> Export Excel/PDF

## Tech Stack

Use:

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase PostgreSQL
- Supabase Auth
- Supabase Row Level Security
- Private Supabase Storage for school logos and rectified OMR evidence
- Scanic for browser document edges/perspective; OpenCV.js + jscanify as legacy fallback
- TypeScript template-coordinate optical reader on the server (adaptive candidate stays experimental)
- jsQR for QR reading
- qrcode for QR generation
- jsPDF for PDF generation
- xlsx for Excel export
- Zod
- Radix dialog primitives and reusable project UI; shadcn/ui, React Hook Form and TanStack Table are future candidates, not installed runtime dependencies

## Architecture Rules

- This is a modular monolith.
- Do not create microservices.
- Do not add Kubernetes.
- Do not add MongoDB.
- Do not add RabbitMQ.
- Do not add a separate mobile app.
- Keep one Next.js project.
- Keep one Supabase PostgreSQL database.
- Use private Supabase Storage (`school-logos`, `scan-images`), not Cloudinary.
- Store image paths/references, observations and audit metadata in PostgreSQL, never Base64. `image_url`/`image_public_id` retain their legacy names for compatibility.
- Keep one retained rectified image for new scans, preserving the local original until a successful save. Retire old originals only after verifying processed evidence exists. Exam deletion must use resumable, reference-safe cleanup.

## Folder Structure Rules

- Do not change the folder structure unless explicitly asked.
- Do not rename folders.
- Do not move files without permission.
- Do not merge unrelated modules.
- Do not rewrite unrelated files.
- Only edit files related to the current task.
- If a feature is not fully implemented yet, keep a TODO placeholder that compiles.

The following is the historical blueprint map, not an instruction to scaffold missing files. Keep the existing repository paths. Current scanner modules are in `lib/omr/`, Storage helpers in `lib/supabase/`, and teacher/workspace providers in `components/layout/`. Old Cloudinary compatibility names do not authorize restoring Cloudinary. Consult the current implementation document before adding modules.

Historical folder structure:

```text
smart-omr/
├── app/
│   ├── dashboard/page.tsx
│   ├── students/page.tsx
│   ├── students/import/page.tsx
│   ├── students/[id]/page.tsx
│   ├── exams/page.tsx
│   ├── exams/new/page.tsx
│   ├── exams/[id]/page.tsx
│   ├── exams/[id]/answer-key/page.tsx
│   ├── exams/[id]/omr-generate/page.tsx
│   ├── exams/[id]/scan/page.tsx
│   ├── exams/[id]/review/page.tsx
│   ├── exams/[id]/results/page.tsx
│   ├── export/page.tsx
│   ├── api/students/route.ts
│   ├── api/exams/route.ts
│   ├── api/answer-keys/route.ts
│   ├── api/omr-sheets/route.ts
│   ├── api/scan-records/route.ts
│   ├── api/grading/route.ts
│   ├── api/cloudinary/route.ts
│   ├── api/export/route.ts
│   ├── login/page.tsx
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── layout/app-sidebar.tsx
│   ├── layout/app-header.tsx
│   ├── layout/main-shell.tsx
│   ├── dashboard/dashboard-cards.tsx
│   ├── students/student-table.tsx
│   ├── students/student-form.tsx
│   ├── students/import-preview-table.tsx
│   ├── students/student-filters.tsx
│   ├── exams/exam-table.tsx
│   ├── exams/exam-form.tsx
│   ├── exams/answer-key-editor.tsx
│   ├── exams/exam-summary-card.tsx
│   ├── omr/omr-sheet-preview.tsx
│   ├── omr/omr-bubble-grid.tsx
│   ├── omr/omr-generate-panel.tsx
│   ├── scanner/scanner-camera.tsx
│   ├── scanner/image-upload-panel.tsx
│   ├── scanner/qr-result-card.tsx
│   ├── scanner/scan-status-card.tsx
│   ├── review/review-answer-table.tsx
│   ├── review/scanned-image-viewer.tsx
│   ├── review/manual-correction-dialog.tsx
│   ├── results/result-table.tsx
│   ├── results/result-summary.tsx
│   ├── results/student-result-detail.tsx
│   ├── export/export-panel.tsx
│   └── export/report-preview.tsx
├── lib/
│   ├── supabase/client.ts
│   ├── supabase/server.ts
│   ├── supabase/admin.ts
│   ├── cloudinary/upload.ts
│   ├── cloudinary/delete.ts
│   ├── omr/generate-template.ts
│   ├── omr/generate-sheet-code.ts
│   ├── omr/qr.ts
│   ├── omr/scan-qr.ts
│   ├── omr/compress-image.ts
│   ├── omr/detect-bubbles.ts
│   ├── omr/template-lock.ts
│   ├── omr/confidence.ts
│   ├── grading/grade-exam.ts
│   ├── grading/recalculate.ts
│   ├── grading/manual-correction.ts
│   ├── export/export-excel.ts
│   ├── export/export-pdf.ts
│   ├── export/report-template.ts
│   ├── import/parse-students.ts
│   ├── import/parse-sql-students.ts
│   ├── import/normalize-name.ts
│   ├── import/normalize-classroom.ts
│   └── audit/log-action.ts
├── types/
│   ├── student.ts
│   ├── classroom.ts
│   ├── exam.ts
│   ├── omr.ts
│   ├── scan.ts
│   ├── result.ts
│   └── export.ts
├── supabase/schema.sql
├── public/omr-assets/
├── .env.example
├── package.json
└── README.md
```

## Database Rules

The main tables are:

- `students`
- `classrooms`
- `exams`
- `answer_keys`
- `omr_templates`
- `omr_sheets`
- `scan_records`
- `detected_answers`
- `exam_results`
- `answer_evaluations`
- `audit_logs`
- `export_jobs`

Rules:

- `student_code` must always be a string, never a number.
- Preserve leading zeroes in `student_code`, such as `02074`.
- Do not store old imported passwords as plain text.
- Use UUID primary keys.
- Use timestamps.
- Add useful indexes.
- Enable RLS where appropriate.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client components.

## Student Import Rules

Support old SQL rows with columns:

```text
id, name, password, grade, role, photo_url, is_first_login, created_at, updated_at
```

Mapping:

- `id` -> `student_code`
- `name` -> `full_name`
- `grade` -> `classroom_name`
- `role` -> `role`
- `photo_url` -> `photo_url`
- `is_first_login` -> `is_first_login`

Ignore `password` or leave a TODO for secure auth migration. Do not store it as plain text.

Normalize Thai names.

Examples:

```text
นายณัฐภัทร พิมพ์สิม
-> prefix = นาย
-> first_name = ณัฐภัทร
-> last_name = พิมพ์สิม

เด็กชายกิตติกร เหล่าทองสิงห์
-> prefix = เด็กชาย
-> first_name = กิตติกร
-> last_name = เหล่าทองสิงห์
```

Supported prefixes:

- เด็กชาย
- เด็กหญิง
- นาย
- นางสาว
- น.ส.
- ด.ช.
- ด.ญ.

Normalize classrooms.

Examples:

```text
ม.1/2
-> grade_level = ม.1
-> room = 2
-> classroom_name = ม.1/2

ม.6
-> grade_level = ม.6
-> room = null
-> classroom_name = ม.6
```

## OMR Rules

OMR sheet generation:

- A4 landscape, two sheets left/right by default; a single full sheet when validation requires it
- Thai school format
- show school name
- show exam title
- show subject
- show `classroom_name`
- show `academic_year`
- show `term`
- show student `full_name`
- show `student_code`
- show QR code
- retain sheet instance/print-job identity separately in the print registry
- show answer bubbles
- support 1–60 questions with locked geometry and fit validation
- support 4 or 5 choices

QR payload is `SAS2:<64-character SHA-256>`, shared by copies of the same exam/key/layout version. Resolve it against the workspace's immutable template registry before reading IDs/answers. It contains no student PII. Read the student ID separately from five OMR columns; printed roster IDs may be prefilled. Do not change the QR protocol or historical geometry without an explicit version migration and compatibility tests.

Use template lock for bubble coordinates.

Start with one default OMR template before adding advanced templates.

## Scanner Rules

Scanner must support:

- upload image
- camera capture if possible
- image preview
- image compression before upload
- QR reading with jsQR
- duplicate scan detection
- authenticated binary upload to private Supabase Storage (legacy JSON clients remain supported)
- `scan_records` creation

Image processing policy:

- Live detection at adaptive 480/640/800px long edge, one task at a time; reusable canvases, worker when supported, manual fallback always available.
- Capture high-resolution still if supported, re-detect on the still; otherwise capture video. Never assume still and preview share FOV/crop.
- Existing rectified dimensions: 900×1273 (cut half) or 1800×1273 (whole A4). New JPEGs encode once at 0.85; do not lower quality to force a byte target.
- Validate on the server, retain safe bounded JPEG bytes unchanged; normalize only when needed and store the image-policy version in Storage object metadata. OMR reads those exact stored bytes.
- No unconditional double encoding; legacy JSON normalization is preserved for replay compatibility.
- Clear caches/resources on workspace/account change, hidden page and unmount. Do not relax physical quality gates based only on synthetic benchmarks.

Duplicate detection:

- check `exam_id` + `student_id`
- do not overwrite confirmed result automatically
- if duplicate, show warning and require explicit user choice

## Bubble Detection Rules

Use the existing server TypeScript template-coordinate reader. Scanic/OpenCV camera edges are not student-answer detection. New adaptive/local-background logic remains experimental until physical ground-truth regression passes.

Detection rules:

- convert to grayscale
- threshold image
- use template coordinates
- calculate fill percentage
- `fill_percentage >= 55` means marked
- `fill_percentage < 20` means blank
- more than one marked option means multiple
- close scores between top options means `low_confidence`

Detected answer status in current code can be:

- `valid`
- `blank`
- `multiple`
- `ambiguous` (low confidence)
- `unreadable`

## Grading Rules

Grading rules:

- correct answer = score from `answer_keys`
- wrong = 0
- blank = 0
- multiple = 0
- `ambiguous` can calculate provisional score but result must stay `pending_review`
- all new grading results should start as `pending_review`
- teacher must confirm result before final use

Create or update:

- `detected_answers`
- `answer_evaluations`
- `exam_results`

Grading must be idempotent.

## Manual Review Rules

Manual correction must:

- require `correction_reason`
- save `corrected_answer`
- set `manually_corrected = true`
- save `corrected_by`
- save `corrected_at`
- recalculate score
- update `exam_results`
- create `audit_logs` record

Confirmed result must:

- set `exam_results.status = confirmed`
- set `scan_records.scan_status = confirmed`
- set `omr_sheets.status = reviewed`
- save `confirmed_by`
- save `confirmed_at`

Reject scan must require reason and create audit log.

## Audit Log Rules

Always create audit logs for:

- `import_students`
- `create_exam`
- `update_answer_key`
- `generate_omr_sheet`
- `upload_scan`
- `duplicate_scan_detected`
- `auto_grade`
- `manual_correct_answer`
- `confirm_result`
- `reject_scan`
- `export_excel`
- `export_pdf`

Audit logs must include:

- `action`
- `module_name`
- `resource_type`
- `resource_id`
- `old_values`
- `new_values`
- `reason`
- `display_message`
- `severity`

Use Thai display messages where appropriate.

## Export Rules

Excel export must include:

- เลขที่
- รหัสนักเรียน
- ชื่อ-สกุล
- ชั้น/ห้อง
- จำนวนข้อ
- ถูก
- ผิด
- ไม่ตอบ
- ฝนหลายคำตอบ
- คะแนนเต็ม
- คะแนนที่ได้
- เปอร์เซ็นต์
- ผ่าน/ไม่ผ่าน
- สถานะ
- คำตอบข้อ 1
- คำตอบข้อ 2
- ...
- คะแนนข้อ 1
- คะแนนข้อ 2
- ...

PDF export must support:

- class result report
- individual student report

Use jsPDF and xlsx.

## UI Rules

Use Thai labels.

UI style:

- clean
- modern
- teacher-friendly
- readable tables
- clear buttons
- cards for summaries
- badges for statuses
- dialogs for confirmations
- toast notifications
- loading states
- empty states
- error states

Use shadcn/ui where possible.

## Security Rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code.
- Never store imported old passwords as plain text.
- Validate API input with Zod.
- API routes must return valid JSON.
- Do not silently overwrite confirmed scores.
- Manual score changes must create audit log.
- Supabase secrets must only be used server-side. Do not use exposed/old service-role credentials; normal scan routes use the authenticated user's session and RLS.

## Development Order

Follow this order unless explicitly told otherwise:

1. Project structure
2. Database schema and TypeScript types
3. Supabase Auth/RLS/private Storage setup
4. Student management and import
5. Exam and answer key
6. OMR generator
7. Scanner and upload
8. Bubble detection and grading
9. Review and manual correction
10. Export Excel/PDF
11. Final integration and cleanup

## Response Rules for Codex

For every task:

- Do not rewrite unrelated files.
- Do not change the project structure.
- Only implement files related to the current task.
- Keep compatibility with previous steps.
- Every file must compile.
- Every API route must return valid JSON.
- Return a summary of changed files after finishing.
- If something is not possible, explain clearly and add a TODO placeholder.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
