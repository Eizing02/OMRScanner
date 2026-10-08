import { polygonArea, validQuad, type Quad } from "./camera-geometry";
type OpenCV = typeof import("@techstark/opencv-js");
const cvWindow = () => window as unknown as { cv: OpenCV | Promise<OpenCV> };
let loading: Promise<OpenCV> | null = null;
export function loadOpenCv() {
  if (loading) return loading;
  loading = new Promise<OpenCV>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/omr-assets/opencv.js";
    script.async = true;
    const timer = setTimeout(
      () =>
        reject(
          new Error("โหลดตัวตรวจขอบกระดาษไม่สำเร็จ กรุณาใช้การปรับมุมด้วยมือ"),
        ),
      30000,
    );
    script.onload = async () => {
      try {
        const cv = await cvWindow().cv;
        if (!cv?.Mat) throw new Error("OpenCV not ready");
        clearTimeout(timer);
        resolve(cv);
      } catch {
        clearTimeout(timer);
        loading = null;
        reject(new Error("เปิดตัวตรวจขอบกระดาษไม่สำเร็จ"));
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("ไม่พบตัวตรวจขอบกระดาษ"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
export async function createDocumentDetector() {
  const [cv, { default: JScanify }] = await Promise.all([
    loadOpenCv(),
    import("jscanify/client"),
  ]);
  cvWindow().cv = cv;
  const scanner = new JScanify();
  return {
    engine: "jscanify" as const,
    detect(frame: HTMLCanvasElement): { quad: Quad | null; coverage: number } {
      const source = cv.imread(frame),
        gray = new cv.Mat(),
        edges = new cv.Mat(),
        contours = new cv.MatVector(),
        hierarchy = new cv.Mat();
      try {
        cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
        cv.Canny(gray, edges, 50, 150);
        cv.findContours(
          edges,
          contours,
          hierarchy,
          cv.RETR_EXTERNAL,
          cv.CHAIN_APPROX_SIMPLE,
        );
        let best: Quad | null = null,
          largest = 0;
        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);
          try {
            const area = cv.contourArea(contour) / (frame.width * frame.height);
            if (area < 0.1 || area <= largest) continue;
            const points = scanner.getCornerPoints(contour);
            if (Object.values(points).some((p) => !p)) continue;
            const quad = [
              points.topLeftCorner,
              points.topRightCorner,
              points.bottomRightCorner,
              points.bottomLeftCorner,
            ].map((p) => ({
              x: p.x / frame.width,
              y: p.y / frame.height,
            })) as Quad;
            if (validQuad(quad)) {
              best = quad;
              largest = polygonArea(quad);
            }
          } finally {
            contour.delete();
          }
        }
        return { quad: best, coverage: largest };
      } finally {
        source.delete();
        gray.delete();
        edges.delete();
        contours.delete();
        hierarchy.delete();
      }
    },
    warp(original: HTMLCanvasElement, quad: Quad, single: boolean) {
      if (!validQuad(quad))
        throw new Error("มุมกระดาษไขว้กัน กรุณาปรับมุมใหม่");
      const width = single ? 900 : 1800,
        height = Math.round(width * (single ? 210 / 148.5 : 210 / 297));
      const source = cv.imread(original),
        destination = new cv.Mat();
      const src = cv.matFromArray(
        4,
        1,
        cv.CV_32FC2,
        quad.flatMap((p) => [p.x * original.width, p.y * original.height]),
      );
      const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        width,
        0,
        width,
        height,
        0,
        height,
      ]);
      const matrix = cv.getPerspectiveTransform(src, dst);
      try {
        cv.warpPerspective(
          source,
          destination,
          matrix,
          new cv.Size(width, height),
        );
        const canvas = document.createElement("canvas");
        cv.imshow(canvas, destination);
        return canvas;
      } finally {
        source.delete();
        destination.delete();
        src.delete();
        dst.delete();
        matrix.delete();
      }
    },
  };
}
