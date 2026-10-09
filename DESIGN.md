---
name: Smart Answer Sheet
description: พื้นที่ทำงานครูไทยที่สงบ แม่นยำ และตรวจย้อนกลับได้
colors:
  canvas: "#f5f7fa"
  surface: "#fff"
  ink: "#18263d"
  muted: "#5d6b7f"
  subtle: "#7c899b"
  line: "#e1e6ee"
  nav: "#15263c"
  nav-text: "#c7d4e4"
  blue: "#245bd5"
  blue-light: "#ecf2ff"
  teal: "#087c63"
  teal-light: "#e8f5ef"
  amber: "#96620a"
  amber-light: "#fff4db"
  red: "#b33d40"
  red-light: "#fdf0f0"
  blue-hover: "#1649b8"
  secondary-line: "#cdd6e3"
  secondary-hover: "#f0f4fa"
  ghost-hover: "#e8edf5"
  field-line: "#cbd4e1"
  focus: "#6892e5"
  badge-neutral: "#f0f3f7"
  badge-ink: "#556378"
  badge-blue-ink: "#2452a7"
  nav-hover: "#223950"
  nav-active: "#285178"
  work-inset: "#f7f9fc"
typography:
  headline:
    fontFamily: "Noto Sans Thai, sans-serif"
    fontSize: "27px"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Noto Sans Thai, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.6
  subtitle:
    fontFamily: "Noto Sans Thai, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.65
  body:
    fontFamily: "Noto Sans Thai, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "Noto Sans Thai, sans-serif"
    fontSize: "13px"
    fontWeight: 550
    lineHeight: 1.65
  status:
    fontFamily: "Noto Sans Thai, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.8
  score:
    fontFamily: "Noto Sans Thai, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  badge: "5px"
  icon: "6px"
  field: "7px"
  control: "8px"
  panel: "12px"
  floating: "14px"
  circle: "50%"
spacing:
  compact: "4px"
  field-gap: "7px"
  control-gap: "8px"
  cluster: "12px"
  mobile-gutter: "16px"
  work-gap: "20px"
  panel-padding: "22px"
  section-gap: "24px"
  shell-gutter: "32px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-ghost-hover:
    backgroundColor: "{colors.ghost-hover}"
  button-ghost-selected:
    backgroundColor: "{colors.blue-light}"
    textColor: "{colors.blue}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.nav-text}"
    rounded: "{rounded.field}"
    padding: "11px 13px"
  nav-item-hover:
    backgroundColor: "{colors.nav-hover}"
  nav-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.surface}"
  badge-neutral:
    backgroundColor: "{colors.badge-neutral}"
    textColor: "{colors.badge-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.badge}"
    padding: "3px 9px"
  badge-blue:
    backgroundColor: "{colors.blue-light}"
    textColor: "{colors.badge-blue-ink}"
  badge-green:
    backgroundColor: "{colors.teal-light}"
    textColor: "{colors.teal}"
  badge-amber:
    backgroundColor: "{colors.amber-light}"
    textColor: "{colors.amber}"
  badge-red:
    backgroundColor: "{colors.red-light}"
    textColor: "{colors.red}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-padding}"
  notice:
    backgroundColor: "{colors.blue-light}"
    textColor: "#345281"
    rounded: "{rounded.control}"
    padding: "12px 14px"
  notice-warning:
    backgroundColor: "{colors.amber-light}"
    textColor: "#7c560f"
  notice-success:
    backgroundColor: "{colors.teal-light}"
    textColor: "{colors.teal}"
  notice-error:
    backgroundColor: "{colors.red-light}"
    textColor: "#a22f35"
  route-node:
    backgroundColor: "{colors.badge-neutral}"
    textColor: "#6d7c8f"
    rounded: "{rounded.circle}"
    size: "27px"
  route-node-complete:
    backgroundColor: "#dfefe9"
    textColor: "{colors.teal}"
  route-node-current:
    backgroundColor: "#eab85b"
    textColor: "#483409"
  shutter:
    backgroundColor: "{colors.surface}"
    textColor: "#203853"
    rounded: "{rounded.circle}"
    size: "68px"
---

# Design System: Smart Answer Sheet

## Overview

**Creative North Star: "เส้นทางตรวจข้อสอบ"**

“เส้นทางตรวจข้อสอบ” วางพื้นที่ทำงานของครูเป็นงานเอกสารที่มีลำดับและตรวจย้อนกลับได้ พื้นสีขาวเย็นรับแสงกลางวันอยู่คู่กับแถบนำทางสีน้ำเงินหมึก เส้นแบ่งบางและพื้นที่สี่เหลี่ยมช่วยจัดข้อมูลแน่นให้สงบ ปุ่ม สถานะ และรอยฝนเป็นจุดที่ใช้สีอย่างมีความหมาย ความรู้สึกหลักคือแม่นยำ ช่วยเหลือ และน่าเชื่อถือ ตามบุคลิกใน PRODUCT.md.

ชื่อทิศทางและคำบรรยายนี้สกัดจากโค้ดที่ส่งมอบและ docs/DIRECTION.md: grounded direction 4, seed 19bece82 ตามหลักฐานใน docs/DIRECTION_ROLL_EVIDENCE.md. ผู้ใช้มอบหมายการตัดสินใจออกแบบที่ย้อนกลับได้ผ่านคำขอให้ตรวจ Blueprint และนำไปสร้าง ภาพ decision comp มีสถานะเป็นภาพอ้างอิงสำหรับวิจารณ์ ยังไม่มีการอนุมัติ comp หรือถ้อยคำแบรนด์จากผู้ใช้ ค่าที่ใช้จริงใน app/globals.css, app/layout.tsx และองค์ประกอบ React เป็นหลักฐานของระบบนี้.

**Key Characteristics:**

- ผืนงานขาวเย็นกับแถบนำทางน้ำเงินหมึก
- สีการกระทำและสีสถานะแยกหน้าที่ชัดเจน พร้อมคำอธิบายและไอคอน
- Noto Sans Thai แบบ self-hosted สำหรับหัวเรื่อง ป้าย และเนื้อหา
- เส้นแบ่งบาง พื้นราบ และเงาเฉพาะกระดาษหรือชั้นที่ลอย
- มุมโค้งพอเหมาะสำหรับแผงและปุ่ม วงกลมสงวนให้จุดขั้นตอนและปุ่มกล้อง
- พื้นที่ทำงานปรับรูปตามอุปกรณ์ โดย Designer บนโทรศัพท์เน้นดูตัวอย่าง

## Colors

พาเลตประกอบด้วยพื้นขาวเย็น หมึกน้ำเงิน และสีอิ่มตัวที่ผูกกับการกระทำหรือสถานะ ค่าด้านบนเป็นค่าจริงจาก CSS; ชื่อเชิงบรรยายด้านล่างช่วยอธิบายหน้าที่โดยไม่เปลี่ยนค่าสี. แถบ tonalRamp ใน sidecar สังเคราะห์ใน OKLCH เพื่อเทียบเฉดในแผงเอกสารเท่านั้น ไม่เป็นสีเพิ่มที่แอปใช้.

### Primary

- **น้ำเงินลงมือทำ** — blue ใช้กับปุ่มหลัก ลิงก์ และสิ่งที่ถูกเลือก; blue-light รองรับพื้นเลือกและข้อความแจ้งข้อมูล.
- **น้ำเงินเมื่อชี้ปุ่มและวงโฟกัส** — blue-hover เป็นสีปุ่มหลักเมื่อชี้; focus บอกตำแหน่งคีย์บอร์ดบนพื้นสว่าง.
- **หมึกสถานะสีน้ำเงิน** — badge-blue-ink ช่วยให้ป้ายสถานะอ่านได้บนพื้นน้ำเงินอ่อน.

### Secondary

- **เขียวน้ำทะเลตรวจแล้ว** — teal และ teal-light ใช้กับสถานะตรวจแล้ว สัญลักษณ์ตรวจผ่าน และข้อความสำเร็จ.

### Tertiary

- **เหลืองอำพันไม่แน่ใจ** — amber และ amber-light ใช้กับคิวตรวจ ความไม่ชัด และคำเตือน.
- **แดงตัวขัดขวาง** — red และ red-light ใช้กับข้อผิดพลาดหรือข้อขัดข้องที่ต้องจัดการ.

### Neutral

- **ขาวเย็นกลางวัน / ขาวกระดาษ** — canvas เป็นพื้นรอบงาน; surface เป็นแผง กระดาษ และแถบบริบท.
- **หมึกสำหรับเนื้อหา / หมึกอ่อน / หมึกจาง** — ink เป็นข้อความหลัก; muted เป็นคำอธิบาย; subtle เป็นเครื่องช่วยรอง.
- **น้ำเงินหมึกนำทาง** — nav และ nav-text สร้างฐานที่มั่นคงให้เมนู; nav-hover และ nav-active แสดงการชี้และหน้าปัจจุบัน.
- **เส้นแบ่งขาวเทา** — line แบ่งแผง ตาราง และแถบเครื่องมือ; field-line และ secondary-line เป็นเส้นขอบของช่องกรอกและปุ่มรอง.
- **พื้นข้อมูลย่อยและพื้นสถานะทั่วไป** — work-inset, badge-neutral และ badge-ink แยกข้อมูลย่อยจากพื้นขาวโดยไม่ยกชั้น.
- **พื้นเมื่อชี้ปุ่มรอง / เครื่องมือ** — secondary-hover และ ghost-hover ใช้กับสถานะที่ตอบสนองการชี้.

**The Meaning Before Color Rule.** ใช้สีน้ำเงินกับการกระทำหรือการเลือก เขียวน้ำทะเลกับสิ่งที่ตรวจแล้ว เหลืองอำพันกับความไม่แน่ใจ และแดงกับตัวขัดขวาง แต่ละสถานะต้องมีข้อความหรือไอคอนประกอบ สีสำหรับหมวดวิชาเป็นเพียงเครื่องช่วยแยกหมวด ไม่แทนความหมายของสถานะ.

## Typography

**Display Font / Body Font:** Noto Sans Thai พร้อม sans-serif fallback ใช้ครอบคลุมทุกบทบาท; ระบบนี้ไม่มีฟอนต์ display หรือ mono แยก. ฟอนต์ถูก self-host ผ่าน @fontsource/noto-sans-thai ที่ app/layout.tsx โดยโหลดน้ำหนัก 400, 500, 600 และ 700.

**Character:** รูปอักษรไทยตรง อ่านง่าย และเปิดระยะบรรทัดให้สระและวรรณยุกต์ น้ำหนักช่วยแยกหัวเรื่องออกจากป้ายและรายละเอียด; ตัวเลขคะแนนใช้ tabular-nums ในบริเวณที่ต้องเทียบจำนวน.

### Hierarchy

- **Headline** — หัวหน้าจอ (27px, 650, line-height 1.5, letter-spacing −0.025em). ค่า 650 เป็นคำสั่ง CSS ที่ส่งมอบ โดยไฟล์ฟอนต์เป็นน้ำหนักคงที่ตามที่โหลดข้างต้น.
- **Title** — ชื่อส่วนงาน (17px, 600, line-height 1.6).
- **Subtitle** — หัวข้อย่อย (15px, 600, line-height 1.65).
- **Body** — เนื้อหาหลัก (14px, 400, line-height 1.65); บนโทรศัพท์ขนาดฐานลดเป็น 13px.
- **Label** — ปุ่มและป้ายการกระทำ (13px, 550, line-height 1.65).
- **Status** — badge ที่มีข้อความสั้น (11px, 500, line-height 1.8).
- **Score** — คะแนนในแผงตรวจ (25px, 600, line-height 1.4).

หัวหน้าจอเปลี่ยนเป็น 24px ที่ความกว้างไม่เกิน 1100px และ 25px ที่ไม่เกิน 640px; Designer และ Scanner มีหัวเรื่องเฉพาะบริบท (21px และ 23px บนโทรศัพท์). ช่วงเหล่านี้สะท้อนโค้ดจริง ไม่ใช่สเกลแบบอัตราส่วนที่สร้างขึ้นใหม่.

**The Thai Reading Rule.** ใช้ Noto Sans Thai และระยะบรรทัดที่เปิดไว้ในสเกลหลัก ข้อความสำคัญใช้ขนาด body หรือ label; ค่าขนาด 8–10px ที่พบในรายละเอียดแน่นเป็นข้อจำกัดเฉพาะจุดของงานที่ส่งมอบ ไม่ยกเป็นมาตรฐานข้อความที่ต้องอ่านบนหน้าจอใหม่.

## Layout

โครงหลักเป็นแถบนำทางแนวตั้ง แถบบริบท และผืนงาน แถบนำทางกว้าง 248px; แถบบริบทสูง 72px. เนื้อหากว้างได้ถึง 1800px พร้อม gutter 32px. กลุ่มใช้ระยะใกล้เคียงจังหวะ 8px แต่มีค่าปรับตามบริบทจริง เช่น gap 7px ของช่องกรอก และ padding 22px ของแผง; ไม่บังคับให้ทุกค่าเป็นผลคูณของ 8.

แผงหลักใช้พื้นขาวและเส้นแบ่ง งานที่ต้องเทียบกันใช้คอลัมน์ข้างกัน: Dashboard มีพื้นที่หลักยืดหยุ่นกับคิว 300px (gap 20px); Designer ใช้เครื่องมือ 220px – canvas ยืดหยุ่น – คุณสมบัติ 268px; Print มี preview กับส่วนตั้งค่า 310px; Review มีคิว 230px – ภาพยืดหยุ่น – รายละเอียด 340px. Scanner ใช้ภาพแนวตั้ง 410px คู่กับข้อมูลกว้างได้ถึง 400px.

### Responsive behavior

- **ตั้งแต่ 1600px:** gutter เป็น 40px; เครื่องมือและคุณสมบัติ Designer เป็น 230px / 280px.
- **ไม่เกิน 1300px:** แถบนำทางเป็น 224px; gutter 25px; คอลัมน์งานแคบลง.
- **ไม่เกิน 1100px:** แถบนำทางเป็น 205px; Dashboard เป็นคอลัมน์เดียว; คุณสมบัติ Designer ย้ายลงใต้พื้นที่ออกแบบ; รายละเอียด Review อยู่ใต้ภาพ.
- **ไม่เกิน 900px:** แถบนำทางเป็น drawer กว้าง 248px; แถบบริบทสูง 62px; มีเมนูด่วนด้านล่างและระยะเผื่อด้านล่าง 85px.
- **ไม่เกิน 640px:** gutter 16px และระยะเผื่อด้านล่าง 95px; หัวเรื่องกับปุ่มเรียงแนวตั้ง; Print, Scanner และ Review เรียงคอลัมน์เดียว. คิวตรวจเป็นแถวที่เลื่อนแนวนอน; ตารางยังเลื่อนแนวนอนได้.
- **Designer บนโทรศัพท์:** ซ่อนแผงเครื่องมือและคุณสมบัติสามส่วน แสดงกระดาษเต็มความกว้างพร้อมตัวเลือกจำนวนข้อ จำนวนช้อย และขนาดกระดาษที่ปรับพรีวิวทันที มีส่วนอัปโหลดโลโก้แบบพับได้ บันทึกแม่แบบและไปหน้าพิมพ์ได้; การแก้หัวกระดาษยังแนะนำให้ใช้คอมพิวเตอร์ ตามส่วนเสริมที่ผู้ใช้อนุมัติ. Scanner มี viewport สูง 450px, ปุ่มยืนยันผลสูงอย่างน้อย 48px ใน Review และพื้นที่จับมุม 48px.

## Elevation & Depth

ผืนงานและแผงข้อมูลใช้การแบ่งสีพื้นและเส้นบางเป็นหลัก แผงปกติไม่มีเงา เงามีไว้เพื่อให้กระดาษตัวอย่างดูเป็นวัตถุ และให้เมนู กล่องโต้ตอบ และข้อความแจ้งผลแยกจากงานข้างหลัง.

### Shadow Vocabulary

- **เมนูที่ลอย:** 0 8px 24px #18263d14.
- **กระดาษบน Designer:** 0 7px 22px #233b5a20.
- **กระดาษก่อนพิมพ์:** 0 7px 24px #233b5a1f.
- **กระดาษใน Review:** 0 4px 18px #243c5820.
- **กล่องโต้ตอบ:** 0 20px 70px #10213740; overlay เป็น #10213780.
- **ข้อความแจ้งผล:** 0 7px 22px #152c3e30.

**The Flat Seam Rule.** แผงข้อมูลพื้นราบใช้เส้นแบ่งและสีพื้นเพื่อแสดงขอบเขต เงาใช้กับกระดาษตัวอย่าง เมนูที่ลอย กล่องโต้ตอบ และข้อความแจ้งผลตามบทบาทที่บันทึกไว้.

## Shapes

มุมโค้งแบ่งตามหน้าที่: badge 5px, ปุ่มไอคอน 6px, ช่องกรอกและรายการนำทาง 7px, ปุ่มและข้อความแจ้ง 8px, แผง 12px และกล่องโต้ตอบหรือพื้นที่กล้อง 14px. เส้นขอบทั่วไปหนา 1px; ขอบเลือกแท็บหนา 2px. กระดาษตัวอย่างยังเป็นสี่เหลี่ยมเพื่อสื่อวัตถุจริง. วงกลมใช้กับจุดขั้นตอน avatar ชัตเตอร์ และตัวจับมุม ไม่ขยายเป็นรูปทรงพื้นฐานของทุกแผง.

## Components

### Buttons

ปุ่มชัดและตรงกับงาน ใช้มุมโค้ง 8px, padding 9px 15px, gap 8px และความสูงขั้นต่ำ 42px. ปุ่มหลักใช้ blue กับข้อความขาว; ปุ่มรองใช้พื้นขาวและ secondary-line; ปุ่ม ghost ใช้พื้นใสกับ muted และเมื่อเลือกใช้ blue-light กับ blue.

เมื่อชี้ ปุ่มเปลี่ยนพื้นด้วย transition background 0.15s ease. วงโฟกัสทั่วไปหนา 3px สี focus และเว้น 3px. Disabled ใช้ opacity 0.46 และ cursor not-allowed. ช่วงความกว้างไม่เกิน 1100px ปุ่มบริเวณหัวหน้าจอใช้ padding 8px 12px. ปุ่มไอคอนของแถบเครื่องมือบน desktop เป็น 36px; ปุ่มแก้คำตอบใน Review บนโทรศัพท์เป็น 44px.

### Chips

Badge มีข้อความสั้นตรงความหมาย ใช้มุม 5px, padding 3px 9px และสเกล status. มี neutral / blue / green / amber / red ตาม API ที่ใช้จริง; ไม่เป็นปุ่มโดยอัตโนมัติ. การเลือกใช้ปุ่ม ghost หรือแท็บแทน.

### Cards / Containers

แผงมีมุม 12px พื้น surface เส้นขอบ line 1px และ padding 22px; บนโทรศัพท์ padding 17px. ส่วนหัว เนื้อหา และท้ายแผงใช้เส้นบางแบ่งเมื่อจำเป็น. แผงตารางอาจไม่มี padding รอบนอกเพื่อให้ toolbar และตารางใช้พื้นที่ร่วมกัน. ไม่เพิ่มเงาให้ทุกแผง.

### Inputs / Fields

ช่องกรอกใช้พื้นขาว เส้น field-line 1px มุม 7px, padding 10px 12px และความสูงขั้นต่ำ 43px. Label แยกบรรทัดและเว้น 7px จากช่อง; caret ใช้ blue. วงโฟกัสใช้กฎทั่วไป; ช่องค้นหาแบบมีไอคอนใช้ outline 2px เว้น 2px บน wrapper เมื่อ focus-within. Placeholder เป็น #68778a. ข้อผิดพลาดประกอบด้วยข้อความสี red หรือ Notice แบบ error.

### Navigation

เมนูวางบน nav ใช้ข้อความ nav-text และไอคอนเส้น เมนูสูงอย่างน้อย 44px, padding 11px 13px, gap 12px, มุม 7px และข้อความ 12px. เมื่อชี้ใช้ nav-hover; หน้าปัจจุบันใช้ nav-active กับข้อความขาว และ aria-current. โทรศัพท์ใช้ drawer พร้อม backdrop และเมนูด่วนพื้นขาวที่เส้นขอบด้านบน; หน้าปัจจุบันในเมนูด่วนใช้ blue.

### Notices and dialogs

Notice มีมุม 8px, padding 12px 14px, gap 9px, ข้อความ 12px และ line-height 1.75. ไอคอนขนาด 18px อยู่ต้นข้อความ; success / warning / error ใช้ชุดสีที่สอดคล้องกับสถานะ. กล่องโต้ตอบมีมุม 14px, padding 25px, ความกว้าง min(560px, calc(100vw − 32px)) และความสูงที่เลื่อนได้ภายใน calc(100dvh − 60px). เงาและ overlay ใช้บทบาทกล่องโต้ตอบข้างต้น.

### Exam route and paper workspace

เส้นทางชุดสอบเป็นจุดกลม 27px เชื่อมด้วยเส้น 2px. จุดที่เสร็จมีเครื่องหมายถูกและสี teal; จุดปัจจุบันเป็นสีอำพันพร้อมชื่อขั้นตอน; จุดอนาคตสีเทา. บนโทรศัพท์จุดเป็น 25px. รูปแบบนี้ใช้ในพื้นที่ที่ต้องแสดงลำดับงานจริง ไม่ใช้เป็นของตกแต่ง.

กระดาษคงพื้นขาวบนพื้น canvas ที่มีโทนเข้มขึ้น เงาอ่อนบอกวัตถุ ขอบปลอดภัย เส้นไม้บรรทัด และรายละเอียดสัดส่วนเป็นเครื่องช่วยการอ่านพื้นที่ทางกายภาพ.

### Camera controls

พื้นที่กล้องใช้พื้น #101d2d และข้อความสว่าง; ชัตเตอร์ขนาด 68px เป็นวงกลมขาว ขอบ 4px และวงนอก 2px. การค้นหา ความไม่พร้อม และพร้อมจับภาพมีข้อความกับกรอบคนละสีบนภาพจริง. ตัวจับมุมมีพื้นที่ 48px ครอบจุดสีน้ำเงิน 14px; focus ใช้วง #8ac8ff หนา 3px. ขนาดนี้เป็นหลักฐานของการใช้งานสัมผัสและคีย์บอร์ดในงานกล้อง.

การเคลื่อนไหวมีเพียงการเปลี่ยนสีปุ่ม 150ms, drawer 200ms และ spinner 800ms linear. เมื่อ prefers-reduced-motion เป็น reduce ใช้ scroll-behavior auto และลด animation / transition เป็น 0.01ms.

## Do's and Don'ts

### Do:

- Do ใช้สีสถานะพร้อมคำภาษาไทยและไอคอนที่บอกความหมายเดียวกัน.
- Do ใช้เส้นบางและพื้นที่ว่างแยกส่วนข้อมูลก่อนเพิ่มเงา.
- Do ใช้ปุ่มน้ำเงินกับการกระทำหลัก ปุ่มขาวมีขอบกับการกระทำรอง และปุ่มพื้นใสในแถบเครื่องมือ.
- Do ให้กระดาษคงพื้นขาวและสัดส่วนกายภาพ แล้ววางบนพื้นพื้นที่ทำงานที่เข้มขึ้นเล็กน้อย.
- Do คงวงโฟกัสที่เห็นชัด ปุ่มชัตเตอร์ขนาด 68px และพื้นที่จับมุม 48px; เคารพ prefers-reduced-motion.

### Don't:

- Don't ใช้สีเขียวน้ำทะเลเพื่อทำให้งานที่ยังไม่แน่ใจดูผ่านแล้ว.
- Don't เพิ่ม gradient, glassmorphism หรือ animation ที่รบกวนการอ่านและชะลอการทำงาน.
- Don't ย่อเครื่องมือ Designer ทั้งสามส่วนลงในโทรศัพท์; ใช้รูปแบบดูตัวอย่างและทางไปหน้าพิมพ์หรือสแกนที่มีอยู่.
- Don't ยกระดับข้อความประกอบขนาด 8–10px หรือสีเฉพาะหมวดวิชาให้เป็นสเกลหลักของหน้าจอใหม่.
