# แผนตรวจพิมพ์และสแกนจริง

สถานะ: **ยังไม่ดำเนินการกับกระดาษจริง**. PDF ปัจจุบันรองรับ 1–60 ข้อ/4–5 ตัวเลือก A4 landscape แบบ 2 ใบซ้าย–ขวาหรือ 1 ใบเต็ม A4 เป็นแม่แบบทดลอง ไม่ใช่แม่แบบพร้อมเก็บคะแนน

## ก่อนทดลอง

1. ปิดข้อขัดแย้ง storage/worker และทำ adapter อ่าน QR/markers/ID/answers พร้อม immutable versions ก่อนทดสอบ end-to-end
2. ใช้ข้อมูลสังเคราะห์เท่านั้น; ไม่ถ่ายรหัส/ชื่อเด็กจริงลง test dataset. ภาพจากกล้องไม่ถูกอัปโหลดใน implementation ปัจจุบัน
3. บันทึก layoutHash, font hash, engine commit, template version, printer/driver, paper, device/browser, light/background และ original image (ไม่เก็บเพียง crop)
4. พิมพ์ PDF ด้วย A4 แนวนอน ขนาดจริง 100%, ปิด fit/shrink-to-page และเลือก 1 หน้า PDF ต่อแผ่น (PDF จัดสองใบไว้ให้แล้ว). วัด 297×210 mm และระยะ marker/bubble centers ด้วยไม้บรรทัด; บันทึก scale error ไม่ปรับพิกัดเดา

## Matrix เริ่มต้น

- เครื่องพิมพ์ laser/inkjet ที่โรงเรียนใช้จริง; scan full A4 และตัดสองใบแล้วทดสอบแต่ละใบอิสระ
- จำนวนข้อ 10/20/30/40/50/60 และขอบเขตเปลี่ยนครึ่ง A4→เต็ม A4; ทั้ง 4/5 ตัวเลือก; จำนวนใบคี่; หัวข้อ/วิชายาวและโลโก้แนวนอน/แนวตั้ง
- กระดาษเปล่าที่มี ก ข ค ง จ อยู่ในวงฝน และกระดาษถ่ายสำเนา ต้องไม่ถูกอ่านเป็นรอยฝน; ทดสอบเส้นวง/ตัวอักษรกับ threshold จริง
- Android Chrome และ iPhone Safari หลายรุ่น; landscape/portrait, permission deny/retry, background/กลับมา, network loss
- พื้นเรียบสีเข้ม/อ่อน/มีลาย; แสงห้อง/ข้างหน้าต่าง/เงามือ/glare; เอียง/หมุน/บังมุม/เบลอ
- ดินสอ/ปากกา/ฝนเบา/ยางลบ/วงสองตัวเลือก/ข้อว่าง/รหัสว่างหรือหลายช่อง; ground truth ระบุ invalid states
- QR missing/damaged/revoked, unknown roster ID, duplicate same-sheet scan, template mismatch, wrong paper

## เกณฑ์ตรวจ

Geometry และ PDF: compare rasterized centers กับ manifest ที่ fixed DPI; กำหนด error budget ก่อน acceptance. ตรวจ QR quiet zone, marker contrast, font glyphs/digits, text/graphic overlaps และ QR/markers ครบในแต่ละใบที่ตัดแยก. QR เหมือนกันทั้งชุด แต่ต้อง resolve exam/key/layout version ถูกต้อง; ทดสอบ QR เก่าและใหม่ปะปนกัน

Camera: corner error normalized, false polygons, sharpness/glare gates, stability, track lifecycle, memory/FPS/heat. Green/stable edge ไม่ใช่การยืนยันความแม่น OMR

OMR: QR read rate, bubble accuracy, sheet exact match, **ID false-positive match**, review rate, invalid retry rate. เก็บ confusion/error examples และ confidence intervals; ค่าเป้าหมายใน Blueprint ไม่ใช่ผลที่ได้แล้ว

Pipeline: original preserved, correct immutable versions, unknown/ambiguous→review, queue retry idempotent, duplicate does not overwrite verified score, reason/audit/revision retained, verified-only publication, exports preserve zero

## การปล่อยใช้

แยก calibration/validation/holdout device/lighting; เริ่ม small pilot แล้วขยายชุดจริงตาม Blueprint (ข้อเสนออย่างน้อย 1,000 ใบ) เมื่อ infrastructure และสิทธิ์ข้อมูลพร้อม. ต้องมี explicit pilot sign-off และเอกสารผลผิดพลาดก่อนเปิด production printing/auto-scoring. วงฝน 3.6 มม. เป็นค่าทดลอง ไม่ใช่ขนาดขั้นต่ำที่รับรองแล้ว; แม้ระบบสร้าง 5 ตัวเลือกได้ ยังไม่ถือว่าผ่าน OMR calibration
