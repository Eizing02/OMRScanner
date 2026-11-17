"use client";
import { useEffect, useRef, useState } from "react";
import { Link2, RefreshCw, Save } from "lucide-react";
import { Badge, Notice, Modal } from "@/components/ui/primitives";
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
  const [code, setCode] = useState(""),
    [consent, setConsent] = useState(false),
    [useCode, setUseCode] = useState(false),
    [confirmation, setConfirmation] = useState<"revoke" | "recover" | null>(
      null,
    );
  const pairRequest = useRef<{ code: string; id: string } | null>(null);
  const confirmationTrigger = useRef<HTMLButtonElement | null>(null);
  const confirmationId = useRef<string | undefined>(undefined);
  const pairInput = useRef<HTMLInputElement | null>(null);
  const connection = state?.connection;
  const signed = Boolean(state?.signedPairing && !useCode);
  const stage = connection?.signedStage;
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
              ? busy && signed
                ? "กำลังส่งคำขอ"
                : stage === "cancelled"
                  ? "ยกเลิกแล้ว"
                  : "ยังไม่เชื่อม"
              : connection.status === "pending_approval"
                ? stage && stage !== "waiting"
                  ? "ยังยืนยันผลไม่ได้"
                  : "รออนุมัติ"
                : connection.status === "error"
                  ? stage === "rejected"
                    ? "ปฏิเสธ"
                    : stage === "expired"
                      ? "หมดอายุ"
                      : "มีปัญหา"
                  : connection.revocationPending
                    ? "กำลังยกเลิก"
                    : connection.enabled
                      ? "เชื่อมแล้ว"
                      : "หยุดส่ง";
  return (
    <section
      className="panel settings-section integration-section"
      aria-labelledby="mathquest-settings-title"
      aria-busy={loading || busy}
    >
      <div className="section-title">
        <h2 id="mathquest-settings-title">เชื่อมต่อ MathQuest</h2>
        <Badge tone={label === "เชื่อมแล้ว" ? "green" : "neutral"}>
          {label}
        </Badge>
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
      ) : !state?.enabled || !state.receiverReady ? (
        <p className="muted">เปิดใช้งานเมื่อโรงเรียนปลายทางพร้อมรับคะแนน</p>
      ) : !connection || connection.status === "revoked" ? (
        <form
          className="integration-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const choice = signed ? "signed" : code.trim();
            if (pairRequest.current?.code !== choice)
              pairRequest.current = {
                code: choice,
                id: crypto.randomUUID(),
              };
            if (
              await mutate(
                "POST",
                signed
                  ? {
                      method: "signed",
                      requestId: pairRequest.current.id,
                      consent,
                    }
                  : {
                      requestId: pairRequest.current.id,
                      code: code.trim(),
                      consent,
                    },
                signed,
              )
            ) {
              setCode("");
              setConsent(false);
            }
          }}
        >
          {signed ? (
            <div>
              <p className="integration-destination">
                {state.signedPairing?.destinationLabel}
              </p>
              <small className="muted">
                จากพื้นที่ {state.signedPairing?.workspaceLabel}
              </small>
            </div>
          ) : (
            <label>
              รหัสเชื่อมต่อ
              <input
                ref={pairInput}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                maxLength={128}
                required
                minLength={8}
                disabled={disabled}
              />
            </label>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={disabled}
            />
            อนุญาตส่งรหัสนักเรียนและคะแนนไป MathQuest ของโรงเรียน
          </label>
          <button
            className="btn btn-primary"
            disabled={
              disabled || !consent || (!signed && code.trim().length < 8)
            }
          >
            <Link2 size={17} />
            {busy ? "กำลังส่ง…" : signed ? "ส่งคำขอเชื่อมต่อ" : "ขอเชื่อมต่อ"}
          </button>
          {state.signedPairing && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={disabled}
              onClick={() => {
                setUseCode(!useCode);
                setConsent(false);
              }}
            >
              {useCode ? "ขอเชื่อมโดยไม่ใช้รหัส" : "ใช้รหัสเชื่อมต่อ"}
            </button>
          )}
        </form>
      ) : (
        <div className="integration-form">
          {connection.destinationLabel && (
            <p className="integration-destination">
              {connection.destinationLabel}
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
              ยังยืนยันรอบเปิดรับไม่ได้ ยกเลิกคำขอนี้ก่อนขอเชื่อมใหม่
            </Notice>
          )}
          {connection.revocationPending && (
            <Notice tone="warning">
              {connection.recoveryPending
                ? "กู้คืนยังไม่สำเร็จ ลองกู้คืนอีกครั้งเมื่อเชื่อมต่อได้"
                : "ยังยกเลิกที่ MathQuest ไม่สำเร็จ ลองยกเลิกอีกครั้ง"}
            </Notice>
          )}
          {!stage &&
            connection.lastError === "CONNECTION_DENIED" &&
            !connection.recoveryPending && (
              <Notice tone="warning">
                MathQuest ปฏิเสธการเชื่อมต่อ
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
              <button
                className="btn btn-ghost"
                disabled={busy || readOnly}
                onClick={(event) => {
                  confirmationTrigger.current = event.currentTarget;
                  confirmationId.current = connection.id;
                  setConfirmation("revoke");
                }}
              >
                {connection.revocationPending
                  ? "ลองยกเลิกอีกครั้ง"
                  : "ยกเลิกคำขอ"}
              </button>
            </div>
          )}
        </div>
      )}
      <Modal
        returnFocusRef={
          connection?.status === "revoked" ? pairInput : confirmationTrigger
        }
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={
          confirmation === "recover"
            ? "กู้คืนการเชื่อมต่อ MathQuest"
            : "ยกเลิกการเชื่อมต่อ MathQuest"
        }
        description={
          confirmation === "recover"
            ? "ยกเลิกการเชื่อมต่อเดิมเพื่อจับคู่ใหม่ คะแนนที่เคยเผยแพร่ยังไม่ถูกถอน"
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
                : connection?.revocationPending
                  ? "ลองยกเลิกอีกครั้ง"
                  : "ยืนยันยกเลิก"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
