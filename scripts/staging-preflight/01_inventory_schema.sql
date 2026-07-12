select
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.numeric_precision,
  c.numeric_scale
from information_schema.columns c
where c.table_schema in ('public', 'auth', 'supabase_migrations')
order by c.table_schema, c.table_name, c.ordinal_position;

