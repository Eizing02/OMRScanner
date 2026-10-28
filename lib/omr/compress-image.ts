/** Binary v2: one JPEG encode, no quality reduction to force a storage target. */
export function retainCaptureBlob(source: HTMLCanvasElement): Promise<Blob> {
  // Local recovery only: preserve the camera's pixel dimensions until save.
  // This is never uploaded and never used as the grading evidence.
  return new Promise((resolve, reject) =>
    source.toBlob(
      (blob) => {
        if (!blob || blob.type !== "image/jpeg")
          reject(new Error("เก็บภาพสำหรับลองใหม่ไม่สำเร็จ กรุณาถ่ายใหม่"));
        else resolve(blob);
      },
      "image/jpeg",
      0.85,
    ),
  );
}
export async function compressScanBlob(
  source: HTMLCanvasElement,
  maxWidth = 1800,
  quality = 0.85,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxWidth / Math.max(source.width, source.height));
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้เตรียมภาพไม่ได้");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  try {
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.type !== "image/jpeg")
            reject(new Error("สร้างไฟล์ภาพไม่ได้ กรุณาลองใหม่"));
          else if (blob.size > 2_000_000)
            reject(new Error("ภาพใหญ่เกินไป กรุณาถ่ายใหม่"));
          else resolve(blob);
        },
        "image/jpeg",
        quality,
      ),
    );
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export function compressScanCanvas(source: HTMLCanvasElement, maxWidth = 1600) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxWidth / Math.max(source.width, source.height));
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้เตรียมภาพไม่ได้");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  let quality = 0.75,
    output = canvas.toDataURL("image/jpeg", quality);
  while (output.length > 430_000 && quality > 0.6) {
    quality -= 0.05;
    output = canvas.toDataURL("image/jpeg", quality);
  }
  return output;
}
