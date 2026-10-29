# ถังขยะทะเบียนโรงเรียนและโฉมใหม่ — 28 ตุลาคม 2569

งานนี้ทำในเครื่อง ไม่เปลี่ยน production schema/data/env ไม่สั่ง deploy และไม่เพิ่มสิทธิ์เจ้าของให้เขียนงานของครูคนอื่น SQL 013–018 เป็นงานรอบก่อนที่ผู้ใช้แจ้งว่ารันแล้ว แต่รอบนี้ไม่ได้ตรวจฐานข้อมูลจริง

## พฤติกรรมที่อนุมัติ

เจ้าของระบบเปิด นักเรียนและห้องเรียน → ทะเบียนโรงเรียน → เลือกโรงเรียน → ย้ายโรงเรียนเข้าถังขยะ ตรวจจำนวนรายชื่อ ห้อง และพื้นที่ที่ติดตาม แล้วพิมพ์ชื่อโรงเรียนให้ตรงก่อนยืนยัน ถังขยะอยู่ในหน้าต่างทะเบียนโรงเรียน เปิดดูวันครบกำหนดและกดกู้คืนได้ก่อนครบ 14 วัน ตามเวลาของฐานข้อมูล แสดงเวลาท้องถิ่นกรุงเทพฯ

- เจ้าของเท่านั้นที่ย้ายหรือกู้คืนทั้งโรงเรียน ผู้ดูแลทะเบียนและครูทำไม่ได้ การตรวจพื้นที่ครูอื่นของเจ้าของยังเป็นอ่านอย่างเดียว
- ทะเบียนที่อยู่ในถังขยะหายจากรายการเลือก อ่าน/แก้ข้อมูลกลาง นำเข้า และสมัครติดตามใหม่ไม่ได้ รายชื่อที่ครูมีอยู่แล้วยังคงใช้ได้และหยุดอัปเดตกลาง การถอนสิทธิ์/ระงับบัญชีและข้อยกเว้นท้องถิ่นยังมีผลตามเดิม
- กู้คืนก่อนหมดเวลาแล้ว การติดตามห้องเดิมที่ยังมีสิทธิ์กลับมาทำงานตามรอบ sync ปกติ ไม่คืนรายชื่อที่ครูเคยแยกหรือนำออกเอง
- เมื่อพ้นกำหนด งานรายชั่วโมงตัดการเชื่อมของสำเนาในพื้นที่ครูเป็นรายชื่อส่วนตัว โดยเก็บรหัส UUID ชื่อและสถานะเดิม จากนั้นลบรายชื่อกลาง สิทธิ์กลางและการติดตามของทะเบียนนั้น คะแนน ข้อสอบ งานพิมพ์ ภาพสแกน และ snapshots เก่าไม่ถูกลบ
- ไม่ลบโรงเรียน/พื้นที่ทำงานครูใน `public.schools` การลบทะเบียนกลางไม่ใช่การลบบัญชีหรือการลบข้อมูลทั้งระบบ
- กู้คืนหลังพ้น 14 วันไม่ได้ แม้งานลบรอบถัดไปยังไม่ทำงาน การลบถาวรเกิดในรอบงานแรกที่ทำสำเร็จหลังครบกำหนด จึงอาจช้ากว่าเวลาเส้นตายได้

## SQL ที่ต้องติดตั้งเพิ่ม

สำรองข้อมูลและตรวจบน staging ก่อน รันด้วยสิทธิ์ `postgres` ใน Supabase SQL Editor ตามลำดับ หลังตรวจว่ามี installation marker 018 แล้ว:

1. `supabase/migrations/202610280019_directory_lifecycle.sql` — คอลัมน์ถังขยะ, RPC/สิทธิ์, freeze sync, request receipts และ private cleanup
2. `supabase/migrations/202610280020_directory_cleanup_cron.sql` — เปิด pg_cron หากยังไม่มี และตั้งงาน `scansob-school-directory-trash`

แต่ละไฟล์เป็น transaction และติดตั้งครั้งเดียว ถ้าล้มเหลวให้ rollback transaction ก่อนแก้และลองใหม่ ไม่รันไฟล์ก่อนหน้าซ้ำ ถ้า 020 แจ้ง extension ไม่พร้อม ให้เปิด Supabase Cron/pg_cron ใน Dashboard แล้วลอง 020 ใหม่ อ้างอิง [คู่มือติดตั้ง Supabase Cron](https://supabase.com/docs/guides/cron/install)

งานทำทุกชั่วโมงที่นาที 17 เรียก `private.purge_school_directories(5)` ภายในฐานข้อมูลเดียว ไม่ใช้ Edge Function, API key, cron ภายนอกหรือ Netlify Function ก่อนตั้งงานสำเร็จ UI จะไม่อนุญาตย้ายทะเบียนเข้าถังขยะ

ตรวจแบบอ่านอย่างเดียวหลังติดตั้ง:

```sql
select version from private.app_installation
where version in ('202610280019', '202610280020') order by version;

select jobid, jobname, schedule, command, active, username
from cron.job where jobname = 'scansob-school-directory-trash';

select status, return_message, start_time, end_time
from cron.job_run_details
where jobid in (select jobid from cron.job
  where jobname = 'scansob-school-directory-trash')
order by start_time desc limit 10;
```

ต้องได้ marker ทั้งสอง และงาน active รันใน role postgres คำสั่งตรงกับ private function ผลรอบแรกอาจยังไม่มีจนถึงนาที 17 งานที่ไม่มีรายการครบกำหนดควรสำเร็จและคืน 0 ตรวจประวัติงานจากหน้า Supabase Cron ด้วย อย่าเปิด private schema ให้ PostgREST หรือให้ authenticated/service_role เรียก purge

เมื่อฐานข้อมูลถูกพัก งานตามเวลาก็ไม่ทำงานจนกลับมาใช้งาน ตรวจสถานะ job หลัง restore/migration/เปลี่ยนการตั้งค่าโครงการเสมอ ไม่ถือว่ามีชื่อ job เท่ากับพิสูจน์ว่าทำงานสำเร็จ

## การทดสอบและขอบเขต

ชุด `tests/directory-lifecycle.test.ts` ใช้ PGlite กับรายชื่อสังเคราะห์: owner confirmation, scheduler readiness, teacher/pending denial, freeze/read isolation, restore, stale revision, retry, deadline และ purge โดยคง confirmed result/snapshot ส่วน browser fixture เรียก RPC จริงในฐานข้อมูลจำลอง ไม่แตะ production PGlite ไม่มี pg_cron จึงจำลองเฉพาะ metadata readiness; การรันงานตามเวลาจริงต้องตรวจจาก staging/production ตาม SQL ข้างบน

RPC เดิมคงชื่อสาธารณะไว้ผ่าน wrappers ตรวจ lifecycle ฟังก์ชันเก่าถูกย้ายเข้า private และถอน execute เพื่อไม่เปิดช่องข้าม guard การลบใช้ transaction เดียว จำกัด 5 โรงเรียนต่อรอบ ใช้ workspace locks และข้ามพื้นที่ที่กำลังใช้งานเพื่อ retry รอบหน้า ไม่มี client endpoint สำหรับ purge

## ถ้าต้องหยุดหรือย้อนกลับ

เลือก forward fix ก่อน เก็บ migration 019 ไว้เพื่อรักษา freeze และสิทธิ์ ขณะตรวจปัญหาสามารถหยุดเฉพาะ job นี้ใน Supabase Cron ห้าม drop extension เพราะจะกระทบงานอื่น การปิดงานทำให้รายการเก่ารอค้างและย้ายโรงเรียนใหม่ไม่ได้ ต้องเปิดงานกลับและตรวจ run history หลังแก้ ไม่ลบตาราง/คอลัมน์/UUID หรือคืน backup ทับคะแนนใหม่ ไม่มี destructive down migration และกู้ข้อมูลกลางที่ purge สำเร็จแล้วผ่านปุ่มกู้คืนไม่ได้

## UI และประสิทธิภาพ

เปลี่ยน shell/tokens/controls เป็นกรมท่า–น้ำเงิน–เขียวน้ำทะเล โดยไม่แตะพิกัดกระดาษ QR หรือ scoring ฟอร์มจัดกลุ่มรายละเอียดกับภาคเรียน แยกพื้นที่เลื่อนจากแถวปุ่มบนมือถือ/iPad เฉลยเริ่มว่าง มีจำนวนข้อที่เลือกแล้ว ปุ่มบันทึกเปิดเมื่อเฉลยครบและคะแนนถูกต้อง ล้างจำนวนข้อเพื่อพิมพ์ใหม่ได้ ย่อ/ขยายจำนวนข้อยังคงค่าที่กรอกในรอบนั้น เปลี่ยน 5→4 ยกเลิก จ และแจ้งให้เลือกใหม่

ใช้ Impeccable สำหรับ craft/ตรวจ responsive และแนว state/focus/inline validation จาก [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) ไม่เพิ่ม Python dependency ศึกษา [React Three Fiber](https://github.com/pmndrs/react-three-fiber) แล้วไม่เพิ่ม runtime 3D เพราะไม่ได้ช่วยงานกรอกข้อมูลและสแกนนี้ ไม่มีการแสดง quota หรือปรับตำแหน่งเพื่อหลบป้าย Netlify

## ไฟล์และผลตรวจในเครื่อง

- ฐานข้อมูล: migrations `202610280019_directory_lifecycle.sql`, `202610280020_directory_cleanup_cron.sql`
- คำสั่ง/API: `types/roster.ts`, `lib/import/roster-api.ts` ใช้ route `/api/students` เดิม
- UI: `components/students/student-directory.tsx`, `components/exams/exam-form.tsx`, `components/ui/primitives.tsx`, `components/layout/main-shell.tsx`, `app/globals.css`, `app/layout.tsx`
- เอกสาร: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `README.md`, `.impeccable/design.json`, `.impeccable/surfaces/app-layout-tsx.md`, คู่มือนี้และ `STUDENT_ROSTER_IMPLEMENTATION.md`
- ทดสอบ: `tests/directory-lifecycle.test.ts`, `tests/student-api.test.ts`, `tests/e2e/exam-theme.spec.ts` และ browser fixtures/roster-management/settings-exam/workspace/pastel-print ที่เกี่ยวข้อง

วันที่ตรวจ 29 ตุลาคม 2569: Vitest ผ่าน 238 รายการ ข้าม 2 รายการแบบเลือกเปิด (print artifact QA และ receiver fixture ของอีกโปรเจกต์); browser tests 23 กรณีผ่าน รวม 12 connected-account/roster cases, 2 exam-key cases, 4 print/palette cases และ 5 settings/workspace cases จากนั้นทดสอบยืนยันหน้าต่างถังขยะซ้ำหลังแก้ชั้น backdrop แล้ว ผ่าน `typecheck`, `lint`, `build --webpack` การตรวจ axe ครอบคลุมหน้าฟอร์ม/เฉลยและหน้าหลักทั้งเก้าหน้าบนขนาดที่ระบุในชุดทดสอบ ไม่ใช่การรับรอง WCAG ทั้งระบบหรือการทดสอบกล้องจริง

Production SQL, งาน cron จริง, Google OAuth จริง และ deployment ยังไม่ได้ตรวจหรือเปลี่ยนในรอบนี้

Impeccable finish review รอบแรกพบ 3 ประเด็น: ชั้นหน้าต่างยืนยันลบ, รูปแบบ seed reference และเอกสารธีมเก่า แก้แล้วถ่ายภาพซ้ำ ผู้ตรวจให้ `ship` สำหรับการแก้ทั้ง 3 ประเด็นนี้ เอกสาร DESIGN/sidecar ผ่านการตรวจ schema และตรงกับ root colors 26 ค่า ไม่มี raster ใหม่ที่นำขึ้นใช้งาน
