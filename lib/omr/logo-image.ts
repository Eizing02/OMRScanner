export const MAX_LOGO_BYTES = 5 * 1024 * 1024;
export const DEFAULT_SCHOOL_LOGO = "/omr-assets/school-logo.png";
export const DEFAULT_SCHOOL_NAME = "โรงเรียนกุงแก้ววิทยาคาร";

/** Inspect original bytes, not the filename/MIME supplied by the browser. */
export function inspectLogo(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES)
    throw new Error(
      "ใช้ภาพ PNG / JPG ขนาดไม่เกิน 5 MB โดยระบบจะไม่ย่อไฟล์ให้เอง",
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0,
    height = 0,
    format: "PNG" | "JPEG" = "PNG";
  if (
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v) &&
    String.fromCharCode(...bytes.slice(12, 16)) === "IHDR"
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    format = "JPEG";
    let position = 2;
    while (position + 4 <= bytes.length) {
      if (bytes[position] !== 255) break;
      while (bytes[position] === 255) position++;
      const marker = bytes[position++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (position + 2 > bytes.length) break;
      const length = view.getUint16(position);
      if (length < 2 || position + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 7
      ) {
        height = view.getUint16(position + 3);
        width = view.getUint16(position + 5);
        break;
      }
      position += length;
    }
  }
  if (
    !width ||
    !height ||
    width > 10000 ||
    height > 10000 ||
    width * height > 20000000
  )
    throw new Error(
      "ภาพไม่ถูกต้องหรือใหญ่เกิน 20 ล้านพิกเซล กรุณาเลือก PNG / JPG ใหม่",
    );
  return { width, height, format };
}

export async function originalLogoDataUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const dimensions = inspectLogo(bytes);
  // FileReader preserves the original compressed bytes, alpha and pixel dimensions.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("เปิดภาพไม่ได้ กรุณาเลือกไฟล์ใหม่"));
    reader.readAsDataURL(
      new Blob([bytes], {
        type: dimensions.format === "PNG" ? "image/png" : "image/jpeg",
      }),
    );
  });
  const image = new Image();
  image.src = dataUrl;
  await image.decode().catch(() => {
    throw new Error("ไฟล์ภาพเสียหรือเปิดไม่ได้ กรุณาเลือกไฟล์ใหม่");
  });
  return { dataUrl, ...dimensions };
}

/** PDF libraries don't honor image orientation metadata; the browser does. Lossless PNG at
 * the oriented original pixel dimensions keeps preview and PDF consistent.
 * The stored source bytes are never changed or downsampled. */
export async function printableLogo(source: string) {
  const response = await fetch(source);
  if (!response.ok) throw new Error("โหลดโลโก้ไม่สำเร็จ กรุณาลองใหม่");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const dimensions = inspectLogo(bytes);
  // Most PNGs have no orientation metadata. Keep their original lossless
  // stream (including alpha), and normalize only PNGs carrying an eXIf chunk.
  let hasExif = false;
  if (dimensions.format === "PNG") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = view.getUint32(at);
      if (at + length + 12 > bytes.length) break;
      if (String.fromCharCode(...bytes.slice(at + 4, at + 8)) === "eXIf")
        hasExif = true;
      at += length + 12;
    }
    if (!hasExif) {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return {
        dataUrl: `data:image/png;base64,${btoa(binary)}`,
        width: dimensions.width,
        height: dimensions.height,
      };
    }
  }
  const blob = new Blob([bytes], {
    type: bytes[0] === 137 ? "image/png" : "image/jpeg",
  });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เปิดภาพโลโก้ไม่ได้");
    // Decode once using the same orientation as SVG <image>. Never apply an
    // additional rotation: both PNG eXIf and JPEG EXIF can contain orientation.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
