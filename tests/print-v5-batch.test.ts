import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { rosterFixture } from "./student-roster-fixture";
import { teacherA, teacherB, owner } from "./score-integration-fixture";
import {
  defaultLayout,
  compileOmrTemplate,
  measurePrintText,
  printTexts,
  resolveGeometry,
} from "@/lib/omr/generate-template";
import { createSetIdentity } from "@/lib/omr/qr";
import type { ConfirmationCandidate } from "@/types/scan";
let f: Awaited<ReturnType<typeof rosterFixture>>;
beforeAll(async () => {
  f = await rosterFixture(true, true);
  for (const file of [
    "202610280017_print_v5.sql",
    "202610280018_batch_confirmation.sql",
  ])
    await f.db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
}, 60000);
afterAll(async () => {
  await f?.db.close();
});
describe("versioned print and authoritative batch confirmation", () => {
  it("matches SQL geometry and font advances while preserving historical 2/3/4 identities", async () => {
    for (const printStyle of [
      "classic",
      "compact",
      "school",
      "school-v2",
    ] as const) {
      for (const [questionCount, choiceCount] of [
        [20, 4],
        [32, 5],
        [60, 5],
      ] as const) {
        const input = {
          ...defaultLayout,
          instructions: "ใช้ดินสอ 2B ฝนให้เต็มวง",
          printStyle,
          questionCount,
          choiceCount,
        };
        const identity = await createSetIdentity(input);
        const row = await f.db.query<{ matches: boolean }>(
          "select private.print_json_matches(private.expected_print_geometry($1::jsonb),$2::jsonb) matches",
          [
            JSON.stringify(identity.snapshot.layout),
            JSON.stringify(compileOmrTemplate(identity.snapshot.layout)),
          ],
        );
        expect(row.rows[0].matches).toBe(true);
      }
    }
    const text = "โรงเรียนกุงแก้ววิทยาคาร ชื่อ–สกุล …02074…";
    const result = await f.db.query<{ width: number }>(
      "select private.print_v5_width($1,2.8,true) width",
      [text],
    );
    expect(result.rows[0].width).toBeCloseTo(
      measurePrintText(text, 2.8, true),
      8,
    );
    const g = resolveGeometry(defaultLayout);
    expect(g.markers).toHaveLength(4);
    expect(g.qr.width).toBe(28);
    const texts = printTexts({
      ...defaultLayout,
      school: "โรงเรียนกุงแก้ววิทยาคาร",
    });
    expect(
      texts.some(
        (t) => t.value === "โรงเรียนกุงแก้ววิทยาคาร" && t.weight === "bold",
      ),
    ).toBe(true);
  }, 30000);
  it("confirms ready rows, skips stale/uncertain rows, safely retries and isolates workspaces", async () => {
    const good = await f.exam(0),
      uncertain = await f.exam(1),
      stale = await f.exam(0);
    await f.db.query(
      "update detected_answers set detection_status='ambiguous' where scan_id=$1 and question_number=1",
      [uncertain.scanId],
    );
    await f.db.query("select private.recalculate_scan($1)", [uncertain.scanId]);
    const items = [good, uncertain, stale].map((r) => ({ scanId: r.scanId }));
    const preview = await f.rpc<ConfirmationCandidate[]>(
      teacherA,
      "preview_scan_confirmation",
      { school_id: f.schoolA, items },
    );
    expect(preview.map((r) => r.ready)).toEqual([true, false, true]);
    await f.rpc(teacherA, "review_scan", {
      school_id: f.schoolA,
      scanId: stale.scanId,
      revision: 1,
      action: "correct",
      question: 1,
      choice: "B",
      reason: "แก้คำตอบก่อนยืนยัน",
    });
    const command = {
      school_id: f.schoolA,
      items: preview.map(({ scanId, revision }) => ({ scanId, revision })),
    };
    const result = await f.rpc<
      { scanId: string; confirmed: boolean; reason?: string }[]
    >(teacherA, "confirm_scan_batch", command);
    expect(result.map((r) => r.confirmed)).toEqual([true, false, false]);
    expect(result[1].reason).toBe("UNRESOLVED_ANSWERS");
    expect(result[2].reason).toBe("STALE_REVIEW");
    const retried = await f.rpc<{ confirmed: boolean }[]>(
      teacherA,
      "confirm_scan_batch",
      { school_id: f.schoolA, items: [command.items[0]] },
    );
    expect(retried[0].confirmed).toBe(true);
    expect(
      (
        await f.db.query<{ count: number }>(
          "select count(*)::integer count from audit_logs where resource_id=$1 and action='confirm_result'",
          [good.scanId],
        )
      ).rows[0].count,
    ).toBe(1);
    for (const actor of [teacherB, owner])
      await expect(f.rpc(actor, "confirm_scan_batch", command)).rejects.toThrow(
        "FORBIDDEN",
      );
    await expect(
      f.rpc(teacherA, "preview_scan_confirmation", {
        school_id: f.schoolA,
        items: [items[0], items[0]],
      }),
    ).rejects.toThrow("INVALID_REVIEW");
  }, 30000);
});
