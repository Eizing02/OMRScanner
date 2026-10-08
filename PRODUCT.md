# Product: Smart Answer Sheet

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Planned, not yet implemented:
- Frontend: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui.
- Visual answer-sheet editor: React Konva (subject to prototype evaluation).
- Backend and image-processing API: Python, FastAPI, OpenCV, and a pinned MIT-licensed revision of Udayraj123/OMRChecker, adapted behind an internal OMR adapter.
- Browser document detection: jscanify as the initial candidate; evaluate Scanic against it on representative devices before production selection.
- Cloud: Supabase Auth, PostgreSQL, Storage, Queues, and Realtime; container-hosted Python workers for heavy OMR processing (for example, Cloud Run).
- Exports: print-accurate PDF, XLSX, and CSV.
- All application workflows are online and browser-based; teachers are not required to install desktop software. Resilient uploads are desirable, but fully offline grading is out of scope.

## Users

### Primary: Thai secondary-school teachers

Teachers of Mathayom 1–6 and other subjects who regularly prepare paper-based multiple-choice quizzes, unit tests, midterms, and final exams. They use a laptop or desktop to prepare exam sheets, an ordinary A4 printer to print them, and a phone or scanner to grade student papers. They need trustworthy scores without operating technical OMR software or manually copying marks into spreadsheets.

### Secondary: School administrators and authorized academic staff

Administrators manage school membership, subject/class organization, permissions, and aggregated academic reporting. Authorized reviewers may assist teachers in checking ambiguous scans. Access must be scoped to the appropriate school and role.

### Indirect: Students

Students normally do **not** need accounts. They write their name, surname, class, number and subject when required; fill a five-digit student-ID bubble grid; and mark answers on printed sheets.

## Product Purpose

Smart Answer Sheet is a Thai-first, cloud-based platform to **design, print, scan, verify, grade, archive and analyze paper answer sheets** in one workflow.

The essential promise: **Teachers can customize a paper answer sheet without compromising the ability to scan it accurately.** The sheet design, printable PDF, machine-readable regions, QR identity and grading configuration must remain linked and versioned.

A successful teacher can:
1. Import or select a class roster and create a subject/exam.
2. Define answer keys and marks per question.
3. Choose or customize a print-safe answer-sheet template and preview the actual A4 output.
4. Print and distribute papers sharing an exam/key/layout-version QR token, with a separate five-digit student-ID bubble field.
5. Use a phone camera or upload images/PDFs to scan sheets online.
6. See detected paper boundaries, capture/crop the sheet, review uncertain reads, verify the student match and publish scores.
7. Export scorebooks and reports to Excel, CSV or PDF, and revisit previous exams later.

Accuracy, auditability and confidence matter more than ornamental UI or speed claims.

## Positioning

Unlike a fixed-form OMR scanner, this product combines a **teacher-controlled answer-sheet designer** with an **automatically generated OMR recognition template**. Its key distinction is a shared, versioned layout model connecting:

- The designer's on-screen preview.
- The physical print/PDF dimensions and safe margins.
- Every sheet's QR code and location markers.
- The exact bubble coordinates used by the OMR engine.
- The answer key, scoring rules, student roster and final grading record.

Document detection in the browser and optical-mark recognition on the server are two distinct stages. Neither QR recognition nor paper-edge detection alone determines the marked answers.

## Operating Context

- Primary locale: Thai (`th-TH`); labels, forms, validation and printable school information must support Thai text correctly. Plan for Thai Buddhist Era academic years as entered by schools. Use familiar Thai terms such as `ชื่อ`, `สกุล`, `ชั้น`, `เลขที่`, `วิชา`, `เก็บคะแนน`, `กลางภาค`, and `ปลายภาค`.
- Common users work in a school environment with standard black-and-white A4 printers, varying printer margins, variable room lighting, different phone cameras and sometimes unstable internet.
- The default page is **A4 landscape, 297 × 210 mm**, with **two answer sheets per A4 page**. Presets for one, three or four per page may be offered only when the print-and-scan validator confirms sufficient space. Each detachable sheet must remain independently scannable.
- Approved 8 October 2026: the two-up layout splits left/right. Live previews show one logical answer sheet. Support 1–60 questions and four/five choices, with Thai choice letters inside the bubbles. Resolve column geometry immediately and switch to one full-A4 sheet when half-A4 cannot fit; do not shrink bubbles to force a fit. The PDF performs imposition itself; print one PDF page per A4 at 100%.
- Printed sheets can include a school logo, school name, exam type, unit/topic, instructions, time, total score, teacher-defined text, and fields for student first name, surname, class, number, and subject.
- Every answer sheet includes a **five-digit numeric student-ID OMR area** (five columns, digits 0–9) and a QR token for exam/sheet/template identity. Preserve leading zeros: `04217` is a valid ID and must remain a string.
- Teachers bring their own student datasets as Excel/CSV. Student-code matches are checked against the roster belonging to the exam/school, never blindly matched globally.
- The scanning camera interface must be optimized for portrait-oriented mobile devices even though the printed A4 sheet is landscape.
- The first release uses a verified fixed geometry for reliable scanning; progressively expose more drag-and-drop freedom only as validation coverage expands.

## Capabilities and Constraints

### Core navigation and product surfaces

1. **Dashboard** — recent exams, classes, scan-job status, papers needing review, and quick actions.
2. **Subjects & Classes** — subjects, school year/term, classrooms, class rosters and permitted teacher access.
3. **Students & Import** — XLSX/CSV upload, column mapping, row validation, duplicates and import history.
4. **Exam Library** — search, duplicate, organize and archive exams by subject, class, term, unit and exam type.
5. **Exam Editor** — quiz/unit/midterm/final/custom exam categories, sets A/B, item count, four or five choices, answer key, points and version history.
6. **Answer Sheet Designer** — A4 landscape canvas, templates, live print preview, logo upload, editable text/fields, QR/markers, bubble zones, cut guides and undo/redo.
7. **Print Center** — select roster, generate one shared QR for the exam/key/layout version, preview one answer sheet and actual A4 paper counts, generate PDF at 100% scale and inspect print warnings.
8. **Scan Center** — camera live view, shaded outside-of-paper overlay, detected corner polygon, alignment status, automatic/manual capture, crop correction and batch image/PDF upload.
9. **Review Queue** — original and processed images side-by-side, per-question marks, student-ID match, uncertain or multiple marks, corrections and reviewer confirmation.
10. **Results & Reports** — scores, answer-by-question view, summary statistics, optional item analysis, download XLSX/CSV/PDF.
11. **Settings & Access** — school logo/profile, users/roles, printing presets, data-retention rules and privacy notices.

### Answer-sheet designer requirements

- The editing canvas uses real-world units (millimeters), not arbitrary browser pixel positions; preview and print export derive from the same layout model.
- Support **Auto Layout** for nontechnical teachers and a constrained **Custom Layout** mode for advanced users.
- Provide configurable school logo with aspect-ratio preservation, automatic sensible size, and prevent overlap with required scan-safe regions.
- Approved 8 October 2026: small school logo upper left, handwritten score box upper right, exam-set QR below it in a separate reserved area. The score box is not automatically recognized or used to overwrite the digital score.
- Provide fields for `ชื่อ`, `สกุล`, `ชั้น`, `เลขที่`, `วิชา`, exam title/type, unit/topic, date/time, total marks and custom notes/instructions.
- Support multiple answer columns within a sheet, choice labels ก/ข/ค/ง or ก/ข/ค/ง/จ, and a five-digit student-code grid.
- QR codes, alignment markers and required scan margins may be repositioned only within validated constraints; show non-dismissible blocking errors for scan-invalid geometry.
- Use a **Print & Scan Validator** to check bubble size, padding, QR quiet zone, marker visibility, region collision, content overflow, cut margins and the intended printer scale.
- Generate both a printable PDF and immutable corresponding OMR/template JSON from one layout version. An already printed version remains scannable after future edits.
- Support a calibration/test sheet to validate a printer and scanning configuration before printing a whole class set.

### Live scanning requirements

- In-browser paper detection from the camera feed: **show an outline on the four document corners and darken the area outside the detected paper**.
- Clearly distinguish searching (neutral), detected but not ready (amber), and ready to capture (green), supported by text/icons rather than color alone.
- Offer device-friendly prompts: move closer, improve lighting, hold steady, include all corners, turn off glare.
- Auto-capture only after the document is stable and meets empirically validated quality checks; manual shutter and manual four-corner adjustment remain available.
- Deskew and correct perspective before using layout coordinates. Store the original image as well as the rectified result when appropriate.
- Support scanning the **full A4 page containing several sheets** or individual cut sheets; identify and process each independent sheet.
- Read the QR code to resolve the sheet/exam/template version; read the five student-ID digits separately with OMRChecker; then read answer bubbles using the appropriate template.
- Never silently guess a missing QR, unclear ID, ambiguous bubble, or duplicate submission. Route uncertain results to teacher review.
- Upload and queue processing online, display job progress and clear retry/failure states, and prevent duplicated scores on job retry.
- Use OMRChecker for mark detection behind a stable service boundary; camera capture/cropping and server-side OMR are separate modules.

### Scoring and records

- Match student IDs only within the authorized school/exam roster. Preserve `student_code` as a five-character string; use a separate UUID for the database primary key.
- Approved 8 October 2026: a QR token identifies an **exam/answer-key/layout version** and is identical on all copies of that version; it contains no unprotected student identity. Resolve the QR first, read the five-digit student ID separately, then read answers. Keep submission/sheet-instance identity separate; detect duplicates by exam and student, not shared QR alone. Changing physical geometry, choices, counts or keys requires a new version/identity without mutating previously printed snapshots.
- Distinguish unmarked, multi-marked, unreadable and valid choices; use explicit scoring rules and configurable marks per question.
- Keep raw observations, confidence/ambiguity flags, reviewed answers, original image, processed image and audit history.
- Use score workflow states: `scanned`, `needs_review`, `verified`, `published`, `voided`. Corrections are attributed to an authorized person and never overwrite raw reads.
- Lock/preserve published template and answer-key versions. Corrections create new versions and auditable recalculations.
- Prevent cross-school data exposure through Supabase Auth, role-based permissions, RLS and private Storage policies; use short-lived access to private files and never expose service credentials in client code.
- Provide reasonable retention/deletion policies, backups for both database and storage files, privacy notices and administrative audit logs for student-related information.

### UX and visual direction for Impeccable

- **Design register: Product UI**, not a landing page or marketing campaign.
- Personality: calm, precise, helpful, credible, modern Thai educational tool. The interface must communicate that exam results are serious and traceable.
- Preferred design direction: modern minimalist workspace, polished but understated, ample whitespace, strong content hierarchy, clear tables, consistent form controls, subtle borders and purposeful icons.
- Prefer light theme as the initial default; keep colors restrained and semantic. Use high-contrast text and distinct success, warning and error states. The exact palette, typography and token values belong in `DESIGN.md`, not this product context.
- Desktop-first for complex creation and editing; **mobile-first for scanning and result confirmation**. Fully responsive, without trying to squeeze the desktop designer onto narrow phone screens.
- Thai-first content; avoid decorative English labels when a natural Thai label exists. Do not force teachers to see words like `fieldBlocks`, `JSON`, `processor` or `threshold`.
- Use action-oriented labels: `สร้างชุดสอบ`, `ออกแบบกระดาษคำตอบ`, `ดูตัวอย่างก่อนพิมพ์`, `เริ่มสแกน`, `ตรวจสอบผล`, `ส่งออกคะแนน`.
- Use progressive disclosure: keep expert calibration controls in an advanced panel, not on the main workflow.
- Provide empty, loading, success, recoverable error and permission-denied states for every core surface. Never show a completed/published state before its server confirmation.
- Accessible by keyboard and touch; target WCAG 2.2 AA. Pair color with text/icons; use visible focus rings, legible Thai type, readable data density and large camera controls.
- Tables must remain practical: search, sort, filter, pagination, row-level actions, descriptive status labels and selective export.
- Avoid distracting gradients, excessive glassmorphism, gamification, decorative dashboard widgets, tiny text and animation that delays teachers.

### Essential flows and error cases

**Teacher happy path:** Sign in → Select subject/class → Import/select roster → Create exam and answer key → Choose sheet template → Preview and validate → Print → Scan → Review exceptions → Confirm grades → Export.

**Guardrails:** no paper detected; page partly out of frame; too dark or blurry; cut sheet missing markers; unreadable QR; unknown/multi-marked student-ID digit; duplicate ID; duplicate sheet; mismatched exam version; accidental scale-to-fit printing; overlapping elements; submission already published; interrupted upload; expired session; permission denied; Supabase or scan worker unavailable.

Offer recovery actions that preserve progress. Examples: retake image, adjust corners, inspect crop, correct a digit with an audit entry, resume upload, or contact a school administrator.

### Delivery stages

- **MVP (first validated vertical slice):** teacher login, subjects/classes, roster XLSX/CSV import, exam/answer key, locked A4-landscape two-up template, QR and five-digit ID, print PDF, live camera overlay and manual/auto crop, Python OMR scan, review, Supabase persistence and XLSX/CSV export.
- **Next:** full constrained drag-and-drop, one/three/four-up presets validated on physical printers, reusable template library, batch processing improvements, item analysis, richer reporting and PDF exports.
- **Later:** multi-school administration at scale, integrations with school information systems, collaborative workflows and extensive performance optimization.

### Non-goals for the initial release

- AI-generated test questions, essay grading, handwriting recognition for student names or free-text answers.
- Student-facing accounts, public score lookup or social/sharing features.
- Arbitrary placement of bubbles or QR markers that bypasses scan validation.
- Claims of guaranteed 100% accuracy or unsupported grading speed.
- Relying on QR alone to read student responses or on OMR alone to identify the exam version.

### Quality and acceptance principles

- The actual print, camera, crop, template and scoring pipeline must be tested end-to-end using real printers and phones—not only mocked previews.
- Record bubble-level accuracy, full-sheet accuracy, student match precision, unknown/ambiguous review rate, QR detection rate, throughput, failure/retry frequency and cross-school access tests.
- A proposed goal is **at least 99.5% item-reading accuracy on images meeting defined quality criteria**, but this is a validation target, not an achieved claim. Avoid silent erroneous student matches and incorrect published grades.
- Keep a golden image dataset and run regression tests when updating OMRChecker, crop libraries or template geometry.
- Use deterministic, idempotent scoring and preserve records needed to investigate disputed grades.

### Open decisions to validate

- Final product name, logo and brand colors; formalize in `DESIGN.md` after the visual direction is approved.
- Final browser document-edge detector (jscanify vs Scanic) following device/accuracy performance comparisons.
- Minimum physical bubble diameter, QR size, print margins and valid maximum question counts for each split preset.
- Exact school roster format, import mapping and retention policy once sample data and school policy are available.
- Cloud hosting region, hosting provider, operating cost assumptions and expected peak scanning volumes.

**Current status:** product blueprint/specification only. The proposed implementation, Supabase integration, device performance and OMR accuracy have not yet been verified in a deployed application.
