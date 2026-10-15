"use client";
import { useRef, useState } from "react";
import { Link2, RefreshCw, Save } from "lucide-react";
import { Badge, Notice, Modal } from "@/components/ui/primitives";
import { useMathQuest } from "./use-mathquest";
export function MathQuestSettings() {
  const { state, mode, readOnly, loading, error, busy, mutate, refresh } =
    useMathQuest("/api/integrations/mathquest");
  const [code, setCode] = useState(""),
    [consent, setConsent] = useState(false),
    [revoke, setRevoke] = useState(false);
  const pairRequest = useRef<{ code: string; id: string } | null>(null);
  const connection = state?.connection;
  const disabled =
    busy ||
    readOnly ||
    connection?.revocationPending === true ||
    !state?.enabled ||
    !state?.receiverReady ||
    mode !== "connected";
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
              ? "ยังไม่เชื่อม"
              : connection.status === "pending_approval"
                ? "รออนุมัติ"
                : connection.status === "error"
                  ? "มีปัญหา"
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
            if (pairRequest.current?.code !== code.trim())
              pairRequest.current = {
                code: code.trim(),
                id: crypto.randomUUID(),
              };
            if (
              await mutate("POST", {
                requestId: pairRequest.current.id,
                code: code.trim(),
                consent,
              })
            ) {
              setCode("");
              setConsent(false);
            }
          }}
        >
          <label>
            รหัสเชื่อมต่อ
            <input
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
            disabled={disabled || !consent || code.trim().length < 8}
          >
            <Link2 size={17} />
            {busy ? "กำลังเชื่อม…" : "ขอเชื่อมต่อ"}
          </button>
        </form>
      ) : (
        <div className="integration-form">
          {connection.destinationLabel && (
            <p className="integration-destination">
              {connection.destinationLabel}
            </p>
          )}
          {connection.revocationPending && (
            <Notice tone="warning">
              ยังยกเลิกที่ MathQuest ไม่สำเร็จ
              ลองยืนยันอีกครั้งเมื่อเชื่อมต่อได้
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
                  disabled={busy || readOnly}
                  onClick={() => setRevoke(true)}
                >
                  {connection.revocationPending
                    ? "ลองยกเลิกอีกครั้ง"
                    : "ยกเลิกการเชื่อมต่อ"}
                </button>
              </div>
            </>
          )}
          {connection.status !== "active" && (
            <div className="integration-actions">
              <button
                className="btn btn-secondary"
                disabled={disabled || connection.status !== "pending_approval"}
                onClick={() => void mutate("PATCH", { action: "refresh" })}
              >
                <RefreshCw size={16} />
                {busy ? "กำลังตรวจ…" : "ตรวจสถานะ"}
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy || readOnly}
                onClick={() => setRevoke(true)}
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
        open={revoke}
        onOpenChange={setRevoke}
        title="ยกเลิกการเชื่อมต่อ MathQuest"
        description="ต้องถอนคะแนนที่เผยแพร่ให้สำเร็จก่อนยกเลิก"
      >
        {error && <Notice tone="error">{error}</Notice>}
        <div className="integration-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setRevoke(false)}
          >
            กลับ
          </button>
          <button
            className="btn btn-danger"
            disabled={busy || readOnly || mode !== "connected"}
            onClick={async () => {
              if (await mutate("PATCH", { action: "revoke", consent: true }))
                setRevoke(false);
            }}
          >
            {busy
              ? "กำลังยกเลิก…"
              : connection?.revocationPending
                ? "ลองยกเลิกอีกครั้ง"
                : "ยืนยันยกเลิก"}
          </button>
        </div>
      </Modal>
    </section>
  );
}
