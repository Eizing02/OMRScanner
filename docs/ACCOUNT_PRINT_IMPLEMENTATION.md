# สรุประบบบัญชีและการพิมพ์รายบุคคล

อัปเดต 9 ตุลาคม 2569 · repository `D:/Omr scanner`

## สถานะที่ยืนยันได้

ส่วนเสริมที่อนุมัติทำแล้วในโค้ดและผ่านการทดสอบในเครื่อง: Google sign-in flow, การอนุมัติบัญชี, พื้นที่ส่วนตัว, แอดมินเปิดดูแบบอ่านอย่างเดียว, การตั้งค่าโรงเรียน/วิชา, โลโก้ Supabase Storage, ชั้นจากรายชื่อจริง และกระดาษคำตอบรายบุคคลพร้อมทะเบียนพิมพ์

**ยังไม่ใช่ระบบตรวจคะแนน OMR ครบวงจร และยังไม่ได้ยืนยันการทำงานบนเว็บ production** ไม่ใช้ผล unit tests หรือ mock browser tests แทนการล็อกอิน Google/สแกนกระดาษจริง

| ส่วน | สถานะจริงรอบนี้ |
|---|---|
| Supabase project | ตรวจ dashboard ของ `bbtgulutbvxeafktntxg` ได้ |
| ฐานข้อมูล public | ตรวจพบว่ายังไม่มีตารางก่อนติดตั้ง |
| Auth users | ตรวจพบ 0 บัญชี |
| Storage | ยังไม่มี bucket และไม่มี policies บน `storage.objects` ก่อนติดตั้ง |
| SQL | รวม migrations 001–005 ใน `supabase/schema.sql` transaction เดียว ทดสอบติดตั้ง/ป้องกันรันซ้ำแล้ว เตรียมใน SQL Editor แต่ **ยังไม่ได้กด Run** รอการยืนยันติดตั้งสิทธิ์บนคลาวด์ |
| Google Provider | `/auth/v1/settings` ยืนยันว่า Google ยังปิดอยู่ ต้องมี OAuth Client ID/Secret และตั้ง redirect ก่อน |
| เว็บออนไลน์ | ทราบ origin `https://scansob.netlify.app/` แต่รอบนี้ไม่ได้ push/deploy หรือทดสอบ Google บนเว็บนั้น |
| คีย์ลับที่เปิดเผย | ไม่ใช้ service-role ที่เคยส่งในแชต ต้องจัดการยกเลิกคีย์เดิมก่อนนำข้อมูลนักเรียนจริงเข้า |

ข้อความ “Success. No rows returned” ในภาพ SQL Editor เป็นผล **SELECT ตรวจฐานข้อมูลเดิม** ไม่ใช่หลักฐานติดตั้ง snapshot แล้ว

## วิธีทำงานเมื่อเปิดระบบจริงแล้ว

1. ครูเข้าหน้า `/login` ใช้บัญชี Google ผ่าน Supabase Auth/PKCE ไม่ต้องตั้งรหัสผ่านของเว็บ
2. ระบบตรวจ Google identity และ verified email เจ้าของ `piyawatpiwsiri@gmail.com` ได้ role owner/approved คนอื่นเริ่ม pending ไม่แต่งตั้งคนแรกที่ล็อกอินให้เป็นแอดมิน และไม่เชื่อ role ที่ผู้ใช้แก้ใน metadata
3. เจ้าของเปิด การตั้งค่า → จัดการสิทธิ์ผู้ใช้ ระบุเหตุผลและยืนยันอนุมัติ/ปฏิเสธ/ระงับ มี audit ของการเปลี่ยนสิทธิ์
4. ผู้ได้รับอนุมัติมี workspace ของตัวเอง นักเรียน ข้อสอบ เฉลย การตั้งค่า โลโก้ และชุดพิมพ์ไม่ถูกคัดลอกจากบัญชีอื่น
5. ตั้งชื่อโรงเรียน ปี/ภาคเรียน และวิชาที่ใช้บ่อย อัปโหลดโลโก้ แล้วนำเข้ารายชื่อ 3 คอลัมน์ `รหัสประจำตัว`, `ชื่อ-สกุล`, `ชั้น` รหัส 5 หลักเป็น string เช่น `02074` คงศูนย์นำหน้า ไม่เก็บรหัสผ่านจาก SQL เก่า
6. สร้างข้อสอบ: กรอกชื่อ เลือกวิชา/ประเภท/ชั้น/ปี/ภาคเรียน ชั้นมีเฉพาะในรายชื่อจริงของพื้นที่นั้น เช่น `ม.1/1`, `ม.1/2`, `ม.6` ไม่มีรายชื่อจะไม่สร้างห้องขึ้นเองและบล็อกการสร้างข้อสอบ
7. ทำเฉลย ตรวจจำนวนข้อ/ตัวเลือก บันทึกเลย์เอาต์ แล้วเลือกนักเรียนทั้งหมดหรือบางคนก่อนพิมพ์ ตรวจพรีวิวรายบุคคลหนึ่งใบ หรือเลือกใบสำรองว่าง
8. โหมดเชื่อมต่อจะลงทะเบียนชุดพิมพ์ในฐานข้อมูลก่อนสร้าง PDF ใช้ชื่อ/รหัส snapshot จาก transaction ไม่ใช้ข้อความระบุนักเรียนที่ส่งจาก client เอง

เจ้าของเลือก “เปิดดูพื้นที่” ได้ แต่เขียน/นำเข้า/สร้างงานข้ามพื้นที่ไม่ได้ทั้ง UI, API และ RLS มีแถบอ่านอย่างเดียวและปุ่มกลับพื้นที่ตัวเอง การรีโหลดหน้าเต็มจะกลับพื้นที่ของตัวเอง; การนำทางภายในแอปรักษาพื้นที่ที่กำลังเปิดดู

## สิทธิ์และ session

- API ใช้ publishable key กับ session ของผู้ใช้ ไม่ใช้ service-role bypass ตรวจ approved status ทุกคำขอ
- `x-workspace-id` เป็นเพียงตัวเลือกพื้นที่ ไม่ใช่สิทธิ์ ตรวจ UUID, เจ้าของ และความเป็นเจ้าของพื้นที่ซ้ำที่ API/ฐานข้อมูล
- anon/pending/rejected/suspended ไม่เปิด workspace หรืออ่านข้อมูลส่วนตัว ไม่ fallback เป็น demo เมื่อเชื่อมต่อจริงล้มเหลว
- ล้างข้อมูลและยกเลิกคำขอเมื่อเปลี่ยนบัญชี/พื้นที่ ป้องกันคำขอเก่ากลับมาเติมข้อมูลบัญชีใหม่ ข้อมูลจริงไม่เก็บใน demo localStorage
- ตรวจสถานะใหม่เมื่อกลับมาโฟกัส/เปิดแท็บ และเมื่อตอบกลับ 401/403 การระงับมีผลกับคำขอ API/DB/Storage ใหม่ แม้ผู้ใช้ยังมี session เดิม
- ออกจากระบบเฉพาะ session ในเครื่องนี้ ไฟล์ที่เคยดาวน์โหลดไม่สามารถเรียกคืน และ signed logo URL ที่ออกแล้วอาจใช้ได้จนครบ 600 วินาที

## โลโก้

ใช้ private bucket `school-logos` รับ PNG/JPEG จริงไม่เกิน 5 MB / 20 ล้านพิกเซล ตรวจชนิดจาก bytes เก็บไฟล์ต้นฉบับ ไม่ resize/re-encode ไม่เปลี่ยนสัดส่วน ปรับเฉพาะขนาดที่แสดงในพรีวิว/PDF ครูเจ้าของพื้นที่กดใช้ตราโรงเรียนต้นฉบับที่แนบไว้ได้

เมื่อเปลี่ยนโลโก้: upload ใหม่ → ตรวจ revision และสลับ pointer ใน transaction → เข้าคิวภาพเก่าก่อนลบ → ตรวจ metadata ว่าลบจริงก่อนปิดงาน หากลบไม่สำเร็จมีสถานะค้างและปุ่มลองใหม่ ไม่ลบโลโก้ปัจจุบันแม้ response สูญหายหรือเปลี่ยนพร้อมกัน ไม่เปิดไฟล์ค้างในคิวให้กลับมาใช้ใหม่

งาน cleanup ไม่ใช่ background worker ที่รับรองว่าจะลบเองตลอดเวลา ต้องมีคำขอ cleanup/ลองใหม่หากเกิดข้อผิดพลาด พิมพ์ข้อสอบเดิมใหม่ใช้โลโก้ล่าสุด PDF ที่ดาวน์โหลดไปแล้วไม่เปลี่ยน แม่แบบ/hash ไม่เก็บ URL ของโลโก้

Cloudinary helpers ยังสงวนไว้สำหรับ **ภาพสแกน OMR** ตาม AGENTS.md โลโก้ไม่ใช้ Cloudinary และยังไม่มี scan-image upload pipeline ที่ใช้งานจริง

## กระดาษคำตอบและ QR

- พิมพ์ชื่อ ชั้น รหัสตามรายชื่อ ตรวจชื่อของตัวเองแล้วฝนคำตอบเท่านั้น รหัสมี 5 วงดำทึบ ไม่มีตัวเลขสีขาวเจาะวงที่ฝน
- ตัวเลือก `ก ข ค ง` หรือ `ก ข ค ง จ` อยู่ในวงฝน จำนวนข้อ 1–60 ปรับคอลัมน์อัตโนมัติ
- พรีวิวหนึ่งใบ; PDF A4 แนวนอนแบ่งซ้าย–ขวานักเรียนคนละคน ถ้ามีจำนวนคี่ครึ่งสุดท้ายว่าง เมื่อพื้นที่/ข้อความไม่พอเปลี่ยนเป็นหนึ่งคนเต็ม A4 ไม่ย่อวงฝน
- QR เป็น opaque token ร่วมของ exam/key/layout version เดียวกัน ไม่ใช่ QR รายบุคคล ตัวตนต้องอ่านจากรหัส 5 หลักแยกต่างหากใน scanner ที่ยังต้องพัฒนา
- บันทึก `omr_layouts` ต่อ exam version และทะเบียน immutable `omr_templates`, `print_jobs`, `omr_sheets` พร้อมพิกัด/hash/snapshot นักเรียน มี compound FK และตรวจ geometry/hash/text-fit ที่ DB ด้วย
- request ID ทำให้ retry ไม่สร้างชุดซ้ำ หากรายชื่อแก้หลังพิมพ์ retry ใช้ snapshot เดิม ไม่เปลี่ยนกระดาษเก่าให้เป็นชื่อใหม่ เฉลยของรุ่นที่มีชุดพิมพ์ถูกล็อก ต้องสร้างรุ่นใหม่เมื่อแก้
- ตรวจ PDF จริงสองใบ/หนึ่งแผ่นและ 60 ข้อ/เต็มแผ่นแล้ว แต่ **ยังต้องพิมพ์ขนาด 100% ทดสอบเครื่องพิมพ์/โทรศัพท์จริง** ไม่ตั้ง printer เป็น 2 pages per sheet อีกครั้ง เพราะ PDF จัดสองใบให้แล้ว

## การเชื่อมต่อและไฟล์ฐานข้อมูล

ใช้ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` และ production `NEXT_PUBLIC_DEMO_MODE=false` ฝั่ง Netlify ค่า NEXT_PUBLIC ถูกฝังตอน build จึงต้อง redeploy เมื่อแก้ ไม่มี Google Client Secret หรือ service-role ใน client code

snapshot มีตาราง foundation ของโรงเรียน/สมาชิก/นักเรียน/ข้อสอบ/รุ่น/เฉลย/audit ตาม migrations 001–003 ตามด้วยบัญชีสิทธิ์/access audit/cleanup และทะเบียนพิมพ์ตาม 004–005 ไม่ได้สร้างระบบ scan results ที่ยังไม่ implement เพียงเพื่ออ้างว่าครบ Blueprint

ฐานข้อมูลใหม่ใช้ snapshot **ครั้งเดียว** มี guard ตรวจตาราง/bucket/Storage policies เดิม ไม่มีการลบข้อมูลเพื่อแก้ schema conflicts และไม่มี seed นักเรียน เลขเวอร์ชันติดตั้ง `202610090005` อยู่ใน `private.app_installation` ไม่รัน snapshot ทับฐานข้อมูลที่เคยติดตั้งแล้ว

API สำคัญ: `/api/auth/status`, `/auth/callback`, `/api/me/context`, `/api/admin/users`, `/api/settings`, `/api/settings/logo`, `/api/settings/logo/cleanup`, `/api/students`, `/api/exams`, `/api/omr-layouts`, `/api/omr-sheets` ตรวจ input และคืน JSON พร้อม private/no-store ตามขอบเขตข้อมูล ส่วน `/api/cloudinary` เป็น compatibility path ของ logo API ไม่ใช่หลักฐานว่า upload ภาพสแกนเสร็จ

คู่มือทีละขั้นอยู่ที่ [SUPABASE_GOOGLE_SETUP.md](SUPABASE_GOOGLE_SETUP.md) โดยใช้ Supabase callback ใน Google Cloud: `https://bbtgulutbvxeafktntxg.supabase.co/auth/v1/callback` และ Next callback allowlist: `https://scansob.netlify.app/auth/callback` สอง URL นี้มีหน้าที่ต่างกัน

## หลักฐานทดสอบรอบนี้

| คำสั่ง/หลักฐาน | ผล |
|---|---|
| `npm test` | 81 ผ่าน / 14 test files |
| `npm run test:e2e` | 15 ผ่าน / 1.4 นาที |
| `npm run test:accounts` | 4 ผ่าน; หลังแก้ hook warnings ทดสอบซ้ำ 4 ผ่าน |
| `npm run typecheck` | ผ่าน |
| `npm run lint` | ผ่าน ไม่มี warning/error หลังแก้ hooks |
| `npm run build` | ผ่าน Next.js 16.4 production build / routes / proxy หลังแก้ runtime declaration ของ compatibility route |
| `git diff --check` | ผ่าน มีเฉพาะข้อความ LF/CRLF ของ Git ไม่มี whitespace error |
| PDF render | ตรวจ personalized-20 หนึ่งหน้า และ personalized-60 สองหน้า ชื่อต่างกัน/QR ร่วม/รหัสศูนย์นำหน้า/วงดำ 5 จุด/คำตอบว่าง |

PostgreSQL tests ใช้ PGlite กับ Supabase Auth/Storage stubs; API tests mock SDK; account browser tests mock Auth และ endpoints **ไม่ใช่ live Supabase E2E** Browser tests เดิมยังตรวจกล้อง/ขอบ/warp ด้วย synthetic camera fixture มี responsive/axe ใน states ที่กำหนด ไม่ใช่ WCAG certification หรือ OMR accuracy benchmark

## ไฟล์สำคัญที่เพิ่ม/แก้

รอบนี้รักษาไฟล์เดิมที่มีงาน roster/logo อยู่ ไม่ย้าย/เปลี่ยนชื่อโฟลเดอร์ ไม่เขียนทับไฟล์นอกงาน

- Account/security: `types/access.ts`, `components/layout/auth-provider.tsx`, `main-shell.tsx`, `workspace-provider.tsx`, `app/layout.tsx`, `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/api/auth/status/route.ts`, `app/api/me/context/route.ts`, `app/api/admin/users/route.ts`, `lib/supabase/api.ts`, `redirect.ts`, `proxy.ts`
- Settings/logo/exam: `app/settings/page.tsx`, `app/api/settings/**`, `app/api/cloudinary/route.ts`, `lib/supabase/school-logo.ts`, `types/school.ts`, `components/exams/exam-form.tsx`, `components/students/import-preview-table.tsx`, scoped additions ใน `app/globals.css`
- Personalized print: `components/omr/omr-sheet-preview.tsx`, `omr-generate-panel.tsx`, `components/export/report-preview.tsx`, `lib/omr/generate-template.ts`, `qr.ts`, `lib/export/export-pdf.ts`, `types/print.ts`, `app/api/omr-layouts/route.ts`, `app/api/omr-sheets/route.ts`
- SQL: migrations `202610090004_accounts_storage.sql`, `202610090005_print_registry.sql`, combined `supabase/schema.sql` (รวม roster/logo migration 003 ที่มีอยู่)
- Tests/config: account/API/RLS/Storage/print/registry/schema tests, `tests/e2e/accounts.spec.ts`, `settings-exam.spec.ts`, updated answer-sheets/roster/workspace tests, `playwright.accounts.config.ts`, `playwright.config.ts`, `package.json`, `.gitignore`, `.github/workflows/web-checks.yml` เพิ่มรัน account suite (ยังไม่ได้รัน CI บน GitHub รอบนี้)
- Docs: `PRODUCT.md` เฉพาะการเสริมที่ผู้ใช้อนุมัติ, `README.md`, `docs/ARCHITECTURE_DECISIONS.md`, เอกสาร ACCOUNT_PRINT*, `SUPABASE_GOOGLE_SETUP.md`, สถานะ/ผลทดสอบ และ surface brief ของ login แก้ `DESIGN.md` เฉพาะคำอธิบาย Designer มือถือหนึ่งบรรทัดให้ตรงฟีเจอร์ที่อนุมัติ รักษา tokens/`.impeccable/design.json` ไม่เปลี่ยนระบบภาพโดยไม่ได้ขอ

## งานค้างก่อนใช้งานจริง

1. ยืนยันและติดตั้ง SQL บนโปรเจกต์จริง ตรวจ version/tables/RLS/private bucket หลัง Run
2. จัดการ legacy service-role ที่เปิดเผย ตั้ง Google Cloud + Supabase provider/redirect โดยเจ้าของใส่ secret ในผู้ให้บริการเอง
3. ตั้ง env/redeploy Netlify แล้วทดสอบ Google จริง owner และอีกบัญชี ตั้งแต่ pending → approve → isolation → suspend รวม upload/replace/delete โลโก้จริง
4. ทดลองพิมพ์จริง/สแกนจริงเพื่อสอบเทียบ ก่อนใช้กระดาษกับการตรวจคะแนน
5. ทำ QR resolver, อ่านรหัส/รอยฝน, จับคู่รายชื่อ, duplicate detection, upload ภาพสแกน Cloudinary, idempotent grading, persisted manual-review/confirmation/audit และรายงานคะแนนจริง

ไม่มีการให้เปอร์เซ็นต์ “สมบูรณ์” ที่กลบงานค้าง ความพร้อมของส่วนเสริมในเครื่องไม่เท่ากับความพร้อมใช้งานคะแนนนักเรียนจริง
