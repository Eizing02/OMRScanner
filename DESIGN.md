---
name: ScanSob
description: พื้นที่ทำงานครูไทยแบบสารบัญงาน กรมท่านำทาง โคบอลต์เลือก ทีลเสร็จ
colors:
  mint: "#ddf4f1"
  sky: "#dbeafe"
  lavender: "#c7ddfc"
  lilac: "#b7cfeb"
  canvas: "#eef3f8"
  surface: "#fff"
  ink: "#16253b"
  muted: "#52647b"
  subtle: "#607088"
  line: "#cdd8e5"
  nav: "#10243a"
  nav-text: "#d7e4f2"
  blue: "#1d4ed8"
  blue-light: "#e5eeff"
  action-hover: "#163fba"
  focus: "#2563eb"
  control-line: "#7f92aa"
  teal: "#087668"
  teal-light: "#e4f4f0"
  amber: "#865500"
  amber-light: "#fff3d7"
  red: "#b52e36"
  red-light: "#fff0f1"
  field: "#f4f8fd"
  nav-hover: "#1d3b59"
  nav-muted: "#b4c8dd"
typography:
  headline:
    fontFamily: Noto Sans Thai, sans-serif
    fontSize: 27px
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  task-headline:
    fontFamily: Noto Sans Thai, sans-serif
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.025em"
  form-title:
    fontFamily: Noto Sans Thai, sans-serif
    fontSize: 19px
    fontWeight: 600
    lineHeight: 1.5
  title:
    fontFamily: Noto Sans Thai, sans-serif
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.6
  subtitle:
    fontFamily: Noto Sans Thai, sans-serif
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.65
  body:
    fontFamily: Noto Sans Thai, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: Noto Sans Thai, sans-serif
    fontSize: 13px
    fontWeight: 550
    lineHeight: 1.65
  status:
    fontFamily: Noto Sans Thai, sans-serif
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.8
  score:
    fontFamily: Noto Sans Thai, sans-serif
    fontSize: 25px
    fontWeight: 600
    lineHeight: 1.4
rounded:
  badge: 5px
  icon: 6px
  field: 7px
  control: 8px
  panel: 12px
  floating: 14px
  circle: 50%
spacing:
  compact: 4px
  field-gap: 7px
  control-gap: 8px
  cluster: 12px
  mobile-gutter: 16px
  work-gap: 20px
  panel-padding: 22px
  section-gap: 24px
  shell-gutter: 28px
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 9px 15px
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 9px 15px
  button-secondary-hover:
    backgroundColor: "{colors.blue-light}"
    textColor: "{colors.blue}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 9px 15px
  button-ghost-selected:
    backgroundColor: "{colors.blue-light}"
    textColor: "{colors.blue}"
  button-danger:
    backgroundColor: "{colors.red}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: 9px 15px
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: 10px 12px
  input-focus:
    backgroundColor: "{colors.surface}"
  input-error:
    backgroundColor: "{colors.red-light}"
    textColor: "{colors.ink}"
  nav-item:
    backgroundColor: transparent
    textColor: "{colors.nav-text}"
    rounded: "{rounded.field}"
    padding: 11px 13px
  nav-item-hover:
    backgroundColor: "{colors.nav-hover}"
  nav-item-active:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
  badge-blue:
    backgroundColor: "{colors.blue-light}"
    textColor: "{colors.blue}"
    typography: "{typography.status}"
    rounded: "{rounded.badge}"
    padding: 3px 9px
  badge-green:
    backgroundColor: "{colors.teal-light}"
    textColor: "{colors.teal}"
    typography: "{typography.status}"
    rounded: "{rounded.badge}"
    padding: 3px 9px
  badge-amber:
    backgroundColor: "{colors.amber-light}"
    textColor: "{colors.amber}"
    typography: "{typography.status}"
    rounded: "{rounded.badge}"
    padding: 3px 9px
  badge-red:
    backgroundColor: "{colors.red-light}"
    textColor: "{colors.red}"
    typography: "{typography.status}"
    rounded: "{rounded.badge}"
    padding: 3px 9px
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-padding}"
  answer-choice:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.icon}"
    width: 44px
    height: 44px
  answer-choice-selected:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
  workspace-tab:
    backgroundColor: transparent
    textColor: "{colors.muted}"
    padding: 8px 12px
  workspace-tab-active:
    backgroundColor: "{colors.lavender}"
    textColor: "{colors.blue}"
  exam-action-footer:
    backgroundColor: "{colors.field}"
    textColor: "{colors.muted}"
    padding: 16px 28px
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.floating}"
    padding: 25px
    width: min(560px, calc(100vw - 32px))
---

# Design System: ScanSob

## Overview

**Creative North Star: "สารบัญงานครู"**

“สารบัญงานครู” ใช้ลำดับอ่านแบบสารบัญบทเรียนไทยเพื่อให้ครูเห็นงานปัจจุบัน ส่วนข้อมูลที่กำลังแก้ และการกระทำถัดไปได้ทันที เมนูกรมท่าแยกการนำทางจากผืนงานสีเทาเย็น แผงขาวรองรับเนื้อหา และพื้นช่องกรอกที่ติดสีเล็กน้อยบอกว่าข้อมูลแก้ไขได้ โคบอลต์สื่อการเลือกและการกระทำหลัก ส่วนทีลสื่อขั้นตอนที่เสร็จพร้อมข้อความหรือเครื่องหมายประกอบ.

นี่คือโลกภาพแทนที่พาเลต pastel ตามการอนุมัติ 28 ตุลาคม 2026 และ PRODUCT.md โดยคงเส้นทางและรูปแบบการทำงานที่ครูคุ้นเคย ตัวอักษรไทยอ่านง่าย เส้นแบ่งบาง และการจัดกลุ่มข้อมูลทำหน้าที่สร้างลำดับ สารบัญเป็นหลักการอ่าน ไม่ใช่ภาพตกแต่งหนังสือ ไม่มีภาพ raster ใหม่หรือการตกแต่งสามมิติในระบบที่ส่งมอบ.

ค่าด้านบนสกัดจาก :root และกฎที่ใช้จริงใน app/globals.css พร้อมองค์ประกอบ shared UI, main shell, exam form และ school directory; app/layout.tsx โหลด Noto Sans Thai และสีแถบเบราว์เซอร์ ภาพใน .impeccable/review ใช้ตรวจการแสดงผล ไม่ใช่หลักฐานรับรองกล้อง เครื่องพิมพ์ การติดตั้งฐานข้อมูล หรือความแม่นยำในการให้คะแนน.

**Key Characteristics:**

- ลำดับหน้า ส่วน และช่องกรอกชัดเจนในพื้นที่ทำงานครู
- กรมท่านำทาง โคบอลต์เลือก ทีลเสร็จ พร้อมพื้นงานสว่าง
- Noto Sans Thai และตัวเลข tabular ในคะแนนหรือข้อมูลที่ต้องเทียบ
- ช่องกรอกติดสี ขอบควบคุมชัด และสถานะ focus/error/disabled ครบ
- พื้นที่งานเลื่อนภายในและแถวการกระทำคงอยู่เมื่อรายการยาว
- ข้อความไทยกระชับ การตอบสนองสั้น และเคารพ reduced motion

## Colors

พาเลตแยกชั้นงานและความหมายของสถานะอย่างชัดเจน ค่าจริงใน frontmatter เป็นข้อกำหนด; ชื่อ CSS เดิมไม่ใช่คำอธิบายพาเลตเดิม.

### Primary

- **โคบอลต์การกระทำ** (blue) ใช้กับปุ่มหลัก หน้าปัจจุบัน คำตอบที่เลือก caret และลิงก์; action-hover ทำให้ hover เข้มขึ้น และ blue-light รองรับพื้นข้อมูลหรือสถานะชี้.
- **วงโฟกัสโคบอลต์** (focus) แยก keyboard focus จากการเลือก ไม่ตัดวงเมื่อเลือกคำตอบหรือเปิด dialog.

### Secondary

- **ทีลเสร็จงาน** (teal / teal-light) ใช้กับขั้นตอนที่เสร็จ การบันทึกสำเร็จ และสถานะยืนยันที่มีข้อความประกอบ; ไม่ใช้สีนี้รับรองคะแนนจากการจับภาพเพียงอย่างเดียว.

### Tertiary

- **อำพันเตือน** (amber / amber-light) สำหรับสิ่งที่ต้องตรวจหรือคำเตือน.
- **แดงเสี่ยงและผิดพลาด** (red / red-light) สำหรับ error การปฏิเสธ และปุ่มทำลายข้อมูลที่ต้องยืนยัน.

### Neutral

- **กรมท่านำทาง** (nav) รองรับเมนู rail; nav-text และ nav-muted เป็นข้อความสว่าง ส่วน nav-hover เป็นพื้น hover ที่ยังอยู่ในชั้นนำทาง.
- **ผืนงานเทาเย็น** (canvas), **แผงขาว** (surface), **พื้นแก้ไขติดสี** (field) แยกพื้นที่งาน แผง และช่องกรอก.
- **หมึกกรมท่า** (ink) สำหรับข้อมูลหลัก; muted/subtle สำหรับข้อมูลรอง; line ใช้เส้นแบ่ง และ control-line ใช้ขอบช่องกรอกหรือปุ่มรองที่ต้องมองเห็นว่าใช้งานได้.
- mint, sky, lavender และ lilac เป็น alias ที่ยังใช้เพื่อความเข้ากันได้ ปัจจุบันมีค่าเป็นสีทีล/ฟ้าอ่อนของโลกใหม่ เช่น lavender รองรับแท็บส่วนงานที่เลือก ไม่อนุญาตให้คืนสี pastel รุ่นเดิม.

**The Task Color Rule.** ใช้โคบอลต์กับการเลือกหรือการกระทำ ทีลกับขั้นตอนที่เสร็จหรือผลที่ยืนยันแล้ว และอำพัน/แดงกับคำเตือนหรือความเสี่ยง สีต้องมีข้อความหรือไอคอนที่สื่อความหมายเดียวกัน การจับภาพสำเร็จไม่เท่ากับยืนยันคะแนน.

## Typography

**Display and Body Font:** Noto Sans Thai, sans-serif. ฟอนต์ self-hosted โหลดน้ำหนักจริง 400/500/600/700 ผ่าน app/layout.tsx; ค่า 550/650 ใน CSS เป็นค่าที่เบราว์เซอร์จับคู่กับน้ำหนักที่มี ไม่ใช่ไฟล์ฟอนต์ variable ที่โหลดเพิ่ม.

ลำดับตัวอักษรเน้นการสแกนงานภาษาไทย ใช้น้ำหนัก ขนาด และพื้นที่ว่างแยกหัวข้อโดยไม่พึ่งตัวพิมพ์ใหญ่ ไอคอนเส้น Lucide รองรับข้อความ ไม่ใช้ glyph แทนไอคอน.

### Hierarchy

- **Headline** — หัวหน้าทั่วไป; **Task headline** — หัวพื้นที่ทำงานที่กระชับกว่า ตาม token แยกกัน.
- **Form title** — หัวกลุ่มข้อมูลในตัวสร้างชุดสอบ; ลดเป็นขนาด title ที่หน้าจอไม่เกิน 560px.
- **Title / Subtitle** — หัวส่วนและหัวข้อย่อย; **Body / Label** — เนื้อหา ป้าย และปุ่ม; **Status** — badge สั้น; **Score** — คะแนนที่เด่นในแผงตรวจ.
- หัว task ลดเป็น 21px เมื่อไม่เกิน 900px และ 19px เมื่อไม่เกิน 640px. Body บน phone ใช้ 13px; ช่องกรอกใน main content/dialog ใช้ 16px ที่ไม่เกิน 640px เพื่ออ่านและแก้ข้อมูลได้สะดวกโดยไม่ปิด zoom.
- ใช้ font-variant-numeric: tabular-nums กับคะแนน จำนวนข้อ และตัวเลขที่เทียบเป็นแถว; ขนาดบนกระดาษอ้างหน่วยกายภาพในแม่แบบแยกจาก px ของ UI.

**The Thai Reading Rule.** ใช้ Noto Sans Thai กับระยะบรรทัดในสเกลหลัก ข้อความสำคัญใช้ขนาด body หรือ label; ข้อความประกอบขนาด 8–10px ที่ยังพบในบางจุดไม่เป็นมาตรฐานสำหรับหน้าจอใหม่.

## Layout

โครงงานสูง 100dvh และเก็บ overflow ที่ชั้นงาน แทนปล่อยทั้งหน้าโตตามรายการ. Rail desktop กว้าง 248px ลดเป็น 224px ที่ไม่เกิน 1300px และ 205px ที่ไม่เกิน 1100px; ต่ำกว่าเกณฑ์ 900px เปลี่ยนเป็น drawer 248px และมีเมนูด่วนด้านล่าง. Header ที่ใช้จริงสูง 60px; เหลือ 50px ที่ไม่เกิน 900px. เนื้อหากว้างสูงสุด 1800px, padding หลัก 22px 28px; ที่ไม่เกิน 900px ใช้ 14px 16px และเว้นเมนูล่าง 62px รวม safe-area.

จังหวะช่องว่างใช้สเกลใน frontmatter; form ทั่วไปสองคอลัมน์ gap 22px. ตัวสร้างชุดสอบกว้างสูงสุด 1120px มีสองขั้นข้อมูล/เฉลยก่อนส่งต่อการออกแบบกระดาษ. เนื้อหาแต่ละขั้นเลื่อนภายในด้วย min-height: 0, overscroll-behavior: contain และ scrollbar-gutter: stable; แถวการกระทำท้ายฟอร์มไม่เลื่อนตามรายการ. ส่วนข้อมูลคั่นด้วยเส้นบาง ไม่เพิ่มการ์ดซ้อนทุกกลุ่ม.

### Responsive behavior

- **ไม่เกิน 1200px:** Designer และ Review ใช้ปุ่มเลือกส่วนแทนบีบทุกคอลัมน์ให้แคบ.
- **ไม่เกิน 900px:** Print และเครื่องมืองานแสดงส่วนที่เลือกเต็มพื้นที่; เมนูล่างยังเข้าถึงได้. ตัวสร้างชุดสอบลด padding เนื้อหาเป็น 20px และ footer เป็น 12px 20px.
- **ไม่เกิน 640px:** ปุ่มเลือกส่วนแบ่งความกว้างกัน ช่องกรอกหลักเป็น 16px ปุ่มงานหลักอย่างน้อย 44px; ตาราง/รายการเลื่อนภายใน.
- **ไม่เกิน 560px:** ตัวสร้างชุดสอบเรียงช่องกรอกหนึ่งคอลัมน์, padding เนื้อหา 18px 16px, ข้อและคะแนนอยู่แถวแรก ตัวเลือก 44px อยู่แถวถัดไป; footer ตัดบรรทัดได้โดยไม่ซ่อนสถานะหรือปุ่มหลัก.
- **จอเตี้ย:** มีเงื่อนไข height 700px/500px ร่วมกับ width 900px/1100px เพื่อเก็บ minimum usable pane. Phone landscape กล้องใช้ปุ่มข้างภาพ; เมื่อพื้นที่ไม่พอให้ส่วนงานเลื่อน ไม่บังคับหมุนเครื่องหรือซ่อนการกระทำ.

Designer, Print, Scanner, Review และ Results ใช้พื้นที่ viewport ที่เหลือร่วมกับ pane ภายใน. กระดาษและภาพรักษาสัดส่วนโดยเครื่องมือยังอ่านได้; ต้นแบบงานพิมพ์ไม่ใช่เหตุให้ย่อ UI ทั้งหน้า.

## Elevation & Depth

แผงข้อมูลพื้นราบ ใช้สีและเส้นแบ่งแสดงชั้นงาน เงาแยกวัตถุกระดาษและชั้นลอยตามหน้าที่ ไม่ใส่เงาให้ทุกแผง.

### Shadow Vocabulary

- **เมนูลอย:** 0 8px 24px #18263d14.
- **กระดาษบน Designer:** 0 7px 22px #233b5a20.
- **กระดาษก่อนพิมพ์:** 0 7px 24px #233b5a1f.
- **กระดาษใน Review:** 0 4px 18px #243c5820.
- **Dialog:** 0 20px 70px #10213740 พร้อม overlay #10213780.
- **Toast:** 0 7px 22px #152c3e30.

Dialog ฐานใช้ overlay/content ที่ z-index 100/101. การยืนยันหรือถังขยะที่เปิดทับ directory dialog ใช้ layer="stacked" ให้ overlay/content เป็น 110/111; overlay ชั้นใหม่ต้องปิดทับเนื้อหาของ dialog เดิมทั้งหมด. Toast อยู่ชั้น 200. ค่าชั้นคือพฤติกรรมร่วมของ Modal ไม่ใช่การวาง popup อิสระบนแต่ละหน้า.

**The Flat Seam Rule.** แผงข้อมูลพื้นราบแบ่งส่วนด้วยเส้นและช่องว่าง เงามีหน้าที่แยกกระดาษ เมนูลอย กล่องโต้ตอบ และข้อความแจ้งผลจากงานข้างหลัง.

## Shapes

มุมโค้งแบ่งตามหน้าที่ใน frontmatter: badge กะทัดรัด ปุ่มไอคอน/ตัวเลือกเฉลย ช่องกรอก/เมนู ปุ่ม/Notice แผง และ dialog. เส้นขอบทั่วไป 1px; เส้นล่างแท็บส่วนงาน 2px. วงกลมใช้กับ avatar จุดขั้นตอน ชัตเตอร์ และตัวจับมุม. กระดาษเป็นสี่เหลี่ยมตามวัตถุจริง ไม่มีการบิดหรือใส่มุมตกแต่งลงใน geometry.

## Components

### Buttons

การกระทำตรงงาน ใช้ Noto Sans Thai, มุม control, padding 9px 15px, gap 8px และ min-height 42px. ปุ่มหลัก blue/ขาว; hover action-hover. ปุ่มรอง field พร้อมขอบ control-line; hover เป็น blue-light พร้อมขอบ/ข้อความ blue. Ghost ใช้พื้นใสและ muted, hover #e8edf5; selected ใช้ blue-light/blue.

ปุ่มลบแบบเต็มใช้ red/ขาวและ hover brightness(0.9). ทางเข้าการลบแบบ quiet ใช้พื้น surface ขอบ/ข้อความ red และ hover red-light. ปุ่มทั่วไป focus-visible เป็นเส้น focus 3px เว้น 3px; disabled opacity 0.46 และ cursor not-allowed. ปุ่มที่กดได้มี scale(0.98) ชั่วครู่; ปิด transform นี้เมื่อ reduced motion. ปุ่มไอคอนทั่วไป 36px ส่วนควบคุมงานบน phone ใช้เกณฑ์ของ pane ตนเองอย่างน้อย 44px.

### Chips

Badge neutral/blue/green/amber/red ใช้ข้อความสั้น มุม badge, padding 3px 9px และ status type. Neutral เป็นพื้น #f0f3f7/ข้อความ #556378; variant อื่นใช้คู่สีสถานะ. Badge ไม่เป็นปุ่มโดยอัตโนมัติ และคำว่า green ใน API ใช้ teal ปัจจุบัน.

### Cards / Containers

แผง surface, ขอบ line 1px, มุม panel, padding 22px และ 17px บน phone. แผงตารางหรือ task form ที่มี toolbar/footer ใช้ขอบนอกเดียว แล้วจัด padding และ scroll ให้พื้นที่ลูก. ตัวสร้างชุดสอบใช้ส่วนอ่านลำดับกับเส้นแบ่ง ไม่เพิ่มเงารอบกลุ่มข้อมูล.

### Inputs / Fields

พื้น field, ขอบ control-line 1px, มุม field, padding 10px 12px และ min-height 43px; ใน exam form อย่างน้อย 44px. Label แยกบรรทัด gap 7px. Placeholder ใช้ muted; focus เปลี่ยนเป็น surface ขอบ blue และ outline focus 2px เว้น 1px. aria-invalid="true" ใช้ขอบ red และพื้น red-light พร้อมข้อความไทยสี red. Disabled ใช้พื้น #e5ecf4/ข้อความ muted และ cursor not-allowed.

ช่องตัวเลขอาจว่างระหว่างแก้ไข แล้วตรวจช่วงค่าก่อนข้ามขั้นหรือบันทึก ไม่เติมค่าเริ่มต้นทันทีขณะลบ. Error ใน setup ส่ง focus ไปช่องแรกที่ aria-invalid เพื่อให้แก้ตรงจุด.

### Navigation and workspace selection

เมนูบน nav ใช้ nav-text พร้อมไอคอนเส้นสีสว่าง, min-height 44px, padding 11px 13px, gap 12px, มุม field และ type 13px. Hover ใช้ nav-hover; หน้าปัจจุบันใช้ blue/ขาว น้ำหนัก 650 พร้อม aria-current. ค่าฟอนต์ 13px มาจากกฎล่าสุดที่ทับขนาดเล็กของ rail เดิม.

แท็บส่วนงาน min-height 44px, padding 8px 12px, type 13px. ส่วนปัจจุบันใช้ lavender/blue พร้อมเส้นล่าง blue 2px และมุมบน 8px; ส่วนอื่น muted. ใช้ role group/aria-pressed ตามองค์ประกอบจริง. เมนู phone แบบล่างแสดงไอคอนและคำไทยสั้น; drawer ยังคงเมนูเต็ม.

### Progressive exam form and answer choices

ขั้นปัจจุบันแสดงจุดโคบอลต์และข้อความ ส่วนเสร็จใช้ทีลพร้อมเครื่องหมายถูก; แต่ละขั้นมีชื่อที่อ่านตรงงาน. เฉลยทุกข้อเริ่ม null และปุ่มทุกตัวเลือกเป็นกลางจนกว่าครูเลือก; selected เป็น blue/ขาวและเครื่องหมายถูกมุมขวาบน. ปุ่มในตัวสร้างชุดสอบมีขนาด 44×44px, type 15px และ gap 5px desktop/8px phone. Hover ที่ยังไม่เลือกใช้ขอบ blue พื้น blue-light และข้อความ blue.

แถวเฉลย desktop แบ่งข้อ/ตัวเลือก/คะแนนเป็น 42px 1fr 66px และกริดข้อใช้ auto-fit ขั้นต่ำ 390px ตามพื้นที่จริง; phone แยกตัวเลือกเป็นอีกแถว. แถบความคืบหน้าบอกจำนวนที่เลือกและช่วงคะแนน; ครบทุกข้อจึงใช้ทีล. ลดห้าตัวเลือกเป็นสี่ต้องล้าง E เป็นค่าว่าง พร้อมข้อความให้เลือกใหม่ ห้ามแทน A. ปุ่มบันทึกยัง disabled จนเฉลยและคะแนนครบและถูกต้อง.

Footer ใช้ field กับเส้นบน line และ flex-shrink: 0; สถานะอยู่ใกล้ปุ่มหลักและตัดบรรทัดบน phone ได้. การเลื่อน 60 ข้อไม่ทำให้ทางบันทึกหลุดออกจากพื้นที่ทำงาน.

### Notices, dialogs and destructive confirmation

Notice ใช้ icon 18px กับคำไทย, padding 12px 14px, gap 9px, มุม control, type 12px และ line-height 1.75. Error มี role alert; ข้อความอื่น role status. คำไทยระบุงานหรือการแก้ปัญหาตรง ๆ โดยรักษาคำเตือนสำคัญและสถานะอ่านอย่างเดียว.

Dialog ใช้ Radix, มุม floating, padding 25px, width min(560px, calc(100vw - 32px)) และ max-height calc(100dvh - 60px) พร้อมเลื่อนภายใน. ใช้ layer ฐาน/stacked ตาม Elevation & Depth; คืน focus ไปจุดเรียกเมื่อกำหนด returnFocusRef. การย้ายโรงเรียนเข้าถังขยะแสดงชื่อ จำนวนผลกระทบ ระยะกู้คืน และช่องให้พิมพ์ชื่อโรงเรียนตรงทุกตัว; ปุ่มอันตราย disabled จนเงื่อนไขพร้อม ข้อมูลเตือนไม่ถูกแทนด้วยถ้อยคำทั่วไป.

### Motion and camera controls

Feedback ใช้ motion-fast 130ms, motion-state 220ms และ ease-out ใน CSS. การเปลี่ยนหน้า opacity 0.85 → 1 กับ translateY 3px → 0 ใช้ 180ms; dialog 220ms, overlay 150ms, toast 160ms. ไม่มี choreography ที่หน่วงงานหรือ animation ของกระดาษ.

Reduced motion ปิด entrance/spatial animation และใช้ scroll-behavior auto; คง color/background/border/opacity ที่ 80ms linear. Spinner หลักช้าลงเป็น 1.4s เพื่อแสดงงานที่ค้าง; ไอคอน .spin ใน exam form หยุดหมุน. ไม่ถือว่าการลด motion เป็นเหตุให้ซ่อนสถานะ loading.

กล้องใช้พื้นเข้ม #101d2d ข้อความสว่าง ชัตเตอร์ 68px และ corner handle พื้นที่ 48px ครอบจุด 14px. ค้นหา/ยังไม่พร้อม/พร้อมจับภาพใช้ข้อความ ไอคอน และเส้นกรอบด้วย. ค่าสี overlay กล้องที่ตัดกับภาพจริงเป็น scope เฉพาะ ไม่ใช่สี accent ใหม่ของแผงงาน. แยกการจับภาพ การอัปโหลด และการยืนยันคะแนน; ไม่ใช้ความนิ่งเป็นหลักฐานว่าคะแนนถูกต้อง.

### App identity and printed OMR boundary

ใช้ภาพ ScanSob ฉบับเต็มใน AppLogo รักษาสัดส่วนด้วย object-fit: contain บนพื้นขาว; compact 56px, large 112px และ 88px บน phone/หน้ารอสิทธิ์. โลโก้แอปไม่แทนตราโรงเรียนบน OMR. ชื่อแท็บ/ติดตั้งคือ ScanSob; viewport themeColor ตรงกับ nav. ระบบยังเป็นเว็บออนไลน์และไม่มี raster ใหม่ในรอบนี้.

กระดาษยังเป็นพื้นขาว หมึกดำ และหน่วยกายภาพตามแม่แบบ. school-v2 / geometry 5 เป็นรุ่นพิมพ์ใหม่โดยคง reader รุ่น 2/3/4; A4 landscape สองใบซ้าย/ขวาเป็นค่าเริ่มต้นและขยายเป็นใบเต็มเมื่อ validator ต้องการ. สี UI ไม่เปลี่ยน bubble, marker, QR, student code, สัดส่วน หรือกฎให้คะแนน. รายละเอียด print layout อยู่ในเอกสาร geometry ที่เกี่ยวข้องและ snapshot รุ่นนั้น; ห้ามใช้ DESIGN.md เพื่อแก้รุ่นที่พิมพ์แล้ว.

## Do's and Don'ts

### Do:

- Do ใช้บทบาทกรมท่า โคบอลต์ ทีล และพื้นช่องกรอกตาม token ปัจจุบัน.
- Do ให้เฉลยเริ่มว่าง แสดงความคืบหน้า และใช้สีโคบอลต์พร้อมเครื่องหมายถูกเมื่อครูเลือก.
- Do คงวงโฟกัสที่เห็นชัด ข้อความ error ภาษาไทย และสถานะ disabled ที่แยกได้.
- Do ให้รายการยาวเลื่อนภายในโดยแถวการกระทำและเมนูยังเข้าถึงได้บน phone/iPad.
- Do ใช้ stacked modal เมื่อต้องยืนยันเหนือ dialog เดิม พร้อมชื่อ ข้อมูลผลกระทบ และปุ่มยกเลิกที่ชัด.
- Do รักษากระดาษขาว หมึกดำ สัดส่วนพิมพ์ และ geometry/QR ตามรุ่นที่ล็อกไว้.
- Do ให้ feedback สั้นและเคารพ prefers-reduced-motion โดยไม่หน่วงการทำงาน.

### Don't:

- Don't คืนพาเลต pastel เดิมเพราะชื่อ alias mint/sky/lavender/lilac ยังอยู่ใน CSS.
- Don't เลือก A แทนครูหรือแทนเฉลย E ที่ถูกเอาออกเมื่อเปลี่ยนเป็นสี่ตัวเลือก.
- Don't ใช้สีอย่างเดียวบอกสถานะหรือทำให้ผลรอตรวจดูเป็นผลยืนยันแล้ว.
- Don't เพิ่มภาพตกแต่งสามมิติ gradient หรือ glassmorphism ที่รบกวนงานอ่านและตรวจ.
- Don't ย่อทั้งหน้าจอ ปิด browser zoom หรือบังคับให้เครื่องมือทุกคอลัมน์อยู่พร้อมกันบน phone.
- Don't เปลี่ยนพิกัด OMR, marker, QR หรือกฎให้คะแนนเพื่อให้เข้ากับสีและการจัดหน้า UI.
- Don't ยกระดับข้อความประกอบเล็กและสีหมวดวิชาเฉพาะจุดให้เป็นมาตรฐานระบบ.
