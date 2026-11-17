"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Link2, RefreshCw } from "lucide-react";
import { Badge, Notice, Modal } from "@/components/ui/primitives";
import { useMathQuest } from "./use-mathquest";

const previewErrors: Record<string, string> = {
  SCORE_IDENTITY_REVIEW: "ตรวจรหัสนักเรียนเทียบกับข้อมูลตอนสอบก่อนส่ง",
  MIXED_EXAM_METADATA: "ผลสอบใช้ข้อมูลชุดสอบต่างรุ่น ตรวจข้อมูลชุดสอบก่อนส่ง",
  ZERO_MAX_SCORE: "ตรวจคะแนนเต็มและคะแนนที่ยืนยันแล้วก่อนส่ง",
  SYNC_LIMIT: "จำนวนผลสอบเกินขอบเขตของการส่งคะแนนหนึ่งชุด",
  NO_CONFIRMED_RESULTS: "ยืนยันผลในศูนย์ตรวจสอบก่อนส่งคะแนน",
};

export function ExamPublication({
  examId,
  title,
}: {
  examId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false),
    [consent, setConsent] = useState<string | null>(null),
    [withdraw, setWithdraw] = useState(false);
  const { state, loading, busy, error, readOnly, mode, mutate, refresh } =
    useMathQuest(`/api/exams/${examId}/publication${open ? "?preview=1" : ""}`);
  const prepared = useRef<{
    action: string;
    id: string;
    fingerprint: string | null;
  } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const pub = state?.publication,
    conn = state?.connection;
  const preview = pub?.preview;
  const fingerprint = preview?.fingerprint ?? null;
  const disabled =
    busy ||
    readOnly ||
    !state?.receiverReady ||
    !conn ||
    conn.revocationPending ||
    conn.status !== "active";
  const publicationBlocked = pub?.termClosed || pub?.recoveryRequired;
  const canPublish =
    !disabled &&
    !publicationBlocked &&
    conn?.enabled &&
    Boolean(fingerprint) &&
    pub?.state !== "withdraw_pending";
  async function command(action: "publish" | "withdraw" | "retry") {
    const approval = action === "publish" ? fingerprint : null;
    if (
      action === "publish" &&
      (!canPublish || !approval || consent !== approval)
    )
      return;
    if (
      prepared.current?.action !== action ||
      prepared.current.fingerprint !== approval
    )
      prepared.current = {
        action,
        id: crypto.randomUUID(),
        fingerprint: approval,
      };
    if (
      await mutate("POST", {
        action,
        requestId: prepared.current.id,
        consent: true,
        ...(approval ? { previewFingerprint: approval } : {}),
      })
    ) {
      prepared.current = null;
      setConsent(null);
      setWithdraw(false);
    }
  }
  if (mode !== "connected" || loading || !state?.enabled || readOnly)
    return null;
  const label =
    pub?.state === "withdrawn"
      ? "ถอนแล้ว"
      : pub?.withdrawalBlocked
        ? "รอตรวจสอบการถอน"
        : pub?.state === "withdraw_pending"
          ? "รอถอน"
          : pub?.termClosed
            ? "ปิดภาคเรียนแล้ว"
            : pub?.recoveryRequired
              ? "ต้องถอนคะแนนเดิม"
              : pub?.lastError
                ? "ส่งไม่สำเร็จ"
                : pub?.pending
                  ? "รอส่ง"
                  : pub?.unmatched.length || pub?.invalid.length
                    ? "ส่งบางส่วน"
                    : pub?.revision && pub.delivered
                      ? "ส่งแล้ว"
                      : "ยังไม่เผยแพร่";
  return (
    <>
      <button
        ref={trigger}
        className="btn btn-secondary integration-trigger"
        onClick={() => setOpen(true)}
      >
        <Link2 size={17} />
        ส่งคะแนนไป MathQuest
      </button>
      <Modal
        returnFocusRef={trigger}
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setConsent(null);
            setWithdraw(false);
          }
        }}
        title="เผยแพร่คะแนนไป MathQuest"
        description={title}
      >
        <div className="integration-publication" aria-busy={busy}>
          {error && <Notice tone="error">{error}</Notice>}
          {!state.receiverReady ? (
            <Notice tone="warning">ปลายทางยังไม่พร้อมรับคะแนน</Notice>
          ) : !conn || conn.status !== "active" ? (
            <p>
              เชื่อมต่อโรงเรียนใน<Link href="/settings">หน้าตั้งค่า</Link>
              ก่อนเผยแพร่คะแนน
            </p>
          ) : (
            <>
              <div className="integration-summary" aria-live="polite">
                <strong>{conn.destinationLabel}</strong>
                <Badge tone={label === "ส่งแล้ว" ? "green" : "amber"}>
                  {label}
                </Badge>
              </div>
              {preview?.metadata && (
                <p className="integration-exam-scope">
                  {preview.metadata.title !== title && (
                    <strong>
                      {preview.metadata.title}
                      <br />
                    </strong>
                  )}
                  {preview.metadata.subject} · {preview.metadata.exam_type} ·{" "}
                  {preview.metadata.classroom} · ภาคเรียน{" "}
                  {preview.metadata.term}/{preview.metadata.academic_year}
                </p>
              )}
              <dl className="integration-counts">
                <div>
                  <dt>ยืนยันแล้ว</dt>
                  <dd>{preview?.confirmedCount ?? pub?.confirmed ?? 0} คน</dd>
                </div>
                <div>
                  <dt>รอตรวจ</dt>
                  <dd>
                    {preview?.reviewCount ?? "—"}
                    {preview ? " คน" : ""}
                  </dd>
                </div>
                <div>
                  <dt>รับแล้ว</dt>
                  <dd>{pub?.delivered ?? 0} คน</dd>
                </div>
              </dl>
              {preview?.blocked && !withdraw && (
                <Notice tone="warning">
                  {previewErrors[preview.blocked] ?? "ตรวจข้อมูลผลสอบก่อนส่ง"}
                </Notice>
              )}
              {!preview && (
                <Notice>โหลดรายการที่จะส่งด้วยปุ่มตรวจสถานะด้านล่าง</Notice>
              )}
              {!!preview?.identityIssueCount && (
                <details className="integration-unmatched">
                  <summary>
                    รหัสต่างจากตอนสอบ {preview.identityIssueCount} รายการ
                  </summary>
                  <ul>
                    {preview.identityIssues.map(
                      ({ originalCode, currentCode }, index) => (
                        <li key={index}>
                          ตอนสอบ {originalCode ?? "ไม่มีหลักฐาน"} · ปัจจุบัน{" "}
                          {currentCode ?? "ไม่พบรหัส"}
                        </li>
                      ),
                    )}
                  </ul>
                </details>
              )}
              {!!pub?.pending &&
                !pub.withdrawalBlocked &&
                (!pub.termClosed || pub.state === "withdraw_pending") && (
                  <p className="muted">มีงานรอส่ง {pub.pending} รายการ</p>
                )}
              {!!pub?.unmatched.length && (
                <details className="integration-unmatched">
                  <summary>
                    รหัสไม่พบใน MathQuest {pub.unmatched.length} คน
                  </summary>
                  <ul>
                    {pub.unmatched.map((code) => (
                      <li key={code}>{code}</li>
                    ))}
                  </ul>
                  <p className="muted">
                    ตรวจทะเบียนทั้งสองระบบ แล้วกดเผยแพร่คะแนนอีกครั้ง
                  </p>
                </details>
              )}
              {!!pub?.invalid.length && (
                <details className="integration-unmatched">
                  <summary>ข้อมูลต้องตรวจ {pub.invalid.length} คน</summary>
                  <ul>
                    {pub.invalid.map((code) => (
                      <li key={code}>{code}</li>
                    ))}
                  </ul>
                </details>
              )}
              {pub?.lastError && (
                <Notice tone="warning">
                  {pub.withdrawalBlocked
                    ? "MathQuest ยังยืนยันการถอนคะแนนไม่ได้ กรุณาติดต่อผู้ดูแลปลายทาง"
                    : pub.canRetryWithdrawal
                      ? "ส่งคำขอถอนไม่สำเร็จ ลองถอนอีกครั้งได้"
                      : pub.termClosed
                        ? pub.canWithdraw
                          ? "ภาคเรียนนี้ปิดรับคะแนน แต่ขอถอนคะแนนเดิมได้"
                          : "MathQuest ปิดรับคะแนนภาคเรียนนี้แล้ว"
                        : pub.recoveryRequired
                          ? "ถอนคะแนนเดิมผ่านการเชื่อมต่อนี้ก่อนเผยแพร่อีกครั้ง คะแนนใน ScanSob ยังคงอยู่"
                          : "ส่งไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่"}
                </Notice>
              )}
              {pub?.termClosed && !pub.lastError && (
                <Notice tone="warning">
                  MathQuest ปิดรับคะแนนภาคเรียนนี้แล้ว
                  {pub.state === "withdraw_pending"
                    ? " กำลังรอยืนยันการถอน"
                    : pub.canWithdraw
                      ? " แต่ขอถอนคะแนนเดิมได้"
                      : ""}
                </Notice>
              )}
              {withdraw ? (
                <>
                  <Notice tone="warning">
                    {pub?.termClosed
                      ? "ถอนสำเร็จเมื่อ MathQuest ยืนยันแล้ว คะแนนใน ScanSob ยังคงอยู่"
                      : "เมื่อ MathQuest ยืนยันการถอน นักเรียนจะไม่เห็นคะแนนชุดนี้"}
                  </Notice>
                  <div className="integration-actions">
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => setWithdraw(false)}
                    >
                      กลับ
                    </button>
                    <button
                      className="btn btn-danger"
                      disabled={disabled || !pub?.canWithdraw}
                      onClick={() => void command("withdraw")}
                    >
                      {busy ? "กำลังถอน…" : "ยืนยันถอนเผยแพร่"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={Boolean(fingerprint && consent === fingerprint)}
                      onChange={(e) =>
                        setConsent(e.target.checked ? fingerprint : null)
                      }
                      disabled={!canPublish}
                    />
                    ยืนยันส่งผลสอบที่ตรวจแล้วไปยังโรงเรียนนี้
                  </label>
                  <div className="integration-actions">
                    <button
                      className="btn btn-primary"
                      disabled={!canPublish || consent !== fingerprint}
                      onClick={() => void command("publish")}
                    >
                      {busy ? "กำลังทำรายการ…" : "เผยแพร่คะแนน"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={
                        disabled ||
                        (!pub?.canRetryWithdrawal &&
                          (publicationBlocked ||
                            pub?.withdrawalBlocked ||
                            !conn.enabled)) ||
                        (!pub?.pending && !pub?.canRetryWithdrawal)
                      }
                      onClick={() => void command("retry")}
                    >
                      {pub?.canRetryWithdrawal
                        ? "ลองถอนอีกครั้ง"
                        : "ลองส่งใหม่"}
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={
                        disabled ||
                        !pub?.canWithdraw ||
                        !pub?.revision ||
                        pub.state === "withdrawn" ||
                        pub.state === "withdraw_pending"
                      }
                      onClick={() => setWithdraw(true)}
                    >
                      {pub?.withdrawalBlocked ? "ขอถอนอีกครั้ง" : "ถอนเผยแพร่"}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              setConsent(null);
              void refresh();
            }}
          >
            <RefreshCw size={16} />
            ตรวจสถานะ
          </button>
        </div>
      </Modal>
    </>
  );
}
