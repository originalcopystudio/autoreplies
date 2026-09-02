-- Lock Supabase's REST API out of every table — run once in the Supabase SQL editor
-- (project zizukuxmpmhtugjpxxoc / OCS AutoReplies). Safe to re-run.
--
-- Why: Prisma creates tables in the `public` schema with no Row-Level Security, and
-- Supabase exposes `public` through PostgREST — so anyone with the project URL and the
-- anon key could read them, including Account / InstagramAccount, which hold OAuth
-- tokens. This app NEVER uses that API: it talks to Postgres only through Prisma as
-- the `postgres` role, which bypasses RLS. Enabling RLS with no policies therefore
-- closes the public door completely and changes nothing for the app.

-- 1. RLS on with zero policies = deny-all for API roles, on every current table.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;

-- 2. Belt and braces: strip the API roles' grants too, including on tables that
--    future Prisma migrations create (which would otherwise reopen the gap until
--    this script runs again).
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Verify: Dashboard → Advisors → Security Advisor → Refresh. Both findings
-- (rls_disabled_in_public, sensitive_columns_exposed) should clear.
