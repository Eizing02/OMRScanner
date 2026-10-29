import type { Page } from "@playwright/test";
import { rosterFixture } from "../student-roster-fixture";
import { owner, teacherA } from "../score-integration-fixture";
import { rosterCommandSchema, rosterRpcInput } from "@/types/roster";
import { scoreRow } from "@/lib/grading/recalculate";
import type { Exam } from "@/types/exam";
import type { ReviewItem } from "@/types/result";
import { readFile } from "node:fs/promises";

export async function rosterBrowserFixture(
  page: Page,
  initialActor = teacherA,
  lifecycle = false,
) {
  const f = await rosterFixture(true, true);
  if (lifecycle) {
    for (const file of [
      "202610280017_print_v5.sql",
      "202610280018_batch_confirmation.sql",
      "202610280019_directory_lifecycle.sql",
    ])
      await f.db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    // PGlite has no pg_cron; emulate only the readiness metadata, never the scheduler.
    await f.db.exec(
      "create schema cron; create table cron.job(jobname text,active boolean); insert into cron.job values('scansob-school-directory-trash',true)",
    );
  }
  let actor = initialActor;
  const requests: { method: string; path: string; view: string | null }[] = [];
  await page.route("https://accounts-test.supabase.co/**", (r) =>
    r.fulfill({ status: 401, json: { error: "synthetic_session" } }),
  );
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    requests.push({
      method: request.method(),
      path: url.pathname,
      view: url.searchParams.get("view"),
    });
    try {
      const access = await f.rpc<{ schoolId: string; role: string }>(
        actor,
        "get_access_context",
      );
      const tenant = request.headers()["x-workspace-id"] ?? access.schoolId;
      if (
        tenant !== access.schoolId &&
        (access.role !== "owner" || request.method() !== "GET")
      )
        throw Error("FORBIDDEN");
      let data: unknown;
      if (url.pathname === "/api/me/context")
        data = await f.rpc(actor, "get_access_context");
      else if (url.pathname === "/api/auth/status")
        data = { configured: true, googleEnabled: true };
      else if (url.pathname === "/api/students") {
        if (request.method() === "POST") {
          const { name, input } = rosterRpcInput(
            rosterCommandSchema.parse(request.postDataJSON()),
            tenant,
          );
          data = await f.rpc(actor, name, input);
        } else {
          const query = Object.fromEntries(url.searchParams);
          if (query.view === "page" || query.view === "export")
            data = await f.rpc(actor, "get_student_roster", {
              ...query,
              school_id: tenant,
              export: query.view === "export",
            });
          else if (query.view?.startsWith("directory"))
            data = await f.rpc(actor, "get_roster_directory", {
              ...query,
              school_id: tenant,
              view: query.view === "directory_options" ? "options" : "students",
            });
          else
            data = (
              await f.asUser(
                actor,
                "select * from public.students where school_id=$1 and active",
                [tenant],
              )
            ).rows;
        }
      } else if (url.pathname === "/api/scan-records") {
        const query = Object.fromEntries(url.searchParams);
        if (request.method() === "PATCH")
          data = await f.rpc(
            actor,
            request.postDataJSON().action === "preview_confirm"
              ? "preview_scan_confirmation"
              : request.postDataJSON().action === "confirm_batch"
                ? "confirm_scan_batch"
                : "review_scan",
            {
              ...request.postDataJSON(),
              school_id: tenant,
            },
          );
        else if (query.media) {
          const template = (
            await f.asUser<{ layout_json: unknown; omr_json: unknown }>(
              actor,
              "select t.layout_json,t.omr_json from public.scan_records s join public.omr_templates t on t.id=s.template_id where s.school_id=$1 and s.id=$2",
              [tenant, query.media],
            )
          ).rows[0];
          if (!template) throw Error("FORBIDDEN");
          data = {
            original: null,
            processed:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVy8AAAAASUVORK5CYII=",
            template,
          };
        } else {
          if (!query.view) throw Error("Unexpected unscoped scan fetch");
          data = await f.rpc(actor, "get_workspace_read_model", {
            ...query,
            school_id: tenant,
          });
        }
      } else if (url.pathname === "/api/exams") {
        const result = await f.asUser<{
          id: string;
          archived: boolean;
          deleting: boolean;
          created_at: string;
          version_no: number;
          config_json: Record<string, unknown>;
          printed: boolean;
        }>(
          actor,
          "select e.id,e.archived,e.deleting,e.created_at,v.version_no,v.config_json,exists(select 1 from public.print_jobs p where p.exam_id=e.id) printed from public.exams e join lateral(select * from public.exam_versions where exam_id=e.id order by version_no desc limit 1) v on true where e.school_id=$1 order by e.created_at desc",
          [tenant],
        );
        data = result.rows.map((e) => ({
          ...e.config_json,
          id: e.id,
          version: e.version_no,
          stage: e.printed ? 3 : 0,
          students: 0,
          scanned: 0,
          reviewCount: 0,
          archived: e.archived,
          deleting: e.deleting,
          updatedAt: e.created_at,
        }));
      } else if (url.pathname === "/api/settings")
        data = {
          school: "โรงเรียนทดสอบ",
          image_url: null,
          image_public_id: null,
          revision: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          settings: { academicYear: 2569, term: 1, subjects: ["คณิตศาสตร์"] },
          canUpload: true,
          cleanupPending: 0,
        };
      else if (url.pathname === "/api/omr-layouts") data = [];
      else if (url.pathname === "/api/integrations/mathquest")
        data = {
          enabled: false,
          receiverReady: false,
          readOnly: false,
          connection: null,
          publication: null,
        };
      else if (/\/api\/exams\/[^/]+\/publication$/.test(url.pathname))
        data = {
          enabled: false,
          receiverReady: false,
          readOnly: false,
          connection: null,
          publication: null,
        };
      else if (url.pathname === "/api/export") {
        const input = request.postDataJSON();
        const reviews = (
          await f.asUser<{ result: ReviewItem[] }>(
            actor,
            "select public.get_scan_reviews($1,$2) result",
            [tenant, input.examId],
          )
        ).rows[0].result;
        const versions = (
          await f.asUser<{ version_no: number; config_json: Exam }>(
            actor,
            "select version_no,config_json from public.exam_versions where school_id=$1 and exam_id=$2",
            [tenant, input.examId],
          )
        ).rows;
        const selected = reviews.filter(
          (r) =>
            r.status === "verified" &&
            (!input.scanIds || input.scanIds.includes(r.id)),
        );
        const jobId = await f.rpc(actor, "register_score_export", {
          school_id: tenant,
          format: input.format,
          scan_ids: selected.map((r) => r.id),
        });
        data = {
          rows: selected.map((r) =>
            scoreRow(r, {
              ...versions.find((v) => v.version_no === r.examVersion)!
                .config_json,
              id: r.examId,
            }),
          ),
          title: "ข้อสอบสังเคราะห์",
          jobId,
        };
      } else throw Error(`Unexpected API ${request.method()} ${url.pathname}`);
      await route.fulfill({ json: { data, error: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await route.fulfill({
        status: message.includes("FORBIDDEN") ? 403 : 409,
        json: { data: null, error: { code: message, messageTh: message } },
      });
    }
  });
  return {
    ...f,
    requests,
    setActor: (id: string) => {
      actor = id;
    },
    owner,
  };
}
