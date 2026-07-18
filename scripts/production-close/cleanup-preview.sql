-- QB Insumos: vista previa READ ONLY para una limpieza futura autorizada.
-- Este archivo no contiene DELETE, UPDATE ni TRUNCATE y no debe modificarse para
-- convertirlo en un ejecutor. Complete listas exactas y fecha de corte, revise
-- el reporte y prepare un script transaccional separado solo con autorización.

with
parameters as (
  select null::date as cutoff_date
),
authorized_orders as (
  select id
  from unnest(array[]::uuid[]) as selected(id)
),
authorized_merchandise_receipts as (
  select id
  from unnest(array[]::uuid[]) as selected(id)
),
authorized_receipts as (
  select id
  from unnest(array[]::uuid[]) as selected(id)
),
authorized_customers as (
  select id
  from unnest(array[]::uuid[]) as selected(id)
),
authorized_demo_users as (
  select id
  from unnest(array[]::uuid[]) as selected(id)
),
preview as (
  select 'safety'::text as section, 'cutoff_date_configured'::text as item,
    count(*) filter (where cutoff_date is not null)::bigint as rows
  from parameters
  union all
  select 'authorized', 'qb_orders', count(*) from authorized_orders
  union all
  select 'dependencies', 'qb_order_items', count(*)
  from public.qb_order_items where order_id in (select id from authorized_orders)
  union all
  select 'dependencies', 'qb_order_preparations', count(*)
  from public.qb_order_preparations where order_id in (select id from authorized_orders)
  union all
  select 'dependencies', 'qb_order_preparation_items', count(*)
  from public.qb_order_preparation_items
  where preparation_id in (
    select id from public.qb_order_preparations
    where order_id in (select id from authorized_orders)
  )
  union all
  select 'dependencies', 'qb_order_delivery_movements', count(*)
  from public.qb_order_delivery_movements
  where order_id in (select id from authorized_orders)
  union all
  select 'authorized', 'qb_merchandise_receipts', count(*)
  from authorized_merchandise_receipts
  union all
  select 'dependencies', 'qb_merchandise_receipt_lines', count(*)
  from public.qb_merchandise_receipt_lines
  where receipt_id in (select id from authorized_merchandise_receipts)
  union all
  select 'dependencies', 'qb_merchandise_receipt_movements', count(*)
  from public.qb_merchandise_receipt_movements
  where receipt_id in (select id from authorized_merchandise_receipts)
  union all
  select 'authorized', 'qb_receipts', count(*) from authorized_receipts
  union all
  select 'dependencies', 'qb_receipt_orders', count(*)
  from public.qb_receipt_orders where receipt_id in (select id from authorized_receipts)
  union all
  select 'dependencies', 'qb_receipt_lines', count(*)
  from public.qb_receipt_lines where receipt_id in (select id from authorized_receipts)
  union all
  select 'authorized', 'customer_accounts', count(*) from authorized_customers
  union all
  select 'dependencies', 'qb_customer_locations', count(*)
  from public.qb_customer_locations
  where customer_account_id in (select id from authorized_customers)
  union all
  select 'authorized', 'demo_users', count(*) from authorized_demo_users
  union all
  select 'safety', 'catalog_master_candidates', 0::bigint
)
select section, item, rows
from preview
order by section, item;
