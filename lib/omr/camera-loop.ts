export function detectionCadence(elapsed: number) {
  // Reserve time for painting/input; bounded to 2.5–8.3 detections/s on slow/fast devices.
  return Math.min(400, Math.max(120, elapsed * 2));
}
export function previewDimension(elapsed: number) {
  return elapsed > 100 ? 480 : elapsed < 40 ? 800 : 640;
}
/** One reusable detection canvas, one task at a time, no work while hidden. */
export function startCameraLoop(
  video: HTMLVideoElement,
  process: (frame: HTMLCanvasElement, now: number) => Promise<void>,
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  let stopped = false,
    pending = false,
    last = -Infinity,
    duration = 65;
  let callback: number | undefined,
    timeout: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    if (stopped) return;
    if (typeof video.requestVideoFrameCallback === "function")
      callback = video.requestVideoFrameCallback(tick);
    else timeout = setTimeout(() => tick(performance.now()), 50);
  }
  function tick(now: number) {
    schedule();
    if (
      stopped ||
      pending ||
      document.hidden ||
      !ctx ||
      !video.videoWidth ||
      now - last < detectionCadence(duration)
    )
      return;
    pending = true;
    last = now;
    const size = previewDimension(duration),
      scale = Math.min(1, size / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * scale),
      height = Math.round(video.videoHeight * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.drawImage(video, 0, 0, width, height);
    void process(canvas, now)
      .catch(() => undefined)
      .finally(() => {
        duration = duration * 0.7 + (performance.now() - now) * 0.3;
        pending = false;
        if (stopped) canvas.width = canvas.height = 0;
      });
  }
  schedule();
  return () => {
    stopped = true;
    if (callback !== undefined) video.cancelVideoFrameCallback?.(callback);
    if (timeout !== undefined) clearTimeout(timeout);
    if (!pending) canvas.width = canvas.height = 0;
  };
}
