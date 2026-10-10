import { afterEach, expect, it, vi } from "vitest";
import { captureCameraFrame } from "@/lib/omr/camera-capture";
afterEach(() => vi.unstubAllGlobals());
it("falls back to video when ImageCapture is missing or rejects, without requiring still APIs", async () => {
  const drawImage = vi.fn(),
    canvas = { width: 0, height: 0, getContext: () => ({ drawImage }) };
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("ImageCapture", undefined);
  const video = { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement;
  expect((await captureCameraFrame(video)).photo).toBe(false);
  expect(canvas).toMatchObject({ width: 1280, height: 720 });
  vi.stubGlobal(
    "ImageCapture",
    class {
      async takePhoto() {
        throw new Error("UNSUPPORTED");
      }
    },
  );
  expect(
    (
      await captureCameraFrame(video, {
        readyState: "live",
      } as MediaStreamTrack)
    ).photo,
  ).toBe(false);
  expect(drawImage).toHaveBeenCalledTimes(2);
});
