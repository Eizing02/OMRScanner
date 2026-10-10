# Implementation status — 9 ตุลาคม 2569

## Current override — 10 October 2026 scanner upgrade

สถานะปัจจุบันอยู่ใน [SCANNER_MAJOR_UPGRADE_IMPLEMENTATION.md](SCANNER_MAJOR_UPGRADE_IMPLEMENTATION.md): Scanic/camera scheduler/still/binary JPEG/QR orientation และ benchmark เพิ่มในรอบนี้; Supabase schema เดิม ไม่รัน SQL เพิ่ม ไม่แตะข้อมูลจริง. ข้อความวันที่ 8–9 ตุลาคมด้านล่างเป็นประวัติแต่ละรอบ ไม่ใช่รายการงานที่ยังขาดทั้งหมดหรือสถานะ deployment ปัจจุบัน. ตาราง/RPC สแกนและรายงานมีแล้ว; Python/Cloudinary ไม่ใช่สถาปัตยกรรมที่อนุมัติล่าสุด. Physical calibration ยังไม่ผ่าน.

## ประวัติ 9 October: สแกน–ตรวจทาน–รายงาน และกระดาษพิมพ์

รายละเอียดรอบนี้อยู่ใน [SCANNING_PRINT_IMPLEMENTATION.md](SCANNING_PRINT_IMPLEMENTATION.md). เพิ่ม QR-first, อ่าน ID/วงฝนจากภาพ, private Supabase scan Storage, คะแนน pending/review/confirm พร้อมเหตุผลและ audit, รายงาน Excel/CSV/PDF และ workspace แบบ compact แล้ว ไม่ใช้ Cloudinary ทั้งโลโก้และภาพสแกน

SQL 006 และ 007 ติดตั้งในโปรเจกต์ `bbtgulutbvxeafktntxg` แล้วหลังผู้ใช้ยืนยัน ตรวจ live metadata พบ marker 005/006/007, RLS ครบ 6 ตาราง และ bucket ภาพแบบ private. ยังไม่ได้ push/deploy โค้ดรอบนี้ และยังไม่ผ่านการปรับเทียบกระดาษที่ถ่ายจากโทรศัพท์จริง ห้ามตีความ build/tests เป็นการรับรองความแม่นยำคะแนนจริง

## บันทึกรอบบัญชีและพิมพ์รายบุคคลก่อนหน้านี้

รายละเอียดล่าสุดอยู่ใน [ACCOUNT_PRINT_IMPLEMENTATION.md](ACCOUNT_PRINT_IMPLEMENTATION.md) และ [SUPABASE_GOOGLE_SETUP.md](SUPABASE_GOOGLE_SETUP.md) ส่วนบันทึกด้านล่างเป็นหลักฐาน foundation/กระดาษคำตอบวันที่ 8 ตุลาคม ไม่ใช่สถานะปัจจุบันของทุกส่วน

เพิ่ม Google-only login, pending/approved/rejected/suspended, owner approval และ read-only inspection, workspace isolation/API/RLS, settings, private Supabase logo พร้อม durable cleanup, ห้องจาก roster จริง, prefilled student identity และ immutable print registry/layout persistence แล้วในโค้ด แต่ยังไม่ apply snapshot บน Supabase, Google provider ยังปิด และยังไม่ deploy รอบนี้

81 unit tests, 15 browser tests และ 4 mock-account tests ผ่าน พร้อม typecheck/lint ไม่มีคำเตือนและ production build; ไม่ใช่ live Google/Supabase E2E ระบบ QR/ID/bubble recognition, scan upload, persisted grading/review/report และ physical calibration **ยังไม่เสร็จ**

ข้อกำหนดที่อนุมัติใหม่แทนสถานะเดิม: โลโก้ใช้ private Supabase Storage/พิมพ์ใหม่ใช้ภาพล่าสุด, login Google และเจ้าของเปิดดูงานคนอื่นได้แบบอ่านอย่างเดียว; Cloudinary ใช้สำหรับภาพสแกนในขั้นถัดไป ไม่เพิ่ม Python worker/microservice

## บันทึกเดิม — 8 ตุลาคม 2569

## ขอบเขตการส่งมอบ

เริ่มลงมือจาก MASTER BLUEPRINT v2.2 หลังเทียบ PRODUCT.md และ AGENTS.md ได้ foundation ของ Next.js โครงการเดียว พร้อม UI ภาษาไทยและเครื่องมือที่รันจริงในเครื่อง **ยังไม่ปิด acceptance ของ Phase ใดทั้ง Phase และยังไม่ใช่ระบบตรวจ OMR production** ไม่มี deployment, cloud upload หรือ migration บนบัญชีผู้ใช้

หลังการส่งมอบ foundation ผู้ใช้อนุมัติการขยายกระดาษคำตอบ: 1–60 ข้อ, 4/5 ตัวเลือก, พรีวิวหนึ่งใบ, A4 แนวนอนสองใบซ้าย–ขวาหรือหนึ่งใบเต็มเมื่อพื้นที่ไม่พอ และ QR ร่วมต่อรุ่นชุดสอบ จึงปรับ PRODUCT.md เฉพาะข้อกำหนดเหล่านี้ ไม่เปลี่ยนข้อกำหนด functional ส่วนอื่นหรือสถาปัตยกรรม storage/worker

## Phase / หลักฐาน / งานค้าง

| Phase                    | Implemented                                                                                                                                                                                                                                                                | ยังต้องทำก่อนถือว่าเสร็จ                                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Discovery / foundation | scaffold Next/React/TypeScript, Thai shell, DESIGN, lockfile, CI definition, lint/typecheck/build/tests, license notices                                                                                                                                                   | OMRChecker adapter/worker health/Python tests, dev dependency finding, staging CI จริง                                                                                                       |
| 1 Auth / roster / exams  | Supabase SSR/Auth code, signed-in API, 9 ตาราง RLS, atomic import/create draft/new-version RPC, mapper XLSX/CSV, เฉลย 1–60 ข้อ/4–5 ตัวเลือก/คะแนนรายข้อ, published-key guards; demo review อ้างรุ่นข้อสอบเดิม                                                              | migration ใหม่บน staging, Supabase login/RLS E2E, subjects/classes/enrollments, school selector/invites, A/B, publish/version lifecycle ครบวงจร                                              |
| 2 Locked print           | geometry mm เดียวกับ SVG/PDF/OMR candidate JSON; one-sheet live preview, A4 landscape 2-up/full fallback; 50 ID + N×choices answer bubbles/ใบ; Thai letters inside fixed 3.6-mm bubbles; shared opaque set QR, score box/logo, validator, snapshot manifest/hash, Thai PDF | server-persisted immutable template/print batch/token lookup, calibrated minima, physical cut-sheet test, raster-center comparison automation; layout ของ connected mode ยังไม่บันทึก server |
| 3 Camera                 | getUserMedia, jscanify corner helper + OpenCV adapter, shaded polygon, experimental stability hold, capture/image preview, perspective warp, original preserved locally, accessible manual corners                                                                         | Android/iPhone devices/rotation/permission tests, calibrated sharpness/glare, Web Worker performance, upload/retry, Scanic A/B benchmark                                                     |
| 4 OMR worker             | pure grading/status safeguards และ candidate template เท่านั้น; upstream SHA/license ตรวจอ้างอิงแล้ว                                                                                                                                                                       | ยังไม่มี clone/adapter/worker/queue/QR decode/resolver/ID reading/roster match/duplicate attempt persistence ทั้งหมด                                                                         |
| 5 Review / export        | development-only synthetic correction with reason/raw preservation, demo verification, XLSX/CSV Scores download                                                                                                                                                            | real scan images/readings, transactional server audit/revisions, verify/publish authorization, private exports, Responses/ItemAnalysis/Metadata sheets, PDF reports                          |
| 6 Hardening              | local RLS tests, automated responsive/axe checks, build + production dependency audit                                                                                                                                                                                      | physical golden dataset, pentest/storage isolation, backup/restore/retention, load/concurrency/cost/monitoring, pilot sign-off                                                               |

## โหมดข้อมูลและความจริงของปุ่ม

- Development ไม่มี Supabase: แถบ “ข้อมูลตัวอย่าง” ชัดเจน; ข้อมูลสังเคราะห์ browser-local เท่านั้น ไม่ใช้กับรายชื่อนักเรียนจริง
- เชื่อม Supabase: ใช้ session/membership/RLS จริง ไม่มี fallback เป็น demo ถ้าโหลดล้มเหลว; ต้องกำหนด env และ provision โรงเรียนก่อน
- Production ไม่มี env: API คืน JSON `NOT_CONFIGURED`/503; หน้าเว็บไม่แสดงตัวอย่างเป็นข้อมูลจริง
- PDF เป็น “PDF ทดสอบ” มี experimental warning และยังไม่ผูก token กับฐานข้อมูล
- Scanner เปิดกล้อง/จับขอบ/crop จริง แต่ยังไม่อ่าน QR หรือช่องฝน ไม่อัปโหลดและไม่ให้คะแนนภาพจริง
- Review/Export ใช้ผลสังเคราะห์เฉพาะ demo; การกดยืนยันไม่ใช่ server confirmation หรือ publication

## Database / API

ฐานข้อมูลเดิมใช้ migration `202610080001_foundation.sql` ตามด้วย `202610080002_adaptive_answer_sheets.sql`; ฐานข้อมูลใหม่เลือกใช้ snapshot `supabase/schema.sql` แทนการรันสอง migration ได้ ไม่รัน snapshot ซ้ำบนฐานข้อมูลเดิม รอบนี้ทดสอบ SQL ใน PGlite เท่านั้น ไม่ได้ apply ไป Supabase ของผู้ใช้

ตารางที่มี: schools, school_members, students, student_imports, exams, exam_access, exam_versions, answer_keys, audit_logs. UUID/timestamps/indexes/composite tenant FKs; RLS ทุกตาราง; helpers กำหนด search_path/execute privileges. ห้าม self-escalation membership; การ provision เป็นงานผู้ดูแล

API ที่มี: `GET /api/me/context`, `GET/POST /api/students`, `GET/POST/PATCH /api/exams`. Writes ตรวจ Zod, role, membership, same-origin และ stream body ไม่เกิน 1 MB. RPC ตรวจซ้ำรวม direct-call types/missing fields และ commit แบบ transaction พร้อม audit summary ที่ไม่บันทึกรหัสผ่านเก่า. PATCH ตรวจ expectedVersion และสร้างรุ่นใหม่แทนแก้เฉลยเดิม; จำกัดเจ้าของข้อสอบหรือ admin. ยังไม่มี rate limiter/quotas หรือครบ API contracts ของ Blueprint

## Files changed / created

ไม่มีการย้าย/เปลี่ยนชื่อโฟลเดอร์เดิม ไม่มี Git repository ให้สร้าง commit/PR ในการส่งมอบนี้

- Root/config: package.json, package-lock.json, tsconfig.json, next-env.d.ts, next.config.ts, postcss.config.mjs, eslint.config.mjs, vitest.config.ts, playwright.config.ts, proxy.ts, .env.example, .gitignore, README.md, DESIGN.md, .github/workflows/web-checks.yml
- App shell: app/layout.tsx, app/globals.css, app/page.tsx; components/layout/main-shell.tsx, workspace-provider.tsx; components/ui/primitives.tsx
- Screens/routes: app/dashboard/page.tsx; app/exams/page.tsx, new/page.tsx, [id]/page.tsx, [id]/answer-key/page.tsx, [id]/omr-generate/page.tsx, [id]/print/page.tsx, [id]/scan/page.tsx, [id]/review/page.tsx, [id]/results/page.tsx; app/students/page.tsx, students/import/page.tsx; app/scan/page.tsx, review/page.tsx, export/page.tsx, login/page.tsx, settings/page.tsx
- UI modules: components/dashboard/dashboard-cards.tsx; components/exams/exam-table.tsx, exam-form.tsx, answer-key-editor.tsx, exam-summary-card.tsx; components/students/student-table.tsx, import-preview-table.tsx; components/omr/omr-sheet-preview.tsx, omr-generate-panel.tsx; components/scanner/scanner-camera.tsx; components/review/review-answer-table.tsx; components/export/export-panel.tsx, report-preview.tsx
- Auth/API: lib/supabase/client.ts, server.ts, api.ts; app/api/me/context/route.ts, students/route.ts, exams/route.ts
- Domain/tools: types/student.ts, exam.ts, result.ts, camera.ts; lib/demo.ts; lib/import/normalize-name.ts, parse-students.ts; lib/omr/generate-template.ts, qr.ts, camera-geometry.ts, document-edge-detector.ts; lib/grading/grade-exam.ts; lib/export/export-pdf.ts, export-excel.ts
- SQL/tests: supabase/schema.sql, supabase/migrations/202610080001_foundation.sql; tests/domain.test.ts, rls.test.ts, pdf.test.ts; tests/e2e/workspace.spec.ts, scanner.spec.ts
- Assets/notices: public/omr-assets/opencv.js, OPENCV-LICENSE.txt, NotoSansThai-Variable.ttf, NotoSansThai-Regular.ttf, FONT-LICENSE.txt; docs/licenses/JSCANIFY-LICENSE.txt, SHEETJS-LICENSE.txt, RUNTIME-LICENSES.txt
- Documentation: docs/BLUEPRINT_REVIEW.md, ARCHITECTURE_DECISIONS.md, DIRECTION.md, DIRECTION_ROLL_EVIDENCE.md, IMPLEMENTATION_STATUS.md, TEST_RESULTS.md, THIRD_PARTY_NOTICES.md, PRINT_CALIBRATION.md, FINISH_REVIEW.md; .impeccable/design.json และภาพหลักฐานใน .impeccable/review

ใช้ reusable Radix primitives/CSS tokens ในครั้งนี้ ยังไม่ได้เพิ่ม shadcn registry components, React Hook Form หรือ TanStack Table. Designer เป็น constrained reference workspace ไม่ใช่ react-konva editor เต็มรูปแบบ; QR generator ใช้ qrcode แต่ยังไม่มี QR decoder. บันทึกความแตกต่างเพื่อไม่อ้าง stack/ความสามารถที่ยังไม่มี

## Next concrete steps

1. ตรวจ schema ใน Supabase ที่ตั้งค่าไว้แล้ว และ apply migration ใหม่ผ่าน workflow ของผู้ดูแล จากนั้นทดสอบ login/import/create/new-version กับบัญชีสองโรงเรียน (ไม่ส่ง secret key ผ่านแชต)
2. เติม Phase 1 entities + publish/version validation ให้ครบ
3. ทำ PRINT_CALIBRATION ด้วยเครื่องพิมพ์/โทรศัพท์จริง ก่อนเปิด printing หรือคะแนน production
4. ขอการตัดสินใจ Cloudinary หรือ Supabase Storage และสิทธิ์เพิ่ม Python worker เนื่องจากขัด AGENTS.md แล้วจึงเริ่ม Phase 4 integration. ไม่เปิดบริการ/บัญชี cloud โดยอาศัยคำสั่งในเอกสารแนบอย่างเดียว

ดูผลคำสั่งและขอบเขตการทดสอบใน TEST_RESULTS.md ไม่ใช้จำนวน tests แทนหลักฐานความแม่นยำ OMR

## Changed files — adaptive answer-sheet task

รายการข้างบนเป็น foundation เดิม รายการต่อไปนี้คือไฟล์ที่เพิ่ม/แก้สำหรับคำขอปัจจุบัน โดยไม่มีการย้ายหรือเปลี่ยนชื่อโฟลเดอร์:

- Geometry / PDF / QR: `lib/omr/generate-template.ts`, `lib/omr/qr.ts`, `lib/export/export-pdf.ts`
- Designer / preview: `components/omr/omr-generate-panel.tsx`, `components/omr/omr-sheet-preview.tsx`, `components/export/report-preview.tsx`, `app/globals.css`
- Exam / version compatibility: `types/exam.ts`, `types/result.ts`, `components/layout/workspace-provider.tsx`, `components/exams/exam-form.tsx`, `components/exams/answer-key-editor.tsx`, `lib/grading/grade-exam.ts`, `components/review/review-answer-table.tsx`, `components/export/export-panel.tsx`
- Dynamic labels / help: `components/dashboard/dashboard-cards.tsx`, `components/exams/exam-table.tsx`, `components/layout/main-shell.tsx`, `components/scanner/scanner-camera.tsx` (แก้ชื่อรูปแบบกระดาษเท่านั้น ไม่เพิ่ม decoder)
- Server / SQL: `app/api/exams/route.ts`, `supabase/schema.sql`, `supabase/migrations/202610080002_adaptive_answer_sheets.sql` (ใหม่)
- Tests: `tests/domain.test.ts`, `tests/layout.test.ts` (ใหม่), `tests/pdf.test.ts`, `tests/rls.test.ts`, `tests/e2e/answer-sheets.spec.ts` (ใหม่), `playwright.config.ts`
- Documents / evidence: `PRODUCT.md`, `README.md`, `docs/ANSWER_SHEET_LAYOUT.md` (ใหม่), `docs/PRINT_CALIBRATION.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/TEST_RESULTS.md`, `docs/ANSWER_SHEET_FINISH_REVIEW.md` (ใหม่), `docs/ANSWER_SHEET_DESIGN_EVIDENCE.md` (ใหม่), `.impeccable/surfaces/components-omr-omr-generate-panel-tsx.md`, PNG/PDF evidence ใน `.impeccable/review` และ `output/pdf`
- รักษา `DESIGN.md`, `.impeccable/design.json`, original foundation migration และ `.env.local`; ไม่เพิ่ม shipping raster assets หรือ dependency
