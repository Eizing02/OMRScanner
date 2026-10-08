"use client";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { PageHeading, Notice, Badge } from "@/components/ui/primitives";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
export default function Settings() {
  const { mode, notify } = useWorkspace();
  const router = useRouter();
  return (
    <>
      <PageHeading
        title="การตั้งค่าระบบ"
        description="สถานะการเชื่อมต่อและข้อจำกัดของรุ่นพัฒนา"
      />
      <section className="panel form-panel">
        <div className="section-title">
          <h2>สภาพแวดล้อม</h2>
          <Badge tone={mode === "connected" ? "green" : "amber"}>
            {mode === "connected"
              ? "มีการตั้งค่า Supabase"
              : mode === "demo"
                ? "โหมดข้อมูลตัวอย่าง"
                : "ยังไม่ตั้งค่าระบบ"}
          </Badge>
        </div>
        <p>
          ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ใน .env.local แล้วเรียกใช้
          migrations ตาม README
        </p>
        <Notice>
          ผู้ใช้ต้องเป็นสมาชิกโรงเรียนที่มีสถานะ active
          ก่อนอ่านหรือบันทึกข้อมูลได้
        </Notice>
        <h3>สถานะโมดูล</h3>
        <ul className="settings-list">
          <li>
            การเข้าสู่ระบบ / รายชื่อนักเรียน / ชุดสอบ: มี client, API และ SQL
            สำหรับเชื่อม Supabase
          </li>
          <li>Designer และ PDF: geometry และไฟล์ทดสอบใช้งานบนเครื่องได้</li>
          <li>กล้องและ crop: ประมวลผลบนเครื่อง · ยังไม่ตรวจคะแนน</li>
          <li>OMR worker, upload, queue และผลสอบจริง: TODO ในขั้นต่อไป</li>
        </ul>
        {mode === "connected" && (
          <button
            className="btn btn-secondary"
            onClick={async () => {
              const { error } = await createClient().auth.signOut();
              if (error) notify("ออกจากระบบไม่สำเร็จ");
              else router.replace("/login");
            }}
          >
            ออกจากระบบ
          </button>
        )}
      </section>
    </>
  );
}
