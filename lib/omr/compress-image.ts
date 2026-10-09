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
