"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { accessContextSchema, type AccessContext } from "@/types/access";
type AuthState = {
  access: AccessContext | null; loading: boolean; error: string; configured: boolean;
  workspaceId: string | null; readOnly: boolean; refresh: () => Promise<void>;
  inspectionLabel: string | null;
  signOut: () => Promise<void>; inspectWorkspace: (id: string | null, label?: string) => void;
};
const Context = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const [access, setAccess] = useState<AccessContext | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState("");
  const [inspection, setInspection] = useState<{ id: string; label: string } | null>(null);
  const generation = useRef(0), lastUser = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!configured) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const ticket = ++generation.current;
    try {
      const response = await fetch("/api/me/context", { cache: "no-store", signal: controller.signal });
      if (ticket !== generation.current) return;
      if (response.status === 401) { setAccess(null); setInspection(null); setError(""); return; }
      const body = await response.json();
      if (ticket !== generation.current) return;
      if (!response.ok) throw new Error(body.error?.messageTh ?? "ตรวจสอบสิทธิ์ไม่สำเร็จ");
      const next = accessContextSchema.parse(body.data);
      if (lastUser.current !== next.userId || next.status !== "approved") setInspection(null);
      lastUser.current = next.userId; setAccess(next); setError("");
    } catch (error) {
      if (controller.signal.aborted || ticket !== generation.current) return;
      setAccess(null); setInspection(null);
      setError(error instanceof Error ? error.message : "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally { if (ticket === generation.current) setLoading(false); }
  }, [configured]);
  useEffect(() => {
    if (!configured) return;
    // Keep the stable ref containers, not a snapshot of the generation value:
    // cleanup must invalidate whichever asynchronous request is current then.
    const currentGeneration = generation, currentRequest = request;
    const client = createClient(); let active = true;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id ?? null;
      if (id !== lastUser.current || event === "SIGNED_OUT") {
        generation.current++; request.current?.abort(); lastUser.current = id;
        setAccess(null); setInspection(null); setLoading(Boolean(id)); setError("");
      }
      // Do not invoke auth APIs synchronously inside the SDK auth lock.
      queueMicrotask(() => { if (active) void refresh(); });
    });
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { active = false; currentGeneration.current++; currentRequest.current?.abort(); data.subscription.unsubscribe();
      window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [configured, refresh]);
  async function signOut() {
    generation.current++; request.current?.abort(); lastUser.current = null;
    setAccess(null); setInspection(null); setLoading(false); setError("");
    const result = await createClient().auth.signOut({ scope: "local" });
    if (result.error) { await refresh(); throw new Error("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่"); }
  }
  const workspaceId = inspection?.id || access?.schoolId || null;
  return <Context.Provider value={{ access, loading, error, configured, workspaceId,
    readOnly: Boolean(inspection && inspection.id !== access?.schoolId), inspectionLabel: inspection?.label ?? null, refresh, signOut,
    inspectWorkspace: (id, label) => { if (access?.role === "owner" && access.status === "approved") setInspection(id ? { id, label: label || id } : null); },
  }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error("AuthProvider missing"); return value; }
