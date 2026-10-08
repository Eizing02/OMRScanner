"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { demoExams, demoReviews, demoStudents } from "@/lib/demo";
import {
  defaultLayout,
  layoutSchema,
  layoutForExam,
  type SheetLayout,
} from "@/lib/omr/generate-template";
import type { Exam, ExamInput } from "@/types/exam";
import type { ReviewItem } from "@/types/result";
import type { Student } from "@/types/student";
type Workspace = {
  exams: Exam[];
  students: Student[];
  reviews: ReviewItem[];
  layout: SheetLayout;
  mode: "demo" | "connected" | "unconfigured";
  error: string;
  loading: boolean;
  notify: (message: string) => void;
  setLayout: (layout: SheetLayout) => void;
  setReviews: (items: ReviewItem[]) => void;
  setExams: (items: Exam[]) => void;
  setStudents: (items: Student[]) => void;
  createExam: (input: ExamInput) => Promise<Exam>;
  updateExam: (exam: Exam, input: ExamInput) => Promise<Exam>;
  getLayout: (exam: Exam) => SheetLayout;
  getExamVersion: (id: string, version?: number) => Exam | undefined;
};
const Context = createContext<Workspace | null>(null);
const storageKey = "smart-answer-sheet-demo-v1";
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const mode = configured
    ? "connected"
    : process.env.NODE_ENV !== "production" &&
        process.env.NEXT_PUBLIC_DEMO_MODE !== "false"
      ? "demo"
      : "unconfigured";
  const [exams, setExams] = useState<Exam[]>(mode === "demo" ? demoExams : []);
  const [students, setStudents] = useState<Student[]>(
    mode === "demo" ? demoStudents : [],
  );
  const [reviews, setReviews] = useState<ReviewItem[]>(
    mode === "demo"
      ? demoReviews.map((r) => ({
          ...r,
          examVersion: demoExams.find((e) => e.id === r.examId)?.version,
        }))
      : [],
  );
  const [examHistory, setExamHistory] = useState<Exam[]>([]);
  const [layout, setLayout] = useState(defaultLayout);
  const [sheetLayouts, setSheetLayouts] = useState<Record<string, SheetLayout>>(
    {},
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(mode === "connected");
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (mode === "demo") {
        try {
          const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
          if (saved?.schemaVersion === 1) {
            setExams(saved.exams ?? demoExams);
            setStudents(saved.students ?? demoStudents);
            const restoredExams: Exam[] = saved.exams ?? demoExams;
            setReviews(
              (saved.reviews ?? demoReviews).map((r: ReviewItem) => ({
                ...r,
                examVersion:
                  r.examVersion ??
                  restoredExams.find((e) => e.id === r.examId)?.version,
              })),
            );
            setExamHistory(saved.examHistory ?? []);
            const restored = layoutSchema.safeParse(saved.layout);
            setLayout(restored.success ? restored.data : defaultLayout);
            const validLayouts: Record<string, SheetLayout> = {};
            for (const [id, value] of Object.entries(
              saved.sheetLayouts ?? {},
            )) {
              const parsed = layoutSchema.safeParse(value);
              if (parsed.success) validLayouts[id] = parsed.data;
            }
            setSheetLayouts(validLayouts);
          }
        } catch {
          localStorage.removeItem(storageKey);
        }
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [mode]);
  useEffect(() => {
    if (mode === "demo" && hydrated) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            schemaVersion: 1,
            exams,
            students,
            reviews,
            layout,
            sheetLayouts,
            examHistory,
          }),
        );
      } catch {
        queueMicrotask(() =>
          setError("พื้นที่จัดเก็บตัวอย่างเต็ม กรุณาส่งออกงานก่อนปิดหน้า"),
        );
      }
    }
  }, [
    mode,
    hydrated,
    exams,
    students,
    reviews,
    layout,
    sheetLayouts,
    examHistory,
  ]);
  useEffect(() => {
    if (mode !== "connected") return;
    let active = true;
    Promise.all([
      fetch("/api/exams").then((r) => r.json()),
      fetch("/api/students").then((r) => r.json()),
    ])
      .then(([e, s]) => {
        if (!active) return;
        if (e.error || s.error)
          setError(e.error?.messageTh ?? s.error.messageTh);
        else {
          setExams(e.data);
          setStudents(s.data);
        }
      })
      .catch(
        () => active && setError("เชื่อมต่อไม่สำเร็จ กรุณาลองโหลดหน้าใหม่"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [mode]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  async function createExam(input: ExamInput): Promise<Exam> {
    if (mode === "unconfigured")
      throw new Error("กรุณาตั้งค่า Supabase ก่อนสร้างชุดสอบ");
    if (mode === "connected") {
      const response = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.messageTh ?? "สร้างชุดสอบไม่สำเร็จ");
      setExams((old) => [body.data, ...old]);
      return body.data;
    }
    const exam: Exam = {
      ...input,
      id: `demo-${crypto.randomUUID()}`,
      version: 1,
      stage: 0,
      scanned: 0,
      students: students.length,
      reviewCount: 0,
      archived: false,
      updatedAt: new Date().toISOString(),
    };
    setExams((old) => [exam, ...old]);
    return exam;
  }
  async function updateExam(exam: Exam, input: ExamInput): Promise<Exam> {
    if (mode === "unconfigured")
      throw new Error("กรุณาตั้งค่า Supabase ก่อนบันทึก");
    let next: Exam;
    if (mode === "connected") {
      const response = await fetch("/api/exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: exam.id,
          expectedVersion: exam.version,
          config: input,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.messageTh ?? "บันทึกเวอร์ชันไม่สำเร็จ");
      next = {
        ...exam,
        ...input,
        version: body.data.version,
        updatedAt: body.data.created_at,
      };
    } else
      next = {
        ...exam,
        ...input,
        version: exam.version + 1,
        updatedAt: new Date().toISOString(),
      };
    setExamHistory((old) => [
      ...old.filter((e) => !(e.id === exam.id && e.version === exam.version)),
      exam,
    ]);
    setExams((old) => old.map((e) => (e.id === exam.id ? next : e)));
    return next;
  }
  return (
    <Context.Provider
      value={{
        exams,
        students,
        reviews,
        layout,
        mode,
        error,
        loading: loading || !hydrated,
        notify: setToast,
        setLayout: (next) => {
          setLayout(next);
          if (next.examId !== "unassigned")
            setSheetLayouts((old) => ({ ...old, [next.examId]: next }));
        },
        getLayout: (exam) =>
          layoutForExam(
            sheetLayouts[exam.id]?.examVersion === exam.version
              ? sheetLayouts[exam.id]
              : { ...defaultLayout, school: layout.school, logo: layout.logo },
            exam,
          ),
        getExamVersion: (id, version) =>
          [...exams, ...examHistory].find(
            (e) =>
              e.id === id && (version === undefined || e.version === version),
          ),
        setReviews,
        setExams,
        setStudents,
        createExam,
        updateExam,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error("WorkspaceProvider missing");
  return context;
}
