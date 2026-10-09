import type { LockedScanTemplate, OpticalRead } from "@/types/scan";
import type { Raster } from "./scan-qr";
import { choices } from "@/types/exam";

// Sample only the inner disk: exclude outlines. Ink printed in a blank bubble
// is deliberately not treated as a mark until the marked-area threshold is met.
export function fillPercentage(
  image: Raster,
  x: number,
  y: number,
  radius: number,
  threshold = 155,
) {
  let ink = 0,
    total = 0;
  for (let py = Math.floor(y - radius); py <= Math.ceil(y + radius); py++) {
    for (let px = Math.floor(x - radius); px <= Math.ceil(x + radius); px++) {
      if (
        px < 0 ||
        py < 0 ||
        px >= image.width ||
        py >= image.height ||
        (px - x) ** 2 + (py - y) ** 2 > radius ** 2
      )
        continue;
      const i = (py * image.width + px) * 4;
      const luminance =
        image.data[i] * 0.2126 +
        image.data[i + 1] * 0.7152 +
        image.data[i + 2] * 0.0722;
      if (luminance < threshold) ink++;
      total++;
    }
  }
  return total ? Math.round((ink / total) * 10000) / 100 : 0;
}
export function classifyFills(fills: number[]) {
  const marked = fills
    .map((fill, i) => ({ fill, i }))
    .filter((x) => x.fill >= 55);
  const sorted = [...fills].sort((a, b) => b - a);
  if (marked.length > 1)
    return { index: null, state: "multiple" as const, confidence: 1 };
  if (marked.length === 1) {
    const close = sorted[0] - (sorted[1] ?? 0) < 18;
    return {
      index: marked[0].i,
      state: close ? ("ambiguous" as const) : ("valid" as const),
      confidence: Math.min(1, (sorted[0] - (sorted[1] ?? 0)) / 65),
    };
  }
  if (sorted[0] < 20)
    return { index: null, state: "blank" as const, confidence: 1 };
  return {
    index: fills.indexOf(sorted[0]),
    state: "ambiguous" as const,
    confidence: 0,
  };
}
export function readOpticalMarks(
  image: Raster,
  template: LockedScanTemplate,
): OpticalRead {
  const omr = template.omr_json,
    layout = template.layout_json;
  const mmWidth = layout.paperMode === "full" ? 297 : 148.5;
  const sx = image.width / mmWidth,
    sy = image.height / 210;
  if (Math.abs(sx / sy - 1) > 0.035)
    throw new Error(
      "สัดส่วนภาพไม่ตรงกับกระดาษ เลือก A4 ทั้งแผ่นหรือครึ่งแผ่นให้ถูกต้อง",
    );
  if (Math.min(sx, sy) < 3.2)
    throw new Error("ภาพละเอียดไม่พอ กรุณาถ่ายกระดาษให้ใกล้ขึ้น");
  const sample = (x: number, y: number) =>
    fillPercentage(image, x * sx, y * sy, 1.8 * Math.min(sx, sy) * 0.76);
  // Registration markers are required evidence that this is the entire sheet,
  // not a QR crop or a page stretched to an arbitrary bounding rectangle.
  for (const [x, y] of [
    [7.5, 7.5],
    [mmWidth - 7.5, 7.5],
    [7.5, 202.5],
    [mmWidth - 7.5, 202.5],
  ]) {
    if (fillPercentage(image, x * sx, y * sy, 0.65 * Math.min(sx, sy)) < 55)
      throw new Error(
        "จุดจัดแนวไม่ครบ กรุณาปรับมุมให้รวมทั้งกระดาษและจุดดำทั้ง 4 มุม",
      );
  }
  const digits = Array.from({ length: 5 }, (_, digit) => {
    const fills = omr.centersMm.id
      .filter((b) => b.digit === digit)
      .map((b) => sample(b.x, b.y));
    const read = classifyFills(fills);
    return {
      digit,
      value: read.state === "valid" ? read.index : null,
      state: read.state,
      fills,
    };
  });
  const answers = Array.from({ length: layout.questionCount }, (_, i) => {
    const fills = omr.centersMm.answers
      .filter((b) => b.question === i + 1)
      .map((b) => sample(b.x, b.y));
    const read = classifyFills(fills);
    return {
      question: i + 1,
      choice: read.index === null ? null : choices[read.index],
      state: read.state,
      fills,
      confidence: read.confidence,
    };
  });
  return {
    studentCode: digits.every((d) => d.value !== null)
      ? digits.map((d) => String(d.value)).join("")
      : null,
    digits,
    answers,
  };
}
