---
version: 1
slug: "components-students-import-preview-table-tsx"
primary_target: "components/students/import-preview-table.tsx"
related_targets: ["components/students/student-table.tsx"]
---

# Current-term roster format — 9 October 2026

Scope: existing student import/list. Mode: Operate. Preserve school-logo controls and the established visual system.

## Direction contract

THESIS: Teachers compare the same four columns as the supplied roster before committing; do not make them merge names or rename headers.

OWN-WORLD: Inherit Noto Sans Thai, ink-blue shell, cool canvas, white panels, labelled native selects, existing buttons and semantic notices. No identity replacement or new design tokens.

STORY: Upload XLSX/CSV with รหัสประจำตัว, ชื่อ, นามสกุล, ระดับชั้น. Preserve five-digit strings and prefixed first names; preview every row, resolve errors, then explicitly import. Previously supported combined-name files still work.

FIRST VIEWPORT: Existing upload panel, short four-column instruction and sample download. Four primary mappings follow file order; combined-name and optional-number mappings remain in details, automatically expanded when a combined-name file is detected. Preview adds row/status around the four source columns; student list uses those four columns. Keep search, grade/room filters, pagination and keyboard-accessible horizontal scrolling on mobile.

FORM: Precisely specified local extension, inherited direction seed 19bece82; no roll, comp or new raster. Signature interaction: all four source headers map automatically and the preview matches the teacher's source layout, without losing zeroes or prefixes.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Release boundary

Do not modify supplied Excel/CSV or upload real student data during this audit. Compare live metadata if available; distinguish it from local SQL evidence. No new SQL is needed for the roster header mapping. Preserve duplicate-code blocking and legacy three-column imports; do not add term history, merge rosters or overwrite existing students. Scanner/grading and authentication configuration are outside this narrow change.
