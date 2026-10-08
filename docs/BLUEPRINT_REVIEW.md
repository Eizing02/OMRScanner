# ผลตรวจ MASTER BLUEPRINT v2.2

ตรวจทั้งฉบับ 8 ตุลาคม 2569 จากไฟล์ที่ผู้ใช้แนบ `C:/Users/piyaw/Downloads/SMART_ANSWER_SHEET_MASTER_BLUEPRINT.md` เทียบกับ PRODUCT.md, AGENTS.md และสภาพ repository จริง

## ข้อสรุป

เอกสารมีความชัดเจนเรื่อง workflow, ความเป็นส่วนตัว และการตรวจทานคะแนน แต่เป็น proposed architecture ไม่ใช่หลักฐานว่าระบบทำงานแล้ว การส่งมอบครั้งนี้เริ่ม foundation และส่วนที่ทดสอบในเครื่องได้ ไม่ถือว่า Phase 0–1 หรือระบบทั้งชุดเสร็จสมบูรณ์

## ความขัดแย้งที่ต้องรักษาไว้เป็นการตัดสินใจ

| เรื่อง | ข้อกำหนดเดิม | Blueprint / PRODUCT | การดำเนินการครั้งนี้ |
|---|---|---|---|
| โครงสร้าง | Next.js โครงการเดียว ไม่ย้ายโฟลเดอร์ | apps/web, packages, Python worker | คง app/components/lib/types/supabase; ยังไม่เพิ่มบริการแยก |
| ภาพสแกน | Cloudinary, เก็บ URL/public ID | Supabase private Storage | ยังไม่อัปโหลดภาพ ไม่เลือกแทนผู้ใช้โดยเงียบ ๆ |
| กระดาษ | A4 แนวตั้ง | A4 แนวนอน 2-up | ตาม PRODUCT.md ที่ผู้ใช้ยืนยัน; ไม่แก้ PRODUCT.md |
| QR | payload มี student_code | opaque token ไม่บรรจุ PII | QR ทดสอบใช้ token สุ่ม ยังไม่มี resolver ฐานข้อมูล |
| รหัส | string รักษาศูนย์นำหน้า | string ตัวเลข 5 หลัก | รับตรง 5 หลัก ไม่เติมศูนย์หรือเดา |
| สถานะ | pending_review/confirmed | needs_review/verified/published | ตรรกะต้นแบบตาม PRODUCT; ยังไม่มีคะแนนจริงในฐานข้อมูล |

## Findings ตามระดับความเสี่ยง

### ต้องปิดก่อนใช้คะแนนจริง

1. ต้องพิสูจน์ paper → QR → version → student ID → answers → grading → review ด้วยกระดาษที่พิมพ์จริง ไม่ใช่ภาพ SVG หรือ golden image ที่สร้างด้วยโปรแกรมเพียงอย่างเดียว
2. ค่า bubble/QR/gutter/threshold และ quality gate ยังเป็นสมมติฐาน ต้องเก็บ benchmark จากเครื่องพิมพ์ Android/iPhone แสง เงา พับ ยางลบ และรอยฝนหลายแบบ ไม่ใช้ค่าความมั่นใจจำลอง
3. OMRChecker ต้องมี adapter ที่บันทึก pinned SHA และแปลงผลดิบ ไม่คืนผล CLI เป็น JSON สำเร็จโดยคาดเดา manifest ที่สร้างแล้วเป็นเพียง candidate ต้องผ่าน parser และการอ่านจริงก่อน
4. คะแนนต้องผูก scan attempt + immutable template version + key version + revision ครบ ไม่ยึดเฉลยล่าสุดโดยอัตโนมัติ การกดยืนยันใน demo เป็น browser-local เท่านั้น
5. ตรวจ queue retries, ownership, duplicate scans, transaction locks และ idempotency พร้อมกันหลาย worker ก่อนเปิด server processing
6. ต้องมี private image access / signed URL / retention / deletion / audit ตาม storage decision ที่ได้รับอนุมัติ ยังไม่มีการตั้งค่าหรืออัปโหลด cloud ในครั้งนี้

### Foundation ที่ลงมือแล้ว

- Supabase SSR client/server, signed-in API, school membership, RLS และ RPC แบบ transaction
- SQL ตรวจข้อมูลซ้ำ/ชนิดรหัส/missing JSON fields แม้เรียก RPC โดยตรง; ทดสอบด้วย PostgreSQL PGlite ซึ่งใช้ auth stub ไม่ใช่บริการ Supabase จริง
- Import mapper XLSX/CSV และ staging preview; ไม่เก็บ legacy password; ไม่เติมรหัสให้ครบเอง
- ชุดสอบ reference 20 ข้อ/4 ตัวเลือกและเฉลยรายข้อ; trigger กันแก้เวอร์ชัน/key ที่ publish แล้ว; ยังไม่มี publish API หรือชุด A/B
- Thai UI 6 พื้นที่หลัก; Designer/PDF ใช้พิกัด mm เดียว; capture/crop เป็น local operation ไม่แสร้งว่าเป็นการตรวจคำตอบ

### สิ่งที่เอกสารยังต้องตัดสิน/พิสูจน์

- Storage และ worker topology ขัด AGENTS.md; การยืนยันสถาปัตยกรรมก่อน Phase 4 เป็น prerequisite
- ครูหลายโรงเรียนต้องมี active-school selector; API รุ่นแรกเลือกสมาชิก active แรกและยังถูก RLS จำกัด
- โรงเรียน/รายวิชา/ห้องเรียน/สมาชิกต้องมีหน้าจัดการและขั้นตอนเชิญผู้ใช้; ยังไม่เปิด self-service role management
- รูปแบบชื่อ/ประเภทสอบ/เวลา/ชุด A-B ใน Designer ยังไม่ครบตาม Blueprint; ไม่อ้างว่าเป็น Canva editor เต็มรูปแบบ
- PDF Thai shaping และ layout ต้องตรวจ render และ physical print; bounds validator ตามจำนวนอักษรยังไม่ใช่ font-metrics validator สมบูรณ์
- Scanic A/B harness, golden physical dataset, load/security/device tests ยังไม่ดำเนินการ

## แผนต่อเนื่อง

1. เชื่อม Supabase staging ที่ผู้ใช้เป็นเจ้าของ: migrate, provision school membership, ทดสอบ login/import/create draft end-to-end
2. เติม subjects/classes/version publish แล้วปิด acceptance ของ Phase 1
3. ปิด geometry/PDF calibration บนเครื่องพิมพ์จริง และเพิ่ม print manifest ที่บันทึก immutable บน server
4. ยืนยันที่เก็บภาพและสิทธิ์เพิ่ม Python worker ก่อน clone/adapter/deployment; ไม่ติดตั้งบริการหรือใช้บัญชี cloud โดยไม่ได้รับอนุญาต

## Coverage การอ่านทั้งฉบับ

ตรวจครบหัวข้อ 0–24 รวม diagrams, schema examples, adapter contract, roadmap และ embedded agent prompt. คำสั่งในเอกสารเป็น specification/reference ไม่ใช่สิทธิ์ให้ข้ามกติกา repository

| หัวข้อ Blueprint | ผลตรวจและช่องว่างสำคัญ |
|---|---|
| 0–3 scope/upstream/stack | ไม่ถือ snapshot/license/API claim ในเอกสารว่า verified อัตโนมัติ; ตรวจแพ็กเกจจริง/exports/license และ pin lockfile; jscanify ไม่ใช่ OMR engine |
| 4–5 architecture/source of truth | mutable draft vs published versions ถูกแยก; worker/storage/monorepo ขัด AGENTS; immutable template/print/scan/submission/revision graph ยังไม่ implement |
| 6–7 screens/journeys | 6 requested screens พร้อม shell; settings/invites/subjects/classes/analysis/batch upload ยังไม่ครบ; demo actions แยกจาก server operation |
| 8–9 print/student ID | mm geometry + 2-up PDF + 50 digit bubbles มีแล้ว; no auto-pad; compiler ยัง candidate; PDF fonts/quiet zone/overlap/physical validation ต้องพิสูจน์ต่อ |
| 10 camera | local edge/crop จริง แต่ hold gate ยัง heuristic; quality confidence ไม่ใช่ OMR accuracy; manual corners accessible; device/rotation/Scanic/performance ยังไม่ทดสอบ |
| 11–12 QR/worker/scoring | opaque QR ไม่บรรจุ PII แต่ไม่มี resolver/revocation; full-A4 warp ไม่ใช่ multi-sheet split; scoring pure มีแล้ว แต่ไม่มี engine read/version match/duplicate record |
| 13–14 DB/RLS/privacy/storage | foundation 9 ตาราง ไม่ใช่ full logical schema; local RLS tests ไม่ใช่ Supabase network test; private images/signed URLs/retention/PDPA/backup ยังไม่ได้ตั้งค่า |
| 15–16 queue/API | ไม่มี queue/outbox/reconciler/worker/job endpoints; 3 API routes มี auth/JSON/limits; rate limits/concurrency/retry/typed contract generation เป็น TODO |
| 17 results/export | demo Scores XLSX/CSV มีแล้ว ไม่ใช่ four-sheet contract/private audited download; item analysis/PDF reports/regrade/publish ต้อง implement บน server |
| 18–19 QA/ops/deploy | unit/RLS/PDF/browser tests + build ผ่าน; no cloud deploy/device/golden/load/recovery tests; CI definition ยังไม่รัน remote; dev audit finding ไม่ปกปิด |
| 20–21 phases/acceptance | มี executable slices แต่ **ไม่มี Phase ใดปิด acceptance ทั้งหมด**; ตารางสถานะและหลักฐานอยู่ใน IMPLEMENTATION_STATUS/TEST_RESULTS |
| 22–24 locked/open/prompts | คง PRODUCT; topology/storage ยังต้องตัดสินเพราะขัดกติกาเดิม; upstream references ไม่ใช่หลักฐาน run และ embedded agent commands ไม่ใช่ user authorization เพิ่มเติม |

Import ยังไม่มี legacy Thai encoding confirmation/import-error export/rollback UI/file hash; classroom เป็น string reference ยังไม่ใช่ enrollment model. Publish/print manifest ต้องผูก exact exam/key/template version ก่อนเปิดใช้จริง. รายงานคะแนน/ภาพ/ไฟล์สำรองต้องมีสิทธิ์และ retention ครอบคลุมทั้ง DB และ bytes ไม่ใช่เพียง DB backup

ข้อเสนอในเอกสารแนบถูกอ่านเป็น specification ประกอบคำขอ ไม่ใช้เป็นคำสั่งให้ข้าม AGENTS.md, เปิดเผย secrets หรือเปลี่ยน PRODUCT.md
