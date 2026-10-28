"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/layout/workspace-provider";
import type { ReviewPage } from "@/types/roster";

export function useReviewPage(input: {
  view: "queue" | "results";
  examId?: string;
  status: string;
  query?: string;
  page: number;
  limit?: number;
}) {
  const { mode, request, reviewRevision } = useWorkspace();
  const key = JSON.stringify({ ...input, revision: reviewRevision });
  const [state, setState] = useState<{
    key: string;
    data: ReviewPage | null;
    error: string;
  }>({ key: "", data: null, error: "" });
  useEffect(() => {
    if (mode !== "connected" || (input.view === "results" && !input.examId))
      return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(
      () => {
        const params = new URLSearchParams();
        for (const [name, value] of Object.entries(JSON.parse(key)))
          if (value !== undefined && name !== "revision")
            params.set(name, String(value));
        request(`/api/scan-records?${params}`, { signal: controller.signal })
          .then(async (r) => {
            const body = await r.json();
            if (!r.ok)
              throw new Error(body.error?.messageTh ?? "โหลดรายการไม่สำเร็จ");
            if (active) setState({ key, data: body.data, error: "" });
          })
          .catch((e) => {
            if (active && !controller.signal.aborted)
              setState({
                key,
                data: null,
                error: e instanceof Error ? e.message : "โหลดรายการไม่สำเร็จ",
              });
          });
      },
      input.query ? 180 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, mode, request, input.view, input.examId, input.query]);
  return {
    data: state.key === key ? state.data : null,
    error: state.key === key ? state.error : "",
    loading: mode === "connected" && state.key !== key,
  };
}
