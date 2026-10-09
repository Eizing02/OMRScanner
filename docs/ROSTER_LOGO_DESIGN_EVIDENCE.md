# หลักฐานการออกแบบรายชื่อและโลโก้โรงเรียน — 8 ตุลาคม 2569

งานนี้ต่อเติมหน้าจอเดิมในโหมด Operate: ครูนำเข้ารายชื่อ ตรวจข้อมูล แล้วใช้โลโก้โรงเรียนบนกระดาษคำตอบ คงทิศทาง “เส้นทางตรวจข้อสอบ” และ seed `19bece82` ตาม `DESIGN.md`, `.impeccable/design.json` และ surface brief เดิม ไม่มีการเลือกโลกภาพใหม่หรือ comp ใหม่

## ระบบเดิมที่ใช้ต่อ

| สิ่งที่คงไว้ | หลักฐานในงานที่ส่งมอบ |
| --- | --- |
| น้ำเงินหมึกนำทาง พื้นขาวเย็น แผงขาว | ตัวแปรสีใน `app/globals.css` และภาพทั้งหก ใช้ blue กับการกระทำหลัก และสีสถานะพร้อมข้อความไทย |
| Noto Sans Thai และลำดับขนาดเดิม | หัวหน้าจอ 27px, หัวส่วน 17px, body 14px; มือถือใช้ body 13px ตาม CSS เดิม ตารางใช้ความหนาแน่นเดิม |
| แผงพื้นราบ เส้นแบ่งบาง มุมเดิม | ไม่เพิ่มเงาตกแต่งให้ตารางหรือฟอร์ม เงาของกระดาษยังใช้บทบาทเดิม |
| ช่องกรอกมีป้าย ปุ่มหลักน้ำเงิน และข้อความแจ้งผล | ใช้ primitive เดิม พร้อมสถานะกำลังอ่าน/อัปโหลด ข้อผิดพลาด และปุ่ม disabled |
| กฎเดิมทั้งสาม | Meaning Before Color, Thai Reading และ Flat Seam ยังเป็นฐาน ไม่มีการเพิ่มกฎเฉพาะงานนี้เป็นมาตรฐานทั้งแอป |

## การต่อเติมเฉพาะหน้าจอ

- `/students/import`: คอลัมน์หลัก 3 ช่องคือ รหัสประจำตัว ชื่อ-สกุล และชั้น; mapping ชื่อ/นามสกุลแยกและเลขที่อยู่ในส่วนรูปแบบเก่า ตรวจทุกแถวก่อนนำเข้า แสดงพรีวิวหน้าละ 100 แถว พร้อมข้อผิดพลาดและรหัสซ้ำ
- `/students`: ตาราง 3 คอลัมน์เดียวกับไฟล์ครู มีค้นหา กรองระดับชั้น/ห้อง จำนวนรายชื่อ และ pagination หน้าละ 50 คน บนมือถือแถบค้นหาใช้เต็มแถว ตารางมีพื้นที่เลื่อนพร้อมชื่อสำหรับคีย์บอร์ด
- Designer: คงเครื่องมือ–กระดาษ–คุณสมบัติบนคอมพิวเตอร์ มือถือคงพรีวิวและเพิ่มส่วน “โลโก้โรงเรียน” ใต้กระดาษ การเปลี่ยนค่าเริ่มต้นใช้กับใบที่แก้และแม่แบบใหม่ ตามข้อความใน controls
- โลโก้วางในกรอบ 12 × 12 มม. ที่ตำแหน่งเดิม พรีวิว SVG ใช้ `xMidYMid meet`; PDF คำนวณสัดส่วนจากขนาดภาพต้นฉบับและฝัง PNG/JPEG จาก bytes โดยตรง ไม่ครอปหรือย่อความละเอียดผ่าน Canvas
- รหัสเป็นข้อความ 5 หลัก คงศูนย์นำหน้าและคำนำหน้าชื่อ ไม่เติมรหัสหรือเลขที่เอง ชั้นที่ไม่มีห้องคงห้องเป็น null และรหัสที่มีแล้วไม่ถูกเขียนทับ

## ภาพหลักฐานที่เปิดตรวจในรอบบันทึก

| หน้าจอ | คอมพิวเตอร์: กว้าง 1440px | มือถือ: กว้าง 390px |
| --- | --- | --- |
| นำเข้ารายชื่อ | `.impeccable/review/roster-import-desktop.png` | `.impeccable/review/roster-import-mobile.png` |
| รายชื่อนักเรียน | `.impeccable/review/roster-list-desktop.png` | `.impeccable/review/roster-list-mobile.png` |
| โลโก้โรงเรียน | `.impeccable/review/school-logo-desktop.png` | `.impeccable/review/school-logo-mobile.png` |

ภาพเป็น full-page จาก viewport 1440 × 1000 และ 390 × 844; ความสูงไฟล์จึงอาจมากกว่า viewport รอบบันทึกนี้เปิดภาพที่มีอยู่และตรวจ source เท่านั้น ไม่เปิด browser ถ่ายภาพใหม่ รัน tests หรือ detector ภาพรายชื่อและโลโก้มือถือเป็นชุดที่ถ่ายใหม่หลังคำตัดสิน recapture; ประวัติและ ship verdict อยู่ใน `ROSTER_LOGO_FINISH_REVIEW.md`

ตามบันทึก `ROSTER_LOGO_IMPLEMENTATION.md` โลโก้ `public/omr-assets/school-logo.png` เป็น PNG ที่ผู้ใช้ให้ ขนาด 742 × 763 พิกเซล เพิ่มเฉพาะ metadata ที่มา และตรวจ IDAT เท่ากับไฟล์ต้นฉบับแล้ว ภาพนี้ไม่ได้สร้างหรือแก้ pixels ด้วย AI

## ความคลาดเคลื่อนที่รายงานโดยไม่แก้ระบบเอกสาร

`PRODUCT.md` ยังระบุ Stack ว่า “Planned, not yet implemented” และสถานะเป็น blueprint รวมทั้งยังมี open decision เรื่องรูปแบบรายชื่อ ซึ่งล้าหลัง prototype และข้อกำหนดรายชื่อที่ยืนยันในงานนี้ `DESIGN.md` และ sidecar อธิบาย Designer มือถือเน้นพรีวิว แต่ยังไม่ระบุ logo controls ใต้พรีวิวที่เพิ่มเฉพาะงานนี้ คงทั้งสามไฟล์ไว้ตามขอบเขต ไม่เปลี่ยนเอกสารผลิตภัณฑ์หรือระบบภาพทั่วแอป

ระหว่างบันทึกพบกฎ focus ของ file-upload wrapper อ้าง `--focus` ที่ไม่มี declaration ผู้ดำเนินงานแก้เฉพาะกฎนี้เป็น `outline: 3px solid #6892e5` ซึ่งตรงกับ focus เดิม และตรวจ computed style มือถือได้ `rgb(104, 146, 229)`, 3px, solid การแก้นี้เกิดหลัง ship review ของภาพ normal state และไม่เปลี่ยน geometry; ไม่อ้างว่าผู้ตรวจเห็นการแก้หลังรีวิว ไม่ยก token ที่ไม่มีค่า หรือข้อความรายละเอียด 8–10px เดิม ขึ้นเป็นกฎระบบใหม่

หลักฐาน source ที่ตรวจ: `app/globals.css`, `components/students/import-preview-table.tsx`, `student-table.tsx`, `components/omr/omr-generate-panel.tsx`, `omr-sheet-preview.tsx`, `lib/omr/generate-template.ts` และ `lib/export/export-pdf.ts`; ใช้ `ROSTER_LOGO_IMPLEMENTATION.md` เป็นบันทึกผลทดสอบและสถานะบริการจริง

รอบ documenter นี้เพิ่ม/แก้เฉพาะ `docs/ROSTER_LOGO_DESIGN_EVIDENCE.md` และ `docs/ROSTER_LOGO_FINISH_REVIEW.md` ไม่แก้ source, ภาพ, environment, `PRODUCT.md`, `DESIGN.md` หรือ `.impeccable/design.json`
