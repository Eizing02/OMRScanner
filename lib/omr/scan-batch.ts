/** A removed paper, not the shared exam QR, re-arms continuous capture. */
export class PaperRearm {
  private absent = 0;
  blocked = false;
  captured() {
    this.blocked = true;
    this.absent = 0;
  }
  observe(present: boolean) {
    if (!this.blocked) return true;
    this.absent = present ? 0 : this.absent + 1;
    if (this.absent >= 3) this.blocked = false;
    return !this.blocked;
  }
  reset() {
    this.blocked = false;
    this.absent = 0;
  }
}
export const SCAN_QUEUE_LIMIT = 3;
export type QueuedScan<T> = {
  id: string;
  processed: Blob;
  original: Blob;
  template: T;
  paper: "single" | "a4";
  state: "waiting" | "sending" | "failed";
  message?: string;
};
export function scanUploadForm(input: {
  id: string;
  processed: Blob;
  paper: "single" | "a4";
  examId: string;
  replacePending?: boolean;
  reason?: string;
}) {
  const form = new FormData();
  form.set(
    "metadata",
    JSON.stringify({
      requestId: input.id,
      paper: input.paper,
      expectedExamId: input.examId,
      replacePending: input.replacePending ?? false,
      reason: input.reason ?? "",
    }),
  );
  form.set("processed", input.processed, "scan.jpg");
  return form;
}
