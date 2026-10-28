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
