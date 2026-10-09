---
name: ScanSob
description: พื้นที่ทำงานครูไทยสีอ่อน อ่านชัด และตรวจย้อนกลับได้
colors:
  mint: "#defcf9"
  sky: "#cadefc"
  lavender: "#c3bef0"
  lilac: "#cca8e9"
  canvas: "#f6f8fc"
  surface: "#fff"
  ink: "#29263f"
  muted: "#5f5a73"
  subtle: "#6b657d"
  line: "#dedde9"
  nav-text: "#3e455d"
  blue: "#534095"
  blue-light: "#eeebfb"
  action-hover: "#44317f"
  focus: "#6653a4"
  control-line: "#8a829f"
  teal: "#087c63"
  teal-light: "#e8f5ef"
  amber: "#855707"
  amber-light: "#fff4db"
  red: "#b33d40"
  red-light: "#fdf0f0"
  ghost-hover: "#e8edf5"
  nav-hover: "#cae8eb"
  nav-active-ink: "#30274f"
  badge-neutral: "#f0f3f7"
  badge-ink: "#556378"
  notice-ink: "#3f4666"
  work-inset: "#f7f9fc"
  paper-canvas: "#edf0f8"
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
  shell-gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-secondary-hover:
    backgroundColor: "{colors.blue-light}"
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
    backgroundColor: "{colors.lavender}"
    textColor: "{colors.nav-active-ink}"
  badge-neutral:
    backgroundColor: "{colors.badge-neutral}"
    textColor: "{colors.badge-ink}"
    typography: "{typography.status}"
    rounded: "{rounded.badge}"
    padding: "3px 9px"
  badge-blue:
    backgroundColor: "{colors.blue-light}"
    textColor: "{colors.blue}"
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
    textColor: "{colors.notice-ink}"
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
  workspace-tab:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "8px 12px"
    height: "44px"
  workspace-tab-active:
    backgroundColor: "{colors.lavender}"
    textColor: "{colors.blue}"
  shutter:
    backgroundColor: "{colors.surface}"
    textColor: "#203853"
    rounded: "{rounded.circle}"
    size: "68px"
---

# Design System: ScanSob

## Overview

**Creative North Star: "ทะเบียนตรวจข้อสอบสีอ่อน"**

“ทะเบียนตรวจข้อสอบสีอ่อน” ทำให้พื้นที่ทำงานครูเข้าถึงง่ายด้วยเมนูมิ้นต์ พื้นข้อมูลฟ้าอ่อน การเลือกลาเวนเดอร์ และรายละเอียดไลแลค หมึกพลัมเข้มรักษาความชัดของหัวเรื่อง ตาราง ช่องกรอก และปุ่มหลัก สีอ่อนเป็นพื้นรองรับงานเอกสารที่มีลำดับและสถานะชัดเจน ปุ่มและการสลับส่วนตอบสนองสั้น ๆ เพื่อให้รู้สึกเบาและเป็นมิตร โดยยังอ่านคะแนนและคำเตือนได้ทันที.

ทิศทางนี้บันทึกการแทนโลกสีเดิมตามคำขอผู้ใช้เมื่อ 9 ตุลาคม 2026: พาเลต DEFCF9 / CADEFC / C3BEF0 / CCA8E9 ข้อความไทยกระชับ และการเคลื่อนไหวสั้นที่นุ่มนวล สัญญาทิศทางอยู่ใน .impeccable/surfaces/app-layout-tsx.md (assessment register, candidate 4, seed e0df4ce4). ค่าจริงสกัดจาก app/globals.css, components/layout/main-shell.tsx และองค์ประกอบ UI/กระดาษ ระบบยังใช้ Noto Sans Thai และไอคอนเส้น Lucide เดิม; วันที่ 10 ตุลาคม 2026 เพิ่มโลโก้ ScanSob ที่ผู้ใช้จัดให้ โดยไม่เปลี่ยนโลกสีหรือวาดตราใหม่ ที่มาและขนาดไฟล์อยู่ใน docs/APP_BRANDING.md.

หลักฐานรอบรีเฟรชใน .impeccable/review ครอบคลุม 9 หน้าบน desktop/phone และ Designer, Print, Scanner, Review บน iPad จำลองทั้งสองแนว พร้อมภาพ school-print-pdf.png ที่เรนเดอร์จาก jsPDF จริง การตรวจที่รายงานไม่พบ axe violations หรือ page overflow ในหน้าที่จับภาพ และผู้ตรวจให้ verdict ship โดยไม่มีข้อแก้ไข ขอบเขตนี้ไม่รับรองกล้องหรือเครื่องพิมพ์จริง การติดตั้ง SQL/การ deploy สด หรือผลสอบที่มีข้อมูลครบทุกสถานะ.

**Key Characteristics:**

- เมนูมิ้นต์ พื้นข้อมูลฟ้าอ่อน การเลือกลาเวนเดอร์ และรายละเอียดไลแลค
- หมึกพลัมและปุ่มหลักเข้มที่อ่านชัดบนพื้นสีอ่อน
- สถานะเขียว อำพัน และแดงพร้อมคำภาษาไทยหรือไอคอน
- Noto Sans Thai แบบ self-hosted และตัวเลข tabular ในข้อมูลที่ต้องเทียบ
- แผงพื้นราบ ขอบบาง และเงาเฉพาะกระดาษหรือชั้นที่ลอย
- พื้นที่งานพอดี viewport สลับส่วนบน phone/iPad และเคลื่อนไหวสั้นตามสถานะ

## Colors

พาเลตสีอ่อนรับหมึกพลัมเข้ม ค่าด้านบนเป็น source of truth จาก CSS; ชื่อ blue/blue-light ในโค้ดเดิมยังคงอยู่แต่ค่าใช้สีพลัม/ลาเวนเดอร์แล้ว แถบ tonalRamp ใน sidecar สังเคราะห์ใน OKLCH เพื่อแสดงเฉดในแผงเอกสารเท่านั้น ไม่เพิ่มสีให้แอป.

### Primary

- **พลัมลงมือทำ** — blue ใช้กับปุ่มหลัก ลิงก์ การเลือก และ caret; action-hover ทำให้ปุ่มเข้มขึ้นเมื่อชี้; focus เป็นวงโฟกัสคีย์บอร์ด.
- **ลาเวนเดอร์เลือกงาน** — lavender ใช้กับเมนูปัจจุบัน แท็บพื้นที่งาน และการเลือกข้อความ; blue-light รองรับปุ่มเครื่องมือที่เลือก badge ข้อมูล และ Notice.

### Secondary

- **มิ้นต์นำทาง** — mint รองรับแถบเมนูหลักซึ่งมี nav-text เข้ม; nav-hover เป็นพื้นเมื่อชี้ และ nav-active-ink ใช้กับหน้าปัจจุบัน.
- **ฟ้าข้อมูล** — sky รองรับบริบทชุดสอบ สรุปข้อมูล และ avatar-light; ใช้หมึกเข้มอยู่ด้านบน.

### Tertiary

- **ไลแลคจุดเล็ก** — lilac ใช้กับ avatar และรายละเอียดหมวดข้อมูลที่ไม่ต้องแข่งขันกับงานหลัก.
- **เขียวน้ำทะเลตรวจแล้ว** — teal/teal-light บอกความสำเร็จหรือสถานะตรวจแล้ว.
- **อำพันรอตรวจ** — amber/amber-light บอกคำเตือนและความไม่แน่ใจ.
- **แดงต้องจัดการ** — red/red-light บอกข้อผิดพลาดหรือการลบถาวรที่ต้องยืนยัน.

### Neutral

- **ขาวเย็น / ขาวกระดาษ** — canvas เป็นพื้นรอบงาน; surface เป็นแผงและกระดาษ.
- **หมึกพลัม / หมึกรอง** — ink สำหรับข้อความหลัก; muted สำหรับคำอธิบายและ placeholder; subtle สำหรับเครื่องช่วยรอง.
- **เส้นแบ่ง / ขอบควบคุม** — line แบ่งส่วนงาน; control-line เป็นขอบช่องกรอกและปุ่มรองที่มองเห็นชัด.
- **พื้นสถานะและข้อมูลย่อย** — badge-neutral/badge-ink, work-inset, paper-canvas และ ghost-hover แยกข้อมูลหรือ feedback ด้วยโทนพื้นแทนการยกเงา.

**The Readable Pastel Rule.** ใช้พาเลตสีอ่อนเป็นพื้น หมึก ink/muted และปุ่ม blue ที่เป็นพลัมเข้มใช้สำหรับข้อความและการกระทำสำคัญ สถานะต้องมีคำหรือไอคอนประกอบ; มิ้นต์ในเมนูไม่ได้หมายความว่าตรวจผ่าน.

## Typography

**Display Font / Body Font:** Noto Sans Thai พร้อม sans-serif fallback ใช้ทุกบทบาท ไม่มี display หรือ mono แยก. Self-host ผ่าน @fontsource/noto-sans-thai ใน app/layout.tsx โดยโหลดน้ำหนัก 400, 500, 600 และ 700.

**Character:** รูปอักษรไทยตรง อ่านง่าย และเปิดระยะบรรทัดให้สระและวรรณยุกต์ น้ำหนักช่วยแยกหัวเรื่อง ป้าย และรายละเอียด; คะแนนและจำนวนที่ต้องเทียบใช้ tabular-nums.

### Hierarchy

- **Headline** — หัวหน้าจอทั่วไป (27px, 650, line-height 1.5, letter-spacing −0.025em). ค่า 650 เป็นคำสั่ง CSS โดยไฟล์ฟอนต์โหลดน้ำหนักคงที่ตามรายการข้างต้น.
- **Title** — ชื่อส่วนงาน (17px, 600, line-height 1.6).
- **Subtitle** — หัวข้อย่อย (15px, 600, line-height 1.65).
- **Body** — เนื้อหาหลัก (14px, 400, line-height 1.65); ขนาดฐานบน phone เป็น 13px.
- **Label** — ปุ่มและป้ายการกระทำ (13px, 550, line-height 1.65).
- **Status** — badge ข้อความสั้น (11px, 500, line-height 1.8).
- **Score** — ตัวเลขคะแนนในแผงตรวจ (25px, 600, line-height 1.4).

หัวเรื่อง task workspace ใช้ 24px, ลดเป็น 21px เมื่อไม่เกิน 900px และ 19px เมื่อไม่เกิน 640px. ช่องกรอกใน main content และ dialog บน phone ใช้ 16px เพื่ออ่านง่ายและหลีกเลี่ยง iOS auto-zoom; ไม่ปิด browser zoom. สเกลพิมพ์เป็นหน่วยกายภาพตามแม่แบบ และไม่เทียบ px ของหน้าจอโดยตรง.

**The Thai Reading Rule.** ใช้ Noto Sans Thai และระยะบรรทัดที่เปิดไว้ในสเกลหลัก ข้อความสำคัญใช้ขนาด body หรือ label; ขนาด 8–10px ที่พบในรายละเอียดแน่นเป็นข้อจำกัดเฉพาะจุด ไม่เป็นมาตรฐานเนื้อหาหน้าจอใหม่.

## Layout

โครงหลักเป็นเมนูแนวตั้งมิ้นต์ แถบบริบทขาว และผืนงานสูง 100dvh. เมนู desktop กว้าง 248px; ลดเป็น 224px เมื่อไม่เกิน 1300px และ 205px เมื่อไม่เกิน 1100px. แถบบริบทที่ใช้จริงสูง 60px. เนื้อหามี padding 22px 28px และกว้างได้ถึง 1800px. จังหวะช่องว่างใช้กลุ่ม 4/8/12/16/20/24px พร้อมค่าตามบริบท เช่น gap ช่องกรอก 7px และ padding แผง 22px.

Designer, Print, Scanner, Review และ Results ใช้พื้นที่ viewport ที่เหลือ รายการ คิว ตาราง และตัวเลือกเลื่อนภายในแผงของตน แถบการกระทำไม่หายตามรายการยาว. Desktop ใช้กระดาษหรือภาพคู่กับเครื่องมือ/รายละเอียด; Print มีตัวเลือกด้านข้าง 300px. กระดาษรักษาสัดส่วน ไม่ย่อทั้งหน้าจอจนข้อความควบคุมเล็กลง.

### Responsive behavior

- **ไม่เกิน 1200px:** Designer สลับส่วนตัวอย่างกับหัวกระดาษ/โลโก้; Review สลับภาพ คำตอบ และคิวด้วยปุ่มเลือกส่วน แทนการบีบคอลัมน์ desktop.
- **ไม่เกิน 900px:** เมนูเป็น drawer 248px และมีเมนูด่วนด้านล่างสูง 62px พร้อม safe-area; header สูง 50px; content padding 14px 16px. Print สลับตัวอย่างกับตัวเลือก; งานตรวจแสดงส่วนที่เลือกเต็มพื้นที่.
- **ไม่เกิน 640px:** ปุ่มเลือกส่วนแบ่งความกว้างเท่ากัน ช่องกรอกหลัก 16px; ปุ่มหลักของ task สูงอย่างน้อย 44px. ตัวกรอง Results เรียงแนวตั้งและตารางเลื่อนภายใน ไม่รับรองว่าทุกคอลัมน์จะเห็นพร้อมกัน.
- **Scanner:** ภาพ กล้อง overlay และตัวจับมุมใช้ระนาบภาพเดียวกัน; viewport ใช้ความสูงที่เหลือของงาน โดยแถบกล้องและชัตเตอร์อยู่ในพื้นที่คงที่. ปุ่มควบคุมกล้องสูงอย่างน้อย 48px; corner handle มีพื้นที่ 48px.
- **Review:** รายการทุกข้อเป็นค่าเริ่มต้นและใช้พื้นที่หลักที่เลื่อนภายใน ลดสรุปคะแนนซ้ำ; ปุ่มแก้/ประวัติบน phone อย่างน้อย 44px. Desktop มีปุ่มขยายรายการคำตอบ.
- **หน้าสูงไม่เกิน 700px บนอุปกรณ์ไม่เกิน 900px:** ลดช่องว่างงานและซ่อนข้อความช่วยรองใน Designer เพื่อเก็บพื้นที่ให้กระดาษและการกระทำ.

แบบพิมพ์ school ใช้ A4 landscape 297 × 210mm; default เป็นสองใบซ้าย/ขวา แต่พรีวิวแสดงหนึ่งใบ. เมื่อ geometry หรือข้อความไม่พอ ขยายเป็นใบเต็ม A4 แทนการย่อ bubble; PDF จัดหน้าเองและพิมพ์ 100%.

## Elevation & Depth

แผงข้อมูลใช้พื้นและเส้นบาง ไม่มีเงาในสถานะพัก เงาอ่อนแยกกระดาษจากผืนงาน และเงาเฉพาะบทบาทแยกเมนู กล่องโต้ตอบ และข้อความแจ้งผลจากงานข้างหลัง.

### Shadow Vocabulary

- **เมนูที่ลอย:** 0 8px 24px #18263d14.
- **กระดาษบน Designer:** 0 7px 22px #233b5a20.
- **กระดาษก่อนพิมพ์:** 0 7px 24px #233b5a1f.
- **กระดาษใน Review:** 0 4px 18px #243c5820.
- **กล่องโต้ตอบ:** 0 20px 70px #10213740; overlay #10213780.
- **ข้อความแจ้งผล:** 0 7px 22px #152c3e30.

สีในเงาเป็นค่า CSS ที่ยังใช้จริง ไม่ใช่สีข้อความหรือ accent เพิ่ม.

**The Flat Seam Rule.** แผงข้อมูลพื้นราบใช้เส้นแบ่งและสีพื้นเพื่อแสดงขอบเขต เงาใช้กับกระดาษตัวอย่าง เมนูที่ลอย กล่องโต้ตอบ และข้อความแจ้งผลตามบทบาทที่บันทึกไว้.

## Shapes

มุมโค้งแบ่งตามหน้าที่: badge 5px, ปุ่มไอคอน 6px, ช่องกรอกและเมนู 7px, ปุ่มและ Notice 8px, แผง 12px และ dialog/กล้อง 14px. เส้นขอบทั่วไป 1px; เส้นเลือกแท็บ 2px. กระดาษเป็นสี่เหลี่ยมตามวัตถุจริง. วงกลมใช้กับ avatar จุดขั้นตอน ชัตเตอร์ และตัวจับมุม.

## Components

### App identity

ใช้ภาพ ScanSob ฉบับเต็ม ไม่ครอป ไม่เปลี่ยนสี และไม่หมุน ใน `AppLogo` ร่วมกันทั้งเมนูหลัก หน้าเข้าสู่ระบบ และหน้ารอสิทธิ์ กรอบ compact 56×56px; large 112×112px ลดเป็น 88×88px บน phone และหน้ารอสิทธิ์ รักษาสัดส่วนด้วย object-fit: contain บนพื้นขาว เมนูมีชื่อ ScanSob อ่านชัดแยกจากภาพขนาดเล็ก รูปมี width/height ที่แน่นอนและโหลด eager เพื่อไม่ให้แบรนด์กระโดดหลังโหลด.

ชื่อแท็บและชื่อเมื่อติดตั้งเป็น ScanSob ไอคอน browser 32px, Apple 180px และ manifest 192/512px พร้อม maskable 512px ที่ภาพทั้งหมดอยู่ในวง safe zone กลาง 80% ไม่ใช้ไอคอนแอปแทนตราโรงเรียนบน OMR การติดตั้งเป็นทางเข้าเว็บแบบ standalone และยังใช้อินเทอร์เน็ต/Google approval/RLS ตามเดิม ไม่เพิ่ม offline cache ของข้อมูลนักเรียน.

### Buttons

ปุ่มเป็นมิตรและตรงงาน ใช้มุม 8px, padding 9px 15px, gap 8px และความสูงขั้นต่ำ 42px. ปุ่มหลักพลัมเข้มมีข้อความขาว; ปุ่มรองขาวมีขอบ control-line; ghost ใช้ muted บนพื้นใส และเลือกด้วย blue-light/blue. ชี้ปุ่มรองเป็นลาเวนเดอร์อ่อน; ชี้ ghost เป็น ghost-hover.

Feedback พื้น สี และขอบใช้ 130ms; กดปุ่มที่ไม่ disabled ย่อเป็น scale(0.98) ด้วย ease-out แล้วกลับทันที. วงโฟกัสทั่วไป 3px สี focus เว้น 3px; disabled opacity 0.46 พร้อม cursor not-allowed. ปุ่มไอคอน desktop 36px; งานแก้คำตอบ phone 44px.

### Chips

Badge มุม 5px, padding 3px 9px, status type และข้อความไทยสั้น. API neutral/blue/green/amber/red เดิมคงอยู่; blue หมายถึงข้อมูลพลัมอ่อนในโลกสีนี้. Badge ไม่เป็นปุ่มโดยอัตโนมัติ และสีเขียวสงวนให้ความสำเร็จ/ตรวจแล้ว.

### Cards / Containers

แผงพื้น surface ขอบ line 1px มุม 12px padding 22px; phone 17px. แผงตารางไม่มี padding รอบนอกในบริเวณ toolbar/table ที่ต้องใช้พื้นที่ร่วมกัน. ส่วนย่อยใช้เส้นแบ่งตามจริง ไม่มีเงาเพิ่มทุกแผง.

### Inputs / Fields

ช่องกรอกพื้นขาว ขอบ control-line 1px มุม 7px, padding 10px 12px และความสูงขั้นต่ำ 43px. Label แยกบรรทัดเว้น 7px; caret พลัมและ placeholder muted. วงโฟกัสทั่วไป 3px; search wrapper ใช้ focus-within 2px เว้น 2px. Error มีคำไทยสี red หรือ Notice error; ไม่ใช้ขอบสีเพียงอย่างเดียว.

### Navigation and workspace selection

เมนูอยู่บน mint ใช้ nav-text และไอคอนเส้นเข้ม; สูงอย่างน้อย 44px, padding 11px 13px, gap 12px, มุม 7px, type 12px. ชี้เป็น nav-hover; หน้าปัจจุบันเป็น lavender/nav-active-ink พร้อม aria-current และน้ำหนัก 650. ไอคอนหน้าที่เลือกยืนยันสั้น ๆ จาก scale(0.88) เป็น 1 ใน 220ms.

ปุ่มเลือกส่วนงานสูงอย่างน้อย 44px ใช้ aria-pressed ใน role group ตาม implementation. ส่วนปัจจุบันมีพื้น lavender ข้อความ blue เส้นล่าง 2px และมุมบน 8px; ส่วนอื่น muted. Feedback เปลี่ยนพื้น 220ms และสี/ขอบ 130ms. Phone ใช้แต่ละปุ่มแบ่งความกว้างเท่ากัน.

### Notices, dialogs and concise Thai copy

Notice มุม 8px, padding 12px 14px, gap 9px, type 12px และ line-height 1.75 พร้อมไอคอน 18px. Error ใช้ role alert; ข้อความอื่น role status. Dialog มุม 14px, padding 25px, กว้าง min(560px, calc(100vw − 32px)), เลื่อนภายใน calc(100dvh − 60px) และมาถึงด้วย opacity/translate 5px ใน 220ms; overlay 150ms, toast 160ms.

คำไทยระบุงาน การกระทำ หรือการแก้ปัญหาตรง ๆ. คงคำเตือนยืนยันคะแนน การแทนที่ สิทธิ์อ่านอย่างเดียว และข้อมูลตัวอย่าง; ตัดคำอธิบายเทคนิคที่ไม่ช่วยตัดสินใจ. ข้อความช่วยอัปโหลดโลโก้ใน Settings และ Designer ใช้ตรงกัน: “รูปภาพขนาดไม่เกิน 5 MB”.

### Exam route and motion

เส้นทางชุดสอบเป็นจุด 27px เชื่อมด้วยเส้น 2px; phone 25px. ขั้นที่เสร็จมีเครื่องหมายถูก/teal ขั้นปัจจุบันเป็นอำพันพร้อมชื่อ ขั้นอนาคตสีเทา. ใช้กับลำดับงานจริง.

หน้าใหม่เข้าด้วย opacity 0.85 → 1 และ translateY(3px → 0) ใน 180ms; การเคลื่อนไหวหลักใช้ cubic-bezier(0.16, 1, 0.3, 1). Drawer เดิม 200ms และ loading spinner 800ms linear คงอยู่. เมื่อ prefers-reduced-motion: reduce, CSS ลด animation/transition เป็น 0.01ms และ scroll เป็น auto ปิดการย่อปุ่มและ animation ไอคอน/dialog; page transition เหลือ opacity 0.9 → 1 ใน 80ms. ไม่เพิ่ม choreography ที่หน่วงการทำงาน; กระดาษพิมพ์ไม่มี animation แยก.

### Camera controls

พื้นที่กล้องพื้น #101d2d กับข้อความสว่างและชัตเตอร์ขาว 68px ขอบ 4px วงนอก 2px. Corner handle 48px ครอบจุด 14px และวงโฟกัส #8ac8ff. กรอบ polygon เปลี่ยนสี 220ms; เมื่อ QR ล็อกแล้ว แถบสถานะยืนยันผ่านการเปลี่ยนพื้นใน 250ms. สถานะค้นหา/ยังไม่พร้อม/พร้อมจับภาพมีข้อความ ไอคอน และกรอบที่ต่างกัน; progress ความนิ่งไม่เป็นหลักฐานว่าคะแนนถูกต้อง.

Auto-capture เปิดเริ่มต้นและจำตัวเลือกใน browser. มีถ่ายใหม่/ใบถัดไป แยกการจับภาพจากการบันทึกและการยืนยันคะแนน; ไม่ยืนยันคะแนนเอง. ค่า heuristic ยังต้องทดสอบกล้องจริง.

### School paper header and print identity

รูปแบบ school ใหม่เป็น geometryVersion 4; classic 2 และ compact 3 คงไว้สำหรับความเข้ากันได้. พรีวิว SVG และ jsPDF ใช้ resolveGeometry/printTexts ชุดเดียวกัน. กระดาษขาว หมึกดำ QR และ marker แยกจากสี UI.

โลโก้ school อยู่ในกรอบ 20 × 20mm ทางซ้าย รักษาสัดส่วนและ orientation ของภาพต้นฉบับ; ขนาดกรอบไม่ย่อไฟล์ที่จัดเก็บ. หัวโรงเรียนขนาด 4.1mm แยกคำ “โรงเรียน” กับชื่อในบรรทัดถัดไปเมื่อใช้ prefix นี้; pitch 4.5mm. กล่องเขียนคะแนน 29 × 14mm ด้านขวาบนแสดงจุดแล้ว / คะแนนเต็ม โดยไม่มีคำ “คะแนน”; QR กว้าง 23mm อยู่ด้านล่างกล่องในพื้นที่สำรอง.

ชื่อ–สกุลและวิชามีเส้นจุดรองรับข้อมูลที่พิมพ์; ระดับชั้น ห้อง และเลขที่แยกอ่านได้. รหัส 5 หลักคง leading zeroes; ใบรายชื่อเติมรหัสและ bubble ดำตามนักเรียนจริง ใบสำรองคงช่องเขียน/ฝนเอง. Layout lock และ QR identity ไม่เปลี่ยนย้อนหลังตามสีหน้าจอหรือโลโก้ล่าสุด. การตรวจ PDF ในรอบนี้เป็น visual evidence; การสอบเทียบพิมพ์และ OMR จริงยังแยกตรวจ.

## Do's and Don'ts

### Do:

- Do ใช้พาเลตสีอ่อนกับพื้น และหมึกหรือพลัมเข้มกับข้อความและการกระทำ.
- Do ใช้สีสถานะพร้อมคำภาษาไทยและไอคอนที่บอกความหมายเดียวกัน.
- Do ให้ปุ่ม แท็บ และกรอบกล้องตอบสนองสั้นโดยไม่หน่วงงาน; เคารพ prefers-reduced-motion.
- Do ใช้เส้นบางและพื้นที่ว่างแยกส่วนข้อมูลก่อนเพิ่มเงา.
- Do ให้กระดาษคงพื้นขาว หมึกดำ สัดส่วนกายภาพ และพิกัดตามรุ่นที่ล็อกไว้.
- Do คงวงโฟกัสที่เห็นชัด ชัตเตอร์ 68px พื้นที่จับมุม 48px และการเลื่อนภายในรายการยาว.

### Don't:

- Don't ใช้ข้อความสี pastel อ่อนบนพื้นขาว หรือใช้สีอย่างเดียวบอกสถานะ.
- Don't ใช้มิ้นต์หรือลาเวนเดอร์สื่อว่าผลที่ยังรอตรวจได้รับการยืนยันแล้ว.
- Don't เพิ่ม gradient, glassmorphism หรือ animation ที่รบกวนการอ่านและชะลอการทำงาน.
- Don't ย่อทั้งหน้าหรือปิด browser zoom เพื่ออัดเครื่องมือ desktop ลงใน phone/iPad.
- Don't เปลี่ยนพิกัด classic/compact หรือกระดาษที่พิมพ์แล้วเพื่อให้เข้ากับหัวกระดาษ school รุ่นใหม่.
- Don't ยกระดับข้อความประกอบขนาด 8–10px หรือสีหมวดวิชาให้เป็นสเกลหลักของหน้าจอใหม่.
