# Smart Answer Sheet

เว็บพื้นที่ทำงานครูไทย Next.js App Router โครงการเดียว พร้อม UI และ PDF ทดลองที่ใช้งานบนเครื่องได้ **ยังไม่ใช่ระบบ OMR production** การตั้งค่า Supabase ไม่ใช่หลักฐานว่า schema/login/OMR ผ่านการทดสอบจริงแล้ว

## เริ่มในเครื่อง

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
npm run build
```

`npm test` รัน domain tests + PostgreSQL RLS/RPC ด้วย PGlite และ auth stub ในเครื่อง ไม่ต้องมี Docker ไม่ใช่การรับรอง Supabase staging

## เชื่อม Supabase staging

1. สร้างไฟล์ .env.local จาก .env.example ใส่ URL และ **publishable** key ของโครงการที่ผู้ใช้เป็นเจ้าของ ห้ามใส่ service-role key ใน NEXT_PUBLIC_*.
2. สำหรับฐานข้อมูลใหม่ ใช้ migrations/202610080001_foundation.sql แล้ว 202610080002_adaptive_answer_sheets.sql ตามลำดับ ผ่าน Supabase SQL editor/CLI. หากติดตั้ง foundation แล้ว ใช้เฉพาะ migration 002. schema.sql เป็น snapshot รวมสำหรับฐานข้อมูลใหม่ ไม่รันซ้ำกับ migrations. ตรวจ migration plan/backup ก่อน apply กับข้อมูลจริง; task นี้ไม่ได้รัน migration บน Supabase.
3. สร้างบัญชีครูใน Supabase Auth แล้วเข้าสู่ระบบ /login. ยังไม่มี self-service invite UI.
4. ผู้ดูแลโครงการสร้างโรงเรียน/สมาชิกผ่าน SQL editor ตามตัวอย่าง โดยแทน UUID ด้วย UID ของบัญชีจริง (ไม่ต้องนำ secret key มาใส่แอป).

```sql
insert into public.schools(name_th,created_by)
values ('ชื่อโรงเรียน', 'AUTH_USER_UUID');
-- trigger สร้าง admin ให้ผู้สร้างโรงเรียน
-- ผู้ดูแลโครงการเพิ่ม teacher/reviewer หลังยืนยันตัวตนและโรงเรียน:
insert into public.school_members(school_id,user_id,role)
values ('SCHOOL_UUID','OTHER_AUTH_USER_UUID','teacher');
```

5. restart npm run dev แล้วทดสอบ import/create exam. ไม่มี fallback ไปข้อมูลจำลองเมื่อเชื่อมจริงแล้วแต่โหลดล้มเหลว. ตรวจ RLS staging กับผู้ใช้สองโรงเรียนก่อนใช้ข้อมูลนักเรียน.
6. API รุ่นแรกเลือก active membership แรก; TODO active-school selector. Reviewer อ่านได้เฉพาะ exam ที่ได้รับ exam_access และไม่มีสิทธิ์ import/create exam.

## สิ่งที่ใช้ได้ตอนนี้

- Dashboard, คลังชุดสอบ/ตัวกรอง, สร้างชุดสอบ 1–60 ข้อ / 4–5 ตัวเลือก, แก้เฉลยเป็นเวอร์ชันใหม่, import XLSX/CSV พร้อม mapper/validation
- Supabase login/API และ migration สำหรับ school-scoped roster/exam drafts (ต้องตั้งค่าบริการก่อน)
- Designer: พรีวิวใบเดียวเรียลไทม์ จัดคอลัมน์อัตโนมัติ โลโก้รักษาสัดส่วน ช่องเขียนคะแนน และ Undo/Redo/Zoom; จำนวนข้อที่ต่างจากเฉลยต้องบันทึกเวอร์ชันใหม่ก่อนพิมพ์
- PDF ทดสอบ A4 แนวนอน 2 ใบซ้าย–ขวา หรือ 1 ใบเต็ม A4 เมื่อพื้นที่ไม่พอ; อักษรไทยอยู่ในวงฝน; manifest snapshot และ QR เดียวกันทั้ง exam/key/layout version ไม่บรรจุข้อมูลนักเรียน
- กล้องผ่าน getUserMedia, jscanify corner adapter + OpenCV local perspective crop และ manual corners
- ทดลองตรวจทาน/แก้ด้วยเหตุผล/ยืนยัน/ส่งออกข้อมูลสังเคราะห์ เฉพาะ development

## ข้อจำกัดสำคัญ

- ไม่ตรวจคะแนนจากภาพจริง ไม่อัปโหลดภาพ ไม่รัน worker/queue ไม่ publish คะแนนจริง
- ไม่ได้ deploy หรือ migrate โครงการ Supabase ของผู้ใช้
- กระดาษทุกขนาด/จำนวนข้อยังเป็นแม่แบบทดลอง ไม่ผ่านเครื่องพิมพ์/โทรศัพท์และตัวตรวจ OMR จริง; ห้ามใช้เก็บคะแนน
- PDF รายงานรายคน/ห้องเรียน, publish/version A-B, subject/class management, review server audit ยังเป็น TODO. QR ใหม่ยังไม่ได้ลงทะเบียน immutable template/lookup บน server; scanner ยังไม่ resolve QR หรืออ่านคำตอบจริง
- ต้องยืนยันข้อขัดแย้ง Cloudinary ↔ Supabase Storage และ single Next ↔ Python worker ก่อนขั้น integration

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
