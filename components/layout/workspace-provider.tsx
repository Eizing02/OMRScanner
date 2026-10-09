"use client";
import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
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
import type { SchoolBranding } from "@/types/school";
import { defaultWorkspaceSettings, type WorkspaceSettings } from "@/types/school";
import { useAuth } from "./auth-provider";
import type { PrintRegistrationInput, RegisteredPrint } from "@/types/print";
import {
  DEFAULT_SCHOOL_LOGO,
  DEFAULT_SCHOOL_NAME,
  originalLogoDataUrl,
} from "@/lib/omr/logo-image";
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
  branding: SchoolBranding;
  brandingError: string;
  canUploadLogo: boolean;
  uploadSchoolLogo: (file: File) => Promise<SchoolBranding>;
  readOnly: boolean;
  request: (path: string, init?: RequestInit, write?: boolean) => Promise<Response>;
  saveSettings: (input: { school: string; settings: WorkspaceSettings }) => Promise<void>;
  refreshBranding: () => Promise<SchoolBranding>;
  cleanupLogos: () => Promise<void>;
  saveLayout: (layout: SheetLayout) => Promise<void>;
  registerPrint: (input: PrintRegistrationInput) => Promise<RegisteredPrint>;
  isCurrentWorkspace: () => boolean;
};
const Context = createContext<Workspace | null>(null);
const storageKey = "smart-answer-sheet-demo-v1";
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  return <WorkspaceData key={`${auth.access?.userId ?? "anonymous"}:${auth.workspaceId ?? "none"}:${auth.access?.status ?? "none"}`}>
    {children}
  </WorkspaceData>;
}
function WorkspaceData({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { access, workspaceId, readOnly, refresh: refreshAccess } = auth;
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
  const [branding, setBranding] = useState<SchoolBranding>({
    school: mode === "demo" ? DEFAULT_SCHOOL_NAME : "พื้นที่ส่วนตัว",
    image_url: mode === "demo" ? DEFAULT_SCHOOL_LOGO : null,
    image_public_id: null,
    revision: "bundled",
    settings: defaultWorkspaceSettings,
  });
  const [brandingError, setBrandingError] = useState("");
  const [canUploadLogo, setCanUploadLogo] = useState(mode === "demo");
  const [sheetLayouts, setSheetLayouts] = useState<Record<string, SheetLayout>>(
    {},
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(mode === "connected");
  const [toast, setToast] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const mounted = useRef(true);
  const controllers = useRef(new Set<AbortController>());
  useEffect(() => {
    mounted.current = true;
    const pending = controllers.current;
    return () => { mounted.current = false; for (const controller of pending) controller.abort(); pending.clear(); };
  }, []);
  const request = useCallback(async (path: string, init: RequestInit = {}, write = false) => {
    if (mode === "connected" && (!access || access.status !== "approved" || !workspaceId))
      throw new Error("กรุณาเข้าสู่ระบบและรออนุมัติก่อนทำรายการ");
    if (write && readOnly) throw new Error("พื้นที่ของผู้ใช้อื่นเป็นแบบอ่านอย่างเดียว กลับพื้นที่ของคุณก่อนบันทึก");
    const headers = new Headers(init.headers);
    if (workspaceId) headers.set("x-workspace-id", workspaceId);
    const controller = new AbortController(); controllers.current.add(controller);
    const abort = () => controller.abort(); init.signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(path, { ...init, headers, cache: "no-store", signal: controller.signal });
      if (!mounted.current) throw new Error("บัญชีหรือพื้นที่ทำงานเปลี่ยนแล้ว กรุณาลองใหม่");
      if (response.status === 401 || response.status === 403) void refreshAccess();
      return response;
    } finally { controllers.current.delete(controller); init.signal?.removeEventListener("abort", abort); }
  }, [mode, access, workspaceId, readOnly, refreshAccess]);
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
            if (
              saved.branding?.school &&
              typeof saved.branding?.revision === "string"
            )
              setBranding(saved.branding);
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
            branding,
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
    branding,
  ]);
  useEffect(() => {
    if (mode !== "connected" || auth.access?.status !== "approved" || !auth.workspaceId) return;
    let active = true;
    Promise.all([
      request("/api/exams").then((r) => r.json()),
      request("/api/students").then((r) => r.json()),
      request("/api/settings").then((r) => r.json()),
      request("/api/omr-layouts").then((r) => r.json()),
    ])
      .then(([e, s, b, l]) => {
        if (!active) return;
        if (e.error || s.error)
          setError(e.error?.messageTh ?? s.error.messageTh);
        else {
          setExams(e.data);
          setStudents(s.data);
        }
        if (b.error) setBrandingError(b.error.messageTh);
        else {
          setBranding(b.data);
          setCanUploadLogo(b.data.canUpload);
        }
        if (l.error) setError(l.error.messageTh);
        else {
          const restored: Record<string, SheetLayout> = {};
          for (const item of l.data ?? []) {
            const parsed = layoutSchema.safeParse(item.layout ?? item);
            if (parsed.success) restored[`${parsed.data.examId}:${parsed.data.examVersion}`] = parsed.data;
          }
          setSheetLayouts(restored);
        }
      })
      .catch(
        () => active && setError("เชื่อมต่อไม่สำเร็จ กรุณาลองโหลดหน้าใหม่"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [mode, auth.access?.status, auth.workspaceId, request]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  async function createExam(input: ExamInput): Promise<Exam> {
    if (mode === "unconfigured")
      throw new Error("กรุณาตั้งค่า Supabase ก่อนสร้างชุดสอบ");
    if (mode === "connected") {
      const response = await request("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }, true);
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
  async function uploadSchoolLogo(file: File): Promise<SchoolBranding> {
    if (!canUploadLogo)
      throw new Error(
        "กรุณาติดตั้ง Storage และใช้พื้นที่ของคุณก่อนอัปโหลด",
      );
    const original = await originalLogoDataUrl(file);
    let next: SchoolBranding;
    if (mode === "demo")
      next = {
        ...branding,
        image_url: original.dataUrl,
        image_public_id: null,
        revision: crypto.randomUUID(),
      };
    else {
      const form = new FormData();
      form.set("file", file);
      form.set("revision", branding.revision);
      const response = await request("/api/settings/logo", {
        method: "POST",
        body: form,
      }, true);
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.messageTh ?? "อัปโหลดโลโก้ไม่สำเร็จ");
      next = body.data;
    }
    setBranding(next);
    return next;
  }
  async function updateExam(exam: Exam, input: ExamInput): Promise<Exam> {
    if (mode === "unconfigured")
      throw new Error("กรุณาตั้งค่า Supabase ก่อนบันทึก");
    let next: Exam;
    if (mode === "connected") {
      const response = await request("/api/exams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: exam.id,
          expectedVersion: exam.version,
          config: input,
        }),
      }, true);
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
  async function refreshBranding() {
    if (mode !== "connected") return branding;
    const response = await request("/api/settings"); const body = await response.json();
    if (!response.ok) throw new Error(body.error?.messageTh ?? "โหลดการตั้งค่าไม่สำเร็จ");
    setBranding(body.data); setCanUploadLogo(body.data.canUpload); setBrandingError("");
    return body.data as SchoolBranding;
  }
  async function saveSettings(input: { school: string; settings: WorkspaceSettings }) {
    if (mode === "demo") { setBranding({ ...branding, ...input }); return; }
    const response = await request("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, true);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.messageTh ?? "บันทึกการตั้งค่าไม่สำเร็จ");
    setBranding(body.data);
  }
  async function cleanupLogos() {
    if (mode !== "connected") return;
    const response = await request("/api/settings/logo/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, true);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.messageTh ?? "ลบไฟล์เดิมไม่สำเร็จ");
    setBranding(body.data);
    if (body.data.cleanupWarning) throw new Error("ยังลบไฟล์เดิมไม่ครบ กรุณาลองอีกครั้งภายหลัง");
  }
  async function saveLayout(next: SheetLayout) {
    if (mode === "connected") {
      const response = await request("/api/omr-layouts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: next }) }, true);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.messageTh ?? "บันทึกเลย์เอาต์ไม่สำเร็จ");
    }
    setSheetLayouts((old) => ({ ...old, [`${next.examId}:${next.examVersion}`]: next }));
  }
  async function registerPrint(input: PrintRegistrationInput): Promise<RegisteredPrint> {
    const response = await request("/api/omr-sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }, true);
    const body = await response.json();
    if (!mounted.current) throw new Error("บัญชีหรือพื้นที่ทำงานเปลี่ยนแล้ว กรุณาลองใหม่");
    if (!response.ok) throw new Error(body.error?.messageTh ?? "ลงทะเบียนชุดพิมพ์ไม่สำเร็จ");
    return body.data;
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
        branding,
        brandingError,
        canUploadLogo,
        uploadSchoolLogo,
        readOnly: auth.readOnly, request, saveSettings, refreshBranding, cleanupLogos, saveLayout,
        registerPrint, isCurrentWorkspace: () => mounted.current,
        notify: setToast,
        setLayout: (next) => {
          setLayout(next);
          if (next.examId !== "unassigned")
            setSheetLayouts((old) => ({ ...old, [`${next.examId}:${next.examVersion}`]: next }));
        },
        getLayout: (exam) => {
          const saved = sheetLayouts[`${exam.id}:${exam.version}`] ?? sheetLayouts[exam.id];
          return layoutForExam(
            { ...(saved?.examVersion === exam.version
              ? saved
              : {
                  ...defaultLayout,
                  school: branding.school,
                  logo: branding.image_url,
                }), logo: branding.image_url },
            exam,
          );
        },
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
