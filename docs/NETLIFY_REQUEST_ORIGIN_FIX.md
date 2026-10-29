# แก้แหล่งที่มาของคำขอหลังเข้าสู่ระบบ — 29 ตุลาคม 2569

อาการ: เปิดเว็บหรือเข้าสู่ระบบแล้วพบ `ORIGIN_DENIED` / “แหล่งที่มาของคำขอไม่ถูกต้อง” คำขอแรกที่เปิด workspace เป็น `POST /api/students` action `sync` ก่อนโหลดข้อสอบ/ตั้งค่า/สรุปงาน

## หลักฐานและสาเหตุ

ตรวจโค้ดพบการเทียบ `Origin` กับ `new URL(request.url).origin` ตรง ๆ ใน JSON body reader และ multipart สำหรับภาพสแกน/โลโก้ เมื่อเรียกเว็บหลัก `https://scansob.netlify.app` ตัว adapter ใช้ immutable deploy URL ภายใน จึงทำให้การตรวจนี้ปฏิเสธคำขอจากเว็บของเราเอง

ตรวจเว็บจริงแบบไม่ส่ง cookie/code และไม่แก้ข้อมูล: `GET /auth/callback?next=/dashboard` บนโดเมนหลักคืน 307 ไปยัง `https://6ae3351c95c208097f868f58--scansob.netlify.app/login?error=oauth` จึงยืนยันว่า route มองเห็น hostname ของ deploy แทนโดเมนที่ผู้ใช้เปิด ส่วน `/api/auth/status` รายงาน configured และ Google enabled ไม่ใช่ปัญหาคีย์หรือ SQL 020

Regression test จำลอง request URL ตามที่สังเกต แต่ `Origin` เป็นเว็บหลัก: โค้ดก่อนแก้คืน `ORIGIN_DENIED` หลังแก้รับได้

## การแก้

- `lib/supabase/request-origin.ts` เป็นแหล่งตรวจร่วม รองรับ origin ของ request ตามเดิม และ URL หลัก/ชื่อโดเมนเริ่มต้นของโครงการจาก reserved runtime metadata `URL`, `SITE_ID`, `SITE_NAME` ของ Netlify ตาม [เอกสาร Functions environment variables](https://docs.netlify.com/build/functions/environment-variables/#netlify-read-only-variables)
- ใช้กับ JSON APIs, multipart scan และ multipart logo รวม compatibility route เดิม ไม่เปลี่ยน Auth/RLS/สิทธิ์พื้นที่ ขนาดไฟล์ หรือการเก็บภาพ
- ไม่มี wildcard `.netlify.app` ไม่ยอมรับ origin ของไซต์อื่น และไม่ใช้ Host/X-Forwarded-* ที่ client ส่งมาเพิ่ม origin ที่อนุญาต
- OAuth callback เลือก URL หลักที่รู้จักเพื่อคง navigation กับ cookie ไว้บนโดเมนเดิม Host/forwarded-host ใช้เลือกได้เฉพาะหนึ่งใน URL ที่อนุญาตแล้ว ปลายทาง `next` ยังคงจำกัดเป็น relative in-app path เมื่อไม่มีข้อมูล Netlify ใช้ request URL ตามเดิม
- callback ของ deploy preview ที่ไม่ใช่โดเมนหลัก/alias ที่รู้จักจะกลับ URL หลัก ไม่ขยาย Supabase OAuth redirect allowlist อัตโนมัติ
- ไม่เพิ่ม env ใหม่ ไม่แก้ข้อมูล Supabase ไม่ต้องรัน SQL ซ้ำ และไม่ปิดการตรวจ Origin กรณี legacy ไม่มี Origin ยังคงพฤติกรรมเดิม โดยต้องผ่าน session และ workspace authorization

## ขอบเขตการตรวจ

Unit tests ตรวจ canonical/custom/default alias, immutable deploy URL, local server, invalid/null/cross-project origins, forged headers, OAuth success/failure/relative redirect และ authenticated JSON/logo/binary scan routes พร้อมชุด authorization และข้อมูลเดิม การทดสอบเหล่านี้ไม่แทนการเข้าสู่ Google ด้วยบัญชีจริงบน production

ผลในเครื่อง: regression เฉพาะจุด 60 รายการผ่าน; ชุดเต็ม 265 ผ่าน/2 ข้ามแบบเลือกเปิด; typecheck, lint และ production build แบบ Webpack ผ่าน ไม่เปลี่ยนไฟล์ schema/migrations หรือค่าระบบจริง

หลัง deploy ตรวจ callback แบบไม่มี code ต้องได้ Location กลับ `https://scansob.netlify.app/login?error=oauth` แล้วเปิด URL หลักและทดสอบ login/โหลด workspace ด้วยบัญชีของเจ้าของ ห้ามส่ง code, cookie หรือ token ลงแชตหรือ log
