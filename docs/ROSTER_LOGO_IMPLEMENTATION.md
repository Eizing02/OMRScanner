# รายชื่อนักเรียน 3 คอลัมน์และโลโก้โรงเรียน — 8 ตุลาคม 2569

งานตามคำอนุมัติให้แก้ไขหลังวิเคราะห์ ไม่เปลี่ยน PRODUCT.md, โครงสร้างโปรเจกต์ หรือระบบสแกน/ให้คะแนน

## ใช้งาน

1. เปิด `/students/import` แล้วใช้ XLSX หรือ CSV UTF-8 ที่มี `รหัสประจำตัว,ชื่อ-สกุล,ชั้น` ดาวน์โหลดตัวอย่างใหม่จากหน้านำเข้าได้
2. รหัสต้องเป็นข้อความ 5 หลัก เช่น `02074`; Excel แบบตัวเลขที่มี format `00000` อ่านตามข้อความที่แสดงได้ แต่เลข 2074 ที่ไม่ได้จัดรูปแบบจะถูกปฏิเสธ ไม่เติมศูนย์ให้เอง
3. เก็บคำนำหน้าเต็มตามต้นฉบับและแยกชื่อ/นามสกุลภายใน; ม.1–6 ทั้งไม่มีห้องและแบบมีห้อง ไม่ตีความ ม.1 เป็น ม.1/1 ไม่สร้างเลขที่จากลำดับแถว
4. พรีวิวตรวจทุกแถว แม้แสดงหน้าละ 100 แถว เปิดหน้าถัดไปเพื่อดูข้อผิดพลาดท้ายไฟล์ได้ รหัสซ้ำในไฟล์ระบุทุกแถวที่ซ้ำ; รหัสที่มีแล้วไม่ถูกเขียนทับ
5. ตารางนักเรียนแสดง 3 คอลัมน์ พร้อมค้นหา/กรองระดับชั้นและห้อง เรียงตามชั้น ห้องและรหัส; หน้าละ 50 รายชื่อ
6. ใน Designer เลือก “โลโก้โรงเรียน”; บนมือถือเปิดส่วนโลโก้ใต้พรีวิว ภาพที่ผู้ใช้ให้เป็นค่าเริ่มต้น อัปโหลด PNG/JPG ใหม่ได้เมื่อโหมดนั้นพร้อม

## ภาพและการพิมพ์

- ภาพที่ผู้ใช้ให้: `public/omr-assets/school-logo.png`, 742 × 763 พิกเซล ชื่อโรงเรียนบนตรา: โรงเรียนกุงแก้ววิทยาคาร
- เปรียบเทียบ PNG IDAT กับไฟล์แนบต้นฉบับแล้วเท่ากัน: ไม่มีการเปลี่ยน pixel data เพิ่มเฉพาะ metadata ระบุที่มา ไม่ครอปพื้นขาว/ริบบอน ไม่สร้างภาพด้วย AI
- ไฟล์อัปโหลด PNG/JPG ไม่เกิน 5 MB, ขนาดไม่เกิน 20 ล้านพิกเซล/ด้านละ 10,000 พิกเซล; ปฏิเสธไฟล์เกินขอบเขต ไม่ย่อให้อย่างเงียบ ๆ
- การอัปโหลดทดลองเก็บ bytes เดิมเป็น data URL; การอัปโหลดจริงส่งไฟล์เดิมผ่าน server แบบ signed ไม่มี incoming resize/quality/format transformation
- พรีวิว SVG และ PDF ย่อเฉพาะขนาดวางภาพด้วยสัดส่วนเดียวกันในกรอบ 12 × 12 มม. ภาพ JPG ใช้ JPEG embedding ไม่แปลงเป็น PNG ผ่าน Canvas; ภาพ PNG คงข้อมูลภาพ/ความละเอียด
- เปลี่ยนค่าเริ่มต้นมีผลต่อใบที่กำลังแก้และแม่แบบใหม่เท่านั้น; แม่แบบที่บันทึกไว้/manifest ที่ดาวน์โหลดแล้วคง URL หรือภาพเดิม ไม่เขียนทับ public ID เก่า
- Cloudinary delivery ใช้ `fl_original` เพื่อไม่ให้การตั้งค่า optimize-by-default เปลี่ยนภาพที่ส่งเข้า PDF ตาม [เอกสาร Cloudinary](https://cloudinary.com/documentation/optimize_by_default_settings); การอัปโหลดใช้ signature ฝั่ง server ตาม [Upload API](https://cloudinary.com/documentation/upload_images)

## ตั้งค่าบริการจริงที่ยังต้องทำ

- ติดตั้ง migration `202610080003_roster_school_logo.sql` หลัง 001 และ 002 ผ่าน workflow ผู้ดูแล Supabase; `schema.sql` เป็น snapshot สำหรับฐานข้อมูลใหม่ อย่ารัน snapshot ซ้ำทับฐานข้อมูลเดิม
- เก็บ `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` ใน server environment เท่านั้น ไม่ส่ง secret ผ่านแชต ไม่ใช้ NEXT_PUBLIC_ ไม่ต้องใช้ service-role key ใน client
- ต้องมีผู้ใช้ Supabase Auth และ active school membership เป็น teacher/admin; `/api/cloudinary` ตรวจสิทธิ์และ origin, จำกัด payload, ตรวจรูปแบบภาพ, ตรวจ revision ก่อน upload และตอน RPC; บันทึก audit และเก็บ URL/public ID ใน Supabase
- `/api/students` อ่านรายชื่อ schema เก่าได้ระหว่างรอ migration แต่ปฏิเสธการนำเข้าใหม่ถ้าไม่มีคอลัมน์ใหม่ ป้องกัน RPC เก่าทิ้งคำนำหน้า
- ไม่ได้ apply migration, upload asset จริง, deploy หรือ push GitHub ในงานนี้
- ยังต้องทดสอบ teacher accounts สองโรงเรียน/Cloudinary จริง, network failures, เครื่องพิมพ์จริง และโทรศัพท์จริง โหมดทดลองเก็บใน localStorage อาจเต็มเมื่อใช้หลายภาพใหญ่ ระบบแสดงข้อผิดพลาด ไม่ควรใช้เป็นที่เก็บถาวร
- TODO: จัดการ orphaned Cloudinary uploads หลัง DB transaction ล้มเหลวโดยตรวจ reference ก่อนลบ; immutable template/manifest store จริงยังเป็น TODO เดิม ไม่มีระบบอ่าน QR/ฝนคำตอบเพิ่มในงานนี้

## ผลตรวจ

- Unit/domain/API/PGlite: 46 tests ผ่านใน 8 files; auth เป็น local stub ไม่ใช่ Supabase staging
- Browser: ชุดเดิม 6 tests ผ่าน; roster/logo ใหม่ 5 tests ผ่าน (CSV UTF-8 มี/ไม่มี BOM, prefix/leading zeros, legacy XLSX formatting, error pagination, filtering/reload, PNG/JPG original bytes และ PDF image dimensions)
- `typecheck`, `lint`, `build` ผ่าน; screenshot/a11y/overflow ของหน้าที่แก้ตรวจ desktop 1440 × 1000 และ mobile 390 × 844 ด้วย Chromium emulation ไม่ใช่โทรศัพท์จริง
- Detector รันครั้งเดียว exit 0; มี advisory เกี่ยวกับ token/CSS เดิม ไม่ปรับ visual system ทั่วแอป
- Independent finish review: **ship** เฉพาะ roster/logo prototype extension หลังถ่ายหลักฐานมือถือใหม่ตาม recapture verdict ไม่ใช่การรับรอง production readiness

## ไฟล์ที่แก้/เพิ่ม

- Student UI: `components/students/import-preview-table.tsx`, `components/students/student-table.tsx`
- Student validation/import: `types/student.ts`, `lib/import/parse-students.ts`, `normalize-name.ts`, `normalize-classroom.ts`; `app/api/students/route.ts`
- Logo/server: `types/school.ts`, `lib/omr/logo-image.ts`, `lib/cloudinary/upload.ts`, `app/api/cloudinary/route.ts`, `public/omr-assets/school-logo.png`
- Designer/preview/PDF: `components/omr/omr-generate-panel.tsx`, `omr-sheet-preview.tsx`, `lib/omr/generate-template.ts`, `lib/export/export-pdf.ts`
- Shared state/labels/styles: `components/layout/workspace-provider.tsx`, `main-shell.tsx`, `app/globals.css`
- Database: `supabase/migrations/202610080003_roster_school_logo.sql`, `supabase/schema.sql`; ไม่แก้ migration 001/002
- Tests: `tests/roster-logo.test.ts`, `cloudinary.test.ts`, `cloudinary-route.test.ts`, `student-api.test.ts`, `pdf.test.ts`, `rls.test.ts`, `tests/e2e/roster-logo.spec.ts`, `answer-sheets.spec.ts`
- Documentation: `README.md`, เอกสารฉบับนี้, `docs/ROSTER_LOGO_FINISH_REVIEW.md`, `docs/ROSTER_LOGO_DESIGN_EVIDENCE.md`, `.impeccable/surfaces/components-students-import-preview-table-tsx.md`; screenshots เป็น local ignored evidence
- รักษา PRODUCT.md, DESIGN.md, .impeccable/design.json, .env.local และ dependencies เดิม ไม่มีการย้ายโฟลเดอร์/เปลี่ยนชื่อไฟล์
