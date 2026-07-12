select
  'table' as object_type,
  table_schema as schema_name,
  table_name as object_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_table_grants
where table_schema = 'public'
union all
select
  'routine' as object_type,
  routine_schema as schema_name,
  routine_name as object_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_routine_grants
where routine_schema = 'public'
union all
select
  'sequence' as object_type,
  object_schema as schema_name,
  object_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.role_usage_grants
where object_schema = 'public'
order by object_type, schema_name, object_name, grantee, privilege_type;

