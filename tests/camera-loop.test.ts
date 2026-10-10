import { afterEach, describe, expect, it, vi } from "vitest";
import { startCameraLoop } from "@/lib/omr/camera-loop";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("camera scheduler", () => {
  it("reuses its canvas, skips in-flight frames and cancels video callbacks", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
    };
    const createElement = vi.fn(() => canvas);
    const document = { hidden: false, createElement };
    vi.stubGlobal("document", document);
    let callback!: (now: number) => void, release!: () => void;
    const video = {
      videoWidth: 1920,
      videoHeight: 1080,
      requestVideoFrameCallback: vi.fn((next) => {
        callback = next;
        return 1;
      }),
      cancelVideoFrameCallback: vi.fn(),
    };
    const process = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const stop = startCameraLoop(video as unknown as HTMLVideoElement, process);
    callback(0);
    callback(200);
    callback(400);
    expect(process).toHaveBeenCalledOnce();
    expect(createElement).toHaveBeenCalledOnce();
    expect(Math.max(canvas.width, canvas.height)).toBe(640);
    stop();
    release();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
    expect(canvas.width).toBe(0);
    callback(1000);
    expect(process).toHaveBeenCalledOnce();
  });
  it("uses cancellable timers if rVFC is absent and does no hidden-page processing", async () => {
    vi.useFakeTimers();
    const createElement = vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: vi.fn() }),
    }));
    const document = { hidden: true, createElement };
    vi.stubGlobal("document", document);
    const process = vi.fn(async () => undefined);
    const stop = startCameraLoop(
      { videoWidth: 1200, videoHeight: 1600 } as HTMLVideoElement,
      process,
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(process).not.toHaveBeenCalled();
    document.hidden = false;
    await vi.advanceTimersByTimeAsync(150);
    expect(process).toHaveBeenCalled();
    stop();
    const count = process.mock.calls.length;
    await vi.advanceTimersByTimeAsync(500);
    expect(process).toHaveBeenCalledTimes(count);
  });
});
