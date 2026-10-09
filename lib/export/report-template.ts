import { jsPDF } from "jspdf";
type Row = Record<string, string | number>;
export async function downloadScoreReport(
  rows: Row[],
  title: string,
  individual = false,
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const response = await fetch("/omr-assets/NotoSansThai-Regular.ttf");
  if (!response.ok) throw new Error("โหลดฟอนต์ PDF ไม่สำเร็จ");
  let binary = "";
  for (const byte of new Uint8Array(await response.arrayBuffer()))
    binary += String.fromCharCode(byte);
  doc.addFileToVFS("Thai.ttf", btoa(binary));
  doc.addFont("Thai.ttf", "Thai", "normal");
  doc.setFont("Thai");
  let page = 1,
    y = 0;
  function heading() {
    doc.setFontSize(15);
    const lines = doc.splitTextToSize(title, 178);
    doc.text(lines, 16, 20);
    y = 20 + lines.length * 6;
    doc.setFontSize(10);
    doc.text(
      individual ? "รายงานผลรายบุคคล" : "รายงานคะแนนที่ยืนยันแล้ว",
      16,
      y,
    );
    y += 10;
  }
  function footer() {
    doc.setFontSize(8);
    doc.text(
      `หน้า ${page} · ${new Date().toLocaleDateString("th-TH")}`,
      194,
      286,
      { align: "right" },
    );
  }
  function next() {
    footer();
    doc.addPage();
    page++;
    heading();
  }
  heading();
  if (individual) {
    const row = rows[0];
    if (!row) throw new Error("ไม่พบคะแนน");
    doc.setFontSize(11);
    const name = doc.splitTextToSize(`ชื่อ-สกุล ${row["ชื่อ-สกุล"]}`, 178);
    doc.text(name, 16, y);
    y += name.length * 6;
    doc.text(`รหัส ${row["รหัสนักเรียน"]}   ชั้น ${row["ชั้น/ห้อง"]}`, 16, y);
    y += 8;
    doc.text(
      `คะแนน ${row["คะแนนที่ได้"]} / ${row["คะแนนเต็ม"]}   ${row["เปอร์เซ็นต์"]}%   ${row["ผ่าน/ไม่ผ่าน"]}`,
      16,
      y,
    );
    y += 10;
    for (let q = 1; q <= Number(row["จำนวนข้อ"]); q++) {
      if (y > 270) next();
      doc.setFontSize(10);
      doc.text(
        `ข้อ ${q}     คำตอบ ${row[`คำตอบข้อ ${q}`] || "ไม่ตอบ"}     คะแนน ${row[`คะแนนข้อ ${q}`]}`,
        16,
        y,
      );
      y += 6;
    }
  } else {
    const header = () => {
      doc.setFontSize(10);
      doc.text("รหัส", 16, y);
      doc.text("ชื่อ-สกุล", 39, y);
      doc.text("ชั้น", 127, y);
      doc.text("คะแนน", 155, y);
      doc.text("ผล", 184, y);
      y += 4;
      doc.setDrawColor(200);
      doc.line(16, y, 194, y);
      y += 6;
    };
    header();
    for (const row of rows) {
      const name = doc.splitTextToSize(String(row["ชื่อ-สกุล"]), 83);
      const height = Math.max(7, name.length * 5 + 2);
      if (y + height > 273) {
        next();
        header();
      }
      doc.setFontSize(9);
      doc.text(String(row["รหัสนักเรียน"]), 16, y);
      doc.text(name, 39, y);
      doc.text(String(row["ชั้น/ห้อง"]), 127, y);
      doc.text(`${row["คะแนนที่ได้"]}/${row["คะแนนเต็ม"]}`, 155, y);
      doc.text(String(row["ผ่าน/ไม่ผ่าน"]), 184, y);
      y += height;
    }
  }
  footer();
  doc.save(individual ? "ผลคะแนนรายบุคคล.pdf" : "รายงานคะแนน.pdf");
}
