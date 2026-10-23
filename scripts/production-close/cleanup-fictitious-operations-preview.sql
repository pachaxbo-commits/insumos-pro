-- READ ONLY. Run against the isolated restored copy first.
-- Does not list customer names, emails, addresses, row payloads, or secrets.
select private.qb_prepublication_cleanup_snapshot() as reviewed_scope;

select 'inventory_consistency' as check_name,
  jsonb_build_object(
    'negative_products', (select count(*) from public.products where stock_current < 0),
    'stock_ledger_mismatches', (
      select count(*) from public.products p
      left join lateral (
        select m.stock_after from public.inventory_movements m
        where m.product_id=p.id order by m.created_at desc,m.id desc limit 1
      ) last_movement on true
      where p.stock_current <> coalesce(last_movement.stock_after,0)
    ),
    'invalid_fifo_lots', (
      select count(*) from public.inventory_lots lot
      left join (select lot_id,sum(quantity_consumed) quantity from public.inventory_lot_consumptions group by lot_id) c on c.lot_id=lot.id
      left join (select lot_id,sum(quantity) quantity from public.inventory_lot_writeoffs group by lot_id) w on w.lot_id=lot.id
      where lot.remaining_quantity < 0 or lot.remaining_quantity > lot.initial_quantity
         or lot.initial_quantity <> lot.remaining_quantity+coalesce(c.quantity,0)+coalesce(w.quantity,0)
    ),
    'products_with_nonzero_stock', (select count(*) from public.products where stock_current <> 0)
  ) as details;

select 'preserved_master_counts' as section,
  jsonb_build_object(
    'products',(select count(*) from public.products),
    'categories',(select count(*) from public.product_categories),
    'customers',(select count(*) from public.customer_accounts),
    'customer_locations',(select count(*) from public.qb_customer_locations),
    'profiles',(select count(*) from public.profiles),
    'product_unit_settings',(select count(*) from public.qb_product_unit_settings),
    'allowed_units',(select count(*) from public.qb_product_allowed_units),
    'presentations',(select count(*) from public.qb_product_presentations),
    'unit_regularization_audits',(select count(*) from public.qb_product_unit_regularization_audit),
    'product_deletion_audits',(select count(*) from public.product_deletion_audit)
  ) as counts;

select 'audit_classification' as section,
  jsonb_build_object(
    'security_and_admin_audits_retained', count(*) filter (
      where lower(coalesce(entity_type,'')) in ('auth','security','profile','user','configuration','system','product')
        or lower(coalesce(action,'')) like '%login%'
        or lower(coalesce(action,'')) like '%regularize%'
        or lower(coalesce(action,'')) like '%price%'
        or lower(coalesce(action,'')) like '%user%'
        or lower(coalesce(action,'')) like '%role%'
        or lower(coalesce(action,'')) like '%reset%'
    ),
    'operation_events_to_archive', count(*) filter (
      where lower(coalesce(entity_type,'')) in ('order','qb_order','order_item','preparation','delivery','receipt','qb_receipt','sale','purchase','inventory_movement','inventory_lot','merchandise_receipt','qb_merchandise_receipt','stock_adjustment','qb_order_delivery_movement','qb_order_preparation_items','qb_warehouse_operating_expense')
    ),
    'total_logs', count(*)
  ) as counts
from public.audit_logs;
