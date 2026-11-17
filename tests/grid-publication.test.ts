import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  compileOmrTemplate,
  defaultLayout,
  resolveGeometry,
} from "@/lib/omr/generate-template";
import { createSetIdentity } from "@/lib/omr/qr";
import { scoreEventSchema } from "@/lib/integrations/mathquest/contract";
import { integrationOverviewSchema } from "@/types/integration";
import { teacherA, teacherB } from "./score-integration-fixture";
import { rosterFixture } from "./student-roster-fixture";

const grid = { ...defaultLayout, printStyle: "school-grid" as const };
let fixture: Awaited<ReturnType<typeof rosterFixture>>;

beforeAll(async () => {
  fixture = await rosterFixture(true, true);
  for (const file of [
    "202610280017_print_v5.sql",
    "202610280018_batch_confirmation.sql",
    "202610280019_directory_lifecycle.sql",
  ])
    await fixture.db.exec(
      await readFile(`supabase/migrations/${file}`, "utf8"),
    );
  // PGlite has no pg_cron. The production marker represents the separate scheduled task.
  await fixture.db.exec(
    "insert into private.app_installation(version) values('202610280020')",
  );
  for (const file of [
    "202611170021_print_school_grid.sql",
    "202611170022_score_publication_preview.sql",
    "202611170023_portrait_a4.sql",
    "202611170024_mathquest_signed_pairing.sql",
  ])
    await fixture.db.exec(
      await readFile(`supabase/migrations/${file}`, "utf8"),
    );
  await fixture.connect();
}, 60000);
afterAll(async () => {
  await fixture?.db.close();
});

describe("school-grid print and verified score delivery", () => {
  it("pins signed attempts, rejects stale IDs, and keeps wire secrets out of the overview", async () => {
    const id = crypto.randomUUID();
    const destination = crypto.randomUUID();
    const workspace = { school_id: fixture.schoolB, actor_id: teacherB };
    const envelope = {
      v: "fixture",
      nonce: "synthetic",
      tag: "synthetic",
      ciphertext: "sealed-fixture",
    };
    await fixture.svc("mathquest_service_start_signed_pairing", {
      ...workspace,
      request_id: id,
      destination_school_id: destination,
      destination_label: "Fixture destination",
      receiver_origin: "https://abcdefghijklmnopqrst.supabase.co",
      pairing_secret: envelope,
      draft_secret: envelope,
    });
    const scope = { ...workspace, id };
    expect(
      await fixture.svc("mathquest_service_begin_signed_preparation", scope),
    ).toBe(true);
    expect(
      await fixture.svc("mathquest_service_begin_signed_preparation", scope),
    ).toBe(false);
    const window = crypto.randomUUID();
    await fixture.svc("mathquest_service_freeze_signed_pairing", {
      ...scope,
      window_id: window,
      wire_secret: envelope,
    });
    const frozen = await fixture.svc(
      "mathquest_service_freeze_signed_pairing",
      {
        ...scope,
        window_id: crypto.randomUUID(),
        wire_secret: { ...envelope, ciphertext: "different" },
      },
    );
    expect(frozen).toMatchObject({
      stage: "submit",
      window_id: window,
      wire_secret: envelope,
    });
    await expect(
      fixture.svc("mathquest_service_credentials", {
        ...workspace,
        expected_request_id: crypto.randomUUID(),
      }),
    ).rejects.toThrow("PAIRING_REQUEST_CHANGED");
    await expect(
      fixture.svc("mathquest_service_complete_pairing", {
        ...scope,
        status: "active",
        signed_origin: "https://abcdefghijklmnopqrst.supabase.co",
        signed_destination: destination,
        destination_school_id: crypto.randomUUID(),
      }),
    ).rejects.toThrow("PAIRING_DESTINATION_CHANGED");
    const status = await fixture.rpc(teacherB, "get_mathquest_status", {
      school_id: fixture.schoolB,
    });
    expect(status.connection).toMatchObject({
      signedStage: "submit",
      status: "pending_approval",
    });
    expect(JSON.stringify(status)).not.toContain("sealed-fixture");
  }, 30000);
  it("registers a portrait full leaf and keeps the two-up QR identical", async () => {
    const portrait = { ...grid, printStyle: "school-grid-portrait" as const };
    expect((await createSetIdentity(portrait)).token).toBe(
      (await createSetIdentity(grid)).token,
    );
    const full = await createSetIdentity({
      ...portrait,
      questionCount: 60,
      choiceCount: 5,
    });
    expect(full.snapshot.omr.geometryVersion).toBe(7);
    expect(full.snapshot.omr.pageDimensions).toEqual([900, 1273]);
    const g = resolveGeometry(full.snapshot.layout);
    expect([g.sheetWidth, g.sheetHeight, g.columns, g.rows]).toEqual([
      210, 297, 3, 20,
    ]);
    const match = await fixture.db.query<{ ok: boolean }>(
      "select private.print_json_matches(private.expected_print_geometry($1::jsonb),$2::jsonb) ok",
      [full.snapshot.layout, full.snapshot.omr],
    );
    expect(match.rows[0].ok).toBe(true);
    const exam = await fixture.exam();
    const forced = await createSetIdentity({
      ...portrait,
      paperMode: "full",
      examId: exam.examId,
      school: "พื้นที่ส่วนตัว",
      title: exam.config.title,
      subject: exam.config.subject,
      classroom: exam.config.classroom,
      year: exam.config.year,
      term: exam.config.term,
      answerKeySignature: JSON.stringify(exam.config.answerKey),
    });
    const job = await fixture.rpc<{ sheets: { page: number; slot: number }[] }>(
      teacherA,
      "register_omr_print",
      {
        school_id: fixture.schoolA,
        request_id: crypto.randomUUID(),
        identity_json: JSON.stringify(forced.snapshot),
        blank_count: 2,
      },
    );
    expect(job.sheets.map(({ page, slot }) => [page, slot])).toEqual([
      [1, 0],
      [2, 0],
    ]);
  }, 30000);
  it("matches the database dimensions for both paper sizes and keeps old geometry", async () => {
    for (const [questionCount, choiceCount, columns, pages] of [
      [1, 4, 1, 2],
      [30, 4, 2, 2],
      [48, 5, 3, 2],
      [49, 5, 4, 1],
      [60, 5, 4, 1],
    ] as const) {
      const layout = { ...grid, questionCount, choiceCount };
      const field = resolveGeometry(layout);
      expect([field.columns, field.sheetsPerPage, field.bubbleRadius]).toEqual([
        columns,
        pages,
        1.8,
      ]);
      const { snapshot } = await createSetIdentity(layout);
      const result = await fixture.db.query<{ matches: boolean }>(
        "select private.print_json_matches(private.expected_print_geometry($1::jsonb),$2::jsonb) matches",
        [snapshot.layout, snapshot.omr],
      );
      expect(result.rows[0].matches).toBe(true);
    }
    expect(compileOmrTemplate(defaultLayout).geometryVersion).toBe(5);
    await expect(
      fixture.db.query("select private.expected_print_geometry($1::jsonb)", [
        { ...grid, questionCount: 49 },
      ]),
    ).rejects.toThrow("INVALID_PRINT_GEOMETRY");
    const exam = await fixture.exam();
    const identity = await createSetIdentity({
      ...grid,
      examId: exam.examId,
      school: "พื้นที่ส่วนตัว",
      title: exam.config.title,
      subject: exam.config.subject,
      classroom: exam.config.classroom,
      year: exam.config.year,
      term: exam.config.term,
      answerKeySignature: JSON.stringify(exam.config.answerKey),
    });
    const job = await fixture.rpc<{
      templateUuid: string;
      setToken: string;
      sheets: { slot: number }[];
    }>(teacherA, "register_omr_print", {
      school_id: fixture.schoolA,
      request_id: crypto.randomUUID(),
      identity_json: JSON.stringify(identity.snapshot),
      blank_count: 2,
    });
    expect(job.setToken).toBe(identity.token);
    expect(job.sheets.map(({ slot }) => slot)).toEqual([0, 1]);
    expect(job.templateUuid).not.toBe(exam.template);
  }, 30000);

  it("checks an approved snapshot, freezes the original code and preserves the prior work on stale submission", async () => {
    const first = await fixture.exam(0, undefined, 1, {}, "school-grid");
    await fixture.confirm(first.scanId);
    const second = await fixture.exam(1, first.examId);
    const scope = { school_id: fixture.schoolA, exam_id: first.examId };
    async function preview() {
      const data = await fixture.rpc(teacherA, "get_mathquest_status", {
        ...scope,
        preview: true,
      });
      return integrationOverviewSchema.parse({
        ...data,
        enabled: true,
        receiverReady: true,
        readOnly: false,
      }).publication!.preview!;
    }
    const original = await preview();
    expect([
      original.confirmedCount,
      original.reviewCount,
      original.blocked,
    ]).toEqual([1, 1, null]);
    await expect(
      fixture.rpc(teacherB, "get_mathquest_status", {
        ...scope,
        preview: true,
      }),
    ).rejects.toThrow("FORBIDDEN");
    const publish = (fingerprint: string, id = crypto.randomUUID()) =>
      fixture.rpc(teacherA, "command_mathquest_publication", {
        ...scope,
        action: "publish",
        request_id: id,
        consent: true,
        preview_fingerprint: fingerprint,
      });
    await fixture.confirm(second.scanId);
    await expect(publish(original.fingerprint!)).rejects.toThrow(
      "SCORE_PREVIEW_CHANGED",
    );
    expect(
      (
        await fixture.db.query(
          "select 1 from public.score_sync_outbox where source_exam_id=$1",
          [first.examId],
        )
      ).rows,
    ).toHaveLength(0);
    const fresh = await preview();
    const request = crypto.randomUUID();
    const ack = await publish(fresh.fingerprint!, request);
    expect(await publish(fresh.fingerprint!, request)).toEqual(ack);
    const { rows } = await fixture.db.query<{ payload_text: string }>(
      "select payload_text from public.score_sync_outbox where source_exam_id=$1",
      [first.examId],
    );
    const event = scoreEventSchema.parse(JSON.parse(rows[0].payload_text));
    expect(event.results.map((row) => row.student_code)).toEqual([
      "00123",
      "00124",
    ]);
    // Model a legacy discrepancy in the disposable fixture. The live roster
    // trigger deliberately disallows changing a student's code in place.
    await fixture.db.transaction(async (tx) => {
      await tx.exec(
        "alter table public.students disable trigger student_revision",
      );
      await tx.query(
        "update public.students set student_code='90001' where school_id=$1 and student_code='00123'",
        [fixture.schoolA],
      );
      await tx.exec(
        "alter table public.students enable trigger student_revision",
      );
    });
    const blocked = await preview();
    expect(blocked.blocked).toBe("SCORE_IDENTITY_REVIEW");
    expect(blocked.identityIssues).toEqual([
      { originalCode: "00123", currentCode: "90001" },
    ]);
    await expect(fixture.command(first.examId)).rejects.toThrow(
      "SCORE_IDENTITY_REVIEW",
    );
    const replay = await fixture.svc<{ payload_text: string }>(
      "mathquest_service_claim",
      scope,
    );
    expect(replay.payload_text).toBe(rows[0].payload_text);
  }, 30000);
});
