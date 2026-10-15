# Smart Answer Sheet

ชื่อแอปที่แสดงและติดตั้งบนโทรศัพท์คือ **ScanSob** ใช้โลโก้ที่ผู้ใช้จัดให้ในเมนู หน้าเข้าสู่ระบบ แท็บ และ home-screen icons. อ่าน [สรุปโลโก้และวิธีติดตั้ง](docs/APP_BRANDING.md); รอบนี้ไม่ต้องรัน SQL เพิ่ม ตราโรงเรียนบนกระดาษคำตอบยังแยกจากโลโก้แอป.

เว็บพื้นที่ทำงานครูไทย Next.js App Router โครงการเดียว รองรับรายชื่อ ข้อสอบ/เฉลย กระดาษ PDF, QR-first scanning, private Supabase scan Storage, การตรวจทาน/ยืนยันคะแนน และ Excel/CSV/PDF reports ต้องปรับเทียบกระดาษ/กล้องจริงก่อนใช้เก็บคะแนน อ่านสถานะล่าสุดใน [สรุปรอบลบชุดสอบและโฉมใหม่](docs/EXAM_LIFECYCLE_CAPTURE_IMPLEMENTATION.md)

## เริ่มในเครื่อง

อัปเกรดกล้องล่าสุด: Scanic 1.6.0 + worker เมื่อรองรับ, ตรวจทีละเฟรม, ภาพนิ่งความละเอียดสูงพร้อมตรวจมุมใหม่, binary JPEG และ QR orientation guard. [รายละเอียดงาน](docs/SCANNER_MAJOR_UPGRADE_IMPLEMENTATION.md), [ผลวัดจริงในเครื่อง](docs/SCANNER_PERFORMANCE_BENCHMARK.md), [วิธีย้อนกลับ](docs/SCANNER_MIGRATION_AND_ROLLBACK.md). รอบนี้ไม่ต้องรัน SQL เพิ่มและไม่ได้เปลี่ยนข้อมูลบน Supabase จริง.

ต้องมี Node.js 24 และ npm 11 หรือรุ่นที่เข้ากันได้ ใช้ package-lock.json ที่แนบ

```powershell
npm ci
npm run dev
```

เปิด http://127.0.0.1:3000/dashboard โหมด development เมื่อไม่มี Supabase จะใช้ข้อมูลสังเคราะห์ มีแถบระบุชัดและเก็บใน localStorage เท่านั้น Production ไม่ใช้ข้อมูลตัวอย่าง

```powershell
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run test:accounts
npm run test:integrations
npm run test:scanner-benchmark
npm run build
```

`npm test` รัน domain tests + PostgreSQL RLS/RPC ด้วย PGlite และ auth stub ในเครื่อง ไม่ต้องมี Docker ไม่ใช่การรับรอง Supabase staging

## เชื่อม Supabase staging

1. สร้างไฟล์ .env.local จาก .env.example ใส่ URL และ **publishable** key ของโครงการที่ผู้ใช้เป็นเจ้าของ ห้ามใส่ service-role key ใน NEXT_PUBLIC_*.
2. ฐานข้อมูลใหม่ใช้ `supabase/schema.sql` ทั้งไฟล์ครั้งเดียว (รวม 001–009 และป้องกันรันซ้ำ) หรือใช้ migrations ตามลำดับอย่างใดอย่างหนึ่ง ไม่ใช้ทั้งสองวิธีซ้ำกัน ฐานข้อมูลเดิมใช้เฉพาะ migration ที่ยังไม่ติดตั้ง โปรเจกต์นี้ติดตั้ง 008/009 เพิ่มแล้ว ไม่ต้องรันซ้ำ ดูหลักฐานใน [สรุปรอบล่าสุด](docs/EXAM_LIFECYCLE_CAPTURE_IMPLEMENTATION.md)
3. ตั้ง Google OAuth Web application และ provider/redirect URLs ของ Supabase ตาม [คู่มือติดตั้ง](docs/SUPABASE_GOOGLE_SETUP.md) เจ้าของที่กำหนดคือ Google identity ที่ยืนยันแล้วของ `piyawatpiwsiri@gmail.com` ไม่ใช่คนแรกที่สมัคร
4. เข้าสู่ระบบ `/login` ด้วย Google บัญชีอื่นเริ่ม pending เจ้าของอนุมัติ/ระงับจาก การตั้งค่า มีเหตุผลและ audit เมื่ออนุมัติจึงมีพื้นที่ส่วนตัวของบัญชีนั้น ไม่ต้อง insert สมาชิกด้วยมือแบบรุ่นเก่า
5. รายชื่อ ข้อสอบ ค่าเริ่มต้น โลโก้และทะเบียนพิมพ์แยกตามบัญชี เจ้าของเปิดดูงานคนอื่นได้อ่านอย่างเดียว ทั้ง API และ RLS ปฏิเสธเขียนข้ามพื้นที่ สลับบัญชี/พื้นที่แล้ว remount cache และยกเลิกคำขอเดิม
6. ไม่มี fallback ไปข้อมูลจำลองเมื่อเชื่อมจริงแล้วแต่โหลดล้มเหลว ตรวจบัญชีสองคนบนบริการจริงก่อนนำเข้าข้อมูลนักเรียน ดูหลักฐานสถานะติดตั้งจริงใน [สรุปงานรอบบัญชีและพิมพ์](docs/ACCOUNT_PRINT_IMPLEMENTATION.md)

## สิ่งที่ใช้ได้ตอนนี้

- Dashboard, คลังชุดสอบ/ตัวกรอง, สร้างชุดสอบ 1–60 ข้อ / 4–5 ตัวเลือก, แก้เฉลยเป็นเวอร์ชันใหม่, import XLSX/CSV พร้อม mapper/validation
- Google Login/approval/API/RLS สำหรับพื้นที่ส่วนตัว และหน้าตั้งค่าโรงเรียน/รายวิชา/ปี/ภาคเรียน (ต้องติดตั้ง SQL และเปิด provider ก่อน)
- Designer: พรีวิวใบเดียวเรียลไทม์ จัดคอลัมน์อัตโนมัติ โลโก้รักษาสัดส่วน ช่องเขียนคะแนน และ Undo/Redo/Zoom; จำนวนข้อที่ต่างจากเฉลยต้องบันทึกเวอร์ชันใหม่ก่อนพิมพ์
- PDF รายบุคคล A4 แนวนอน 2 คนซ้าย–ขวา หรือ 1 คนเต็ม A4 เมื่อพื้นที่ไม่พอ; ชื่อ/ชั้น/รหัส 5 หลักพร้อม ID ฝนดำจากรายชื่อ คำตอบว่าง; ลงทะเบียน immutable template/print jobs/sheets ก่อนดาวน์โหลด QR ร่วมต่อรุ่น ไม่บรรจุข้อมูลนักเรียน; JSON ใช้ภายใน ไม่ดาวน์โหลดเป็นไฟล์พิมพ์
- Scanner อ่าน QR → แม่แบบที่ลงทะเบียน → ปรับมุม → ตรวจทิศ/ตำแหน่ง QR → อ่านรหัส/คำตอบจาก pixels ฝั่ง server → private Storage → grading RPC → pending review; รองรับทั้ง A4 2-up และใบครึ่งที่ตัดแล้ว; Scanic เป็นค่าเริ่มต้น, OpenCV/jscanify เป็น lazy fallback และปรับมุมด้วยมือได้เสมอ
- Review ภาพจริง/overlay, ระบุตัวนักเรียน, แก้คำตอบพร้อมเหตุผล/actor/time/audit/revision, ยืนยัน/ปฏิเสธ และคะแนนคำนวณใหม่จากเฉลยเวอร์ชันที่พิมพ์; ไม่เขียนทับ confirmed
- จัดเก็บ/นำชุดสอบกลับด้วยฐานข้อมูลจริง; ลบถาวรยืนยันชื่อชุดสอบ ลบไฟล์ก่อนคะแนนและทะเบียน ถ้าค้างทำต่อได้ โดยไม่ลบรายชื่อ/โลโก้/ข้อสอบอื่น (SQL 008)
- ถ่ายอัตโนมัติเปิดเริ่มต้นหลัง QR/ขอบ/ความนิ่ง/รายละเอียดภาพผ่าน มีถ่ายใหม่และใบถัดไป; เก็บ JPEG หลังปรับมุมเพียงไฟล์เดียว อ่านคำตอบจาก bytes เดียวกับที่เก็บ และรายการตรวจทุกข้อใช้พื้นที่หลัก (SQL 008)
- Excel/CSV + PDF ทั้งห้อง/รายบุคคล ส่งออกคะแนน confirmed เท่านั้น ใช้ server-authoritative rows และบันทึก audit
- Designer/Print/Scanner/Review/Results แบบ compact task workspace บน phone/iPad; รายการและคุณสมบัติเลื่อนภายใน ปุ่มหลักไม่หลุดใต้เมนูด่วน
- โฉมใหม่ mint/sky/lavender/lilac กับตัวหนังสือเข้มและ motion สั้นที่รองรับ reduced motion; หัวพิมพ์ `school` รุ่น 4 ใช้โลโก้ใหญ่ขึ้น ช่องข้อมูลมีจุด และช่องคะแนน dots/total (SQL 009) กระดาษเดิมรุ่น 2/3 ยังสแกนได้ตามทะเบียนเดิม
- การเผยแพร่คะแนนที่ยืนยันแล้วไป MathQuest เป็นโมดูลเสริมแบบ opt-in ต่อ Workspace มี consent, outbox/idempotency, retry, unmatched และถอนก่อนลบชุดสอบ; ค่าเริ่มต้นปิดและยังห้ามใช้ข้อมูลจริงจน receiver ฝั่ง MathQuest ผ่าน security/conformance gate ดู [คู่มือติดตั้งและสัญญาข้อมูล](docs/MATHQUEST_SCORE_INTEGRATION.md)
- อัปเดตการเชื่อมต่อใช้ SQL 011 ต่อจาก 010: กู้คืน connection, ยกเลิกคำขอที่อนุมัติคาบเกี่ยว และแยกภาคเรียนที่ปิดแล้ว ดู [ขั้นตอนอัปเกรดและข้อจำกัดฝั่ง MathQuest](docs/MATHQUEST_RECOVERY_UPGRADE.md) — ผู้ใช้แจ้งว่ารัน 011 แล้ว ยังไม่ได้ตรวจฐานข้อมูลจริงซ้ำ จึงไม่ต้องรันซ้ำ
- ถอนคะแนนเก่าหลังปิดภาคเรียนใช้ SQL 012 ใหม่ร่วมกับ MathQuest receiver 03: ยืนยันโดยครู ส่งซ้ำเฉพาะงานถอน และปลดข้อห้ามลบเมื่อได้ ACK ที่ถูกต้องเท่านั้น ดู [คู่มือติดตั้งและทดสอบ](docs/MATHQUEST_CLOSED_TERM_WITHDRAWAL.md) — 012 ยังไม่ได้ติดตั้งบนระบบจริง

## รายชื่อ 4 คอลัมน์และโลโก้โรงเรียน

- รายชื่อมาตรฐานตามไฟล์ที่ส่งมา: `รหัสประจำตัว,ชื่อ,นามสกุล,ระดับชั้น` รองรับ XLSX และ CSV UTF-8 ทั้งมี/ไม่มี BOM; รหัส 5 หลักต้องเป็นข้อความหรือเซลล์ Excel ที่จัดรูปแบบครบ 5 หลัก ไม่เติมศูนย์หรือเลขที่ให้เอง
- เก็บคำนำหน้าในช่องชื่อครบ; ระดับชั้น ม.1–ม.6 ทั้งไม่มีห้องและแบบ ม.1/1, ม.1/2; ตัวกรองชั้น/ห้องและตาราง 4 คอลัมน์; ไฟล์เดิมชื่อ-สกุลรวม/เลขที่ยังจับคู่ได้ ไม่มีการเปลี่ยนชื่อคอลัมน์ฐานข้อมูลเป็นภาษาไทย
- ตรวจไฟล์เทอมปัจจุบันครบ 202 คน และยืนยัน metadata ของ `public.students` บน Supabase จริงแล้ว ช่องเก็บข้อมูลครบ ไม่ต้องรัน SQL เพิ่มสำหรับรูปแบบนี้ ดูรายละเอียดและขอบเขตการตรวจใน `docs/CURRENT_ROSTER_ALIGNMENT.md` (ยังไม่อัปโหลดรายชื่อจริง)
- โลโก้ที่ผู้ใช้ให้เป็นภาพต้นฉบับ 742 × 763 พิกเซลใน `public/omr-assets/school-logo.png`; ไม่มีการย่อ/ครอป/สร้างตราใหม่ ภาพฝังเฉพาะ metadata ระบุที่มา
- Designer มีอัปโหลด PNG/JPG บน desktop/mobile: ไม่เกิน 5 MB / 20 ล้านพิกเซล; เก็บ original bytes ของไฟล์ที่อัปโหลด ปรับเฉพาะขนาดแสดง/พิมพ์ในกรอบ 20 × 20 มม. ของหัวใหม่ รักษาสัดส่วน JPG/PNG ที่มี EXIF ใช้แนวเดียวกับ browser และแปลง PNG lossless ที่ความละเอียดเดิม ไม่หมุนซ้ำหรือเขียนทับไฟล์เก็บ
- โหมดทดลองเก็บในเบราว์เซอร์เท่านั้น (ไฟล์ใหญ่อาจเกิน quota; UI แสดงข้อผิดพลาด); โหมดเชื่อมจริงใช้ **private Supabase Storage `school-logos`** และบัญชี approved เก็บ original bytes ไม่มีการลดความละเอียด ไม่ต้องตั้ง Cloudinary สำหรับโลโก้
- `/api/settings/logo` ใช้ชื่อไฟล์ใหม่ทุกครั้งและ revision guard หลังสลับโลโก้สำเร็จค่อยลบไฟล์เก่าผ่านคิว หากลบไม่สำเร็จแสดงปุ่มลองใหม่ ไม่ลบไฟล์ปัจจุบัน ส่วน `/api/cloudinary` เป็น compatibility alias สำหรับ client เก่า ไม่ใช่ Cloudinary logo upload แล้ว
- การพิมพ์ข้อสอบเดิมใหม่ใช้โลโก้ปัจจุบันตามที่ผู้ใช้อนุมัติ PDF ที่ดาวน์โหลดไปแล้วไม่เปลี่ยน Signed URL อายุ 600 วินาทีไม่ถูกเก็บใน layout/hash/QR ฐานข้อมูลแม่แบบและทะเบียนชุดพิมพ์เป็น immutable snapshots แยกรหัสนักเรียนจาก QR
- API อ่านรายชื่อเก่าได้ระหว่างรอ migration แต่ปฏิเสธการนำเข้าใหม่ก่อน migration 003 เพื่อไม่ให้ RPC เก่าทิ้งคำนำหน้าโดยเงียบ ๆ

รายละเอียดรอบเดิม: [docs/ROSTER_LOGO_IMPLEMENTATION.md](docs/ROSTER_LOGO_IMPLEMENTATION.md). รอบบัญชี/Storage/พิมพ์ดู [docs/ACCOUNT_PRINT_IMPLEMENTATION.md](docs/ACCOUNT_PRINT_IMPLEMENTATION.md) และ [คู่มือติดตั้ง](docs/SUPABASE_GOOGLE_SETUP.md) ไม่ถือว่ามีโค้ดแล้วเท่ากับเปิดบริการออนไลน์สำเร็จ

ชุดเผยแพร่ GitHub ล่าสุดและงานฝั่งบริการก่อนนำเข้าจริง: [docs/GITHUB_RELEASE_20261009.md](docs/GITHUB_RELEASE_20261009.md)

## ข้อจำกัดสำคัญ

- ยังไม่รับรองความแม่นยำบนกระดาษ/กล้องจริง ต้อง pilot และเทียบการตรวจมือก่อนใช้คะแนนจริง; ภาพ rasterized PDF และ synthetic fixtures ไม่ใช่ภาพจากโทรศัพท์
- SQL 001–007 ติดตั้งจริงจากรอบก่อน; รอบนี้ติดตั้ง 008/009 เพิ่มแล้ว ยังไม่ผ่าน physical Google → camera → confirm → export E2E
- ไม่เพิ่ม Python service/microservice/external queue; `confirmed` ยังเป็นคะแนนครูยืนยัน ไม่ใช่สถานะเผยแพร่ให้นักเรียน การเผยแพร่ MathQuest เก็บสถานะและ revision แยกกันและเปิดได้เฉพาะเมื่อเชื่อมต่อราย Workspace แล้ว
- โลโก้และภาพสแกนใช้ private Supabase Storage ไม่ใช้ Cloudinary; ภาพสแกนใหม่เก็บเฉพาะ processed evidence เดียว ภาพเก่าต้นฉบับจะลบเมื่อเจ้าของเปิด Review และตรวจว่า processed ยังอยู่; TODO orphan cleanup สำหรับอัปโหลดเก่าที่ไม่สัมพันธ์กับ exam และ server pagination เมื่อข้อมูลโตมาก

## กล้องและ troubleshooting

- กล้องต้อง HTTPS หรือ localhost. สำหรับมือถือในเครือข่ายให้ใช้ staging HTTPS ที่อนุญาต camera; URL 127.0.0.1 เป็นเครื่องนี้เท่านั้น
- ไฟล์ OpenCV อยู่ public/omr-assets/opencv.js จากแพ็กเกจ @techstark/opencv-js ที่ล็อกไว้ โหลดเมื่อเปิดกล้อง/เลือกภาพ ไม่ใช่โหลดทุกหน้า. เมื่อติดตั้งแพ็กเกจใหม่ตรวจสำเนาตรง lockfile
- ถ้าปฏิเสธกล้อง: อนุญาตผ่านการตั้งค่าเบราว์เซอร์ หรือเลือก JPG/PNG ไม่เกิน 10 MB/25 MP
- ขอบนิ่งไม่ได้หมายถึง OMR แม่นยำ; ปิด auto-capture ได้. กรณีแสง/ความคมชัดยังต้องมี device calibration
- PDF ต้องมี NotoSansThai-Regular.ttf และ FONT-LICENSE.txt ใน public/omr-assets. พิมพ์ขนาดจริง 100% ปิด fit-to-page เลือก 1 หน้า PDF ต่อแผ่น ไม่จัด 2 หน้าต่อแผ่นซ้ำ
- Demo reset: ลบ localStorage key `smart-answer-sheet-demo-v1` ในเบราว์เซอร์ อย่าลบข้อมูลฐานข้อมูล

## Deploy web staging

รัน npm run build และ npm run start บน Node host หรือ provider ที่รองรับ Next.js 16 พร้อม env ของ Supabase staging. ตั้ง Auth redirect URL ให้ตรง HTTPS host. Production ไม่มี demo และจะแสดงคำแนะนำการตั้งค่าถ้าไม่มี credentials. ไม่ถือว่าการ build ผ่าน = login/OMR/staging ผ่าน

ดูรายละเอียดที่ docs/BLUEPRINT_REVIEW.md, docs/IMPLEMENTATION_STATUS.md, docs/TEST_RESULTS.md, docs/ARCHITECTURE_DECISIONS.md, docs/THIRD_PARTY_NOTICES.md และ DESIGN.md

รอบลบชุดสอบ/ถ่ายอัตโนมัติ/เก็บภาพเดียว/โฉมใหม่: [สรุปและวิธีติดตั้ง SQL 008/009](docs/EXAM_LIFECYCLE_CAPTURE_IMPLEMENTATION.md)
