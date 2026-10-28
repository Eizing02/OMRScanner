"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { studentSchema, type Student } from "@/types/student";
import {
  personInput,
  type ImportRow,
  type RosterFilters,
  type RosterPage,
  type RosterPlan,
} from "@/types/roster";
import { compareClassrooms } from "@/lib/import/normalize-classroom";

export function useRosterCommands() {
  const {
    mode,
    students,
    setStudents,
    request,
    readOnly,
    refreshRoster,
    notify,
  } = useWorkspace();
  const plans = useRef(
    new Map<string, { rows: ImportRow[]; action: string; result?: unknown }>(),
  );
  return useCallback(
    async <T = unknown>(command: Record<string, unknown>): Promise<T> => {
      if (readOnly) throw new Error("พื้นที่นี้เปิดดูได้อย่างเดียว");
      if (mode === "connected") {
        const response = await request(
          "/api/students",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(command),
          },
          true,
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error?.messageTh ?? "ทำรายการไม่สำเร็จ กรุณาลองใหม่",
          );
        if (
          [
            "create",
            "update",
            "apply_plan",
            "subscribe",
            "detach",
            "directory_manage",
          ].includes(String(command.action))
        )
          void refreshRoster().catch(() =>
            notify("บันทึกแล้ว แต่โหลดข้อมูลล่าสุดไม่ได้ กรุณาโหลดหน้าใหม่"),
          );
        return body.data;
      }
      if (mode !== "demo") throw new Error("ยังไม่ได้เชื่อมต่อระบบ");
      let result: unknown = {};
      if (command.action === "create" || command.action === "update") {
        const data = studentSchema.parse(command.student);
        const current = students.find(
          (s) => s.student_code === data.student_code,
        );
        if (command.action === "create" && current)
          throw new Error("รหัสนี้มีอยู่แล้ว");
        if (
          command.action === "update" &&
          (!current ||
            current.id !== command.id ||
            (current.revision ?? 1) !== command.revision)
        )
          throw new Error("รายชื่อเปลี่ยนแล้ว กรุณาโหลดใหม่");
        const row = {
          ...data,
          id: current?.id ?? `demo-${crypto.randomUUID()}`,
          active: current?.active ?? true,
          revision: (current?.revision ?? 0) + 1,
        };
        setStudents(
          current
            ? students.map((s) => (s.id === row.id ? row : s))
            : [...students, row],
        );
        result = row;
      } else if (
        command.action === "preview_import" ||
        command.action === "preview_selection"
      ) {
        const filters = (command.filters ?? {}) as RosterFilters;
        const rows: ImportRow[] =
          command.action === "preview_import"
            ? (command.students as Record<string, unknown>[]).map((raw) => {
                const data = studentSchema.parse(raw);
                const before = students.find(
                  (s) => s.student_code === data.student_code,
                );
                const after = personInput({
                  ...data,
                  number:
                    raw.numberProvided === false && before
                      ? before.number
                      : data.number,
                });
                return {
                  status: !before
                    ? "add"
                    : before.active === false
                      ? "restore"
                      : JSON.stringify(personInput(before)) ===
                          JSON.stringify(after)
                        ? "unchanged"
                        : "update",
                  before: before ? personInput(before) : null,
                  after,
                  studentId: before?.id ?? null,
                  revision: before?.revision ?? 1,
                };
              })
            : students
                .filter(
                  (s) =>
                    (s.active !== false) ===
                      (command.operation === "archive") &&
                    !(command.excludedIds as string[] | undefined)?.includes(
                      s.id,
                    ) &&
                    (command.ids
                      ? (command.ids as string[]).includes(s.id)
                      : matches(s, filters)),
                )
                .map((s) => ({
                  status: "update",
                  before: personInput(s),
                  after: personInput(s),
                  studentId: s.id,
                  revision: s.revision ?? 1,
                }));
        const planId = crypto.randomUUID();
        plans.current.set(planId, {
          rows,
          action:
            command.action === "preview_import"
              ? "import"
              : String(command.operation),
        });
        result = {
          planId,
          rows,
          count: rows.length,
          expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
        };
      } else if (command.action === "apply_plan") {
        const plan = plans.current.get(String(command.planId));
        if (!plan || command.consent !== true)
          throw new Error("กรุณาตรวจรายการใหม่");
        if (plan.result) return plan.result as T;
        const next = [...students];
        let added = 0,
          updated = 0,
          unchanged = 0;
        for (const row of plan.rows) {
          const index = next.findIndex(
            (s) => s.student_code === row.after.student_code,
          );
          if (
            row.studentId &&
            (index < 0 || (next[index].revision ?? 1) !== row.revision)
          )
            throw new Error("รายชื่อเปลี่ยนแล้ว กรุณาตรวจใหม่");
          if (row.status === "unchanged") {
            unchanged++;
            continue;
          }
          const existing = next[index];
          const data =
            plan.action === "import"
              ? studentSchema.parse(row.after)
              : existing;
          const value = {
            ...data,
            id: existing?.id ?? `demo-${crypto.randomUUID()}`,
            revision: (existing?.revision ?? 0) + 1,
            active: plan.action !== "archive",
          };
          if (index < 0) {
            next.push(value);
            added++;
          } else {
            next[index] = value;
            updated++;
          }
        }
        setStudents(next);
        result = { added, updated, unchanged, count: added + updated };
        plan.result = result;
      }
      return result as T;
    },
    [mode, students, setStudents, request, readOnly, refreshRoster, notify],
  );
}
function matches(s: Student, f: RosterFilters) {
  return (
    (!f.classroom || s.classroom_name === f.classroom) &&
    (!f.grade || s.classroom_name.split("/")[0] === f.grade) &&
    (!f.query ||
      `${s.student_code} ${s.prefix ?? ""}${s.first_name} ${s.last_name} ${s.classroom_name}`.includes(
        f.query,
      ))
  );
}
export function useRosterPage(filters: RosterFilters, refreshKey = 0) {
  const { mode, students, request, reviewRevision } = useWorkspace();
  const [data, setData] = useState<RosterPage | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(mode === "connected");
  const key = JSON.stringify(filters);
  useEffect(() => {
    if (mode !== "connected") return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ view: "page" });
      for (const [k, v] of Object.entries(JSON.parse(key)))
        if (v !== undefined && v !== "") params.set(k, String(v));
      request(`/api/students?${params}`, { signal: controller.signal })
        .then(async (r) => {
          const body = await r.json();
          if (!r.ok)
            throw new Error(body.error?.messageTh ?? "โหลดรายชื่อไม่สำเร็จ");
          if (active) setData(body.data);
        })
        .catch((e) => {
          if (active && !controller.signal.aborted) {
            setError(e instanceof Error ? e.message : "โหลดรายชื่อไม่สำเร็จ");
            setData(null);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, refreshKey, mode, request, reviewRevision]);
  if (mode === "connected") return { data, error, loading };
  const activeStudents = students.filter((s) => s.active !== false);
  const all = students
    .filter(
      (s) =>
        (filters.status === "all" ||
          (s.active !== false) === (filters.status !== "inactive")) &&
        matches(s, filters),
    )
    .sort(
      (a, b) =>
        compareClassrooms(a.classroom_name, b.classroom_name) ||
        a.student_code.localeCompare(b.student_code),
    );
  const limit = filters.limit ?? 50,
    page = filters.page ?? 0;
  return {
    data: {
      students: all.slice(page * limit, (page + 1) * limit),
      total: all.length,
      activeCount: activeStudents.length,
      page,
      limit,
      classrooms: [
        ...new Set(
          students
            .filter(
              (s) =>
                filters.status === "all" ||
                (s.active !== false) === (filters.status !== "inactive"),
            )
            .map((s) => s.classroom_name),
        ),
      ]
        .sort(compareClassrooms)
        .map((name) => ({
          name,
          count: students.filter((s) => s.classroom_name === name).length,
        })),
    },
    error: "",
    loading: false,
  };
}
export type { RosterPlan };
