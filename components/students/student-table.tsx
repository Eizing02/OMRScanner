"use client";
import Link from "next/link";
import { useState } from "react";
import { Upload, Search, Users } from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { PageHeading, EmptyState, Badge } from "@/components/ui/primitives";
import { studentFullName } from "@/types/student";
import {
  normalizeClassroom,
  compareClassrooms,
} from "@/lib/import/normalize-classroom";
export function Students() {
  const { students } = useWorkspace();
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("");
  const [classroom, setClassroom] = useState("");
  const [page, setPage] = useState(0);
  const classrooms = [
    ...new Set(
      students
        .filter(
          (s) =>
            !grade ||
            normalizeClassroom(s.classroom_name)?.grade_level === grade,
        )
        .map((s) => s.classroom_name),
    ),
  ].sort(compareClassrooms);
  const rows = students
    .filter(
      (s) =>
        `${s.student_code} ${studentFullName(s)} ${s.classroom_name}`.includes(
          query.trim(),
        ) &&
        (!grade ||
          normalizeClassroom(s.classroom_name)?.grade_level === grade) &&
        (!classroom || s.classroom_name === classroom),
    )
    .sort(
      (a, b) =>
        compareClassrooms(a.classroom_name, b.classroom_name) ||
        a.student_code.localeCompare(b.student_code),
    );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 50) - 1),
  );
  return (
    <>
      <PageHeading
        title="นักเรียนและห้องเรียน"
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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <label>
            ระดับชั้น
            <select
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setClassroom("");
                setPage(0);
              }}
            >
              <option value="">ทุกระดับชั้น</option>
              {Array.from({ length: 6 }, (_, i) => (
                <option key={i}>{`ม.${i + 1}`}</option>
              ))}
            </select>
          </label>
          <label>
            ชั้น / ห้อง
            <select
              value={classroom}
              onChange={(e) => {
                setClassroom(e.target.value);
                setPage(0);
              }}
            >
              <option value="">ทุกห้อง</option>
              {classrooms.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <Badge>
            <Users size={14} />
            {rows.length} / {students.length} คน
          </Badge>
        </div>
        <div
          className="table-scroll"
          role="region"
          aria-label="รายชื่อนักเรียน เลื่อนดูได้"
          tabIndex={0}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>รหัสประจำตัว</th>
                <th>ชื่อ</th>
                <th>นามสกุล</th>
                <th>ระดับชั้น</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(currentPage * 50, (currentPage + 1) * 50).map((s) => (
                <tr key={s.id}>
                  <td className="tabular">{s.student_code}</td>
                  <td>
                    {s.prefix ?? ""}
                    {s.first_name}
                  </td>
                  <td>{s.last_name}</td>
                  <td>{s.classroom_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <EmptyState
            title={
              students.length
                ? "ไม่พบรายชื่อที่ตรงกับตัวกรอง"
                : "ยังไม่มีรายชื่อ"
            }
            description={
              students.length
                ? "ลองเปลี่ยนคำค้น หรือเลือกทุกระดับชั้นและทุกห้อง"
                : "นำเข้า XLSX หรือ CSV และตรวจข้อมูลก่อนบันทึก"
            }
          />
        )}
        {rows.length > 50 && (
          <div className="roster-pagination">
            <span className="small muted">
              หน้า {currentPage + 1} / {Math.ceil(rows.length / 50)}
            </span>
            <button
              className="btn btn-secondary"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              ก่อนหน้า
            </button>
            <button
              className="btn btn-secondary"
              disabled={(currentPage + 1) * 50 >= rows.length}
              onClick={() => setPage(currentPage + 1)}
            >
              ถัดไป
            </button>
          </div>
        )}
      </section>
    </>
  );
}
