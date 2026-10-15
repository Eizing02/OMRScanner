"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Link2, RefreshCw } from "lucide-react";
import { Badge, Notice, Modal } from "@/components/ui/primitives";
import { useMathQuest } from "./use-mathquest";
export function ExamPublication({
  examId,
  title,
}: {
  examId: string;
  title: string;
}) {
  const { state, loading, busy, error, readOnly, mode, mutate, refresh } =
    useMathQuest(`/api/exams/${examId}/publication`);
  const [open, setOpen] = useState(false),
    [consent, setConsent] = useState(false),
    [withdraw, setWithdraw] = useState(false);
  const prepared = useRef<{ action: string; id: string } | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const pub = state?.publication,
    conn = state?.connection;
  const disabled =
    busy ||
    readOnly ||
    !state?.receiverReady ||
    !conn ||
    conn.revocationPending ||
    conn.status !== "active";
  const publicationBlocked = pub?.termClosed || pub?.recoveryRequired;
  async function command(action: "publish" | "withdraw" | "retry") {
    if (prepared.current?.action !== action)
      prepared.current = { action, id: crypto.randomUUID() };
    if (
      await mutate("POST", {
        action,
        requestId: prepared.current.id,
        consent: true,
      })
    ) {
      prepared.current = null;
      setConsent(false);
      setWithdraw(false);
    }
  }
  if (mode !== "connected" || loading || !state?.enabled || readOnly)
    return null;
  const label =
    pub?.state === "withdrawn"
      ? "ถอนแล้ว"
      : pub?.termClosed
        ? "ปิดภาคเรียนแล้ว"
        : pub?.recoveryRequired
          ? "ต้องถอนคะแนนเดิม"
          : pub?.state === "withdraw_pending"
            ? "รอถอน"
            : pub?.lastError
              ? "ส่งไม่สำเร็จ"
              : pub?.unmatched.length || pub?.invalid.length
                ? "มีรหัสต้องตรวจ"
                : pub?.pending
                  ? "รอส่ง"
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
        MathQuest
      </button>
      <Modal
        returnFocusRef={trigger}
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) {
            setConsent(false);
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
              <div className="integration-summary">
                <strong>{conn.destinationLabel}</strong>
                <Badge tone={label === "ส่งแล้ว" ? "green" : "amber"}>
                  {label}
                </Badge>
              </div>
              <dl className="integration-counts">
                <div>
                  <dt>ยืนยันแล้ว</dt>
                  <dd>{pub?.confirmed ?? 0} คน</dd>
                </div>
                <div>
                  <dt>ส่งสำเร็จ</dt>
                  <dd>{pub?.delivered ?? 0} คน</dd>
                </div>
              </dl>
              {!!pub?.pending && (
                <p className="muted">มีงานรอส่ง {pub.pending} รายการ</p>
              )}
              {!!pub?.unmatched.length && (
                <details className="integration-unmatched">
                  <summary>รหัสไม่ตรง {pub.unmatched.length} คน</summary>
                  <ul>
                    {pub.unmatched.map((code) => (
                      <li key={code}>{code}</li>
                    ))}
                  </ul>
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
                  {pub.termClosed
                    ? "MathQuest ปิดรับคะแนนภาคเรียนนี้แล้ว ชุดสอบภาคเรียนอื่นยังส่งได้"
                    : pub.recoveryRequired
                      ? "ถอนคะแนนเดิมผ่านการเชื่อมต่อนี้ก่อนเผยแพร่อีกครั้ง คะแนนใน ScanSob ยังคงอยู่"
                      : "ส่งไม่สำเร็จ ตรวจการเชื่อมต่อแล้วลองใหม่"}
                </Notice>
              )}
              {pub?.termClosed && !pub.lastError && (
                <Notice tone="warning">
                  MathQuest ปิดรับคะแนนภาคเรียนนี้แล้ว
                  ชุดสอบภาคเรียนอื่นยังส่งได้
                </Notice>
              )}
              {withdraw ? (
                <>
                  <Notice tone="warning">
                    นักเรียนจะไม่เห็นคะแนนชุดนี้ใน MathQuest คะแนนใน ScanSob
                    ยังคงอยู่
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
                      disabled={disabled || pub?.termClosed}
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
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      disabled={
                        disabled ||
                        publicationBlocked ||
                        !conn.enabled ||
                        !pub?.confirmed
                      }
                    />
                    อนุญาตให้นักเรียนดูคะแนนที่ยืนยันแล้วใน MathQuest
                  </label>
                  <div className="integration-actions">
                    <button
                      className="btn btn-primary"
                      disabled={
                        disabled ||
                        publicationBlocked ||
                        !conn.enabled ||
                        !consent ||
                        !pub?.confirmed ||
                        pub.state === "withdraw_pending"
                      }
                      onClick={() => void command("publish")}
                    >
                      {busy ? "กำลังทำรายการ…" : "เผยแพร่คะแนน"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={
                        disabled ||
                        publicationBlocked ||
                        (!conn.enabled && pub?.state !== "withdraw_pending") ||
                        (!pub?.pending &&
                          !pub?.unmatched.length &&
                          !pub?.invalid.length &&
                          !pub?.lastError)
                      }
                      onClick={() => void command("retry")}
                    >
                      ลองส่งใหม่
                    </button>
                    <button
                      className="btn btn-ghost"
                      disabled={
                        disabled ||
                        pub?.termClosed ||
                        !pub?.revision ||
                        pub.state === "withdrawn" ||
                        pub.state === "withdraw_pending"
                      }
                      onClick={() => setWithdraw(true)}
                    >
                      ถอนเผยแพร่
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void refresh().catch(() => undefined)}
          >
            <RefreshCw size={16} />
            ตรวจสถานะ
          </button>
        </div>
      </Modal>
    </>
  );
}
