---
version: 1
slug: "components-students-import-preview-table-tsx"
primary_target: "components/students/import-preview-table.tsx"
related_targets: ["components/students/student-table.tsx"]
---

# Student roster management — 28 October 2026

Scope: existing student import/list. Mode: Operate. Preserve school-logo controls and the established visual system.

## Direction contract

THESIS: Teachers manage the same four roster columns, compare changes before committing, and distinguish private records from school-synchronized records without changing historical exams.

OWN-WORLD: Inherit Noto Sans Thai, ink-blue shell, cool canvas, white panels, labelled native selects, existing buttons and semantic notices. No identity replacement or new design tokens.

STORY: Add or edit a student, import XLSX/CSV with five-digit code matching and old/new comparison, or subscribe to authorized school classes. Central fields update automatically; removed or detached records do not silently reappear. Previously supported combined-name files still work.

FIRST VIEWPORT: Existing student heading with one primary add action and secondary import/directory/template tools; search and actual-class filters lead the four-column table with selection and row actions. Compact counts and pagination stay reachable. Forms and destructive confirmations use existing dialogs, wrapping controls on phone/iPad. Import preserves mappings and adds truthful add/update/unchanged/error statuses and expandable old/new differences.

FORM: Precisely specified local extension of the current pastel Operate world, inherited world seed e0df4ce4; no roll, comp or new raster. Signature interaction: server-authoritative comparison and selection make the exact effect visible before a bulk change; school synchronization never masquerades as an editable private record.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Release boundary

The owner approved the detailed student-management plan and four directory decisions on 28 October. This supersedes the earlier insert-only/duplicate-blocking boundary: existing codes may update after explicit preview, never by file absence or across workspaces. New local migrations are required; no production installation, student-data upload, env change or push is implied. Preserve optical grading, historical QR/geometry, private teacher workspaces and legacy import formats. School grants are a narrow approved sharing exception, not general teacher-to-teacher access. DESIGN.md and its sidecar remain unchanged.
