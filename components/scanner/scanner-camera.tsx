"use client";
/* eslint-disable @next/next/no-img-element -- Locally captured images. */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  ImagePlus,
  ScanLine,
  X,
  RotateCcw,
  Check,
  ArrowRight,
  ScanQrCode,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { createDocumentDetector } from "@/lib/omr/document-edge-detector";
import {
  defaultQuad,
  validQuad,
  motionDistance,
  type Quad,
} from "@/lib/omr/camera-geometry";
import { readSetQr } from "@/lib/omr/scan-qr";
import { warpCanvas } from "@/lib/omr/perspective-canvas";
import { compressScanCanvas } from "@/lib/omr/compress-image";
import { Notice, Badge, PageHeading, Modal } from "@/components/ui/primitives";
import type { LockedScanTemplate, ScanReceipt } from "@/types/scan";
type Detector = Awaited<ReturnType<typeof createDocumentDetector>>;
export function Scanner({ examId }: { examId?: string }) {
  const {
    mode,
    notify,
    request,
    readOnly,
    refreshReviews,
    isCurrentWorkspace,
  } = useWorkspace();
  const [live, setLive] = useState(false),
    [busy, setBusy] = useState(false),
    [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [crop, setCrop] = useState<HTMLCanvasElement | null>(null),
    [error, setError] = useState("");
  const [template, setTemplate] = useState<LockedScanTemplate | null>(null),
    [qrBusy, setQrBusy] = useState(false);
  const [quad, setQuad] = useState<Quad>(defaultQuad),
    [single, setSingle] = useState(false),
    [auto, setAuto] = useState(false);
  const [status, setStatus] = useState<"searching" | "unstable" | "ready">(
    "searching",
  );
  const [dimensions, setDimensions] = useState({ width: 640, height: 900 }),
    [plane, setPlane] = useState({ width: 280, height: 394 });
  const [receipt, setReceipt] = useState<ScanReceipt[]>([]),
    [duplicate, setDuplicate] = useState(false),
    [reason, setReason] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    stream = useRef<MediaStream | null>(null);
  const detector = useRef<Detector | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    stable = useRef(0);
  const quadRef = useRef(quad),
    autoRef = useRef(auto),
    templateRef = useRef(template),
    reading = useRef<number | null>(null),
    qrTicket = useRef(0),
    epoch = useRef(0),
    mounted = useRef(true);
  const scanRequest = useRef<{
    id: string;
    original: string;
    processed: string;
  } | null>(null);
  useEffect(() => {
    quadRef.current = quad;
    autoRef.current = auto;
    templateRef.current = template;
  }, [quad, auto, template]);
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setLive(false);
  }
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.hidden) {
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setLive(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", hide);
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
    };
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const scale = Math.min(
        width / dimensions.width,
        height / dimensions.height,
      );
      setPlane({
        width: dimensions.width * scale,
        height: dimensions.height * scale,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [dimensions]);
  async function resolveQr(canvas: HTMLCanvasElement, force = false) {
    if (reading.current !== null && !force) return;
    const ticket = ++qrTicket.current;
    reading.current = ticket;
    const current = epoch.current;
    setQrBusy(true);
    try {
      const frame = document.createElement("canvas"),
        scale = Math.min(1, 1200 / Math.max(canvas.width, canvas.height));
      frame.width = Math.round(canvas.width * scale);
      frame.height = Math.round(canvas.height * scale);
      const ctx = frame.getContext("2d");
      if (!ctx) throw new Error("อ่านภาพไม่ได้");
      ctx.drawImage(canvas, 0, 0, frame.width, frame.height);
      const token = readSetQr({
        ...ctx.getImageData(0, 0, frame.width, frame.height),
        width: frame.width,
        height: frame.height,
      });
      if (!token) {
        if (force)
          setError(
            "ยังอ่าน QR ไม่ได้ เลือกภาพที่เห็น QR ชัดทั้งรูป แล้วอ่านอีกครั้ง",
          );
        return;
      }
      if (templateRef.current?.set_token === token) return;
      if (mode !== "connected")
        throw new Error(
          "การตรวจจริงต้องเข้าสู่พื้นที่ที่เชื่อมต่อฐานข้อมูลก่อน",
        );
      const response = await request(
          `/api/scan-records?token=${encodeURIComponent(token)}`,
        ),
        body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.messageTh ?? "อ่านทะเบียน QR ไม่สำเร็จ");
      if (examId && body.data.exam_id !== examId)
        throw new Error("QR ไม่ตรงกับชุดสอบที่เปิด กรุณาเปลี่ยนกระดาษ");
      if (
        current !== epoch.current ||
        reading.current !== ticket ||
        !mounted.current
      )
        return;
      setTemplate(body.data);
      templateRef.current = body.data;
      setError("");
      if (body.data.layout_json.paperMode === "full") setSingle(false);
    } catch (e) {
      if (
        current === epoch.current &&
        reading.current === ticket &&
        mounted.current
      )
        setError(e instanceof Error ? e.message : "อ่าน QR ไม่สำเร็จ");
    } finally {
      if (reading.current === ticket) {
        reading.current = null;
        if (mounted.current) setQrBusy(false);
      }
    }
  }
  async function accept(canvas: HTMLCanvasElement) {
    stop();
    epoch.current++;
    setTemplate(null);
    templateRef.current = null;
    setCrop(null);
    setReceipt([]);
    setError("");
    scanRequest.current = null;
    setSource(canvas);
    setDimensions({ width: canvas.width, height: canvas.height });
    setQuad(defaultQuad);
    quadRef.current = defaultQuad;
    // QR is read immediately, before any corner-confirmation step.
    await resolveQr(canvas, true);
    const current = epoch.current;
    // Loading the optional edge detector never disables manual controls.
    void createDocumentDetector()
      .then((d) => {
        if (!mounted.current || current !== epoch.current) return;
        detector.current = d;
        const found = d.detect(canvas);
        if (found.quad) {
          setQuad(found.quad);
          quadRef.current = found.quad;
        }
      })
      .catch(() => undefined);
  }
  function capture() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    void accept(canvas);
  }
  async function start() {
    setBusy(true);
    setError("");
    stop();
    epoch.current++;
    setTemplate(null);
    templateRef.current = null;
    setSource(null);
    setCrop(null);
    setReceipt([]);
    scanRequest.current = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "เปิดกล้องไม่ได้ ใช้ปุ่มเลือกภาพ หรือเปิดเว็บผ่าน HTTPS",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setLive(true);
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      void createDocumentDetector()
        .then((d) => {
          if (mounted.current) detector.current = d;
        })
        .catch(() => undefined);
      stable.current = 0;
      let tick = 0;
      timer.current = setInterval(() => {
        const v = video.current;
        if (!v?.videoWidth) return;
        const frame = document.createElement("canvas");
        frame.width = 960;
        frame.height = Math.round((960 * v.videoHeight) / v.videoWidth);
        frame.getContext("2d")?.drawImage(v, 0, 0, frame.width, frame.height);
        setDimensions({ width: v.videoWidth, height: v.videoHeight });
        if (tick++ % 3 === 0) void resolveQr(frame);
        if (!detector.current) return;
        try {
          const found = detector.current.detect(frame);
          if (!found.quad) {
            stable.current = 0;
            setStatus("searching");
            return;
          }
          const movement = motionDistance(quadRef.current, found.quad);
          quadRef.current = found.quad;
          setQuad(found.quad);
          stable.current =
            movement < 0.012 && found.coverage > 0.3 ? stable.current + 1 : 0;
          const ready = stable.current >= 6;
          setStatus(ready ? "ready" : "unstable");
          if (ready && autoRef.current && templateRef.current) {
            autoRef.current = false;
            setAuto(false);
            capture();
          }
        } catch {
          setStatus("searching");
        }
      }, 250);
    } catch (e) {
      stop();
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "กรุณาอนุญาตกล้องในเบราว์เซอร์ หรือเลือกภาพจากเครื่อง"
          : e instanceof Error
            ? e.message
            : "เปิดกล้องไม่ได้",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("เลือก JPG / PNG ไม่เกิน 10 MB");
      return;
    }
    const url = URL.createObjectURL(file);
    setBusy(true);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 25_000_000)
        throw new Error("ภาพใหญ่เกิน 25 ล้านพิกเซล");
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      await accept(canvas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดภาพไม่ได้");
    } finally {
      URL.revokeObjectURL(url);
      if (mounted.current) setBusy(false);
    }
  }
  async function warp() {
    if (!source || !template) return;
    if (!validQuad(quad)) {
      setError("มุมไขว้กันหรือใกล้กันเกินไป ปรับให้ตรงขอบกระดาษทั้ง 4 มุม");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const canvas = detector.current
        ? detector.current.warp(source, quad, single)
        : warpCanvas(source, quad, single);
      setCrop(canvas);
      scanRequest.current = null;
      setDimensions({ width: canvas.width, height: canvas.height });
    } catch (e) {
      setError(e instanceof Error ? e.message : "ปรับภาพไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  async function submit(replacePending = false) {
    if (!source || !crop || !template || readOnly) return;
    setBusy(true);
    setError("");
    try {
      scanRequest.current ??= {
        id: crypto.randomUUID(),
        original: compressScanCanvas(source),
        processed: compressScanCanvas(crop, 1800),
      };
      const response = await request(
        "/api/scan-records",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: scanRequest.current.id,
            original: scanRequest.current.original,
            processed: scanRequest.current.processed,
            paper: single ? "single" : "a4",
            expectedExamId: template.exam_id,
            replacePending,
            reason,
          }),
        },
        true,
      );
      const body = await response.json();
      if (!response.ok) {
        if (body.error?.code === "DUPLICATE_SCAN") {
          setDuplicate(true);
          return;
        }
        throw new Error(body.error?.messageTh ?? "ตรวจคำตอบไม่สำเร็จ");
      }
      if (!isCurrentWorkspace()) return;
      setReceipt(body.data);
      setDuplicate(false);
      notify("บันทึกผลสแกนแล้ว รอตรวจและยืนยันคะแนน");
      await refreshReviews().catch(() =>
        setError(
          "บันทึกผลแล้ว แต่โหลดคิวไม่ได้ เปิดศูนย์ตรวจสอบและลองโหลดอีกครั้ง",
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "ส่งตรวจไม่สำเร็จ กรุณาลองใหม่",
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  function reset() {
    stop();
    epoch.current++;
    setSource(null);
    setCrop(null);
    setTemplate(null);
    templateRef.current = null;
    setReceipt([]);
    setError("");
    setQuad(defaultQuad);
    setDimensions({ width: 640, height: 900 });
    scanRequest.current = null;
  }
  function move(i: number, x: number, y: number) {
    setQuad(
      (old) =>
        old.map((p, k) =>
          k === i
            ? { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
            : p,
        ) as Quad,
    );
  }
  const color = source
    ? "#4da3ff"
    : status === "ready"
      ? "#35d59b"
      : status === "unstable"
        ? "#ffbd54"
        : "#c6d0dc";
  const polygon = quad
    .map((p) => `${p.x * dimensions.width},${p.y * dimensions.height}`)
    .join(" ");
  const sourceUrl = useMemo(
      () => source?.toDataURL("image/jpeg", 0.8),
      [source],
    ),
    cropUrl = useMemo(() => crop?.toDataURL("image/jpeg", 0.8), [crop]);
  return (
    <div className="task-workspace scanner-task">
      <PageHeading
        title="สแกนกระดาษคำตอบ"
        actions={
          <Link href="/review" className="btn btn-secondary">
            ตรวจผล <ArrowRight size={16} />
          </Link>
        }
      />
      <div className="scan-context-bar">
        <div className="scan-phase" aria-live="polite">
          <ScanQrCode size={18} />
          <span>
            {template
              ? template.layout_json.title
              : qrBusy
                ? "กำลังอ่าน QR…"
                : "อ่าน QR เพื่อเลือกชุดสอบ"}
          </span>
          {template && (
            <Badge tone="green">รุ่น {template.layout_json.examVersion}</Badge>
          )}
        </div>
        <label>
          <span className="sr-only">รูปแบบกระดาษ</span>
          <select
            aria-label="รูปแบบกระดาษ"
            value={single ? "single" : "a4"}
            disabled={
              busy ||
              Boolean(crop) ||
              template?.layout_json.paperMode === "full"
            }
            onChange={(e) => setSingle(e.target.value === "single")}
          >
            <option value="a4">A4 ทั้งแผ่น</option>
            <option value="single">ครึ่ง A4 ที่ตัดแล้ว</option>
          </select>
        </label>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <section className="camera-stage">
        <div className="camera-topbar">
          <span>
            <ScanLine size={18} />
            {receipt.length
              ? "บันทึกผลแล้ว"
              : crop
                ? "ตรวจความชัดของภาพ"
                : source
                  ? template
                    ? "ปรับมุมกระดาษ"
                    : "อ่าน QR จากภาพ"
                  : "QR → รหัสนักเรียน → คำตอบ"}
          </span>
          <button
            className="icon-button"
            aria-label="ปิดกล้อง"
            disabled={!live}
            onClick={stop}
          >
            <X size={20} />
          </button>
        </div>
        <div className="camera-viewport" ref={viewport}>
          <div
            className="camera-image-plane"
            style={{ width: plane.width, height: plane.height }}
          >
            <video
              ref={video}
              muted
              playsInline
              className={live ? "" : "hidden"}
            />
            {source && (
              <img
                src={cropUrl || sourceUrl}
                alt={crop ? "ภาพหลังปรับมุม" : "ภาพต้นฉบับ"}
              />
            )}
            {!source && !live && (
              <div className="camera-empty">
                <ScanQrCode size={48} />
                <p>เปิดกล้องหรือเลือกภาพกระดาษคำตอบ</p>
              </div>
            )}
            {!crop && (live || source) && (
              <svg
                className="camera-overlay"
                viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                aria-label="กรอบมุมกระดาษ"
              >
                <path
                  d={`M0 0H${dimensions.width}V${dimensions.height}H0Z M${quad.map((p) => `${p.x * dimensions.width} ${p.y * dimensions.height}`).join("L")}Z`}
                  fill="rgba(5,12,22,.58)"
                  fillRule="evenodd"
                />
                <polygon
                  points={polygon}
                  fill="none"
                  stroke={color}
                  strokeWidth={4}
                />
              </svg>
            )}
            {source &&
              !crop &&
              quad.map((point, i) => (
                <button
                  key={i}
                  className="corner-handle"
                  style={{
                    left: `${point.x * 100}%`,
                    top: `${point.y * 100}%`,
                  }}
                  aria-label={`ปรับมุม${["บนซ้าย", "บนขวา", "ล่างขวา", "ล่างซ้าย"][i]}`}
                  data-x={point.x}
                  data-y={point.y}
                  aria-describedby="corner-help"
                  onPointerDown={(e) => {
                    e.currentTarget.focus();
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                    const bounds =
                      e.currentTarget.parentElement!.getBoundingClientRect();
                    move(
                      i,
                      (e.clientX - bounds.left) / bounds.width,
                      (e.clientY - bounds.top) / bounds.height,
                    );
                  }}
                  onPointerUp={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                  onPointerCancel={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                  onKeyDown={(e) => {
                    const delta: Record<string, [number, number]> = {
                      ArrowLeft: [-1, 0],
                      ArrowRight: [1, 0],
                      ArrowUp: [0, -1],
                      ArrowDown: [0, 1],
                    };
                    const value = delta[e.key];
                    if (!value) return;
                    e.preventDefault();
                    const step = e.shiftKey ? 0.02 : 0.005;
                    move(
                      i,
                      point.x + value[0] * step,
                      point.y + value[1] * step,
                    );
                  }}
                >
                  <span aria-hidden="true" />
                </button>
              ))}
          </div>
          {live && (
            <div className={`camera-status camera-${status}`} role="status">
              {template
                ? status === "ready"
                  ? "กรอบนิ่ง · พร้อมถ่าย"
                  : "เห็นกระดาษครบแล้วถือให้นิ่ง"
                : "หันกล้องให้เห็น QR ชัด"}
            </div>
          )}
        </div>
        {source && !crop && (
          <p className="corner-help" id="corner-help">
            ให้มุมตรงขอบกระดาษ รวมจุดดำทั้ง 4 มุม · ใช้ลูกศรปรับได้
          </p>
        )}
        <div className="camera-controls">
          {receipt.length ? (
            <>
              <button className="btn btn-camera-secondary" onClick={reset}>
                <Camera size={17} />
                สแกนใบถัดไป
              </button>
              <Link href="/review" className="btn btn-camera-primary">
                ตรวจและยืนยันคะแนน <ArrowRight size={16} />
              </Link>
            </>
          ) : source ? (
            <>
              <button
                className="btn btn-camera-secondary"
                disabled={busy}
                onClick={
                  crop
                    ? () => {
                        setCrop(null);
                        setDimensions({
                          width: source.width,
                          height: source.height,
                        });
                      }
                    : reset
                }
              >
                <RotateCcw size={17} />
                {crop ? "แก้มุม" : "เลือกใหม่"}
              </button>
              <button
                className="btn btn-camera-primary"
                disabled={busy || qrBusy || readOnly}
                onClick={
                  crop
                    ? () => void submit()
                    : template
                      ? warp
                      : () => void resolveQr(source)
                }
              >
                <Check size={18} />
                {busy
                  ? "กำลังดำเนินการ…"
                  : crop
                    ? "อ่านคำตอบและบันทึก"
                    : template
                      ? "ยืนยันมุมกระดาษ"
                      : "อ่าน QR อีกครั้ง"}
              </button>
            </>
          ) : (
            <>
              <label className="camera-upload">
                <ImagePlus size={22} />
                <span>เลือกภาพ</span>
                <input
                  aria-label="เลือกภาพกระดาษคำตอบ"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={busy || readOnly}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                className="shutter"
                disabled={busy || readOnly}
                onClick={live ? capture : start}
                aria-label={live ? "ถ่ายภาพกระดาษ" : "เปิดกล้อง"}
              >
                {busy ? <span className="spinner" /> : <Camera size={28} />}
              </button>
              <button
                className="camera-toggle"
                aria-pressed={auto}
                disabled={!live}
                onClick={() => setAuto(!auto)}
              >
                <ScanLine size={23} />
                <span>{auto ? "อัตโนมัติ" : "ถ่ายด้วยมือ"}</span>
              </button>
            </>
          )}
        </div>
      </section>
      {receipt.length > 0 && (
        <div className="scan-receipts" role="status">
          {receipt.map((r) => (
            <span key={r.id}>
              {r.studentCode || "รอตรวจรหัส"} · {r.name || "ยังไม่ระบุนักเรียน"}{" "}
              <strong>
                {r.score} / {r.maxScore}
              </strong>
            </span>
          ))}
        </div>
      )}
      <Modal
        open={duplicate}
        onOpenChange={setDuplicate}
        title="พบผลสแกนซ้ำ"
        description="แทนที่ได้เฉพาะผลที่ยังไม่ยืนยัน ผลเดิมและเหตุผลจะอยู่ในประวัติ"
      >
        <label>
          เหตุผลในการสแกนใหม่
          <textarea
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </label>
        <div className="dialog-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setDuplicate(false)}
          >
            ยกเลิก
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || reason.trim().length < 3}
            onClick={() => void submit(true)}
          >
            แทนที่ผลที่ยังไม่ยืนยัน
          </button>
        </div>
      </Modal>
    </div>
  );
}
