import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const db = new PGlite();
let sql: string;
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create table auth.identities(user_id uuid references auth.users(id),provider text,identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
  sql = await readFile("supabase/schema.sql", "utf8");
  await db.exec(sql);
}, 60000);
afterAll(async () => {
  await db.close();
});
it("installs all seven migrations in one guarded transaction with no student seed", async () => {
  expect(sql.match(/^begin;$/gm)).toHaveLength(1);
  expect(sql.match(/^commit;$/gm)).toHaveLength(1);
  expect(
    (
      await db.query(
        "select version from private.app_installation order by version",
      )
    ).rows,
  ).toEqual([
    { version: "202610090005" },
    { version: "202610090006" },
    { version: "202610090007" },
  ]);
  const tables = (
    await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname='public'",
    )
  ).rows.map((row) => row.tablename);
  expect(tables).toEqual(
    expect.arrayContaining([
      "students",
      "exams",
      "answer_keys",
      "user_access",
      "access_audit_logs",
      "logo_cleanup_jobs",
      "omr_layouts",
      "omr_templates",
      "print_jobs",
      "omr_sheets",
      "scan_records",
      "detected_answers",
      "exam_results",
      "answer_evaluations",
      "export_jobs",
    ]),
  );
  expect(
    (await db.query("select count(*)::integer as count from students")).rows,
  ).toEqual([{ count: 0 }]);
  expect(
    (
      await db.query(
        "select public,file_size_limit,allowed_mime_types from storage.buckets where id='school-logos'",
      )
    ).rows,
  ).toEqual([
    {
      public: false,
      file_size_limit: 5242880,
      allowed_mime_types: ["image/png", "image/jpeg"],
    },
  ]);
  expect(
    (
      await db.query(
        "select public,file_size_limit,allowed_mime_types from storage.buckets where id='scan-images'",
      )
    ).rows,
  ).toEqual([
    {
      public: false,
      file_size_limit: 2000000,
      allowed_mime_types: ["image/jpeg"],
    },
  ]);
  await expect(
    db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.query("select * from students");
    }),
  ).rejects.toThrow();
});
it("rejects an accidental second snapshot run without changing installed data", async () => {
  await expect(db.exec(sql)).rejects.toThrow("EXISTING_APP_SCHEMA");
  await db.exec("rollback");
  expect(
    (
      await db.query(
        "select version from private.app_installation order by version",
      )
    ).rows,
  ).toEqual([
    { version: "202610090005" },
    { version: "202610090006" },
    { version: "202610090007" },
  ]);
});
