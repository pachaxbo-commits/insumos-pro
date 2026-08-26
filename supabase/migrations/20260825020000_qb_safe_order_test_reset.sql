begin;

create or replace function public.inspect_qb_order_test_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_conflicts jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Inspección de mantenimiento no autorizada.';
  end if;

  with product_issues as (
    select
      product.id,
      product.name,
      array_remove(array[
        case
          when base_unit.id is null then 'Sin unidad base'
          when upper(replace(trim(base_unit.symbol), '.', '')) in ('BS', 'BOB')
            then 'La unidad base es monetaria (' || base_unit.symbol || ')'
        end,
        case
          when inventory_unit.id is null then 'Sin unidad de inventario'
          when upper(replace(trim(inventory_unit.symbol), '.', '')) in ('BS', 'BOB')
            then 'La unidad de inventario es monetaria (' || inventory_unit.symbol || ')'
        end,
        case
          when price_unit.id is null then 'Sin unidad de precio'
        end,
        case
          when settings.base_sale_price is null or settings.base_sale_price <= 0
            then 'Sin precio base positivo'
        end,
        case
          when exists (
            select 1
            from public.qb_product_allowed_units allowed
            left join public.qb_units allowed_unit
              on allowed_unit.id = allowed.unit_id
            left join public.qb_product_presentations presentation
              on presentation.id = allowed.presentation_id
            where allowed.product_id = product.id
              and allowed.usage_context = 'pedido'
              and allowed.is_active = true
              and upper(replace(trim(coalesce(allowed_unit.symbol, presentation.symbol, '')), '.', ''))
                in ('BS', 'BOB')
          ) then 'BS/BOB está permitido como unidad al crear pedidos'
        end
      ], null) as issues
    from public.products product
    left join public.qb_product_unit_settings settings
      on settings.product_id = product.id
    left join public.qb_units base_unit
      on base_unit.id = settings.base_unit_id
    left join public.qb_units inventory_unit
      on inventory_unit.id = coalesce(
        settings.base_inventory_unit_id,
        settings.inventory_unit_id,
        settings.base_unit_id
      )
    left join public.qb_units price_unit
      on price_unit.id = coalesce(settings.base_price_unit_id, settings.base_unit_id)
    where product.is_active = true
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', issue.id,
        'product_name', issue.name,
        'issues', to_jsonb(issue.issues)
      )
      order by issue.name
    ) filter (where cardinality(issue.issues) > 0),
    '[]'::jsonb
  )
  into v_conflicts
  from product_issues issue;

  return jsonb_build_object(
    'qb_orders', (select count(*) from public.qb_orders),
    'legacy_orders', (select count(*) from public.orders),
    'receipts', (select count(*) from public.qb_receipts),
    'preparations', (select count(*) from public.qb_order_preparations),
    'delivery_items', (select count(*) from public.qb_order_delivery_items),
    'delivery_stock_movements', (
      select count(*)
      from public.qb_order_delivery_movements movement
      where movement.inventory_movement_id is not null
    ),
    'active_products', (select count(*) from public.products where is_active = true),
    'customers', (select count(*) from public.customer_accounts),
    'catalog_conflicts', v_conflicts
  );
end;
$$;

create or replace function public.reset_qb_order_test_data(
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_orders integer;
  v_legacy_orders integer;
  v_receipts integer;
  v_inventory_movements integer;
  v_restored_stock numeric(18, 6) := 0;
  v_inventory_movement_ids uuid[];
  v_stock record;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Reinicio de mantenimiento no autorizado.';
  end if;

  if p_confirmation is distinct from 'BORRAR_TODOS_LOS_PEDIDOS' then
    raise exception 'Confirmación de reinicio inválida.';
  end if;

  lock table public.qb_orders in share row exclusive mode;
  lock table public.products in row exclusive mode;

  select count(*)::integer into v_orders from public.qb_orders;
  select count(*)::integer into v_legacy_orders from public.orders;
  select count(*)::integer into v_receipts from public.qb_receipts;

  select coalesce(array_agg(movement.inventory_movement_id), array[]::uuid[])
  into v_inventory_movement_ids
  from public.qb_order_delivery_movements movement
  where movement.inventory_movement_id is not null;

  for v_stock in
    select
      movement.product_id,
      sum(inventory.quantity)::numeric(18, 6) as quantity
    from public.qb_order_delivery_movements movement
    join public.inventory_movements inventory
      on inventory.id = movement.inventory_movement_id
    where movement.inventory_movement_id is not null
    group by movement.product_id
    order by movement.product_id
  loop
    update public.products
    set stock_current = stock_current + v_stock.quantity,
        updated_at = now()
    where id = v_stock.product_id;

    v_restored_stock := v_restored_stock + v_stock.quantity;
  end loop;

  delete from public.qb_receipts where true;

  delete from public.qb_order_line_change_events where true;

  delete from private.qb_guest_order_idempotency where true;

  delete from private.qb_order_amount_snapshots snapshot
  where snapshot.order_item_id in (
    select item.id from public.qb_order_items item
  );

  delete from public.qb_conversion_snapshots snapshot
  where snapshot.source_table in (
    'qb_order_items',
    'qb_order_preparation_items',
    'qb_order_delivery_items'
  );

  delete from public.qb_order_delivery_movements where true;

  delete from public.inventory_movements movement
  where movement.id = any(v_inventory_movement_ids);
  get diagnostics v_inventory_movements = row_count;

  delete from public.qb_order_delivery_items where true;
  delete from public.qb_orders where true;
  delete from public.orders where true;

  delete from private.qb_guest_order_rate_limits where true;

  if to_regclass('public.public_order_submission_attempts') is not null then
    execute 'delete from public.public_order_submission_attempts where true';
  end if;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    null,
    'reset_order_test_data',
    'qb_order_test_data',
    null,
    jsonb_build_object(
      'deleted_qb_orders', v_orders,
      'deleted_legacy_orders', v_legacy_orders,
      'deleted_receipts', v_receipts,
      'deleted_inventory_movements', v_inventory_movements,
      'restored_stock_quantity', v_restored_stock,
      'preserved_products', (select count(*) from public.products),
      'preserved_customers', (select count(*) from public.customer_accounts)
    )
  );

  return jsonb_build_object(
    'deleted_qb_orders', v_orders,
    'deleted_legacy_orders', v_legacy_orders,
    'deleted_receipts', v_receipts,
    'deleted_inventory_movements', v_inventory_movements,
    'restored_stock_quantity', v_restored_stock,
    'remaining_qb_orders', (select count(*) from public.qb_orders),
    'remaining_legacy_orders', (select count(*) from public.orders),
    'remaining_receipts', (select count(*) from public.qb_receipts),
    'preserved_products', (select count(*) from public.products),
    'preserved_customers', (select count(*) from public.customer_accounts)
  );
end;
$$;

revoke all on function public.inspect_qb_order_test_data()
from public, anon, authenticated;
revoke all on function public.reset_qb_order_test_data(text)
from public, anon, authenticated;

grant execute on function public.inspect_qb_order_test_data()
to service_role;
grant execute on function public.reset_qb_order_test_data(text)
to service_role;

comment on function public.inspect_qb_order_test_data() is
  'Audita datos operativos de pedidos y conflictos de catálogo antes de un reinicio de pruebas.';
comment on function public.reset_qb_order_test_data(text) is
  'Reinicio transaccional restringido: restaura stock descontado por entregas y elimina pedidos, recibos y dependencias de prueba sin tocar catálogo ni clientes.';

commit;
