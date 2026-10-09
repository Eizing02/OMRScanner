# สแกน ตรวจคะแนน กระดาษพิมพ์ และ Responsive — 9 ตุลาคม 2569

## สิ่งที่แก้ในรอบนี้

1. Scanner อ่าน QR ก่อนยืนยันมุม → ตรวจทะเบียนชุดสอบ/เวอร์ชัน/แม่แบบ → ปรับ perspective → อ่านรหัส 5 หลักและคำตอบ → เก็บภาพและผล → ศูนย์ตรวจสอบ ไม่สร้างคะแนนตัวอย่างจากภาพจริง
2. QR เป็น token ชุดเดียวกันตามเวอร์ชันกระดาษ ไม่ใส่ชื่อหรือรหัสนักเรียนใน QR รหัสนักเรียนแยกอ่านจากวงฝนที่พิมพ์ให้แล้ว
3. อ่านวงฝนจากพิกัดแม่แบบที่ลงทะเบียน ไม่ใช้พิกัด Designer รุ่นล่าสุดกับกระดาษเก่า ต้องพบจุดดำครบ 4 มุม สัดส่วน/ความละเอียดผ่านเกณฑ์; blank <20%, marked >=55%, หลายวงและคะแนนใกล้กันส่งตรวจ ไม่เดาคำตอบ
4. ตามคำสั่งล่าสุด ยกเลิก Cloudinary ทั้งหมด ภาพสแกนใช้ Supabase Storage `scan-images` แบบ private ไม่ต้องตั้ง CLOUDINARY_*; module เดิมเป็น stub ปฏิเสธการอัปโหลดเพื่อรักษา path compatibility ส่วน `/api/cloudinary` เป็น alias API โลโก้ Supabase เดิม
5. รูปถ่ายใน browser บีบอัด JPEG quality .60–.75 เป้าหมาย 150–300KB ไม่ใช่การรับรองทุกภาพ เซิร์ฟเวอร์ตรวจไฟล์จริงและจำกัด 2MB/25MP/1800px เก็บภาพก่อนและหลังปรับมุม ภาพต้นฉบับสแกนหมายถึงก่อน crop แต่ผ่านการบีบอัดแล้ว ไม่ใช่ original bytes เหมือนโลโก้
6. เซิร์ฟเวอร์ไม่รับคะแนน/คำตอบที่ browser อ้างเอง PostgreSQL คำนวณจากเฉลย immutable ทุกผลใหม่ pending_review; รายการซ้ำต้องเลือกแทนที่และใส่เหตุผล เฉพาะผลที่ยังไม่ยืนยัน คะแนน confirmed ห้ามสแกนทับ
7. Review มีภาพจริง private signed URL 5 นาที, overlay จากพิกัดจริง, raw observations + corrections แยกกัน, revision guard, เหตุผล/ผู้แก้/เวลา/audit และ recalculate; ระบุตัวนักเรียนด้วยมือได้เมื่อ ID อ่านไม่ได้ ยืนยันไม่ได้ถ้ายังมีคำตอบไม่ชัด
8. ยืนยันพร้อมกันใน transaction: result confirmed, scan confirmed, sheet reviewed รายงานส่งออกเฉพาะ confirmed เป็น Excel/CSV หรือ PDF ทั้งห้อง/รายบุคคล พร้อม audit ใช้เฉลยรุ่นที่ตรวจ ไม่ใช้รุ่นใหม่ย้อนหลัง
9. PDF ไม่ดาวน์โหลด JSON อีกแล้ว JSON เป็น metadata ภายใน โลโก้ JPEG แก้ EXIF orientation ก่อนฝัง PDF เป็น PNG lossless ที่ความละเอียดเดิม ไม่เปลี่ยนไฟล์ที่เก็บ; โลโก้ใหญ่ขึ้นเป็น 16mm ชื่อโรงเรียนใหญ่ขึ้น ชื่อ/ชั้น/เลขที่เติมบนจุด ส่วน QR/กล่องคะแนนจัดชิดขวา
10. แม่แบบ compact v3 ใช้ระยะห่างวงฝนเพิ่มในพื้นที่ว่างโดยไม่ย่อวง พิกัดและ QR รุ่นเดิม classic v2 ไม่เปลี่ยนย้อนหลัง ยังคง A4 แนวนอน 2 ใบซ้าย–ขวา และ 1 ใบเต็มเมื่อพื้นที่ไม่พอ
11. มือถือ/iPad ใช้ task pane + internal scrolling; ปุ่มสแกน/ยืนยัน/ดาวน์โหลดอยู่ใน viewport ไม่ยัดรายละเอียดทุกส่วนพร้อมกัน ลดข้อความช่วยที่ไม่จำเป็น ไม่ตัดคำเตือนด้านข้อมูล/คะแนน/สิทธิ์

## Supabase ที่ติดตั้งจริง

โปรเจกต์ `bbtgulutbvxeafktntxg`: ตรวจ metadata ก่อนติดตั้งพบทะเบียนพิมพ์ 005 แล้ว แต่ไม่มี 006/007 จากนั้นผู้ใช้ยืนยันให้ติดตั้งผ่าน SQL Editor

- ติดตั้ง `202610090006_scanning_review.sql` แล้ว สร้าง 6 ตาราง, RLS, RPC และ private bucket
- ติดตั้ง `202610090007_compact_print.sql` แล้ว ปรับ validator รูปแบบใหม่ โดยเก็บฟังก์ชัน v2 รองรับกระดาษเก่า
- ตรวจ marker `202610090005`, `202610090006`, `202610090007`; RLS ทั้ง 6 ตาราง; `scan-images.public=false`
- ตรวจสิทธิ์จริง: anon อ่าน scan_records ไม่ได้, authenticated UPDATE exam_results ตรงไม่ได้ และเรียก review_scan RPC ได้
- ไม่เพิ่มรายชื่อนักเรียน/คะแนนทดสอบลงฐานข้อมูลจริง ไม่เปลี่ยน Google credentials หรือใช้ service-role key
- สคริปต์ทั้งหมดเป็น transaction ครั้งเดียว ไม่รันซ้ำหลังสำเร็จ ฐานข้อมูลใหม่ใช้ snapshot 001–007 แทน migrations ได้อย่างใดอย่างหนึ่งเท่านั้น

สำหรับโปรเจกต์นี้ **ไม่ต้องรัน SQL เพิ่มแล้ว** หลังส่งโค้ดขึ้นและ deploy รอบนี้ให้ตรวจ workflow จริงต่อ

## Deploy และวิธีใช้งาน

1. ใช้ Node host/Netlify ที่รองรับ Next.js 16 ให้ build และ functions มี dependencies จาก package-lock.json (`sharp` ต้องติดตั้งใน server runtime)
2. Netlify: `NEXT_PUBLIC_SUPABASE_URL` เป็น URL โครงการ, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` เป็น publishable key, `NEXT_PUBLIC_DEMO_MODE=false` ไม่ต้องตั้ง Cloudinary หรือ worker URL; อย่าใส่ service-role key ใน browser env
3. Push โค้ดและ deploy ใหม่ จากนั้นเปิด `https://scansob.netlify.app/` เข้าสู่ Google ของเจ้าของ/บัญชีที่อนุมัติ ถ้า Google ยังขึ้น org_internal ต้องปรับ Google OAuth Audience เป็น External ตามคู่มือเดิม ไม่ใช่แก้ SQL
4. นำเข้ารายชื่อผ่านหน้าเว็บ (ไม่ใช้ CSV import ตรง Table Editor ที่ขาด school_id) → สร้างชุดสอบ/เฉลย → ออกแบบ → เลือกรายชื่อ → ดาวน์โหลด PDF → พิมพ์ A4 แนวนอน ขนาดจริง 100% 1 หน้า PDF ต่อแผ่น ไม่สั่ง 2 หน้าซ้ำในเครื่องพิมพ์
5. ใน Scanner เลือก A4 ทั้งแผ่น หรือครึ่ง A4 ที่ตัดแล้วให้ตรงกระดาษ กระดาษ full ต้องเลือก A4; ให้ QR ชัดและขอบรวมจุดดำครบทั้งใบ QR ของ 2 ใบต้องเป็นแม่แบบเดียวกัน
6. ตรวจภาพหลังปรับมุม → อ่านคำตอบและบันทึก → ศูนย์ตรวจสอบ → แก้คำตอบที่ไม่ชัดพร้อมเหตุผล/ตรวจชื่อ → ยืนยันคะแนน → ส่งออกรายงาน

## สิทธิ์และขอบเขต

- Supabase Auth + cookie session + workspace scope + RLS บัญชี pending/suspended ใช้ข้อมูลไม่ได้ ครูไม่อ่าน/เขียนข้ามบัญชี เจ้าของเปิดดูงานผู้อื่นได้อ่านอย่างเดียวตามนโยบายที่ตกลง
- Client ไม่มี direct table writes ให้คะแนน/เฉลย ใช้ RPC ที่ตรวจสิทธิ์และ revision เท่านั้น ภาพไม่มี public URL และห้าม upsert ทับไฟล์เดิม
- จำกัดพิมพ์ 200 ใบต่อ batch, export 500 คนต่อชุดสอบ รายงานไม่ตัดเหลือเพียง 500 scans ล่าสุดจากชุดอื่น ข้อมูล Review ปัจจุบันโหลดทั้ง workspace; TODO pagination server-side เมื่อข้อมูลโตมาก
- Failed/incomplete uploads เก็บ staging เพื่อให้ retry/แทนที่ผล pending ด้วย request เดิมได้ ไม่ลบภาพที่ผูกคะแนนสำเร็จ; TODO retention job สำหรับ staging ที่เลิก retry แล้ว ต้องลบผ่าน Storage API ไม่ลบเฉพาะ storage.objects ด้วย SQL
- หาก service-role key ที่เคยส่งในแชตยังใช้ได้ เจ้าของควรหมุนคีย์ฝั่ง Supabase เอง ไม่ส่งคีย์ใหม่ในแชต ระบบนี้ไม่ต้องใช้คีย์นั้น

## หลักฐานทดสอบและงานที่ยังไม่รับรอง

- Domain/HTTP: QR pixels จริง, server JPEG normalization, 2 คนต่อ A4, ไม่เชื่อคะแนนปลอม, ไม่มี QR/ผิดชุด/ไฟล์เสีย/ไม่เข้าสู่ระบบ/read-only, duplicate/reason/stale guards
- PostgreSQL PGlite: RLS/Storage isolation, คะแนนเฉลยรุ่นที่พิมพ์, retry idempotent, pending replacement, confirmed lock, raw/corrections/audit และ snapshot guard (ไม่เท่ากับ live Auth E2E)
- PDF 20/60 ข้อสร้างแล้ว rasterize ด้วย Poppler และตรวจภาพ; ตัวอักษรไทยในวงเปล่าไม่ถูกนับเป็นรอยฝนในภาพ rasterized PDF 20 ข้อ
- Browser: ดาวน์โหลด PDF จริงจากหน้าเว็บและตรวจ task layouts desktop/mobile/tablet; ยังไม่ใช่ native Safari/กล้องจริงหรือการทดสอบ browser regression suite เต็มชุดรอบล่าสุด
- Final automated checks: 104 tests ผ่าน + 1 optional test skipped; รัน optical raster suite เพิ่มผ่าน 6 tests, typecheck/lint/build ผ่าน, runtime audit 0 known findings ดูรายละเอียดใน TEST_RESULTS.md
- ยังไม่ได้ push/deploy โค้ดรอบนี้ ยังไม่ทดสอบ Google → อัปโหลดภาพ → ยืนยัน → export แบบ end-to-end บนเว็บออนไลน์หลัง deploy
- ต้อง pilot กระดาษจริงอย่างน้อย 20 และ 60 ข้อ ทั้งรอยฝนปกติ/จาง/ลบ/หลายคำตอบ แสงสะท้อน เอียง 2-up/ตัดครึ่ง และเทียบครูตรวจมือก่อนใช้คะแนนจริง ไม่รับรองความแม่นยำ OMR 100%

## สรุปไฟล์ที่แก้ตามส่วนงาน

- ฐานข้อมูล: supabase/migrations/202610090006_scanning_review.sql, 202610090007_compact_print.sql และ supabase/schema.sql (snapshot ใหม่ 001–007)
- สแกน/API: app/api/scan-records/route.ts, components/scanner/scanner-camera.tsx, lib/omr/{scan-qr,scan-image,detect-bubbles,compress-image,perspective-canvas,scan-errors,document-edge-detector}.ts และ types/scan.ts
- ตรวจคะแนน/รายงาน: app/api/export/route.ts, components/review/review-answer-table.tsx, components/export/{export-panel,report-preview}.tsx, lib/grading/recalculate.ts, lib/export/{export-excel,report-template}.ts และ types/result.ts
- พิมพ์/โลโก้: components/omr/omr-generate-panel.tsx, lib/omr/{generate-template,logo-image}.ts และ lib/export/export-pdf.ts
- เชื่อมข้อมูล/หน้าจอ: app/api/exams/route.ts, lib/supabase/api.ts, components/layout/{workspace-provider,main-shell}.tsx, components/dashboard/dashboard-cards.tsx, components/ui/{primitives,workspace-tabs}.tsx, app/globals.css, app/layout.tsx, app/settings/page.tsx, app/review/page.tsx และหน้า exam-specific scan/review/results
- ยกเลิก Cloudinary: lib/cloudinary/upload.ts, .env.example และ tests/cloudinary.test.ts รักษา path เดิม ไม่มีการย้ายโครงสร้าง
- Tests: scan-api, export-api, optical-reader, print-registry, schema-install และปรับ e2e fixtures/selectors (accounts, answer-sheets, roster-logo, scanner, workspace)
- Dependencies/เอกสาร: package.json/package-lock.json (jsQR/sharp), DESIGN.md, README.md และ docs/{ARCHITECTURE_DECISIONS,IMPLEMENTATION_STATUS,SUPABASE_GOOGLE_SETUP,TEST_RESULTS,THIRD_PARTY_NOTICES}.md พร้อม docs/licenses/RUNTIME-LICENSES.txt; ไม่แก้ PRODUCT.md
