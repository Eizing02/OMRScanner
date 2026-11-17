import { readFile } from "node:fs/promises";
import { integrationFixture } from "./score-integration-fixture";

export async function rosterFixture(directory = false, scoped = false) {
  const f = await integrationFixture();
  for (const file of [
    "202610280013_student_history.sql",
    "202610280014_student_management.sql",
    ...(directory ? ["202610280015_school_directory.sql"] : []),
    ...(scoped ? ["202610280016_scoped_workspace_reads.sql"] : []),
  ])
    await f.db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  return f;
}

export async function signedPairingFixture() {
  const f = await rosterFixture(true, true);
  for (const file of [
    "202610280017_print_v5.sql",
    "202610280018_batch_confirmation.sql",
    "202610280019_directory_lifecycle.sql",
  ])
    await f.db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  // PGlite does not run the separate pg_cron migration.
  await f.db.exec(
    "insert into private.app_installation(version) values('202610280020')",
  );
  for (const file of [
    "202611170021_print_school_grid.sql",
    "202611170022_score_publication_preview.sql",
    "202611170023_portrait_a4.sql",
    "202611170024_mathquest_signed_pairing.sql",
  ])
    await f.db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  return f;
}
