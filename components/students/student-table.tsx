"use client";
import Link from "next/link";
import { useState } from "react";
import { Upload, Search, Users } from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { PageHeading, EmptyState, Badge } from "@/components/ui/primitives";
export function Students() {
  const { students } = useWorkspace();
  const [query, setQuery] = useState("");
  const rows = students.filter((s) =>
    `${s.student_code} ${s.first_name} ${s.last_name} ${s.classroom_name}`.includes(
      query,
    ),
  );
  return (
    <>
      <PageHeading
        title="นักเรียนและห้องเรียน"
        description="รายชื่อที่ใช้จับคู่รหัสนักเรียนในชุดสอบ"
        actions={
          <Link href="/students/import" className="btn btn-primary">
            <Upload size={17} />
            นำเข้ารายชื่อนักเรียน
          </Link>
        }
      />
      <section className="panel">
        <div className="table-toolbar">
          <label className="search-input">
            <Search size={17} />
            <input
              placeholder="ค้นหาชื่อ รหัส หรือห้องเรียน"
              aria-label="ค้นหานักเรียน"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Badge>
            <Users size={14} />
            {students.length} คน
          </Badge>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>รหัสนักเรียน</th>
                <th>ชื่อ</th>
                <th>สกุล</th>
                <th>ชั้น / ห้อง</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.number ?? "—"}</td>
                  <td className="tabular">{s.student_code}</td>
                  <td>{s.first_name}</td>
                  <td>{s.last_name}</td>
                  <td>{s.classroom_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <EmptyState
            title="ยังไม่มีรายชื่อ"
            description="นำเข้า XLSX หรือ CSV และตรวจข้อมูลก่อนบันทึก"
          />
        )}
      </section>
    </>
  );
}
