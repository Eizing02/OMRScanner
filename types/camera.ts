declare module "jscanify/client" {
  import type { Mat } from "@techstark/opencv-js";
  export default class JScanify {
    getCornerPoints(contour: Mat): {
      topLeftCorner: { x: number; y: number };
      topRightCorner: { x: number; y: number };
      bottomRightCorner: { x: number; y: number };
      bottomLeftCorner: { x: number; y: number };
    };
  }
}
