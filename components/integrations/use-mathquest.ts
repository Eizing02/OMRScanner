"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import {
  integrationOverviewSchema,
  type IntegrationOverview,
} from "@/types/integration";
export function useMathQuest(path: string) {
  const { request, mode, readOnly, isCurrentWorkspace } = useWorkspace();
  const [state, setState] = useState<IntegrationOverview | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(mode === "connected");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (mode !== "connected") return;
      const response = await request(path, { signal });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.messageTh ?? "โหลดสถานะ MathQuest ไม่สำเร็จ",
        );
      const result = integrationOverviewSchema.parse(body.data);
      if (mounted.current && isCurrentWorkspace()) {
        setState(result);
        setError("");
      }
    },
    [mode, request, path, isCurrentWorkspace],
  );
  useEffect(() => {
    if (mode !== "connected") return;
    const controller = new AbortController();
    refresh(controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted && mounted.current)
          setError(
            error instanceof Error ? error.message : "โหลดสถานะไม่สำเร็จ",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted && mounted.current) setLoading(false);
      });
    return () => controller.abort();
  }, [mode, refresh]);
  async function mutate(method: "POST" | "PATCH", input: unknown) {
    if (busy || mode !== "connected" || readOnly || state?.readOnly)
      return false;
    setBusy(true);
    setError("");
    try {
      const response = await request(
        path,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        true,
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.messageTh ?? "ทำรายการไม่สำเร็จ กรุณาลองใหม่",
        );
      const next = integrationOverviewSchema.parse(body.data);
      if (!mounted.current || !isCurrentWorkspace()) return false;
      setState(next);
      return true;
    } catch (error) {
      if (mounted.current && isCurrentWorkspace())
        setError(
          error instanceof Error
            ? error.message
            : "ทำรายการไม่สำเร็จ กรุณาลองใหม่",
        );
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function checkStatus() {
    setBusy(true);
    try {
      await refresh();
    } catch (error) {
      if (mounted.current && isCurrentWorkspace())
        setError(error instanceof Error ? error.message : "โหลดสถานะไม่สำเร็จ");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return {
    state,
    error,
    loading,
    busy,
    refresh: checkStatus,
    mutate,
    mode,
    readOnly: readOnly || state?.readOnly === true,
  };
}
