# ติดตั้ง Supabase และ Google Login

อัปเดต 9 ตุลาคม 2569 · โปรเจกต์ `bbtgulutbvxeafktntxg` · เว็บ `https://scansob.netlify.app/`

## สิ่งที่แอปใช้

แอปใช้ `NEXT_PUBLIC_SUPABASE_URL` และ **publishable key** เท่านั้น ทั้งในเครื่องและ Netlify ผู้ใช้แต่ละคนเข้าสู่ระบบผ่าน Supabase Auth แล้ว API ใช้ session ของคนนั้นกับ RLS ไม่ใช้ service-role bypass และไม่ต้องใส่ Google Client Secret ใน repository หรือ Netlify

**คีย์ service-role ที่เคยส่งในแชตถือว่าเปิดเผยแล้ว** ก่อนใช้ข้อมูลนักเรียนจริง ให้ตรวจทุกระบบที่อาจใช้คีย์เดิม ย้ายไปคีย์ใหม่เฉพาะระบบที่จำเป็น แล้วปิด legacy keys ใน Settings → API Keys แอปนี้ใช้ publishable key อยู่แล้ว การสร้างคีย์ใหม่อย่างเดียวไม่ทำให้คีย์เก่าหมดอายุ อย่าส่งคีย์ลับผ่านแชตอีก ดู [ขั้นตอน Supabase สำหรับคีย์ที่เปิดเผย](https://supabase.com/docs/guides/getting-started/api-keys)

## ฐานข้อมูลใหม่

1. ตรวจว่า public ยังไม่มีตารางของแอปและสำรองข้อมูลหากมีข้อมูลเดิม
2. เปิด Supabase → SQL Editor ใช้ **supabase/schema.sql ทั้งไฟล์ครั้งเดียว** ซึ่งรวม migrations 001–005 อยู่ใน transaction เดียว มีตัวป้องกันรันซ้ำ และไม่มีข้อมูลนักเรียนที่ seed ไว้
3. ไม่รัน snapshot ซ้ำกับ migrations สำหรับฐานข้อมูลที่เคยติดตั้งแล้ว ให้ใช้เฉพาะ migration ที่ยังไม่ใช้ตามลำดับ ห้ามลบตารางเพื่อแก้ข้อผิดพลาด
4. ชุดนี้สร้างบัญชีสิทธิ์ พื้นที่ส่วนตัว รายชื่อ ชุดสอบ/เฉลย แม่แบบและทะเบียนชุดพิมพ์ audit และ private bucket `school-logos` ขนาดไม่เกิน 5 MB เฉพาะ PNG/JPEG ไม่มี public bucket และไม่มี anonymous-write policies

สถานะว่าติดตั้งจริงแล้วหรือยังให้อ้าง `docs/ACCOUNT_PRINT_IMPLEMENTATION.md` ไม่ใช่เพียงมีไฟล์ SQL อยู่

## Google Cloud

เข้าสู่ Google Cloud ด้วยบัญชีของคุณเอง หากยังไม่มีโปรเจกต์ ให้สร้าง/เลือกโปรเจกต์สำหรับเว็บนี้

1. Google Auth Platform → Branding: ชื่อแอป Smart Answer Sheet และอีเมลติดต่อของเจ้าของจริง อย่าสร้างนโยบายความเป็นส่วนตัวหรือโดเมนที่ไม่มีจริง
2. Audience: หากใช้ Gmail ทั่วไปเลือก External ระหว่าง Testing เพิ่ม `piyawatpiwsiri@gmail.com` เป็น test user บัญชีทดสอบของ Google ไม่ใช่สถานะอนุมัติภายในแอป หากจะเปิดให้บุคคลอื่นต้องจัดการ audience/publishing ของ Google ให้เหมาะสมก่อน
3. Data Access ใช้เฉพาะข้อมูล sign-in (`openid`, email, profile) ไม่ขอ Gmail inbox, Drive หรือสิทธิ์ที่แอปไม่ใช้
4. Clients → Create client → **Web application**
5. Authorized JavaScript origins: `https://scansob.netlify.app` สำหรับทดสอบในเครื่องอาจเพิ่ม `http://127.0.0.1:3000` และ `http://localhost:3000` อย่าเพิ่ม wildcard
6. Authorized redirect URI: **`https://bbtgulutbvxeafktntxg.supabase.co/auth/v1/callback`** ไม่ใช่ URL callback ของ Next.js
7. นำ Client ID/Client Secret ใส่ใน Google Provider ของ Supabase โดยตรง เก็บ secret ในผู้ให้บริการเท่านั้น ไม่ส่งในแชตและไม่ commit ไฟล์ดาวน์โหลด credentials

อ้างอิง [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google) และ [Google OAuth redirect requirements](https://developers.google.com/identity/protocols/oauth2/web-server)

## Supabase Auth

1. Authentication → Sign In / Providers → Google: เปิด provider ใส่ Client ID/Secret จาก Web application แล้ว Save อย่าปิด nonce/security checks เพื่อให้ล็อกอินผ่าน
2. Authentication → URL Configuration:
   - Site URL: `https://scansob.netlify.app`
   - Redirect URLs: `https://scansob.netlify.app/auth/callback`
   - ถ้าทดสอบในเครื่อง: `http://127.0.0.1:3000/auth/callback` และ `http://localhost:3000/auth/callback`
3. หน้า `/login` ใช้ Google เท่านั้น callback ฝั่ง Next.js แลก code เป็น session (PKCE) ปลายทางภายในเว็บเท่านั้น ไม่มี open redirect
4. เปิด `/login` ด้วย Gmail เจ้าของ ระบบจะให้ owner เฉพาะเมื่อ Supabase ยืนยัน Google identity, อีเมลตรง และยืนยันอีเมลแล้ว ไม่แต่งตั้งคนแรกที่ล็อกอินโดยอัตโนมัติ และไม่อ่าน role จาก user_metadata

อ้างอิง [Supabase redirect allowlist](https://supabase.com/docs/guides/auth/redirect-urls)

## ตั้งค่าบน Netlify

- ใช้ Node ที่เข้ากับ package-lock (ในเครื่องใช้ Node 24)
- ตั้ง `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_DEMO_MODE=false` ใน environment ของเว็บ แล้ว build/redeploy เพราะ NEXT_PUBLIC ค่าถูกฝังตอน build
- โฮสต์ต้องรองรับ Next.js 16 App Router/API/SSR ไม่ใช่ export เว็บ static
- ไม่ใส่ service-role, JWT secret หรือ Google Client Secret ใน NEXT_PUBLIC หรือ source code
- ใช้ HTTPS สำหรับกล้องโทรศัพท์

## ขั้นแรกหลังล็อกอิน

เจ้าของเปิด การตั้งค่า → บันทึกโรงเรียน/ปี/ภาคเรียน/รายวิชา → กดใช้โลโก้ต้นฉบับที่แนบหรืออัปโหลด PNG/JPG → นำเข้ารายชื่อ 3 คอลัมน์ → สร้างข้อสอบจากชั้นที่มีจริง → ตรวจเฉลย → บันทึกเลย์เอาต์ → พิมพ์รายบุคคล

ผู้ใช้ใหม่ล็อกอินแล้วอยู่หน้า “รออนุมัติ” เจ้าของเปิด การตั้งค่า → จัดการสิทธิ์ผู้ใช้ → เลือกบัญชี → ระบุเหตุผล → ยืนยันอนุมัติ ผู้ใช้กดตรวจสถานะอีกครั้ง/กลับเข้าเว็บจึงเปิดพื้นที่ตัวเองได้ การอนุมัติไม่ได้คัดลอกนักเรียนหรือข้อสอบเจ้าของไปให้บัญชีอื่น

เจ้าของกดเปิดดูพื้นที่ผู้ใช้เพื่ออ่านข้อมูล แถบอ่านอย่างเดียวแสดงตลอด กลับพื้นที่ของฉันก่อนบันทึกงานของตัวเอง ไม่มีสิทธิ์เขียนข้ามพื้นที่ทั้ง UI/API/RLS

## เกณฑ์ตรวจรับก่อนข้อมูลจริง

- owner Google → approved และ owner; บัญชีอีกคน → pending และไม่อ่านตารางนักเรียนได้
- owner อนุมัติ → อีกบัญชีเห็นพื้นที่ว่างของตัวเองเท่านั้น
- สลับบัญชีบนเครื่องเดียว ข้อมูลเก่าไม่ติดค้าง
- owner เปิดดู → อ่านได้ แต่ import/create/save อื่นถูกปฏิเสธ
- ระงับบัญชี → session เดิมเรียก API/ตาราง/Storage ใหม่ไม่ได้ โลโก้ที่เคยได้รับ signed URL อาจยังดูได้จนครบ 600 วินาที ไฟล์ที่ดาวน์โหลดแล้วไม่เรียกคืนได้
- เปลี่ยนโลโก้ → ไฟล์ใหม่ครบ bytes และกรอบรักษาสัดส่วน ลบไฟล์เดิมหลังสลับสำเร็จ หากลบไม่สำเร็จแสดงคิวและปุ่มลองใหม่ ไม่แสดงว่าลบครบโดยไม่มีหลักฐาน
- พิมพ์ 2 คน → ชื่อ/รหัสต่างกัน QR เหมือนกัน รหัส `02074` มีศูนย์นำหน้าและ ID ฝนดำ 5 ตำแหน่ง คำตอบไม่ถูกฝนให้
- ตรวจทะเบียน print jobs/templates/sheets กับ PDF และทดสอบเครื่องพิมพ์ขนาดจริง 100% ก่อนทดลองสแกน

**ยังไม่ใช่ระบบให้คะแนนภาพจริง** การตรวจรอยฝน การจับคู่รหัสจากภาพ การตรวจซ้ำ ผลคะแนน/audit review และรายงานคะแนนจริงต้องทดสอบอีกขั้น ห้ามนำหน้าทดลองไปใช้ตัดสินคะแนนนักเรียน
