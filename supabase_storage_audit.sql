-- Supabase SQL Editor: inspect stimulus storage permissions without changing data.
-- These SELECT queries return metadata only; they do not read participant rows.
-- A successful public-key GET (including an empty result) does not prove INSERT works.
-- Reference: https://supabase.com/docs/guides/api/securing-your-api

-- 1. Table existence, RLS status and effective anon privileges.
select
  target.table_name,
  c.oid is not null as table_exists,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  has_schema_privilege('anon', 'public', 'USAGE') as anon_schema_usage,
  has_table_privilege('anon', c.oid, 'INSERT') as anon_table_insert,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_table_select,
  has_table_privilege('anon', c.oid, 'UPDATE') as anon_table_update,
  has_table_privilege('anon', c.oid, 'DELETE') as anon_table_delete
from (values ('sessions'), ('events')) as target(table_name)
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = target.table_name
order by target.table_name;

-- 2. Actual policies, including restrictive policies that can still reject a row.
-- INSERT requires an applicable policy for anon/PUBLIC whose WITH CHECK accepts the row.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('sessions', 'events')
order by tablename, cmd, policyname;

-- 3. Effective column privileges (relevant when grants are made per column).
select
  c.relname as table_name,
  a.attname as column_name,
  has_column_privilege('anon', c.oid, a.attnum, 'INSERT') as anon_column_insert,
  has_column_privilege('anon', c.oid, a.attnum, 'SELECT') as anon_column_select
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('sessions', 'events')
  and a.attnum > 0 and not a.attisdropped
order by c.relname, a.attnum;

-- 4. Owned sequences: events.id uses a bigserial default in this repository.
select
  seq.oid::regclass::text as sequence_name,
  has_sequence_privilege('anon', seq.oid, 'USAGE') as anon_sequence_usage,
  has_sequence_privilege('anon', seq.oid, 'UPDATE') as anon_sequence_update
from pg_class seq
join pg_depend d on d.classid = 'pg_class'::regclass and d.objid = seq.oid
join pg_class tbl on d.refclassid = 'pg_class'::regclass and d.refobjid = tbl.oid
join pg_namespace n on n.oid = tbl.relnamespace
where seq.relkind = 'S' and d.deptype in ('a', 'i')
  and n.nspname = 'public' and tbl.relname in ('sessions', 'events')
order by sequence_name;
