# Test results — 8 October 2026

ผลต่อไปนี้รันจริงใน Windows workspace `D:/Omr scanner` สำหรับ adaptive answer-sheet extension ไม่ใช่ผล Supabase staging หรือ physical OMR benchmark

## Current command results

| Command | Result | Scope |
|---|---|---|
| npm run typecheck | PASS | TypeScript application/config/tests |
| npm run lint | PASS | ไม่ lint generated upstream public OpenCV |
| npm test | PASS: 26 tests / 4 files | domain 11, adaptive layout 6, actual PDF 4, PostgreSQL 5 |
| npm run test:e2e | PASS: 6 tests, 43.1 s | Chromium; synthetic data/camera fixtures |
| npm run build | PASS | Next.js 16.4 production routes + proxy compile |

Vite เตือนเรื่อง CommonJS/ESM config loader ในรุ่นอนาคต; ปัจจุบัน tests ผ่าน. NO_COLOR/FORCE_COLOR warning ไม่กระทบ tests

## What passed

### Domain / adaptive layout / import

- grading safeguards: ไม่ auto-confirm; incomplete/duplicate/out-of-range readings ต้อง review; รักษา student_code `02074` เป็น string; ไม่เก็บ legacy password
- วนทุกจำนวนข้อ 1–60 × 4/5 ตัวเลือก รวม 120 configurations: bubble radius คงที่ 1.8 mm, ไม่มีพิกัดซ้ำ/ล้ำพื้นที่, compiled OMR origins ตรง mm centers
- half-A4 fit boundary, full-A4 override, text-driven automatic fallback, down-then-right numbering และไม่มี phantom questions
- QR เดียวกันสำหรับ exam/key/layout version เดียว; เปลี่ยนเมื่อ exam, version, key หรือ geometry เปลี่ยน; payload ไม่มี student identity
- เฉลย 60 ข้อ/5 ตัวเลือก รวม E ให้คะแนนถูก; ไม่รับ key length/choice mismatch

### PostgreSQL RLS / RPC

รัน original migration 001 **ตามด้วย** adaptive migration 002 ใน PGlite (PostgreSQL WASM), ใช้ auth.users/auth.uid stubs และ authenticated/anon roles ไม่ได้ apply SQL บน Supabase จริง

- school isolation, forged ownership rejection, atomic import rollback/zero preservation, authorized exam access และ audit เดิม
- create_exam_draft รองรับ 60 ข้อ/5 ตัวเลือก; ปฏิเสธ missing/null/fractional/invalid choices และ mismatched key
- create_exam_version สร้างรุ่นใหม่; เก็บ published version/answer keys เดิมครบ; stale expectedVersion ถูกปฏิเสธ
- cross-school และ same-school non-owner colleague ไม่สามารถเปลี่ยนรุ่น; direct answer-key write/published mutation guards ยังทำงาน
- audit ของ new-version transaction มี old/new version metadata

**ยังไม่ทดสอบ:** Supabase network/Auth JWT/cookie expiry, live installed schema, storage/queue, concurrent production requests, revoked membership/backup และ helper privilege pentest. PGlite ไม่ใช่ Supabase E2E

### Browser E2E

1. 6 main screens × desktop 1440×1000 / mobile 390×844: fonts/render, ไม่มี document-wide horizontal overflow, axe WCAG 2 A/AA + 2.1 AA tags ไม่มี violations ใน states ที่ตรวจ
2. demo exam wizard → designer; reason-required synthetic review/correction → demo confirmation; actual PDF download
3. OpenCV edge adapter บน digital quadrilateral fixture; perspective warp; keyboard/mouse/CDP-touch manual corners; accessible targets
4. getUserMedia ด้วย Chromium fake device → capture original → media tracks stop
5. live one-sheet preview 20/4 → 60/5 full A4; draft-key mismatch บล็อก PDF; explicit new-version saves; แก้เฉลยข้อ 60 เป็น จ; QR เปลี่ยน; desktop/mobile screenshots; 3-copy PDF; review รุ่นเดิมยังใช้คะแนนเต็ม 20
6. wide-heading case: school 31 W / title 60 W → full-A4 fallback; ตรวจ SVG rendered text bounds ไม่ล้ำ score/QR; ดาวน์โหลด PDF จริง

Playwright เปิด **server ทดสอบแยก** โดยกำหนด public Supabase configuration ว่างและเปิด demo ผ่าน process environment ไม่แก้ `.env.local`, ไม่ใช้ Supabase จริงในการทดสอบ และไม่ reuse server ที่ผู้ใช้เปิดไว้

ไม่ใช่ screen-reader audit ทุก flow/WCAG certification; mobile viewport ไม่ใช่โทรศัพท์จริง. ไม่มี OMR answer recognition ใน fixture. Denied camera/network/upload/rotation/autocapture/device memory scenarios ยังไม่ครอบคลุม

### Actual PDF and font verification

- 3 half-sheets → 2 A4 landscape pages; ทุก copy ใช้ set token เดียว แต่ instanceId ต่างกัน; odd last slot เว้นว่าง
- 60/5 → 3 copies / 3 full-A4 pages, 300 answer centers, no extra copy
- embedded font cmap มีตัวเลข/Latin punctuation/Thai samples; count/layout ที่ไม่ปลอดภัยถูกปฏิเสธ
- wide-Latin regression ใช้ **metrics ของฟอนต์ที่ embed จริง**: max glyph advance ≤ 1 em, combining marks ที่ฟอนต์รองรับเป็น zero advance, space ≤ 0.32 em; wrapped headings วัดด้วย jsPDF แล้วอยู่ในเขตปลอดภัย
- ดาวน์โหลด PDF ผ่าน UI และ render ด้วย Poppler เพื่อตรวจภาพ: two-up default, full 60/5 และ wide headings
- SVG/PDF ใช้ wrapped lines และ geometry เดียวกัน; logo ใช้ aspect-preserving fit; score box และ QR อยู่ในเขตแยก

PNG inspection ไม่ใช่ automatic raster-center delta assertion, QR decode หรือ physical printer evidence. Unsupported glyphs/Thai shaping ทุก string/font-size ยังไม่ได้รับรอง

## Visual evidence / review boundary

- `.impeccable/review/{dashboard,exams,designer,print,scanner,review}-{desktop,mobile}.png`
- `answer-sheet-60-{desktop,mobile}.png`, `answer-sheet-wide-heading-desktop.png`
- `answer-sheet-two-up-pdf.png`, `answer-sheet-60-pdf.png`, `answer-sheet-wide-heading-pdf.png` เป็น actual PDF raster evidence ไม่ใช่ UI mockups
- Impeccable detector รันหนึ่งครั้ง: 0 primary findings; มี advisory เรื่อง token/style drift เดิม ไม่แก้ global visual system นอกขอบเขต และไม่ถือว่าทุก heuristic/interaction ผ่าน
- fresh independent finish reviewer พบ text-fit defect ของ wide Latin headings; แก้ด้วย verified font upper bound; หลัง recapture ผู้ตรวจให้ `ship` และคะแนน `resolved` เฉพาะประเด็นนี้ รายละเอียดใน `ANSWER_SHEET_FINISH_REVIEW.md`
- screenshots ไม่ใช่ shipping raster assets; ไม่สร้าง artwork/logo ใหม่แทนตราที่ครูต้องอัปโหลด

## Earlier foundation evidence retained

รอบ foundation ก่อนหน้านี้เคยทดสอบ production without credentials: APIs คืน valid JSON 503/NOT_CONFIGURED และไม่ fallback demo; npm production-only audit 0 findings, full audit มี 5 high package entries จาก development ESLint chain เดียว. **ไม่ได้ rerun audit ใน adaptive-sheet task** และไม่อ้างผลเก่าว่าเป็น security guarantee

Known prior dependency advisory: `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3`, GHSA-vfj7-8cjw-p6xm. ไม่ force major downgrade ข้าม Next 16 compatibility; ยังต้องติดตาม upstream/compatible override

## Reproducibility / no physical accuracy claim

CI definition เดิมยังไม่ได้รันบน GitHub; ไม่มี commit/PR/deployment ใน task นี้. Production build ใช้ local public project configuration ที่มีอยู่; browser tests ไม่ได้ใช้ cloud credentials. ไม่ใช้ service-role key ไม่แก้ env ไม่ migrate live database

ยังไม่มีใบสอบพิมพ์จริง, Android/iPhone hardware benchmark, 1,000-sheet pilot, server QR resolver, real ID/bubble recognition หรือ persisted grading result. การผ่าน compile/unit/database/browser tests **ไม่ใช่หลักฐานว่าอ่านคำตอบแม่นยำหรือพร้อมใช้คะแนนนักเรียนจริง**
