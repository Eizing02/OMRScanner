# Test results — 9 October 2026

## ล่าสุด: scanner / review / reports / compact responsive

| Command/check                                  | Result                                                              | Boundary                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| npm test -- --maxWorkers=2                     | PASS: 104 tests / 17 files; 1 optional raster test skipped; 32.07 s | Domain/API mocks และ PGlite PostgreSQL                                                                   |
| PRINT_QA_ARTIFACTS=true + optical-reader suite | PASS: 6 tests, 2.30 s                                               | อ่าน rasterized PDF 20 ข้อจริง รวม QR และ ID สองคน; synthetic full 60 ข้อ/5 ตัวเลือก ไม่ใช่ภาพถ่ายกระดาษ |
| npm run typecheck                              | PASS                                                                | Application/config/tests                                                                                 |
| npm run lint                                   | PASS: 0 errors / 0 warnings                                         | Full project                                                                                             |
| npm run build                                  | PASS: Next.js 16.4 / 27 generated pages / new scan and export APIs  | Production compile ไม่ใช่ Netlify deploy                                                                 |
| npm audit --omit=dev                           | PASS: 0 known vulnerabilities                                       | Runtime packages only; full audit เดิมยังมี development-only braces chain                                |
| git diff --check                               | PASS                                                                | มี LF→CRLF warning เท่านั้น                                                                              |

รอบแรก export API fixture ขาด fields ที่ examSchema บังคับ แก้ fixture ให้เป็น config รุ่นจริงครบถ้วนแล้วผ่าน รอบที่รันพร้อม production build มี logo-route mock timeout 5 วินาที; rerun full suite โดยไม่ชน build ผ่าน โดยไม่ได้เพิ่ม timeout หรือข้าม assertions

### Live Supabase — ติดตั้งตามการยืนยันของผู้ใช้

SQL 005 มีอยู่ก่อนแล้ว ติดตั้ง 006 และ 007 สำเร็จบน `bbtgulutbvxeafktntxg` ผ่าน SQL Editor ตรวจ query แบบ read-only หลังติดตั้งพบ:

- markers: `202610090005, 202610090006, 202610090007`
- RLS enabled tables: 6
- private scan bucket: true
- anon blocked from scan_records SELECT: true
- authenticated direct exam_results UPDATE blocked: true
- authenticated review_scan RPC available: true

ไม่ได้เพิ่ม/ลบรายชื่อ ข้อสอบ หรือคะแนนทดสอบบนฐานข้อมูลจริง ไม่ใช้ service-role key และยังไม่ใช่ live Google/Storage request end-to-end test

### Browser / PDF confirmation

- ยืนยัน viewport จริงผ่าน DOM: mobile 375×812 (Designer, Review dialog, results และ scanner), iPad portrait 768×1024 (Review/Print Preview) และ landscape 1024×768 (Review); desktop print/review ตรวจในรอบ confirmation ก่อนหน้า
- Designer paper SVG อยู่ภายใน canvas, footer/action buttons อยู่เหนือ mobile navigation ไม่มี document-wide horizontal/vertical overflow ใน states ที่วัด; รายละเอียดภายใน panel เลื่อนได้ตามจำเป็น
- Mobile Review: เหตุผลว่างบันทึกไม่ได้ → กรอกเหตุผลข้อมูลสังเคราะห์ → คะแนน 19/20 เป็น 20/20 → audit count 1 → ยืนยันผ่าน dialog → รายการอยู่ใน confirmed report
- ดาวน์โหลด PDF รายบุคคลจาก browser จริง เปิดด้วย Poppler พบ A4 1 หน้า และ raster ตรวจข้อความไทย/คะแนน/คำตอบ 20 ข้อ ไม่พบ clipping ในไฟล์ที่ตรวจ
- ภาพไม่มี QR: แสดงคำเตือน อ่าน QR อีกครั้ง/เลือกใหม่ อยู่ในจอ ไม่เปิดให้ตรวจคะแนน; manual corner มีขนาด 48×48 และ ArrowRight เปลี่ยน data-x +0.005
- PDF กระดาษคำตอบ 20/60 ข้อสร้าง/rasterize/ตรวจภาพแล้ว; การแก้ EXIF โลโก้ JPEG เป็น logic ที่เพิ่มและ build ผ่าน แต่ยังไม่มี native Safari/physical print orientation benchmark
- ปรับ selectors/fixtures ของ browser regression tests ให้ตรง UI ใหม่แล้ว **ยังไม่ได้รัน Playwright regression suite เต็มรอบนี้** ผล suite เดิมด้านล่างเป็นประวัติ ไม่ใช่การรับรองรอบล่าสุด

ยังไม่ได้ push/deploy โค้ดรอบนี้ ต้องทดสอบ Google → พิมพ์ → ถ่ายกระดาษจริง → private upload → review → confirm → export บนเว็บหลัง deploy ก่อนใช้คะแนนจริง ดู [SCANNING_PRINT_IMPLEMENTATION.md](SCANNING_PRINT_IMPLEMENTATION.md)

## ประวัติ: account / private logo / personalized print

| Command               | Result                                                                 | Boundary                                                         |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| npm test              | PASS: 81 tests / 14 files; final rerun 11.63 s                         | domain/API/Storage mocks และ PGlite PostgreSQL                   |
| npm run test:e2e      | PASS: 15 tests, 1.4 min                                                | Chromium demo/synthetic camera/actual PDF downloads              |
| npm run test:accounts | PASS: 4 tests, 9.2 s; rerun หลังแก้ hooks ผ่านอีก 4                    | Mock connected Google/access APIs ไม่ใช่ Google จริง             |
| npm run typecheck     | PASS                                                                   | Application/config/tests                                         |
| npm run lint          | PASS: 0 errors / 0 warnings                                            | full project หลังแก้ hook dependencies/cleanup                   |
| npm run build         | PASS: Next.js 16.4 production build / 25 generated pages / API + proxy | แก้ compatibility route ให้ runtime ประกาศตรงในไฟล์ ไม่ reexport |
| git diff --check      | PASS                                                                   | มี warning เรื่อง LF→CRLF เท่านั้น                               |

เพิ่มเติมที่ทดสอบ: pending/suspend session denial; verified Google owner bootstrap; workspace isolation/owner read-only/forged UID; account-cache remount and request cancellation; original logo bytes/revision races/failed deletion queue/no-op removal metadata proof; actual-roster classroom selectors/empty state; immutable print hash/geometry/Unicode text-fit/ownership/transaction snapshot/idempotent replay; fresh snapshot install+rerun rejection. Account suite หลังเพิ่มชื่อ/อีเมลพื้นที่ที่เปิดดูผ่านอีก 4/4 (10.4 s) รวม mobile wrapping/axe; typecheck และ full lint หลังแก้ผ่าน

ตรวจ PDF จริง `tmp/pdfs/personalized-20.pdf` → 1 หน้า A4/สองคน และ `personalized-60.pdf` → 2 หน้า/สองคน ทั้งสาม rendered pages มีชื่อคนละคน รหัส `02074`/`00005` รักษาศูนย์นำหน้า ID ฝนดำ 5 ตำแหน่ง คำตอบว่าง และ QR ร่วมของรุ่นชุดนั้น เห็นตราโรงเรียนต้นฉบับ/score box/markers โดยไม่มี collision ที่ตรวจพบ

สภาพ cloud ก่อนติดตั้ง: public tables=0, Auth users=0, buckets=0, storage.objects policies=0; Google provider disabled. ชุด SQL เตรียมใน Dashboard แต่ยังไม่ Run ไม่ได้ migrate/deploy และไม่ใช้ exposed service-role. PGlite ใช้ auth/storage stubs การทดสอบนี้ไม่รับรอง Supabase network/Google consent/JWT expiry/Storage service จริง หรือการอ่านรอยฝนจากเครื่องพิมพ์/โทรศัพท์

Impeccable detector รันครั้งเดียว exit0 แต่ผลยาวถูก truncate: advisory สี/ขนาดตัวอักษร/radius เทียบ sidecar เดิม จึงไม่อ้างว่าทุก finding ผ่าน/ไม่มี defect รักษา incumbent design system; provenance scan `public/omr-assets` 1 raster/0 missing. Independent reviewer พบ target-account identity และ mobile Designer documentation gap; แก้ batch เดียว แล้ว verdict `ship`/resolved ทั้งสองประเด็น **เฉพาะ fix list** ไม่ใช่ certification ทั้งระบบ ดู [ACCOUNT_PRINT_FINISH_REVIEW.md](ACCOUNT_PRINT_FINISH_REVIEW.md)

## บันทึกเดิม — 8 October 2026

ผลต่อไปนี้รันจริงใน Windows workspace `D:/Omr scanner` สำหรับ adaptive answer-sheet extension ไม่ใช่ผล Supabase staging หรือ physical OMR benchmark

## Current command results

| Command           | Result                   | Scope                                                    |
| ----------------- | ------------------------ | -------------------------------------------------------- |
| npm run typecheck | PASS                     | TypeScript application/config/tests                      |
| npm run lint      | PASS                     | ไม่ lint generated upstream public OpenCV                |
| npm test          | PASS: 26 tests / 4 files | domain 11, adaptive layout 6, actual PDF 4, PostgreSQL 5 |
| npm run test:e2e  | PASS: 6 tests, 43.1 s    | Chromium; synthetic data/camera fixtures                 |
| npm run build     | PASS                     | Next.js 16.4 production routes + proxy compile           |

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
