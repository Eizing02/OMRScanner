# ลบชุดสอบ ถ่ายอัตโนมัติ เก็บภาพเดียว และโฉมใหม่ — 9 ตุลาคม 2569

สถานะติดตั้ง 10 ตุลาคม 2569: **SQL 008 และ 009 ติดตั้งสำเร็จบน Supabase จริง** โครงการ `bbtgulutbvxeafktntxg` โดย SQL Editor แสดง Success และตรวจ marker `202610090008`/`202610090009` แล้ว ก่อน/หลังยังมีนักเรียน 202 คน ชุดสอบ 1 ชุด ผลคะแนน 1 รายการ ภาพสแกน 4 ไฟล์เท่าเดิม bucket ยัง private และ cleanup jobs = 0 ไม่มีการเรียก purge/ลบข้อมูลจริงระหว่างติดตั้ง

โค้ดพุช `main` แล้วใน commit [`8e1cbf9`](https://github.com/Eizing02/OMRScanner/commit/8e1cbf9f35855d397207038562768c235f03b556) และตรวจ Git remote SHA ตรงกับเครื่อง เว็บ `https://scansob.netlify.app/login` ตอบ HTTP 200 จาก Netlify หน้าเข้าสู่ระบบแสดง copy ใหม่และ CSS ที่เสิร์ฟมีพาเลต/primary/QR-motion รุ่นใหม่แล้ว หลักฐาน `.impeccable/review/live-pastel-login.jpg` เป็นหน้าออนไลน์จริง ไม่ใช่ localhost ขอบเขตนี้ยืนยันว่า UI ใหม่เผยแพร่แล้ว ไม่ใช่ production Google → camera → confirm → export E2E; GitHub connector อ่าน combined deploy status ไม่ได้ (404) จึงไม่อ้าง CI/deploy ID ที่ไม่ได้ตรวจ

## การทำงานที่เปลี่ยน

- คลังชุดสอบจัดเก็บ/นำกลับผ่านฐานข้อมูลจริง ไม่ใช่เปลี่ยนเฉพาะ cache การจัดเก็บไม่ลบคะแนนหรือภาพ
- ตัวเลือกชุดสอบ → ลบถาวร: แสดงจำนวนกระดาษ ผลสแกน คะแนนยืนยัน และไฟล์ภาพ ต้องพิมพ์ชื่อให้ตรง มีทางไปส่งออกคะแนนก่อนลบ
- เมื่อยืนยันลบ ระบบ freeze ชุดสอบแล้วสร้าง cleanup job ลบภาพผ่าน Supabase Storage API ครั้งละไม่เกิน 500 ไฟล์ ตรวจว่าภาพหายครบก่อนลบคะแนน/เฉลย/เวอร์ชัน/ทะเบียนพิมพ์ทั้งหมด งานค้างทำต่อได้ ไม่เริ่มลบซ้ำจากศูนย์
- ลบเฉพาะงานในพื้นที่ของเจ้าของชุดสอบ ไม่ลบรายชื่อนักเรียน ค่าโรงเรียน โลโก้ บัญชี หรือข้อสอบอื่น ภาพ A4 2-up ที่แชร์ระหว่างสองนักเรียนในชุดเดียวกันลบเพียงครั้งเดียว
- เก็บบันทึกการลบแบบสรุป ไม่มี snapshot คำตอบ/คะแนนส่วนบุคคลของชุดที่ลบแล้ว การลบถาวรกู้คืนในแอปไม่ได้ สำเนา PDF/Excel ที่ดาวน์โหลดไว้ไม่ถูกลบจากเครื่องครู
- กล้องเปิดอัตโนมัติเป็นค่าเริ่มต้น จำตัวเลือกในเบราว์เซอร์ อ่าน QR ที่ลงทะเบียนก่อน ตรวจมุม/ขนาด/ความนิ่งต่อเนื่อง 5 เฟรม (~1.25 วินาทีเมื่อประมวลผลทัน) แล้วตรวจ QR จุดดำ ความสว่างและรายละเอียดภาพหลังปรับมุมก่อนจับภาพ มีถ่ายเอง ถ่ายใหม่ แก้มุม และใบถัดไป
- จับภาพอัตโนมัติ **ไม่ใช่ยืนยันคะแนนอัตโนมัติ** ครูยังเลือกอ่านคำตอบและบันทึก แล้วตรวจ/ยืนยันผลตามเดิม ภาพซ้ำและ confirmed scores ไม่ถูกเขียนทับเอง
- ภาพใหม่เก็บเฉพาะ rectified JPEG ใน private bucket `scan-images` ด้านยาวไม่เกิน 1800px, quality 75→60 เพื่อลดขนาดเมื่อเกินเป้าหมาย 300KB ไม่ลดพิกัดจนฝนอ่านไม่ได้เพื่อบังคับเป้าขนาด และไม่มีคำรับรองว่าไฟล์ทุกภาพจะต่ำกว่า 300KB
- อ่าน QR/รหัส/คำตอบบน server จาก JPEG bytes ชุดเดียวกับที่เก็บเป็นหลักฐาน ภาพต้นฉบับอยู่เฉพาะหน่วยความจำเบราว์เซอร์จนบันทึกสำเร็จ ถ้าส่งไม่สำเร็จยังปรับ/ส่งใหม่ได้
- ภาพต้นฉบับเก่า: เมื่อเจ้าของเปิดผลใน Review จะตรวจว่าภาพ processed มีจริงก่อนลบ original ผ่าน Storage API แล้วค่อยล้าง reference การเปิดอ่านของเจ้าของระบบในพื้นที่คนอื่นไม่สั่งลบ ไม่ลบต้นฉบับย้อนหลังทั้งระบบด้วย SQL
- หน้าตรวจเปิดทุกข้อเป็นค่าเริ่มต้น ขยายพื้นที่เลื่อน ยุบสรุปคะแนนซ้ำ และมีปุ่มขยายรายการบน desktop มือถือ/iPad ≤1200px ใช้แท็บภาพ/คำตอบ/คิวทีละส่วน ปุ่มแก้และประวัติ ≥44px ปุ่มหลักอยู่เหนือเมนูด่วน
- ไม่มีหน้าแสดงโควตาพื้นที่ ไม่มีมาตรวัดหรือการจำกัดโควตาครูเพิ่ม

## โฉมใหม่และงานพิมพ์

- ใช้พาเลต `DEFCF9 / CADEFC / C3BEF0 / CCA8E9` กับข้อความและปุ่มสีพลัมเข้ม คงเมนูและขั้นตอนเดิม ลดข้อความอธิบาย แต่คง error/คำเตือนลบถาวร/ยืนยันคะแนน
- ปุ่ม/แท็บ/เปลี่ยนหน้า/QR lock เคลื่อนไหวสั้น 130–250ms ไม่มี animation ที่รอโหลด รองรับ reduced motion โดยตัดการเคลื่อนตำแหน่ง
- หัวกระดาษรุ่น `school` (geometryVersion 4) ใช้โลโก้กรอบ 20×20 มม. ชื่อโรงเรียนใหญ่ขึ้น ช่องชื่อ/วิชา/ระดับชั้น/ห้องมีจุดล้อมข้อมูล ไม่สร้างเลขที่หรือห้องขึ้นเอง ช่องเขียนคะแนน 29×14 มม. แสดงจุด / คะแนนเต็ม ไม่มีคำว่า “คะแนน”
- PDF ใช้แนวภาพที่ browser อ่านจาก EXIF ของ JPG/PNG ไม่หมุนซ้ำ ไม่แก้ต้นฉบับที่เก็บใน Storage พิกัด QR/จุดดำ/วงคำตอบไม่ถูกเลื่อนเพื่อจัดหัวใหม่ แม่แบบ `classic`/`compact` ที่ลงทะเบียนไว้ยังอ่านได้ตามเดิม
- แนวทางจริงและ tokens อยู่ใน `DESIGN.md`; Impeccable ตรวจงานสองรอบและ reviewer ให้ disposition `ship` ไม่ใช่การรับรองความแม่นยำกล้องจริง

## สิทธิ์และการใช้หลายบัญชี

ข้อมูลแยก workspace ด้วย Auth/API/RLS ตามระบบเดิม ครูไม่เห็นหรือแก้ข้อมูลอีกบัญชี เจ้าของระบบยังดูพื้นที่อื่นแบบอ่านอย่างเดียว ไม่ลบงานของครูอื่นในโหมด inspection การใช้ทรัพยากรฟรีของโครงการยังแชร์กันในระดับบริการ แม้ข้อมูลไม่ปนกัน ไม่มีการรับรอง capacity จากผลทดสอบชุดเล็ก

การลบใช้ lock ต่อ workspace เพื่อกัน scan/print/review แข่งกับการลบ ไม่ใช้ lock เดียวข้ามครูทุกคน นโยบาย Storage อนุญาตลบเฉพาะไฟล์ staging/failed, original เก่าที่ processed ยังอยู่ หรือ exact path ของ cleanup job ที่บัญชีนั้นเป็นเจ้าของ ไม่เปิด bucket สาธารณะ

## วิธีเปิดใช้กับ Supabase เดิม

โครงการ `bbtgulutbvxeafktntxg` มี 001–007 จากรอบก่อน และติดตั้งสองไฟล์ต่อไปนี้แล้ว **ไม่ต้องรันซ้ำ**:

`supabase/migrations/202610090008_exam_lifecycle_retention.sql`

`supabase/migrations/202610090009_school_print_header.sql`

1. สำรองข้อมูลตามนโยบายโรงเรียน และจัดช่วงอัปเดตที่ครูหยุด scan/print ชั่วคราว SQL 008 กับ server code ใหม่ต้องเผยแพร่เป็นรอบเดียวกัน ห้ามปล่อย server รุ่นเดิมที่จอง original path ทำงานกับ RPC ใหม่
2. Supabase → SQL Editor ใน project นี้ ตรวจ marker ด้วย `select version from private.app_installation order by version;` ต้องมี 001–007 และยังไม่มี `202610090008`
3. วางไฟล์ 008 ทั้งไฟล์แล้ว Run ครั้งเดียว การติดตั้งเป็น transaction เพิ่มคอลัมน์/ตาราง/RPC/RLS และ backfill ความสัมพันธ์ exam ของ successful uploads **ไม่ลบไฟล์ คะแนน หรือรายชื่อ** ถ้าพบภาพที่ผูกหลาย exam จะหยุดให้ตรวจ ไม่เดา
4. รัน 009 ทั้งไฟล์ต่อจาก 008 เพื่อเพิ่ม `school` print style / geometryVersion 4 โดยไม่แก้ทะเบียนแม่แบบเดิม ตรวจ marker ทั้ง `202610090008`/`202610090009` แล้วเผยแพร่ code รอบใหม่ไป Netlify ด้วย environment เดิม ไม่ต้องสร้าง key ใหม่หรือใช้ service-role key บน client ไม่ต้องใช้ Cloudinary
5. เปิดชุดทดสอบที่ไม่มีข้อมูลจริง พิมพ์ QR ใหม่/เดิม → scan → retake → review → confirm → export → archive/restore จากนั้นทดลองลบชุดทดสอบ ตรวจ bucket และรายชื่อยังอยู่ ใช้บัญชีครูอีกคนทดสอบห้ามอ่าน/เขียนข้ามพื้นที่

ฐานข้อมูลใหม่ว่างใช้ `supabase/schema.sql` ซึ่งรวม 001–009 ครั้งเดียว ไม่ใช้ schema.sql กับ migrations ซ้ำกัน ฐานข้อมูลเดิมไม่ต้องรัน 001–009 ใหม่ ไฟล์ 008 ไม่ใช่คำสั่งลบชุดสอบและไม่ได้ลบข้อมูลให้ทันที ภาพหลักฐานติดตั้งอยู่ใน `.impeccable/review/supabase-008-009-installed.jpg` (local ignored artifact)

## ตรวจ upstream GitHub

- [jscanify / puffinsoft](https://github.com/puffinsoft/jscanify): รุ่นติดตั้ง 1.4.3 ใช้จัดลำดับมุมกระดาษ รองรับ extraction/perspective correction; repository เดิมของ ColonelParrot ชี้ไป upstream นี้แล้ว
- [OpenCV.js / TechStark](https://github.com/TechStark/opencv-js): runtime ที่ติดตั้งใช้หา contours และ warp perspective จริง โหลด local asset เดิม ไม่มีการแก้หรือ upgrade dependency
- [jsQR](https://github.com/cozmo/jsQR): อ่าน RGBA pixels จริง ทั้ง live camera และภาพหลังปรับมุม ไม่ใช่ระบบควบคุมกล้อง/คำนวณคะแนน
- Auto-shutter, quality gates, retake, private workspace และการลบ/retention เป็นโค้ดของโปรเจกต์ ไม่ใช่ความสามารถที่กล่าวอ้างว่า upstream รับรอง
- [OMRChecker](https://github.com/Udayraj123/OMRChecker) ยังเป็นแหล่งที่เคยศึกษา ไม่ได้ติดตั้ง Python adapter หรือใช้ให้คะแนน ปัจจุบัน reader เป็น TypeScript ที่ผูกกับ template coordinates ไม่เปลี่ยน planned architecture อื่นใน PRODUCT.md โดยไม่ได้รับอนุมัติ

รายละเอียด licenses/ที่มา: `docs/THIRD_PARTY_NOTICES.md`

## หลักฐานและข้อจำกัด

ทดสอบ PGlite ด้วย auth/storage stub, HTTP mocks, synthetic QR/OMR pixels และ Chromium canvas camera stream ไม่แตะบริการหรือข้อมูลจริง ตรวจ responsive 375×812, 390×844, 768×1024, 1024×768, 1440×1000 และ axe WCAG A/AA

ผลทดสอบในเครื่อง: Vitest 127 ผ่าน / 1 ข้าม (fixture กระดาษจริงยังไม่มี), main Playwright 22 ผ่าน, account Playwright 5 ผ่าน รวมการจับภาพจาก canvas stream จริงผ่าน OpenCV/jsQR → retake → processed-only API mocks; visual test อีก 1 test ตรวจ 26 หน้าจอ desktop/phone/iPad สองแนว ไม่พบ WCAG A/AA axe violations หรือ horizontal page overflow ในขอบเขตนี้ ทั้ง JPG/PNG EXIF และ PDF โรงเรียนผ่านการทดสอบและตรวจ render จริงแล้ว

`npm run typecheck`, `npm run lint`, `npm run build` ผ่าน รุ่น production สร้าง routes ครบ ไม่มีการเพิ่ม dependency หรือเผยแพร่ env/key/private fixtures ใน GitHub

ไม่มีการรับรองความแม่นยำกระดาษ/เครื่องพิมพ์/iPhone Safari/iPad กล้องจริง ต้อง pilot และเทียบตรวจมือก่อนใช้คะแนนจริง ความนิ่งและความคมเป็น heuristic ไม่รับรองทุกกรณีแสงสะท้อนหรือรอยฝนจาง ผลบัญชี/Storage/scoring ในเครื่องใช้ mocks หรือ auth stubs ไม่ใช่การทดลองลบข้อมูลจริงบน production

TODO ที่ยังไม่รวม: cleanup อัตโนมัติของ historical staging uploads ที่ไม่ผูก exam/ภาพ orphan และ pagination ฝั่ง server ข้อมูลจำนวนมาก ไม่ลบข้อมูลเหล่านี้โดยคาดเดา ภาพเดิมของผลที่ยังไม่เปิด Review ยังมี original อยู่จนเข้าตรวจหรือลบชุดสอบ

## ไฟล์ที่เปลี่ยนในงานนี้

- UI: `components/exams/exam-table.tsx`, `components/scanner/scanner-camera.tsx`, `components/review/review-answer-table.tsx`, `components/layout/workspace-provider.tsx`, `components/layout/main-shell.tsx`, `app/globals.css` และ copy ใน dashboard/exam form/student import/settings/login/OMR/export
- API/image logic: `app/api/exams/route.ts`, `app/api/scan-records/route.ts`, `lib/omr/capture-quality.ts`, `lib/omr/scan-image.ts`, `lib/omr/scan-errors.ts`, `types/exam.ts`, `types/scan.ts`
- Print: `lib/omr/generate-template.ts`, `lib/omr/logo-image.ts` พร้อม tests แม่แบบเดิม/หัวใหม่/EXIF
- Database: migrations 008/009 และ `supabase/schema.sql` snapshot สำหรับฐานใหม่
- Tests: `tests/exam-lifecycle.test.ts`, `tests/exam-lifecycle-api.test.ts`, `tests/capture-quality.test.ts`, `tests/capture-fixture.ts`, `tests/scan-api.test.ts`, `tests/schema-install.test.ts`, `tests/e2e/exam-lifecycle.spec.ts`, `tests/e2e/accounts.spec.ts`
- Documents: เอกสารนี้, `README.md`, `PRODUCT.md` เฉพาะนโยบายที่ผู้ใช้อนุมัติ, `DESIGN.md`, `docs/THIRD_PARTY_NOTICES.md`

Impeccable ใช้แนวทาง distill/adapt/colorize/animate เพื่อยุบข้อมูลซ้ำ เพิ่มพื้นที่คำตอบ คง touch target และสร้างระบบสี/การเคลื่อนไหวเดียวกัน ไม่ได้เพิ่มโควตาหรือเปลี่ยน engine คะแนน
