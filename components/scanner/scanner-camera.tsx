"use client";
/* eslint-disable @next/next/no-img-element -- Locally captured images. */
import { useEffect, useRef, useState } from "react";
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
  smoothQuad,
  type Quad,
} from "@/lib/omr/camera-geometry";
import { readSetQr } from "@/lib/omr/scan-qr";
import { warpCanvas } from "@/lib/omr/perspective-canvas";
import { compressScanBlob } from "@/lib/omr/compress-image";
import { startCameraLoop } from "@/lib/omr/camera-loop";
import { captureCameraFrame } from "@/lib/omr/camera-capture";
import { scannerPhase } from "@/lib/omr/scanner-state";
import { templateOverlay } from "@/lib/omr/template-overlay";
import {
  captureGeometry,
  assessPaperQuality,
  advanceCaptureStability,
} from "@/lib/omr/capture-quality";
import { Notice, Badge, PageHeading, Modal } from "@/components/ui/primitives";
import type { LockedScanTemplate, ScanReceipt } from "@/types/scan";
type Detector = Awaited<ReturnType<typeof createDocumentDetector>>;
function useCanvasUrl(canvas: HTMLCanvasElement | null) {
  const [preview, setPreview] = useState<{
    canvas: HTMLCanvasElement;
    url: string;
  }>();
  useEffect(() => {
    let active = true,
      owned: string | undefined;
    if (canvas)
      canvas.toBlob(
        (blob) => {
          if (!active || !blob) return;
          owned = URL.createObjectURL(blob);
          setPreview({ canvas, url: owned });
        },
        "image/jpeg",
        0.85,
      );
    return () => {
      active = false;
      if (owned) URL.revokeObjectURL(owned);
    };
  }, [canvas]);
  return preview?.canvas === canvas ? preview.url : undefined;
}
function ProcessingTime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(
      () => setSeconds((performance.now() - started) / 1000),
      500,
    );
    return () => clearInterval(timer);
  }, []);
  // Isolated from the camera render loop; timer's implicit live region is off.
  return (
    <span role="timer" aria-label="เวลาประมวลผล">
      {seconds.toFixed(1)} วิ
    </span>
  );
}
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
    [auto, setAuto] = useState(true);
  const [captureHint, setCaptureHint] = useState(
      "ให้เห็นกระดาษครบแล้วถือให้นิ่ง",
    ),
    [progress, setProgress] = useState(0),
    [fromCamera, setFromCamera] = useState(false);
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
    loadingDetector = useRef<Promise<Detector> | null>(null),
    cancelLoop = useRef<(() => void) | null>(null),
    stable = useRef(0);
  const quadRef = useRef(quad),
    autoRef = useRef(auto),
    templateRef = useRef(template),
    reading = useRef<number | null>(null),
    qrTicket = useRef(0),
    epoch = useRef(0),
    mounted = useRef(true);
  const fired = useRef(false),
    nextQualityCheck = useRef(0);
  const [capturing, setCapturing] = useState(false);
  const [engineName, setEngineName] = useState<Detector["engine"] | "loading">(
    "loading",
  );
  const manualCorners = useRef(false);
  const submitController = useRef<AbortController | null>(null);
  const displayQuad = useRef<Quad>(defaultQuad);
  const qrFrame = useRef<HTMLCanvasElement | null>(null);
  const qrSample = useRef<HTMLCanvasElement | null>(null);
  const singleRef = useRef(single);
  const scanRequest = useRef<{
    id: string;
    processed: Blob;
  } | null>(null);
  useEffect(() => {
    if (!live) quadRef.current = quad;
    autoRef.current = auto;
    templateRef.current = template;
    singleRef.current = single;
  }, [quad, auto, template, single, live]);
  function stop() {
    epoch.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    cancelLoop.current?.();
    cancelLoop.current = null;
    setLive(false);
  }
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.hidden) {
        epoch.current++;
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        cancelLoop.current?.();
        cancelLoop.current = null;
        setLive(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", hide);
      stream.current?.getTracks().forEach((t) => t.stop());
      // Session token is intentionally read at cleanup; it is not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      epoch.current++;
      cancelLoop.current?.();
      detector.current?.dispose();
      submitController.current?.abort();
      if (qrFrame.current) qrFrame.current.width = qrFrame.current.height = 0;
      if (qrSample.current)
        qrSample.current.width = qrSample.current.height = 0;
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
  function ensureDetector() {
    return (loadingDetector.current ??= createDocumentDetector()
      .then((d) => {
        if (!mounted.current) {
          d.dispose();
          throw new Error("SCANNER_CLOSED");
        }
        detector.current = d;
        setEngineName(d.engine);
        return d;
      })
      .catch((error) => {
        loadingDetector.current = null;
        throw error;
      }));
  }
  async function resolveQr(canvas: HTMLCanvasElement, force = false) {
    if (reading.current !== null && !force) return;
    const ticket = ++qrTicket.current;
    reading.current = ticket;
    const current = epoch.current;
    setQrBusy(true);
    try {
      const frame = (qrFrame.current ??= document.createElement("canvas")),
        scale = Math.min(1, 1800 / Math.max(canvas.width, canvas.height));
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
      if (body.data.layout_json.paperMode === "full") {
        setSingle(false);
        singleRef.current = false;
        stable.current = 0;
      }
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
  async function accept(
    canvas: HTMLCanvasElement,
    automaticCrop?: HTMLCanvasElement,
    locked?: LockedScanTemplate,
  ) {
    stop();
    epoch.current++;
    setTemplate(locked ?? null);
    templateRef.current = locked ?? null;
    setCrop(automaticCrop ?? null);
    setReceipt([]);
    setError("");
    scanRequest.current = null;
    setSource(canvas);
    setDimensions({
      width: (automaticCrop ?? canvas).width,
      height: (automaticCrop ?? canvas).height,
    });
    setQuad(defaultQuad);
    quadRef.current = defaultQuad;
    manualCorners.current = false;
    // QR is read immediately, before any corner-confirmation step.
    if (automaticCrop && locked) return;
    await resolveQr(canvas, true);
    const current = epoch.current;
    // Loading the optional edge detector never disables manual controls.
    void ensureDetector()
      .then(async (d) => {
        if (!mounted.current || current !== epoch.current) return;
        const found = await d.detect(canvas);
        if (!mounted.current || current !== epoch.current) return;
        setEngineName(d.engine);
        // An optional engine can finish after the teacher starts adjusting.
        // Never replace a manual correction with a late automatic result.
        if (found.quad && !manualCorners.current) {
          setQuad(found.quad);
          quadRef.current = found.quad;
        }
      })
      .catch(() => undefined);
  }
  async function capture(automatic = false) {
    const v = video.current;
    if (!v?.videoWidth || fired.current) return;
    if (
      automatic &&
      (!detector.current ||
        !templateRef.current ||
        Date.now() < nextQualityCheck.current)
    )
      return;
    const current = epoch.current;
    fired.current = true;
    setCapturing(true);
    let canvas: HTMLCanvasElement;
    let photo: boolean;
    try {
      ({ canvas, photo } = await captureCameraFrame(
        v,
        stream.current?.getVideoTracks()[0],
      ));
      if (!mounted.current || current !== epoch.current) return;
      if (automatic) {
        const locked = templateRef.current!;
        let corners = quadRef.current;
        if (photo) {
          const detected = await detector.current!.detect(canvas);
          if (!detected.quad)
            throw new Error("ภาพนิ่งจับขอบไม่ได้ ใช้ปุ่มถ่ายภาพหรือถ่ายใหม่");
          corners = detected.quad; // Photo FOV/crop can differ from preview; never scale preview blindly.
        }
        const geometry = captureGeometry(
          corners,
          canvas.width,
          canvas.height,
          singleRef.current,
        );
        if (geometry) throw new Error(geometry);
        const processed = await detector.current!.warp(
          canvas,
          corners,
          singleRef.current,
        );
        const ctx = processed.getContext("2d");
        if (!ctx) throw new Error("อ่านภาพไม่ได้ ใช้ปุ่มถ่ายภาพได้");
        const quality = assessPaperQuality(
          ctx.getImageData(0, 0, processed.width, processed.height),
          locked,
          singleRef.current,
        );
        if (quality) throw new Error(quality);
        if (!mounted.current || current !== epoch.current) return;
        setEngineName(detector.current!.engine);
        setStatus("ready");
        setFromCamera(true);
        await accept(canvas, processed, locked);
      } else {
        setFromCamera(true);
        await accept(canvas);
      }
    } catch (e) {
      if (!mounted.current || current !== epoch.current) return;
      fired.current = false;
      stable.current = 0;
      setProgress(0);
      setStatus("unstable");
      nextQualityCheck.current = Date.now() + 750;
      setCaptureHint(
        e instanceof Error
          ? e.message
          : "ภาพยังไม่ชัด ใช้ปุ่มถ่ายหรือถ่ายใหม่ได้",
      );
      if (!automatic)
        setError(e instanceof Error ? e.message : "ถ่ายภาพไม่ได้ กรุณาลองใหม่");
    } finally {
      if (mounted.current) setCapturing(false);
    }
  }
  async function start() {
    setBusy(true);
    setError("");
    stop();
    epoch.current++;
    const cameraEpoch = epoch.current;
    try {
      const preference = localStorage.getItem("sas-camera-auto");
      if (preference !== null) {
        setAuto(preference !== "false");
        autoRef.current = preference !== "false";
      }
    } catch {
      /* Private browsing may disable storage. */
    }
    setTemplate(null);
    templateRef.current = null;
    setSource(null);
    setCrop(null);
    setReceipt([]);
    scanRequest.current = null;
    fired.current = false;
    nextQualityCheck.current = 0;
    setProgress(0);
    setStatus("searching");
    setFromCamera(true);
    setDuplicate(false);
    setReason("");
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
      if (
        !mounted.current ||
        cameraEpoch !== epoch.current ||
        document.hidden
      ) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setLive(true);
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      if (cameraEpoch !== epoch.current || stream.current !== media) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      void ensureDetector().catch(() => undefined);
      stable.current = 0;
      let nextQr = 0;
      cancelLoop.current = startCameraLoop(
        video.current!,
        async (frame, now) => {
          const v = video.current;
          if (!v?.videoWidth || fired.current || cameraEpoch !== epoch.current)
            return;
          setDimensions((old) =>
            old.width === v.videoWidth && old.height === v.videoHeight
              ? old
              : { width: v.videoWidth, height: v.videoHeight },
          );
          // Stop live QR work once locked. Capture and server independently revalidate it.
          if (
            now >= nextQr &&
            !templateRef.current &&
            reading.current === null
          ) {
            nextQr = now + 900;
            const qr = (qrSample.current ??= document.createElement("canvas"));
            const scale = Math.min(
              1,
              1800 / Math.max(v.videoWidth, v.videoHeight),
            );
            qr.width = Math.round(v.videoWidth * scale);
            qr.height = Math.round(v.videoHeight * scale);
            qr.getContext("2d")?.drawImage(v, 0, 0, qr.width, qr.height);
            void resolveQr(qr);
          }
          if (!detector.current) {
            setCaptureHint("กำลังเตรียมจับขอบ ใช้ปุ่มถ่ายภาพได้");
            return;
          }
          try {
            const found = await detector.current.detect(frame);
            if (
              !mounted.current ||
              cameraEpoch !== epoch.current ||
              fired.current
            )
              return;
            setEngineName(detector.current.engine);
            if (!found.quad) {
              stable.current = 0;
              setStatus("searching");
              setProgress(0);
              setCaptureHint("ให้เห็นขอบกระดาษครบทั้ง 4 มุม");
              return;
            }
            const movement = motionDistance(quadRef.current, found.quad);
            quadRef.current = found.quad;
            displayQuad.current = smoothQuad(displayQuad.current, found.quad);
            setQuad(displayQuad.current);
            const geometry = captureGeometry(
              found.quad,
              v.videoWidth,
              v.videoHeight,
              singleRef.current,
            );
            stable.current = advanceCaptureStability(
              stable.current,
              movement,
              !geometry &&
                Boolean(templateRef.current) &&
                Date.now() >= nextQualityCheck.current,
            );
            setProgress(stable.current);
            const ready = stable.current >= 5;
            if (geometry) setCaptureHint(geometry);
            else if (stable.current > 0)
              setCaptureHint(
                autoRef.current
                  ? "ถือให้นิ่ง กำลังเตรียมถ่าย…"
                  : "กรอบนิ่ง · พร้อมถ่าย",
              );
            else if (Date.now() >= nextQualityCheck.current)
              setCaptureHint("ถือกล้องให้นิ่ง");
            // Green means the full-resolution quality gates passed, not merely steady corners.
            setStatus("unstable");
            if (ready && autoRef.current && templateRef.current) {
              void capture(true);
            }
          } catch {
            setStatus("searching");
          }
        },
      );
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
    setFromCamera(false);
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
    const current = epoch.current;
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const canvas = detector.current
        ? await detector.current.warp(source, quad, single)
        : warpCanvas(source, quad, single);
      if (!mounted.current || current !== epoch.current) return;
      if (detector.current) setEngineName(detector.current.engine);
      setCrop(canvas);
      scanRequest.current = null;
      setDimensions({ width: canvas.width, height: canvas.height });
    } catch (e) {
      if (mounted.current && current === epoch.current)
        setError(e instanceof Error ? e.message : "ปรับภาพไม่ได้");
    } finally {
      if (mounted.current && current === epoch.current) setBusy(false);
    }
  }
  async function submit(replacePending = false) {
    if (!source || !crop || !template || readOnly) return;
    setBusy(true);
    setError("");
    const current = epoch.current;
    const controller = new AbortController();
    submitController.current = controller;
    try {
      scanRequest.current ??= {
        id: crypto.randomUUID(),
        processed: await compressScanBlob(crop, 1800),
      };
      if (
        !mounted.current ||
        current !== epoch.current ||
        controller.signal.aborted ||
        !isCurrentWorkspace()
      )
        return;
      const form = new FormData();
      form.set(
        "metadata",
        JSON.stringify({
          requestId: scanRequest.current.id,
          paper: single ? "single" : "a4",
          expectedExamId: template.exam_id,
          replacePending,
          reason,
        }),
      );
      form.set("processed", scanRequest.current.processed, "scan.jpg");
      const response = await request(
        "/api/scan-records",
        {
          method: "POST",
          body: form,
          signal: controller.signal,
        },
        true,
      );
      const body = await response.json();
      if (
        !mounted.current ||
        current !== epoch.current ||
        !isCurrentWorkspace()
      )
        return;
      if (!response.ok) {
        if (body.error?.code === "DUPLICATE_SCAN") {
          setDuplicate(true);
          return;
        }
        throw new Error(body.error?.messageTh ?? "ตรวจคำตอบไม่สำเร็จ");
      }
      setReceipt(body.data);
      // Retain the rectified preview only after the server stored evidence
      // and scores. Failed submissions keep the original locally for recovery.
      setSource(crop);
      scanRequest.current = null;
      setDuplicate(false);
      notify("บันทึกผลสแกนแล้ว รอตรวจและยืนยันคะแนน");
      await refreshReviews().catch(() => {
        if (mounted.current && current === epoch.current)
          setError(
            "บันทึกผลแล้ว แต่โหลดคิวไม่ได้ เปิดศูนย์ตรวจสอบและลองโหลดอีกครั้ง",
          );
      });
    } catch (e) {
      if (mounted.current && current === epoch.current)
        setError(
          e instanceof Error ? e.message : "ส่งตรวจไม่สำเร็จ กรุณาลองใหม่",
        );
    } finally {
      if (submitController.current === controller)
        submitController.current = null;
      if (mounted.current && current === epoch.current) setBusy(false);
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
    fired.current = false;
    setDuplicate(false);
    setReason("");
    setProgress(0);
  }
  function move(i: number, x: number, y: number) {
    manualCorners.current = true;
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
    ? "var(--camera-adjust)"
    : status === "ready"
      ? "var(--camera-ready)"
      : status === "unstable"
        ? "var(--camera-aligning)"
        : "var(--camera-searching)";
  const polygon = quad
    .map((p) => `${p.x * dimensions.width},${p.y * dimensions.height}`)
    .join(" ");
  const sourceUrl = useCanvasUrl(source),
    cropUrl = useCanvasUrl(crop);
  const phase = scannerPhase({
    busy,
    live,
    source: Boolean(source),
    crop: Boolean(crop),
    saved: receipt.length > 0,
    error: Boolean(error),
    progress,
    detected: status !== "searching",
    capturing,
  });
  return (
    <div
      className="task-workspace scanner-task"
      data-scanner-phase={phase}
      data-scanner-engine={engineName}
    >
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
            onChange={(e) => {
              const value = e.target.value === "single";
              setSingle(value);
              singleRef.current = value;
              stable.current = 0;
              setProgress(0);
              setStatus("searching");
            }}
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
          {busy && source && <ProcessingTime />}
          <button
            className="icon-button"
            aria-label="ปิดกล้อง"
            disabled={!live}
            onClick={stop}
          >
            <X size={20} />
          </button>
        </div>
        <div
          className="camera-viewport"
          data-qr-locked={Boolean(template)}
          ref={viewport}
        >
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
            {source && (crop ? cropUrl : sourceUrl) && (
              <img
                src={crop ? cropUrl : sourceUrl}
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
                  fill="var(--camera-shade)"
                  fillRule="evenodd"
                />
                <polygon
                  points={polygon}
                  fill="none"
                  stroke={color}
                  strokeWidth={4}
                />
                {template &&
                  templateOverlay(template, quad, single).map((region) => (
                    <polygon
                      key={region.name}
                      data-region={region.name}
                      points={region.points
                        .map(
                          (p) =>
                            `${p.x * dimensions.width},${p.y * dimensions.height}`,
                        )
                        .join(" ")}
                      fill="none"
                      stroke="var(--camera-region)"
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                    />
                  ))}
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
                    manualCorners.current = true;
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
              {capturing
                ? "กำลังถ่ายภาพ…"
                : template
                  ? captureHint
                  : "หันกล้องให้เห็น QR ชัด"}
              {auto && template && progress > 0 && (
                <progress
                  aria-label="ความนิ่งก่อนถ่ายอัตโนมัติ"
                  value={progress}
                  max={5}
                />
              )}
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
              <button
                className="btn btn-camera-secondary"
                onClick={fromCamera ? () => void start() : reset}
              >
                <Camera size={17} />
                สแกนใบถัดไป
              </button>
              <Link href="/review" className="btn btn-camera-primary">
                ตรวจและยืนยันคะแนน <ArrowRight size={16} />
              </Link>
            </>
          ) : source ? (
            <>
              {fromCamera && (
                <button
                  className="btn btn-camera-secondary"
                  disabled={busy}
                  onClick={() => void start()}
                >
                  <Camera size={17} />
                  ถ่ายใหม่
                </button>
              )}
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
                disabled={busy || capturing || readOnly}
                onClick={live ? () => void capture() : start}
                aria-label={live ? "ถ่ายภาพกระดาษ" : "เปิดกล้อง"}
              >
                {busy ? <span className="spinner" /> : <Camera size={28} />}
              </button>
              <button
                className="camera-toggle"
                aria-pressed={auto}
                disabled={!live}
                onClick={() => {
                  const enabled = !auto;
                  setAuto(enabled);
                  autoRef.current = enabled;
                  stable.current = 0;
                  setProgress(0);
                  try {
                    localStorage.setItem("sas-camera-auto", String(enabled));
                  } catch {
                    /* Optional preference. */
                  }
                }}
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
