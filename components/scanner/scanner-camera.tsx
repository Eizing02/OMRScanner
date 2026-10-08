"use client";
/* eslint-disable @next/next/no-img-element -- Captured images are local canvas data, not remote image assets. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Upload,
  ScanLine,
  X,
  RotateCcw,
  Check,
  Move,
  ImagePlus,
  Maximize,
  FlashlightOff,
  ArrowRight,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { SheetPreview } from "@/components/omr/omr-sheet-preview";
import { createDocumentDetector } from "@/lib/omr/document-edge-detector";
import {
  defaultQuad,
  validQuad,
  motionDistance,
  type Quad,
} from "@/lib/omr/camera-geometry";
import { Notice, Badge, PageHeading } from "@/components/ui/primitives";
type Detector = Awaited<ReturnType<typeof createDocumentDetector>>;
export function Scanner() {
  const { layout, notify } = useWorkspace();
  const [live, setLive] = useState(false);
  const [sample, setSample] = useState(true);
  const [status, setStatus] = useState<"searching" | "unstable" | "ready">(
    "searching",
  );
  const [quad, setQuad] = useState<Quad>(defaultQuad);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [crop, setCrop] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [single, setSingle] = useState(false);
  const [auto, setAuto] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 640, height: 900 });
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    detector = useRef<Detector | null>(null),
    quadRef = useRef<Quad>(defaultQuad),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    stable = useRef(0),
    autoRef = useRef(false);
  autoRef.current = auto;
  function stop() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setLive(false);
  }
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) {
        stream.current?.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
        setLive(false);
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  async function start() {
    setError("");
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "เบราว์เซอร์นี้เปิดกล้องไม่ได้ ใช้ปุ่มเลือกภาพแทน หรือเปิดผ่าน HTTPS",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      stream.current = media;
      setSample(false);
      setLive(true);
      setSource(null);
      setCrop("");
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      try {
        detector.current = await createDocumentDetector();
      } catch (e) {
        setError(e instanceof Error ? e.message : "เปิดตัวตรวจขอบไม่สำเร็จ");
      }
      stable.current = 0;
      timer.current = setInterval(() => {
        const v = video.current;
        if (!v || !v.videoWidth || !detector.current) return;
        const frame = document.createElement("canvas");
        frame.width = 480;
        frame.height = Math.round((480 * v.videoHeight) / v.videoWidth);
        frame.getContext("2d")?.drawImage(v, 0, 0, frame.width, frame.height);
        const found = detector.current.detect(frame);
        setDimensions({ width: v.videoWidth, height: v.videoHeight });
        if (!found.quad) {
          setStatus("searching");
          stable.current = 0;
          return;
        }
        const movement = motionDistance(quadRef.current, found.quad);
        quadRef.current = found.quad;
        setQuad(found.quad);
        stable.current =
          movement < 0.012 && found.coverage > 0.3 ? stable.current + 1 : 0;
        const ready = stable.current >= 6;
        setStatus(ready ? "ready" : "unstable");
        if (ready && autoRef.current) {
          autoRef.current = false;
          setAuto(false);
          capture();
        }
      }, 200);
    } catch (e) {
      stop();
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "ไม่ได้รับสิทธิ์กล้อง กรุณาอนุญาตกล้องในเบราว์เซอร์ หรือเลือกภาพจากเครื่อง"
          : e instanceof Error
            ? e.message
            : "เปิดกล้องไม่ได้",
      );
    } finally {
      setBusy(false);
    }
  }
  function capture() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    setSource(canvas);
    setDimensions({ width: canvas.width, height: canvas.height });
    stop();
    notify("เก็บภาพต้นฉบับแล้ว ตรวจมุมกระดาษก่อนปรับภาพ");
  }
  function moveCorner(index: number, x: number, y: number) {
    setQuad(
      (old) =>
        old.map((point, i) =>
          i === index
            ? { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }
            : point,
        ) as Quad,
    );
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError(
        "เลือก JPG / PNG ขนาดไม่เกิน 10 MB · อัปโหลด PDF แบบชุดยังอยู่ระหว่างพัฒนา",
      );
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = async () => {
      if (image.width * image.height > 25_000_000) {
        setError("ภาพใหญ่เกิน 25 ล้านพิกเซล กรุณาย่อภาพก่อน");
        URL.revokeObjectURL(url);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext("2d")?.drawImage(image, 0, 0);
      stop();
      setSource(canvas);
      setSample(false);
      setCrop("");
      setDimensions({ width: canvas.width, height: canvas.height });
      setQuad(defaultQuad);
      quadRef.current = defaultQuad;
      setError("");
      try {
        detector.current = await createDocumentDetector();
        const found = detector.current.detect(canvas);
        if (found.quad) {
          setQuad(found.quad);
          quadRef.current = found.quad;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "ใช้การปรับมุมด้วยมือ");
      }
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      setError("ไฟล์ภาพเสียหาย กรุณาเลือกไฟล์ใหม่");
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }
  async function warp() {
    if (!source || !validQuad(quad)) {
      setError("มุมกระดาษไขว้กันหรืออยู่นอกภาพ กรุณาปรับใหม่");
      return;
    }
    setBusy(true);
    try {
      detector.current ??= await createDocumentDetector();
      setCrop(
        detector.current
          .warp(source, quad, single)
          .toDataURL("image/jpeg", 0.9),
      );
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ปรับภาพไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
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
  return (
    <>
      <PageHeading
        title="สแกนกระดาษคำตอบ"
        description="จับภาพให้ครบทุกมุม แล้วตรวจความชัดก่อนส่งประมวลผล"
        actions={
          <Link href="/review" className="btn btn-secondary">
            เปิดศูนย์ตรวจสอบ
            <ArrowRight size={16} />
          </Link>
        }
      />
      <div className="scanner-workspace">
        <section className="camera-stage">
          <div className="camera-topbar">
            <span>
              <ScanLine size={19} />
              {source ? "ตรวจและปรับมุมกระดาษ" : "กล้องสแกนเอกสาร"}
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
          <div
            className="camera-viewport"
            style={{
              aspectRatio: source
                ? `${dimensions.width}/${dimensions.height}`
                : undefined,
            }}
          >
            <video
              ref={video}
              muted
              playsInline
              className={live ? "" : "hidden"}
            />
            {source ? (
              <img
                src={crop || source.toDataURL("image/jpeg", 0.9)}
                alt={crop ? "ภาพหลังปรับมุม" : "ภาพต้นฉบับที่ถ่าย"}
              />
            ) : (
              sample && (
                <div className="camera-sample">
                  <span className="sample-label">
                    ภาพจำลอง · กล้องยังไม่เปิด
                  </span>
                  <div className="sample-paper">
                    <SheetPreview layout={layout} single />
                  </div>
                </div>
              )
            )}
            {!crop && (live || source || sample) && (
              <svg
                className="camera-overlay"
                viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
                preserveAspectRatio="xMidYMid meet"
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
                  strokeDasharray={
                    status === "searching" && !source ? "16 12" : undefined
                  }
                />
                {!source &&
                  quad.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x * dimensions.width}
                      cy={p.y * dimensions.height}
                      r={7}
                      fill={color}
                      stroke="white"
                      strokeWidth={2}
                    />
                  ))}
              </svg>
            )}
            {source &&
              !crop &&
              quad.map((point, i) => (
                <button
                  key={i}
                  type="button"
                  className="corner-handle"
                  style={{
                    left: `${point.x * 100}%`,
                    top: `${point.y * 100}%`,
                  }}
                  aria-label={`ปรับมุม${["บนซ้าย", "บนขวา", "ล่างขวา", "ล่างซ้าย"][i]}`}
                  aria-describedby="corner-help"
                  data-x={point.x}
                  data-y={point.y}
                  onPointerDown={(event) => {
                    event.currentTarget.focus();
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (!event.currentTarget.hasPointerCapture(event.pointerId))
                      return;
                    const bounds =
                      event.currentTarget.parentElement!.getBoundingClientRect();
                    moveCorner(
                      i,
                      (event.clientX - bounds.left) / bounds.width,
                      (event.clientY - bounds.top) / bounds.height,
                    );
                  }}
                  onKeyDown={(event) => {
                    const steps: Record<string, [number, number]> = {
                      ArrowLeft: [-1, 0],
                      ArrowRight: [1, 0],
                      ArrowUp: [0, -1],
                      ArrowDown: [0, 1],
                    };
                    const delta = steps[event.key];
                    if (!delta) return;
                    event.preventDefault();
                    const step = event.shiftKey ? 0.02 : 0.005;
                    moveCorner(
                      i,
                      point.x + delta[0] * step,
                      point.y + delta[1] * step,
                    );
                  }}
                >
                  <span aria-hidden="true" />
                </button>
              ))}
            {!source && (
              /* Live-camera guidance remains separate from manual editing. */
              <div className={`camera-status camera-${status}`}>
                <span />
                {sample
                  ? "วางกระดาษให้อยู่ในกรอบ"
                  : status === "ready"
                    ? "กรอบนิ่ง · พร้อมถ่ายภาพ"
                    : status === "unstable"
                      ? "พบกระดาษ · กรุณาถือให้นิ่ง"
                      : "กำลังค้นหาขอบกระดาษ"}
              </div>
            )}
          </div>
          <div className="camera-controls">
            {source ? (
              <>
                <button
                  className="btn btn-camera-secondary"
                  onClick={() => {
                    setSource(null);
                    setCrop("");
                    setSample(true);
                    setDimensions({ width: 640, height: 900 });
                    setQuad(defaultQuad);
                  }}
                >
                  <RotateCcw size={17} />
                  ถ่ายใหม่
                </button>
                <button
                  className="btn btn-camera-primary"
                  disabled={busy}
                  onClick={warp}
                >
                  <Check size={18} />
                  {busy ? "กำลังปรับภาพ…" : "ยืนยันมุมกระดาษ"}
                </button>
              </>
            ) : (
              <>
                <label className="camera-upload">
                  <ImagePlus size={22} />
                  <span>เลือกภาพ</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    capture="environment"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>
                <button
                  className="shutter"
                  disabled={busy}
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
          {source && !crop && (
            <p id="corner-help" className="corner-help">
              ลากมุมเพื่อปรับ หรือใช้ Tab เลือกมุมและปุ่มลูกศรเพื่อเลื่อน ·
              Shift เพื่อเลื่อนเร็ว
            </p>
          )}
        </section>
        <aside className="scanner-info">
          <div className="panel scanner-context">
            <h2>ชุดสอบที่สแกน</h2>
            <label>
              ชุดสอบ
              <select>
                <option>เลือกหลังอ่าน QR ในระบบจริง</option>
              </select>
            </label>
            <label>
              รูปแบบกระดาษ
              <select
                value={single ? "single" : "a4"}
                onChange={(e) => setSingle(e.target.value === "single")}
              >
                <option value="a4">A4 ทั้งแผ่น · แนวนอน (1 หรือ 2 ใบ)</option>
                <option value="single">กระดาษครึ่ง A4 ที่ตัดแยก · แนวตั้ง</option>
              </select>
            </label>
            <Badge tone="blue">ปรับภาพบนเครื่อง · ยังไม่ส่งขึ้นระบบ</Badge>
          </div>
          <div className="panel scanner-guide">
            <h2>เพื่อภาพที่อ่านได้ชัด</h2>
            <p>
              <Maximize size={19} />
              ให้เห็นมุมกระดาษครบทั้ง 4 มุม
            </p>
            <p>
              <FlashlightOff size={19} />
              หลีกเลี่ยงเงามือและแสงสะท้อน
            </p>
            <p>
              <Move size={19} />
              ถือให้นิ่งและวางบนพื้นต่างสี
            </p>
            <Notice tone="warning">
              การตรวจกรอบนิ่งเป็นเกณฑ์ทดลอง
              ยังไม่ได้ประเมินความคมชัดหรือแสงสะท้อน ห้ามใช้เป็นหลักฐานว่า OMR
              อ่านได้แม่นยำ
            </Notice>
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          {crop && (
            <div className="panel">
              <h2>ภาพพร้อมตรวจ</h2>
              <p>ปรับมุมภาพสำเร็จ ต้นฉบับยังเก็บอยู่ในหน้านี้</p>
              <Notice>
                TODO: เชื่อมพื้นที่จัดเก็บภาพและ OMR worker ก่อนส่งตรวจจริง
              </Notice>
              <button
                className="btn btn-secondary full-width"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = crop;
                  a.download = "ภาพปรับมุม-ทดสอบ.jpg";
                  a.click();
                }}
              >
                <Upload size={16} />
                บันทึกภาพทดสอบ
              </button>
            </div>
          )}
          <div className="scanner-session">
            <h3>แยกการจับภาพกับการตรวจคำตอบ</h3>
            <p>
              ขอบกระดาษช่วยจัดแนวภาพ
              ส่วนรหัสนักเรียนและคำตอบจะอ่านจากแม่แบบที่ผูกกับ QR
              หลังส่งประมวลผล
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
