# Answer-sheet design evidence

Recorded 8 October 2026 after the shared text-width correction. This is an ordinary Operate-mode extension of the incumbent “เส้นทางตรวจข้อสอบ” world, direction 4 / seed `19bece82`. Authority: [approved layout contract](ANSWER_SHEET_LAYOUT.md), [PRODUCT.md](../PRODUCT.md), [DESIGN.md](../DESIGN.md) and [.impeccable/design.json](../.impeccable/design.json).

## Evidence checked

Source comparison covered `app/globals.css`, `components/omr/omr-generate-panel.tsx`, `components/omr/omr-sheet-preview.tsx`, `components/export/report-preview.tsx`, `lib/omr/generate-template.ts`, `lib/export/export-pdf.ts` and the supporting `lib/omr/qr.ts` identity implementation.

The implementation pass validated these fresh screenshots and actual PDF rasters; this documentation pass confirmed their availability and sampled Designer desktop, Print mobile and the wide-heading PDF raster for incumbent compatibility:

| Coverage | Evidence in `.impeccable/review/` |
| --- | --- |
| Default Designer, desktop / mobile | `designer-desktop.png`, `designer-mobile.png` |
| Default Print, desktop / mobile | `print-desktop.png`, `print-mobile.png` |
| 60 questions, desktop / mobile | `answer-sheet-60-desktop.png`, `answer-sheet-60-mobile.png` |
| Wide-heading fallback | `answer-sheet-wide-heading-desktop.png` |
| Actual PDF output | `answer-sheet-two-up-pdf.png`, `answer-sheet-60-pdf.png`, `answer-sheet-wide-heading-pdf.png` |

Reported final validation: 26 unit/database/PDF tests, six browser E2E tests, typecheck, lint and production build passed. Tests were not rerun for this documentation-only pass. The same reviewer's final disposition is **ship** for the resolved text-fit fix in this experimental extension, as recorded in [ANSWER_SHEET_FINISH_REVIEW.md](ANSWER_SHEET_FINISH_REVIEW.md); it does not certify production readiness. The detector ran once with zero primary findings; earlier token/style advisories remain advisory.

## Incumbent compatibility

The build retains the recorded cool canvas, white surfaces, ink-blue navigation and blue action colour. Amber warnings describe fallback, unsaved structure and experimental printing; colour remains paired with Thai text and icons. The existing labelled fields, buttons, badges, notices and version-confirmation dialog retain their familiar form.

Noto Sans Thai remains the screen family. The established headline/title/body/label/status hierarchy and its responsive rules are preserved. Feature controls use existing field and notice patterns; physical paper type is a separate millimetre specification, not a new screen typography scale.

The tools–canvas–properties desktop composition, mobile preview emphasis, flat bordered panels and paper-only shadow remain compatible with DESIGN.md. The Meaning Before Color, Thai Reading and Flat Seam rules still apply. No new world, global tokens, comp, quality-bar card or shipping raster artwork was introduced. `DESIGN.md` and `.impeccable/design.json` are preserved unchanged.

## Feature-local print behaviour

- A4 is landscape, 297 × 210 mm. Two-up sheets split left/right at 148.5 mm; each detachable sheet is 148.5 × 210 mm. Designer and Print show one logical sheet, while PDF imposition and A4 counts are calculated separately. Preview zoom changes display width only.
- The shared resolved millimetre model drives SVG, PDF and candidate template coordinates. It accepts 1–60 questions and four/five Thai choices inside fixed 3.6 mm bubbles. Columns resolve immediately. Auto mode expands to one full-A4 sheet when answer geometry or text cannot fit; explicit full-A4 mode is also available. Full-page overflow blocks export.
- The logo is aspect-preserving inside a 12 × 12 mm upper-left area. The upper-right score box is 29 × 11 mm, with a separate 23 mm QR region below it. Five-digit student fields remain separate from set identity.
- Both renderers use the same text lines. Wrapping uses a conservative 1-em glyph-advance bound, zero advance for combining marks and a space allowance above the bundled font's measured advance. PDF tests verify those font bounds. Wide school/exam headings trigger full-A4 fallback before entering score or QR space.
- The PDF embeds the bundled Noto Sans Thai font, prints at 100%, and places the cut guide at the physical split. An odd two-up count leaves the final half blank. The print guidance says one PDF page per A4 and disables export until the teacher acknowledges experimental output.
- All copies of one exam/key/layout version share an opaque hash-derived QR. Each manifest carries the layout/template snapshot, version identity, page/slot assignments and separate instance IDs. Question/choice changes require explicit saving as a new exam version and reviewing resized keys; previous versions remain preserved.

## Limits and existing drift

QR generation and candidate geometry do not establish working scanner resolution, student-ID reading, bubble detection or automatic grading. Immutable manifest registration and real printer/phone/OMR calibration remain unfinished; no live migration was applied. The handwritten score box is not recognized or used to alter digital scores. Output remains experimental.

PRODUCT.md still labels the overall product as blueprint-only and its stack as planned, despite the present implementation. That existing status drift is reported and left untouched. Existing 8–10 px screen detail text and literal style values remain incumbent advisories; they are not promoted into new design-system rules or repaired by this local documentation pass.
