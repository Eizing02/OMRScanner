"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileCheck2, ArrowRight, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/layout/auth-provider";
import { Notice } from "@/components/ui/primitives";
export default function Login() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (new URLSearchParams(window.location.search).get("error")) queueMicrotask(() => active && setError("Google Login ยังไม่สำเร็จ กรุณาลองอีกครั้ง หรือตรวจการตั้งค่า URL กลับเข้าเว็บ"));
    fetch("/api/auth/status", { cache: "no-store" }).then((r) => r.json()).then((body) => {
      if (active) setGoogleEnabled(body.data?.googleEnabled ?? null);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  async function signIn() {
    setBusy(true); setError("");
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: "select_account" } },
      });
      if (error) throw new Error("เปิด Google Login ไม่สำเร็จ กรุณาตรวจการตั้งค่า Google ใน Supabase");
    } catch (error) { setError(error instanceof Error ? error.message : "เข้าสู่ระบบไม่สำเร็จ"); setBusy(false); }
  }
  return <main className="login-page">
    <section className="login-story">
      <span className="brand-icon"><FileCheck2 size={28} /></span>
      <h1>พื้นที่ทำงานของครู<br />จากรายชื่อถึงกระดาษคำตอบ</h1>
      <p>สร้างชุดสอบ พิมพ์ใบคำตอบรายบุคคล และตรวจทานงานในพื้นที่ส่วนตัวของคุณ</p>
      <div><ShieldCheck size={23} />แยกข้อมูลแต่ละบัญชี · ใช้งานหลังได้รับอนุมัติ</div>
    </section>
    <section className="login-form">
      <h2>เข้าสู่พื้นที่ทำงาน</h2>
      <p className="muted">ใช้บัญชี Google ไม่ต้องตั้งรหัสผ่านใหม่กับเว็บนี้</p>
      {error && <Notice tone="error">{error}</Notice>}
      {!auth.configured && <Notice tone="warning">ยังไม่ได้ตั้งค่า Supabase กรุณาให้เจ้าของระบบตั้งค่าการเชื่อมต่อก่อน</Notice>}
      {googleEnabled === false && <Notice tone="warning">ยังไม่ได้เปิด Google Login ใน Supabase กรุณาให้เจ้าของระบบตั้งค่า Google OAuth ก่อน</Notice>}
      {auth.access ? <>
        <p className="small">คุณเข้าสู่ระบบเป็น {auth.access.email} แล้ว</p>
        <Link className="btn btn-primary full-width" href="/dashboard">เปิดพื้นที่ / ตรวจสถานะ<ArrowRight size={17} /></Link>
        <button className="btn btn-secondary full-width" onClick={() => void auth.signOut().catch((error: Error) => setError(error.message))}>เปลี่ยนบัญชี Google</button>
      </> : <button className="btn btn-primary full-width" disabled={busy || !auth.configured || googleEnabled === false} onClick={() => void signIn()}>
        {busy ? "กำลังเปิด Google…" : "เข้าสู่ระบบด้วย Google"}<ArrowRight size={17} />
      </button>}
      <p className="small muted">บัญชีใหม่จะอยู่ในสถานะรออนุมัติ และยังเข้าถึงนักเรียนหรือสร้างชุดสอบไม่ได้</p>
      {!auth.configured && process.env.NODE_ENV !== "production" && <Link href="/dashboard" className="text-link">ทดลอง UI ด้วยข้อมูลสังเคราะห์</Link>}
    </section>
  </main>;
}
