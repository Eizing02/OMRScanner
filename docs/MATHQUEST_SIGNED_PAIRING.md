# เชื่อม ScanSob กับระบบเช็คชื่อแบบไม่กรอกรหัส

## สิ่งที่ทำไว้ใน ScanSob

ครูที่ได้รับอนุมัติและเป็นเจ้าของพื้นที่สามารถขอเชื่อมกับโรงเรียนปลายทางที่ตั้งไว้ได้จากหน้า **เชื่อมต่อระบบเช็คชื่อ** เซิร์ฟเวอร์ใช้ตัวตน Google และอีเมลที่ยืนยันแล้วจาก Supabase Auth ผู้ดูแลระบบเช็คชื่อเป็นผู้อนุมัติ การเปิดใช้การเชื่อมต่อเริ่มในโหมดกดส่งเอง ชื่อ MathQuest ยังใช้ใน repo และสัญญาทางเทคนิค

- หน้า ScanSob แสดงปุ่ม **ขออนุมัติส่งคะแนน** เมื่อค่าตั้งพร้อมและปลายทางตอบ `prepare_signed` สำหรับบัญชีครู การตรวจความพร้อมใช้ request ID แยกและไม่มีการเปิดคำขอรอ แสดงสถานะปิดรับหรือติดต่อไม่ได้หากปลายทางยังไม่พร้อมรับ API ฝั่ง ScanSob ปฏิเสธการเปิดคำขอใหม่ด้วยรหัส การตรวจและการยกเลิกคำขอเดิมยังทำได้
- เมื่อยืนยันส่ง เซิร์ฟเวอร์บันทึก ID ข้อมูลคำขอเข้ารหัส ปลายทาง และ challenge ก่อนติดต่อ MathQuest จากนั้นรับ `pairing_window_id` และตรึงไบต์ JSON ก่อนส่ง `request_signed` การส่งซ้ำใช้ ID, window, challenge และ body เดิม พร้อมเซ็น header เวลาปัจจุบัน
- หากคำตอบ `prepare_signed` หาย ผู้ใช้ยกเลิกด้วย challenge เพื่อปิด ID ก่อนสร้างความยินยอมใหม่ ต้นทางทำ prepare จริงของแต่ละ attempt ได้ครั้งเดียว จึงไม่พาคำขอเดิมไปผูกรอบเปิดรับใหม่
- หากคำตอบ `request_signed` หาย ให้ลองส่งคำขอเดิมก่อนเรียก `status` รับสถานะ “รออนุมัติ” หลังปลายทางตอบรับ และ “เชื่อมต่อแล้ว” หลังฐานข้อมูลบันทึก token ที่เข้ารหัส ตรวจ request ID, โรงเรียนและ HTTPS origin ที่ตรึงไว้ทั้งระหว่างเชื่อมและก่อนส่งคะแนนของ connection รุ่นนี้ ครูปิดคำขอที่ปลายทางยืนยันแล้วว่าปฏิเสธหรือหมดอายุได้ก่อนขอใหม่
- ปุ่มตรวจสถานะและยกเลิกผูกกับ ID ที่หน้าจอแสดง หากเปิดหลายแท็บ การกดจากแท็บเก่าจะติดเงื่อนไข ID ที่ฐานข้อมูล หน้าเปิดอยู่จะตรวจสถานะคำขอรออนุมัติประมาณ 30–40 วินาที และเคารพ `Retry-After`
- เมื่อปิด flag สำหรับคำขอใหม่ ระบบจะไม่สร้างคำขอหรือเตรียมรอบใหม่ งานที่ตรึง JSON แล้วใช้ Request ID, JSON และ `pairing_window_id` เดิมส่งซ้ำก่อนตรวจสถานะ งานที่ปลายทางรับแล้วตรวจสถานะและยกเลิกได้ คงการเปิดเครือข่ายคะแนน ค่า HTTPS origin, UUID ปลายทาง และคีย์ลงนามไว้ระหว่างจัดการรายการค้าง

## ข้อมูลสัญญาที่ตรวจร่วมกัน

ใช้ `POST /functions/v1/pair-scansob-workspace` ตาม MathQuest handoff วันที่ 17 พฤศจิกายน 2569. คำตอบ `prepare_signed` เป็น JSON แบบเข้มงวดที่มี `schema_version`, `action`, `request_id`, `destination_school_id`, `pairing_window_id`. คำสั่งส่งรวม `pairing_window_id` และใช้ HMAC-SHA-256 บนไบต์เดียวกับที่ส่งจริง คำสั่งสถานะและยกเลิกใช้ challenge ของคำขอเดิม

สัญญาคะแนนใช้รุ่น **1.0** และตัวรับรายงาน MathQuest สรุปจากใบตอบรับรายชุดสอบและเลขรอบ ไม่ใช้ยอดคะแนนสะสมแทนยอดของรอบส่ง

## ติดตั้ง staging และปล่อยรุ่น

1. **MathQuest staging** ตรวจ receiver migration 03 และชุด signed prepare/window `20261116_01_scansob_code_free_pairing.sql` ก่อนเพิ่มนโยบายรับคำขอที่ให้แอดมินตัดสินรายบัญชีตาม [ไฟล์ส่งต่อ MathQuest](20261117-mathquest-approval-only-handoff-th.md) ตรวจงานรายงาน `20261117_01_scansob_publication_receipts.sql` ด้วย
2. **ScanSob staging** ตรวจ SQL 020–023 ตามลำดับที่ขาดและ [SQL 024](../supabase/migrations/202611170024_mathquest_signed_pairing.sql) ซึ่งมี RPC ที่ใช้กับคำขอใหม่ ถ้าติดตั้ง 024 แล้วไม่ต้องรันซ้ำสำหรับการปรับปุ่มและเส้นทาง API รอบนี้
3. ตั้งค่าด้านล่างในสภาพแวดล้อม staging แล้วใช้บัญชีครูที่ไม่มีชื่อในรายชื่ออีเมลฝั่ง MathQuest ทดสอบการขอ การอนุมัติ การปฏิเสธ การส่งและถอนคะแนนจำลอง ตรวจการตอบรับหลังปิดหน้าเว็บด้วย [ตัวรันคิว staging](MATHQUEST_SCORE_INTEGRATION.md)
4. ยืนยัน deployment และผลตรวจทั้งสองฝั่งก่อนเปิดใช้กับคะแนนจริง ให้ MathQuest ปิดการเปิดคำขอใหม่ด้วยรหัสในการสลับร่วมกัน คำขอที่รับแล้วและสิทธิ์ที่ออกแล้วใช้เส้นทางเดิมต่อได้

| ฝั่ง | ค่าที่ต้องเตรียม |
| --- | --- |
| ScanSob server | `MATHQUEST_RECEIVER_ORIGIN` เป็น HTTPS origin ของ Supabase ปลายทาง, `MATHQUEST_DESTINATION_SCHOOL_ID` เป็น UUID โรงเรียน, `MATHQUEST_DESTINATION_LABEL` เป็นชื่อแสดงผล, `MATHQUEST_CODE_FREE_SIGNING_KEY_ID` และ `MATHQUEST_CODE_FREE_SIGNING_KEY` หาก label ที่ตั้งไว้คือ `MathQuest` ให้ใช้ `ระบบเช็คชื่อ` เมื่อสลับการตั้งค่า คงชื่อจริงของโรงเรียนปลายทาง และคงค่าที่จัดเก็บไว้ของ connection เดิม |
| ScanSob flags | เปิด flag คะแนนเดิมตามคู่มือ staging. `MATHQUEST_CODE_FREE_PAIRING_ENABLED` และ `MATHQUEST_CODE_FREE_PAIRING_RECEIVER_VERIFIED` มีค่าเริ่มต้น false. เปิดทั้งคู่เฉพาะเมื่อได้ทดสอบตัวรับรุ่นใหม่แล้ว |
| MathQuest Edge Function | `SCANSOB_CODE_FREE_SIGNING_KEY`, `SCANSOB_CODE_FREE_SIGNING_KEY_ID`, `SCANSOB_CODE_FREE_DESTINATION_ID` ต้องตรงกับ ScanSob ใน environment นั้น. คีย์ลงนามคือข้อมูลสุ่ม 32 ไบต์ใน base64url แบบไม่เติม padding. คง `SCANSOB_PAIRING_DELIVERY_KEY` สำหรับการส่ง token เดิม |

ค่าลับเก็บที่ server หรือ Edge Function Secrets ของแต่ละ environment. SQL ของ MathQuest ใช้กับ MathQuest เท่านั้น ส่วน SQL 024 ใช้กับ ScanSob เท่านั้น.

## หลักฐานทดสอบในเครื่อง

เรียกตัวรับและ SQL ของ MathQuest ที่ commit `7e8113a` ผ่าน HTTP handler ในฐานจำลองแยกจากฐาน ScanSob ทดสอบการจับคู่เดิมและการลงนาม ขาดการตอบกลับหลัง commit การส่งซ้ำด้วย body เดิม ยอดราย revision แยกบัญชีนักเรียน การถอน การตรวจ ID จากแท็บเก่า การปิดโหมดใหม่ระหว่างรอ และการระงับการส่งคะแนนเมื่อ origin เปลี่ยน การอนุมัติที่ผ่านการทดสอบอยู่ในโหมด manual และคิวมีศูนย์งานจนกว่าจะสั่งส่ง

หลักฐานนี้ใช้ตรวจโค้ดและสัญญา ส่วน Netlify, Supabase Edge Function, Google และตัวรันคิวใน staging ต้องทดสอบเมื่อกำหนด environment ทั้งสองฝั่งแล้ว

ดู [ผลตรวจรับก่อนปล่อย](SCANSOB_ATTENDANCE_STAGING_ACCEPTANCE.md) สำหรับสถานะล่าสุดของการเปลี่ยนชื่อและการส่งซ้ำระหว่างพักรับ
