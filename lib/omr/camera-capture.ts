type StillCamera = { takePhoto: () => Promise<Blob> };
type CaptureConstructor = new (track: MediaStreamTrack) => StillCamera;

/** Feature detection, no UA checks. A still never inherits video corner coordinates. */
export async function captureCameraFrame(
  video: HTMLVideoElement,
  track?: MediaStreamTrack,
): Promise<{ canvas: HTMLCanvasElement; photo: boolean; originalBlob?: Blob }> {
  const Capture = (
    globalThis as unknown as { ImageCapture?: CaptureConstructor }
  ).ImageCapture;
  if (Capture && track?.readyState === "live") {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const blob = await Promise.race([
        new Capture(track).takePhoto(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("STILL_TIMEOUT")), 4000);
        }),
      ]);
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        if (image.naturalWidth * image.naturalHeight > 25_000_000)
          throw new Error("STILL_TOO_LARGE");
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("อ่านภาพไม่ได้");
        // Browser decoding applies image orientation; re-detect on this decoded still.
        ctx.drawImage(image, 0, 0);
        return { canvas, photo: true, originalBlob: blob };
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      /* Permission/API/FOV failures fall back to the live video frame. */
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  if (!video.videoWidth || !video.videoHeight)
    throw new Error("กล้องยังไม่พร้อม กรุณาลองใหม่");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("อ่านภาพไม่ได้");
  ctx.drawImage(video, 0, 0);
  return { canvas, photo: false };
}
