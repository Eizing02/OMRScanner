---
version: 1
slug: "components-omr-omr-generate-panel-tsx"
primary_target: "components/omr/omr-generate-panel.tsx"
related_targets: ["components/export/report-preview.tsx"]
---

# Answer-sheet layout extension — approved 8 October 2026

Scope: Designer, Print Preview, exam configuration and shared printable geometry. Mode: Operate. Preserve the incumbent Thai-first design system and project structure.

## Direction contract

THESIS: Show one detachable answer sheet while explaining the actual A4 paper cost. Preview zoom never changes printable scale.

OWN-WORLD: Inherit DESIGN.md: Noto Sans Thai, ink-blue navigation, cool canvas, white paper, semantic status colours and familiar labelled inputs.

STORY: A Thai teacher selects up to 60 questions and 4/5 choices, sees columns resolve immediately, saves a changed exam configuration as a new version, and downloads a two-up or full-sheet PDF.

FIRST VIEWPORT: Keep the existing tools/canvas/properties composition. Show one portrait half-sheet on the central canvas. Put question count, choices and automatic/full-A4 controls above it. Explain full-A4 fallback inline. Print Preview shows one logical sheet and a separate A4 count.

FORM: User-pinned local extension; no new direction roll or approved comp. Existing direction seed: 19bece82. Signature interaction: changes resolve physical columns and paper cost without shrinking bubbles.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Approved requirements

- A4 landscape, 297 × 210 mm; left/right two-up, each sheet 148.5 × 210 mm.
- One logical sheet in preview; full-A4 fallback when half-sheet geometry or text cannot fit.
- 1–60 questions, 4/5 choices, Thai letters inside fixed-size bubbles.
- Small aspect-preserving logo upper left; score box upper right; QR beneath it; student fields and five-digit ID retained.
- All copies of the same exam/key/layout version share one opaque set QR. Submission identity is separate.
- Preview, PDF and candidate OMR template derive from one resolved millimetre model. Printed manifests remain snapshots.
- Output remains experimental until real printer/phone/OMR calibration. QR generation does not imply working scanner resolution or automatic grading.

## Version and release boundary

Question/choice changes require explicit saving as a new exam version. Existing keys are retained where possible; new questions default to ก / 1 point and require teacher review. Published versions/keys remain immutable. No live migration is applied by this task.
