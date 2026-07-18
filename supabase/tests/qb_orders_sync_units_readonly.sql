begin;
set transaction read only;

with expected_realtime_tables(table_name) as (
  values
    ('qb_orders'::text),
    ('qb_order_items'::text),
    ('qb_order_preparations'::text),
    ('qb_order_preparation_items'::text),
    ('qb_order_delivery_movements'::text)
),
relation_preflight as (
  select
    table_name,
    to_regclass(format('public.%I', table_name)) is not null as present
  from expected_realtime_tables
),
publication_state as (
  select
    expected.table_name,
    publication.tablename is not null as published
  from expected_realtime_tables expected
  left join pg_catalog.pg_publication_tables publication
    on publication.pubname = 'supabase_realtime'
   and publication.schemaname = 'public'
   and publication.tablename = expected.table_name
),
trigger_state as (
  select
    trigger.tgname,
    not trigger.tgisinternal and trigger.tgenabled <> 'D' as enabled
  from pg_catalog.pg_trigger trigger
  where trigger.tgname in (
    'prevent_product_base_unit_change_with_movements',
    'prevent_qb_product_base_unit_change_with_movements'
  )
),
function_state as (
  select
    routine.proname,
    coalesce(array_to_string(routine.proconfig, ','), '') as configuration,
    pg_catalog.pg_get_functiondef(routine.oid) as definition
  from pg_catalog.pg_proc routine
  join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.proname in (
      'prevent_product_base_unit_change_with_movements',
      'prevent_qb_product_base_unit_change_with_movements'
    )
),
versioned_function_state as (
  select
    routine.proname,
    routine.prosecdef,
    coalesce(array_to_string(routine.proconfig, ','), '') as configuration,
    coalesce(routine.proacl::text, '') as acl,
    pg_catalog.pg_get_functiondef(routine.oid) as definition
  from pg_catalog.pg_proc routine
  join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.proname in (
      'start_qb_order_preparation_versioned',
      'save_qb_order_preparation_versioned',
      'confirm_qb_order_delivery_versioned',
      'cancel_qb_order_before_delivery_versioned'
    )
),
product_function_state as (
  select
    routine.prosecdef,
    coalesce(array_to_string(routine.proconfig, ','), '') as configuration,
    coalesce(routine.proacl::text, '') as acl,
    pg_catalog.pg_get_functiondef(routine.oid) as definition
  from pg_catalog.pg_proc routine
  join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.proname = 'save_qb_product_with_units'
),
checks as (
  select
    '01_relations_exist'::text as check_name,
    bool_and(present) and count(*) = 5 as passed,
    count(*)::text || '/5 relaciones presentes' as details
  from relation_preflight
  union all
  select
    '02_realtime_publication',
    bool_and(published) and count(*) = 5,
    count(*) filter (where published)::text || '/5 tablas publicadas'
  from publication_state
  union all
  select
    '03_unit_triggers_enabled',
    bool_and(enabled) and count(*) = 2,
    count(*) filter (where enabled)::text || '/2 triggers activos'
  from trigger_state
  union all
  select
    '04_secure_search_path',
    bool_and(configuration = 'search_path=pg_catalog') and count(*) = 2,
    count(*) filter (where configuration = 'search_path=pg_catalog')::text || '/2 funciones con pg_catalog'
  from function_state
  union all
  select
    '05_inventory_history_guard',
    bool_and(definition like '%public.inventory_movements%') and count(*) = 2,
    count(*) filter (where definition like '%public.inventory_movements%')::text || '/2 funciones verifican movimientos'
  from function_state
  union all
  select
    '06_professional_error',
    bool_and(definition like '%No puedes cambiar la unidad base porque este producto ya tiene movimientos de inventario.%') and count(*) = 2,
    count(*) filter (where definition like '%No puedes cambiar la unidad base porque este producto ya tiene movimientos de inventario.%')::text || '/2 funciones con mensaje esperado'
  from function_state
  union all
  select
    '07_versioned_order_mutations',
    bool_and(prosecdef and configuration = 'search_path=pg_catalog'
      and acl not like '%anon=X%'
      and acl like '%authenticated=X%'
      and definition like '%for update%'
      and definition like '%public.profiles%'
      and definition like '%administrador%inventario%'
      and definition like '%is distinct from p_expected_updated_at%') and count(*) = 4,
    count(*)::text || '/4 mutaciones versionadas transaccionales'
  from versioned_function_state
  union all
  select
    '08_product_rpc_security',
    bool_and(prosecdef and configuration = 'search_path=pg_catalog'
      and acl not like '%anon=X%'
      and acl like '%authenticated=X%') and count(*) = 1,
    count(*)::text || '/1 RPC administrativa segura'
  from product_function_state
  union all
  select
    '09_product_units_atomic',
    bool_and(definition like '%insert into public.products%'
      and definition like '%insert into public.qb_product_unit_settings%') and count(*) = 1,
    count(*)::text || '/1 RPC guarda producto y unidades'
  from product_function_state
)
select check_name, passed, details
from checks
order by check_name;

rollback;
