"use client";
import { useEffect, useRef, useState } from "react";
import { Link2, RefreshCw, Save } from "lucide-react";
import { Badge, Notice, Modal } from "@/components/ui/primitives";
import { attendanceDestinationLabel } from "./attendance-destination";
import { useMathQuest } from "./use-mathquest";
export function MathQuestSettings() {
  const {
    state,
    mode,
    readOnly,
    loading,
    error,
    busy,
    mutate,
    refresh,
    retryAfter,
  } = useMathQuest("/api/integrations/mathquest");
  const [consent, setConsent] = useState(false),
    [confirmation, setConfirmation] = useState<"revoke" | "recover" | null>(
      null,
    );
  const pairRequest = useRef<string | null>(null);
  const confirmationTrigger = useRef<HTMLButtonElement | null>(null);
  const confirmationId = useRef<string | undefined>(undefined);
  const requestButton = useRef<HTMLButtonElement | null>(null);
  const sectionTitle = useRef<HTMLHeadingElement | null>(null);
  const connection = state?.connection;
  const pairing = state?.signedPairing;
  const canRequest = pairing?.availability === "ready";
  const stage = connection?.signedStage;
  const terminalRequest =
    connection?.status === "error" &&
    connection.lastError === "CONNECTION_DENIED" &&
    !connection.connectionId;
  const disabled =
    busy ||
    readOnly ||
    connection?.revocationPending === true ||
    !state?.enabled ||
    !state?.receiverReady ||
    mode !== "connected";
  useEffect(() => {
    if (
      stage !== "waiting" ||
      connection?.status !== "pending_approval" ||
      disabled
    )
      return;
    let timer: ReturnType<typeof setTimeout>;
    const id = connection.id;
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState === "visible")
        timer = setTimeout(
          () => {
            void mutate(
              "PATCH",
              { action: "refresh", expectedRequestId: id },
              true,
            );
          },
          Math.max(30 + Math.random() * 10, retryAfter) * 1000,
        );
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [stage, connection?.id, connection?.status, disabled, mutate, retryAfter]);
  const label = readOnly
    ? "อ่านอย่างเดียว"
    : mode === "demo"
      ? "ไม่ส่งข้อมูลจริง"
      : loading
        ? "กำลังโหลด…"
        : !state?.enabled
          ? "ยังไม่เปิด"
          : !state.receiverReady
            ? "รอปลายทางพร้อม"
            : !connection || connection.status === "revoked"
              ? canRequest
                ? "ยังไม่เชื่อม"
                : pairing?.availability === "closed"
                  ? "ปิดรับคำขอ"
                  : "ยังขออนุมัติไม่ได้"
              : connection.status === "pending_approval"
                ? stage && stage !== "waiting"
                  ? "ยังยืนยันผลไม่ได้"
                  : "รออนุมัติ"
                : connection.status === "error"
                  ? stage === "rejected" || (terminalRequest && !stage)
                    ? "ปฏิเสธ"
                    : stage === "expired"
                      ? "หมดอายุ"
                      : "มีปัญหา"
                  : connection.revocationPending
                    ? "กำลังยกเลิก"
                    : connection.enabled
                      ? "เชื่อมต่อแล้ว"
                      : "หยุดส่ง";
  return (
    <section
      className="panel settings-section integration-section"
      aria-labelledby="mathquest-settings-title"
      aria-busy={loading || busy}
    >
      <div className="section-title">
        <h2 id="mathquest-settings-title" tabIndex={-1} ref={sectionTitle}>
          เชื่อมต่อระบบเช็คชื่อ
        </h2>
        <span role="status">
          <Badge
            tone={
              label === "เชื่อมต่อแล้ว"
                ? "green"
                : label === "รออนุมัติ" || label === "ยังยืนยันผลไม่ได้"
                  ? "amber"
                  : label === "ปฏิเสธ"
                    ? "red"
                    : "neutral"
            }
          >
            {label}
          </Badge>
        </span>
      </div>
      {error && (
        <>
          <Notice tone="error">{error}</Notice>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            ลองโหลดใหม่
          </button>
        </>
      )}
      {readOnly ? (
        <p className="muted">จัดการการเชื่อมต่อได้เฉพาะพื้นที่ของคุณ</p>
      ) : mode === "demo" ? (
        <p className="muted">โหมดทดลองไม่เชื่อมต่อระบบภายนอก</p>
      ) : loading || !state ? null : !state.enabled || !state.receiverReady ? (
        <p className="muted">เปิดใช้งานเมื่อโรงเรียนปลายทางพร้อมรับคะแนน</p>
      ) : !connection || connection.status === "revoked" ? (
        <div className="integration-form">
          {pairing && (
            <div>
              <p className="integration-destination">
                {attendanceDestinationLabel(pairing.destinationLabel)}
              </p>
              <span className="muted">จากพื้นที่ {pairing.workspaceLabel}</span>
            </div>
          )}
          {canRequest ? (
            <>
              <p
                id="mathquest-request-description"
                className="integration-exam-scope"
              >
                เมื่อแอดมินอนุมัติ
                คุณจะส่งรหัสนักเรียนและคะแนนที่ยืนยันแล้วเข้าระบบเช็คชื่อได้
              </p>
              <div className="integration-actions">
                <button
                  ref={requestButton}
                  type="button"
                  className="btn btn-primary"
                  aria-describedby="mathquest-request-description"
                  disabled={disabled}
                  onClick={async () => {
                    pairRequest.current ??= crypto.randomUUID();
                    if (
                      await mutate(
                        "POST",
                        {
                          method: "signed",
                          requestId: pairRequest.current,
                          consent: true,
                        },
                        true,
                      )
                    )
                      pairRequest.current = null;
                  }}
                >
                  <Link2 size={17} aria-hidden="true" />
                  {busy ? "กำลังส่งคำขอ…" : "ขออนุมัติส่งคะแนน"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="integration-exam-scope">
                {pairing?.availability === "closed"
                  ? "ระบบเช็คชื่อยังไม่เปิดรับคำขอ"
                  : pairing?.availability === "google_required"
                    ? "ใช้บัญชี Google ที่ยืนยันอีเมลแล้วเพื่อส่งคำขอ"
                    : "ตรวจความพร้อมของระบบเช็คชื่อไม่ได้ กรุณาลองอีกครั้ง"}
              </p>
              {pairing?.availability !== "google_required" && !error && (
                <div className="integration-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void refresh()}
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                    {busy ? "กำลังตรวจ…" : "ตรวจความพร้อมอีกครั้ง"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="integration-form">
          {connection.destinationLabel && (
            <p className="integration-destination">
              {attendanceDestinationLabel(connection.destinationLabel)}
            </p>
          )}
          {connection.requestedAt &&
            connection.status === "pending_approval" && (
              <p className="muted">
                ขอเมื่อ{" "}
                {new Date(connection.requestedAt).toLocaleString("th-TH")}
              </p>
            )}
          {stage === "preparing" && !busy && !connection.revocationPending && (
            <Notice tone="warning">
              ยังยืนยันรอบเปิดรับไม่ได้ ยกเลิกคำขอนี้ก่อนส่งใหม่
            </Notice>
          )}
          {terminalRequest && (
            <p className="integration-exam-scope">
              {stage === "expired"
                ? "คำขอหมดอายุแล้ว"
                : "ระบบเช็คชื่อปฏิเสธคำขอนี้"}{" "}
              คุณสามารถปิดคำขอแล้วส่งใหม่ได้
            </p>
          )}
          {connection.revocationPending && (
            <Notice tone="warning">
              {connection.recoveryPending
                ? "กู้คืนยังไม่สำเร็จ ลองกู้คืนอีกครั้งเมื่อเชื่อมต่อได้"
                : "ยังยกเลิกที่ระบบเช็คชื่อไม่สำเร็จ ลองยกเลิกอีกครั้ง"}
            </Notice>
          )}
          {!stage &&
            !terminalRequest &&
            connection.lastError === "CONNECTION_DENIED" &&
            !connection.recoveryPending && (
              <Notice tone="warning">
                ระบบเช็คชื่อปฏิเสธการเชื่อมต่อ
                ตรวจปลายทางหรือกู้คืนเพื่อจับคู่ใหม่
              </Notice>
            )}
          {connection.status === "active" && (
            <>
              <label>
                การเผยแพร่
                <select
                  value={connection.mode}
                  disabled={disabled}
                  onChange={async (e) => {
                    if (
                      await mutate("PATCH", {
                        action: "mode",
                        mode: e.target.value,
                        enabled: connection.enabled,
                        consent: true,
                      })
                    )
                      setConsent(false);
                  }}
                >
                  <option value="manual">เลือกเผยแพร่เอง</option>
                  <option
                    value="auto_after_confirm"
                    disabled={
                      !consent && connection.mode !== "auto_after_confirm"
                    }
                  >
                    อัตโนมัติหลังยืนยัน
                  </option>
                </select>
              </label>
              {connection.mode === "auto_after_confirm" ? (
                <p className="muted">
                  คะแนนที่ยืนยันใหม่จะส่งอัตโนมัติเมื่อเปิดส่งคะแนน
                </p>
              ) : (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={disabled}
                  />
                  อนุญาตเผยแพร่คะแนนที่ยืนยันใหม่ให้นักเรียนดูอัตโนมัติ
                </label>
              )}
              <div className="integration-actions">
                <button
                  className="btn btn-secondary"
                  disabled={disabled}
                  onClick={() =>
                    void mutate("PATCH", {
                      action: "mode",
                      mode: connection.mode,
                      enabled: !connection.enabled,
                      consent: true,
                    })
                  }
                >
                  <Save size={16} />
                  {connection.enabled ? "หยุดส่งชั่วคราว" : "เปิดส่งคะแนน"}
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={busy || readOnly || connection.recoveryPending}
                  onClick={(event) => {
                    confirmationTrigger.current = event.currentTarget;
                    confirmationId.current = connection.id;
                    setConfirmation("revoke");
                  }}
                >
                  {connection.revocationPending
                    ? "ลองยกเลิกอีกครั้ง"
                    : "ยกเลิกการเชื่อมต่อ"}
                </button>
                {!connection.enabled && (
                  <button
                    className="btn btn-secondary"
                    disabled={busy || readOnly || !state.receiverReady}
                    onClick={(event) => {
                      confirmationTrigger.current = event.currentTarget;
                      confirmationId.current = connection.id;
                      setConfirmation("recover");
                    }}
                  >
                    {connection.recoveryPending
                      ? "ลองกู้คืนอีกครั้ง"
                      : "กู้คืนการเชื่อมต่อ"}
                  </button>
                )}
              </div>
            </>
          )}
          {connection.status !== "active" && (
            <div className="integration-actions">
              {!terminalRequest && (
                <button
                  className="btn btn-secondary"
                  disabled={
                    disabled ||
                    connection.status !== "pending_approval" ||
                    stage === "preparing"
                  }
                  onClick={() =>
                    void mutate(
                      "PATCH",
                      { action: "refresh", expectedRequestId: connection.id },
                      Boolean(stage),
                    )
                  }
                >
                  <RefreshCw size={16} />
                  {busy
                    ? "กำลังตรวจ…"
                    : stage === "submit"
                      ? "ลองส่งคำขอเดิม"
                      : "ตรวจสถานะ"}
                </button>
              )}
              <button
                className="btn btn-ghost"
                disabled={busy || readOnly}
                onClick={(event) => {
                  confirmationTrigger.current = event.currentTarget;
                  confirmationId.current = connection.id;
                  setConfirmation("revoke");
                }}
              >
                {terminalRequest
                  ? "ปิดคำขอ"
                  : connection.revocationPending
                    ? "ลองยกเลิกอีกครั้ง"
                    : "ยกเลิกคำขอ"}
              </button>
            </div>
          )}
        </div>
      )}
      <Modal
        returnFocusRef={
          connection?.status === "revoked"
            ? canRequest
              ? requestButton
              : sectionTitle
            : confirmationTrigger
        }
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation === "recover"
            ? "กู้คืนการเชื่อมต่อระบบเช็คชื่อ"
            : terminalRequest
              ? "ปิดคำขอเชื่อมต่อระบบเช็คชื่อ"
              : "ยกเลิกการเชื่อมต่อระบบเช็คชื่อ"
        }
        description={
          confirmation === "recover"
            ? "ยกเลิกการเชื่อมต่อเดิมเพื่อจับคู่ใหม่ คะแนนที่เคยเผยแพร่ยังไม่ถูกถอน"
            : terminalRequest
              ? "ปิดรายการนี้เพื่อขออนุมัติส่งคะแนนใหม่"
              : connection?.status === "pending_approval"
                ? "ระบบเช็คชื่อจะไม่สามารถอนุมัติคำขอนี้หลังยกเลิกสำเร็จ"
                : "ต้องถอนคะแนนที่เผยแพร่ให้สำเร็จก่อนยกเลิก"
        }
      >
        {error && <Notice tone="error">{error}</Notice>}
        <div className="integration-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setConfirmation(null)}
          >
            กลับ
          </button>
          <button
            className="btn btn-danger"
            disabled={
              busy ||
              readOnly ||
              mode !== "connected" ||
              !state?.enabled ||
              !state.receiverReady
            }
            onClick={async () => {
              if (
                confirmation &&
                (await mutate(
                  "PATCH",
                  {
                    action: confirmation,
                    consent: true,
                    expectedRequestId: confirmationId.current,
                  },
                  Boolean(stage),
                ))
              ) {
                pairRequest.current = null;
                setConfirmation(null);
              }
            }}
          >
            {busy
              ? "กำลังทำรายการ…"
              : confirmation === "recover"
                ? "ยืนยันกู้คืน"
                : terminalRequest
                  ? "ยืนยันปิดคำขอ"
                  : connection?.revocationPending
                    ? "ลองยกเลิกอีกครั้ง"
                    : "ยืนยันยกเลิก"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
