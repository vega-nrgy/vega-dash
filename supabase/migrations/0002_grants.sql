-- Supabase's default roles don't automatically get privileges on tables
-- created by a plain migration (only tables created through the dashboard's
-- managed flow get this by default) — grant explicitly.
grant usage on schema public to service_role, anon, authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to service_role, anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant usage, select on sequences to service_role, anon, authenticated;
