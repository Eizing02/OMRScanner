export type ScannerPhase =
  | "idle"
  | "initializing"
  | "searching"
  | "detected"
  | "aligning"
  | "stable"
  | "capturing"
  | "captured"
  | "processing"
  | "uploading"
  | "completed"
  | "needs_review"
  | "error";
export function scannerPhase(input: {
  busy: boolean;
  live: boolean;
  source: boolean;
  crop: boolean;
  saved: boolean;
  error: boolean;
  progress: number;
  detected: boolean;
  capturing: boolean;
}): ScannerPhase {
  if (input.error) return "error";
  if (input.saved) return "needs_review";
  if (input.capturing) return "capturing";
  if (input.busy)
    return input.crop
      ? "uploading"
      : input.source
        ? "processing"
        : "initializing";
  if (input.crop) return "captured";
  if (input.source) return "aligning";
  if (input.live)
    return input.progress >= 5
      ? "stable"
      : input.detected
        ? "detected"
        : "searching";
  return "idle";
}
