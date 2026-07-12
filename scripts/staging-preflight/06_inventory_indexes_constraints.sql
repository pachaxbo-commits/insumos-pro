select
  'constraint' as object_type,
  n.nspname as schema_name,
  c.relname as table_name,
  con.conname as object_name,
  con.contype::text as subtype,
  pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
union all
select
  'index' as object_type,
  schemaname as schema_name,
  tablename as table_name,
  indexname as object_name,
  'index' as subtype,
  indexdef as definition
from pg_catalog.pg_indexes
where schemaname = 'public'
union all
select
  'trigger' as object_type,
  event_object_schema as schema_name,
  event_object_table as table_name,
  trigger_name as object_name,
  action_timing as subtype,
  action_statement as definition
from information_schema.triggers
where event_object_schema = 'public'
order by object_type, schema_name, table_name, object_name;

