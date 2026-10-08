"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileCheck2, ArrowRight, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Notice } from "@/components/ui/primitives";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const client = createClient();
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error)
        throw new Error("อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-story">
        <span className="brand-icon">
          <FileCheck2 size={28} />
        </span>
        <h1>
          ทุกกระดาษคำตอบ
          <br />
          เชื่อมถึงคะแนนที่เชื่อถือได้
        </h1>
        <p>
          พื้นที่ทำงานสำหรับครูไทย ตั้งแต่ออกแบบและพิมพ์
          จนถึงตรวจทานและจัดเก็บผลสอบ
        </p>
        <div>
          <ShieldCheck size={23} />
          ตรวจสอบย้อนหลังได้ทุกขั้นตอน
        </div>
      </div>
      <form className="login-form" onSubmit={submit}>
        <h2>เข้าสู่พื้นที่ทำงาน</h2>
        <p className="muted">ใช้บัญชีที่โรงเรียนอนุญาตให้เข้าใช้งาน</p>
        <label>
          อีเมล
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          รหัสผ่าน
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="btn btn-primary full-width" disabled={busy}>
          {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          <ArrowRight size={17} />
        </button>
        <p className="small muted">
          หากยังไม่มีบัญชี กรุณาติดต่อผู้ดูแลโรงเรียน
        </p>
        {process.env.NODE_ENV !== "production" && (
          <Link href="/dashboard" className="text-link">
            ทดลอง UI ด้วยข้อมูลสังเคราะห์
          </Link>
        )}
      </form>
    </div>
  );
}
