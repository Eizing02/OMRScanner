# ScanSob — โลโก้แอปและไอคอนโทรศัพท์

ผู้ใช้จัดให้และอนุญาตใส่ในแอป/เผยแพร่ GitHub เมื่อ 10 ตุลาคม 2569: `ScanSob_ Mobile Answer Sheet Scanner.png` (1254×1254px, RGB PNG). เก็บต้นฉบับครบทุก byte ที่ `public/omr-assets/scansob-logo.png` ไม่วาดใหม่ ไม่ครอป เปลี่ยนสี หรือหมุน และไม่อ้างว่าเป็น public-domain artwork.

SHA-256 ต้นฉบับ: `28428e79658fdb2bd71d6181bb47cd625a35c39a26df9952ed19ebfbb67d8237`.

ไฟล์สำหรับแต่ละพื้นผิวสร้างด้วย Sharp ที่ติดตั้งอยู่แล้ว เป็นการเปลี่ยนขนาด/รูปแบบสำหรับส่งภาพ ไม่แก้ artwork และไม่เขียนทับต้นฉบับ:

- `scansob-app-32.png`: แท็บ/ไอคอนเบราว์เซอร์
- `scansob-app-180.png`: Apple touch icon
- `scansob-app-192.png`: UI และ Android manifest icon
- `scansob-app-512.png`: manifest icon ความละเอียดสูง
- `scansob-app-maskable-512.png`: ภาพเต็มย่อ 286×286px บนพื้นขาว 512×512px เว้นขอบ 113px ทุกด้าน ภาพทั้งหมดอยู่ใน safe circle กลาง 80% จึงรองรับรูปไอคอนวงกลมโดยไม่ตัดตัวหนังสือ

ทั้งหมดเป็น PNG ทึบ รักษาสัดส่วนเดิม ไม่เปลี่ยนตราโรงเรียน ข้อมูลโรงเรียน API โลโก้ Supabase หรือ immutable OMR templates. ภาพ UI/ไอคอนเป็น static assets สาธารณะของแอป ไม่ใช้พื้นที่ Storage ของครู และไม่ต้องรัน SQL เพิ่ม.

## การติดตั้ง

`app/manifest.ts` ให้ชื่อ ScanSob, `display: standalone`, `start_url: /dashboard`, `scope: /`, `lang: th`; metadata ที่ root ให้ favicon, Apple icon/title/capable และ theme color. Manifest/รูปโหลดได้โดยไม่ต้องมี session; เมื่อเปิดพื้นที่ทำงานยังตรวจ Google/approval ตามเดิม.

- iPhone/iPad: เปิดเว็บด้วย Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม
- Android: เปิดเว็บด้วย Chrome → เมนู → ติดตั้งแอป / เพิ่มไปยังหน้าจอหลัก (ชื่อเมนูขึ้นกับรุ่นเบราว์เซอร์)
- ถ้าไอคอนที่เคยเพิ่มยังค้างเป็นแบบเก่า ให้เพิ่มจากเว็บที่เผยแพร่รุ่นใหม่อีกครั้ง ไอคอนติดตั้งขึ้นกับ cache และการอัปเดตของระบบโทรศัพท์ ไม่อ้างว่าอัปเดตทันทีทุกเครื่อง

ไม่เพิ่ม service worker, offline grading, push notifications หรือ cache ของข้อมูลนักเรียน การติดตั้งบนโทรศัพท์จริงยังต้องตรวจบนเครื่องผู้ใช้แยกจาก browser emulation.

## ไฟล์และการตรวจ

- Branding: `lib/app-brand.ts`, `components/layout/app-logo.tsx`, `components/layout/main-shell.tsx`, `app/login/page.tsx`, `app/globals.css`
- Installation metadata: `app/layout.tsx`, `app/manifest.ts`, PNG ทั้งหกไฟล์ข้างต้น
- Context: `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md`, `README.md`, `docs/THIRD_PARTY_NOTICES.md`
- Tests: `tests/app-brand.test.ts` ตรวจ source hash, PNG dimensions/opacity และ maskable safe zone; `tests/e2e/app-brand.spec.ts` ตรวจ public manifest/icons/head metadata และ UI บน desktop/phone/iPad สองแนวพร้อม axe/overflow
- Regression test: `tests/e2e/exam-lifecycle.spec.ts` รอรายชื่อ hydrate ก่อนนับ baseline และใช้ assertion รอจำนวนแถวหลังกลับหน้า แก้ race ของตัวทดสอบ ไม่เปลี่ยนระบบลบหรือรายชื่อจริง

ผลตรวจรอบส่งมอบ:

- `npm run build`, `npm run typecheck`, `npm run lint`: ผ่าน
- `npm test`: 130 ผ่าน, 1 skipped (22 files)
- `npm run test:accounts`: 5 ผ่าน รวม Google entry, pending gate, workspace isolation และ auto capture
- `npm run test:e2e`: 24 ผ่านในครั้งแรก; 1 กรณีอ่าน baseline ก่อน hydration จากนั้นปรับตัวทดสอบและรันกรณีลบถาวรซ้ำผ่าน ไม่อ้างว่าคำสั่งรวมครั้งแรกผ่านทั้งหมด
- Branding tests: 2 browser cases ผ่าน; ตรวจ 8 ภาพ login/menu บน desktop 1440×1000, phone 390×844, iPad 768×1024 / 1024×768 ไม่พบ axe WCAG A/AA violations หรือ horizontal page overflow ในหน้าที่ตรวจ
- เก็บหลักฐานภาพไว้ใน `.impeccable/review/scansob-*.png` (local/ignored). ไม่ได้รับรองการติดตั้ง iOS/Android หรือกล้อง/เครื่องพิมพ์บนอุปกรณ์จริงจาก browser emulation

Impeccable ช่วยคงพาเลตและ responsive เดิม ใช้ component ร่วมและกำหนดขนาดแบรนด์โดยไม่ขยายขอบเขตเป็น redesign รอบใหม่.
