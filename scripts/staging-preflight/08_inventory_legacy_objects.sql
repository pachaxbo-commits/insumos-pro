select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned_table'
    when 'v' then 'view'
    when 'm' then 'materialized_view'
    when 'S' then 'sequence'
    else c.relkind::text
  end as object_type
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (
    c.relname like 'sale%'
    or c.relname like 'purchase%'
    or c.relname like 'payment%'
    or c.relname like 'cash%'
    or c.relname like 'accounts_receivable%'
    or c.relname like 'accounts_payable%'
    or c.relname like 'fulfillment%'
    or c.relname in ('orders', 'order_items', 'customers')
  )
union all
select
  n.nspname as schema_name,
  p.proname as object_name,
  'function' as object_type
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname like '%sale%'
    or p.proname like '%purchase%'
    or p.proname like '%payment%'
    or p.proname like '%cash%'
    or p.proname like '%receivable%'
    or p.proname like '%payable%'
    or p.proname like '%fulfillment%'
    or p.proname like '%public_order%'
  )
order by object_type, object_name;

