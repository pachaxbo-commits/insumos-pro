-- Migración aditiva: Limpieza de bitácora relacionada y plantillas legacy en resets de prueba
-- Creada para rama feat/provision-precios-accesos-clientes
-- NO APLICADA EN PRODUCCIÓN.

begin;

-- 1. Actualizar reset_qb_order_test_data para limpiar también qb_legacy_order_templates y audit_logs asociados a pedidos
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

  -- Eliminar recibos
  delete from public.qb_receipts where true;

  -- Eliminar eventos y registros transaccionales de pedidos
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

  -- Limpiar plantillas legacy para evitar recomendaciones fantasma cuando no quedan pedidos
  if to_regclass('public.qb_legacy_order_template_lines') is not null then
    execute 'delete from public.qb_legacy_order_template_lines where true';
  end if;
  if to_regclass('public.qb_legacy_order_templates') is not null then
    execute 'delete from public.qb_legacy_order_templates where true';
  end if;

  delete from private.qb_guest_order_rate_limits where true;

  if to_regclass('public.public_order_submission_attempts') is not null then
    execute 'delete from public.public_order_submission_attempts where true';
  end if;

  -- Limpiar registros de bitácora vinculados a los pedidos y recibos eliminados
  delete from public.audit_logs
  where entity_type in ('order', 'qb_order', 'order_item', 'preparation', 'delivery', 'receipt', 'qb_receipt')
     or action in ('create_order', 'confirm_order', 'cancel_order', 'edit_order');

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

-- 2. Actualizar execute_qb_test_data_reset para limpiar bitácora de recibos cuando se resetea receipts
create or replace function public.execute_qb_test_data_reset(
  p_actor uuid,
  p_mode text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_preview jsonb;
  v_result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Limpieza no autorizada.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor and p.is_active = true and p.role = 'administrador'
  ) then
    raise exception 'Se requiere un administrador activo.';
  end if;
  if p_confirmation is distinct from 'BORRAR DATOS' then
    raise exception 'Confirmación inválida.';
  end if;
  if p_mode not in ('receipts', 'orders') then
    raise exception 'Selección inválida.';
  end if;

  lock table public.qb_orders in share row exclusive mode;
  lock table public.qb_receipts in share row exclusive mode;
  lock table public.products in row exclusive mode;
  v_preview := public.preview_qb_test_data_reset(p_mode);

  if p_mode = 'receipts' then
    update public.qb_orders o
       set status = 'entregado_pendiente_recibo'
     where o.status in ('incluido_en_recibo_borrador', 'recibo_emitido')
       and exists (select 1 from public.qb_receipt_orders ro where ro.order_id = o.id);
    delete from public.qb_receipts where true;

    -- Limpiar bitácora correspondiente a recibos eliminados
    delete from public.audit_logs
    where entity_type in ('receipt', 'qb_receipt', 'sale')
       or action in ('create_sale', 'confirm_sale', 'cancel_sale');

    v_result := jsonb_build_object('mode', p_mode, 'deleted_receipts', v_preview->'receipts');
  else
    if to_regclass('public.inventory_lot_consumptions') is not null then
      update public.inventory_lots lot
         set remaining_quantity = lot.remaining_quantity + consumed.quantity
        from (
          select c.lot_id, sum(c.quantity_consumed) as quantity
            from public.inventory_lot_consumptions c
           where c.lot_id is not null
           group by c.lot_id
        ) consumed
       where lot.id = consumed.lot_id;
      delete from public.inventory_lot_consumptions where true;
      delete from public.inventory_fifo_consumption_runs where true;
    end if;
    v_result := public.reset_qb_order_test_data('BORRAR_TODOS_LOS_PEDIDOS');
  end if;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'reset_order_test_data', 'qb_order_test_data', null,
          jsonb_build_object('selection', p_mode, 'preview', v_preview, 'result', v_result));
  return jsonb_build_object('preview', v_preview, 'result', v_result);
end;
$$;

-- 3. Actualizar reset_qb_stock_test_data para limpiar bitácora de stock y movimientos
create or replace function public.reset_qb_stock_test_data(p_actor uuid, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_preview jsonb;
  v_zeroed_products integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Limpieza de stock no autorizada.';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_actor and p.is_active = true and p.role = 'administrador'
  ) then
    raise exception 'Se requiere un administrador activo.';
  end if;
  if p_confirmation is distinct from 'BORRAR DATOS' then
    raise exception 'Confirmación inválida.';
  end if;

  lock table public.qb_orders, public.orders, public.qb_receipts,
    public.qb_order_delivery_movements, public.qb_merchandise_receipts,
    public.qb_merchandise_receipt_movements, public.inventory_movements,
    public.inventory_lot_consumptions, public.inventory_lot_writeoffs,
    public.inventory_fifo_consumption_runs, public.inventory_lots,
    public.products in exclusive mode;

  if exists (select 1 from public.qb_orders)
    or exists (select 1 from public.orders)
    or exists (select 1 from public.qb_receipts)
    or exists (select 1 from public.qb_order_delivery_movements) then
    raise exception 'Limpia primero pedidos y recibos; Stock no los modifica.';
  end if;

  v_preview := public.preview_qb_test_data_reset('stock');

  delete from public.inventory_lot_consumptions where true;
  delete from public.inventory_lot_writeoffs where true;
  delete from public.inventory_fifo_consumption_runs where true;
  delete from public.inventory_lots where true;

  delete from private.qb_operational_import_batches
  where import_type = 'initial_stock' or receipt_id is not null;
  delete from public.qb_merchandise_receipts where true;
  delete from public.inventory_movements where true;

  -- Limpiar bitácora correspondiente a movimientos de stock eliminados
  delete from public.audit_logs
  where entity_type in ('inventory_movement', 'inventory_lot', 'merchandise_receipt', 'stock_adjustment')
     or action in ('create_inventory_movement', 'create_qb_merchandise_receipt', 'confirm_qb_merchandise_receipt', 'annul_qb_merchandise_receipt');

  update public.products
  set stock_current = 0, updated_at = now()
  where stock_current <> 0;
  get diagnostics v_zeroed_products = row_count;

  if exists (select 1 from public.products where stock_current <> 0)
    or exists (select 1 from public.inventory_movements)
    or exists (select 1 from public.inventory_lots)
    or exists (select 1 from public.qb_merchandise_receipts) then
    raise exception 'La verificación de stock en cero falló; se revierte la transacción.';
  end if;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (p_actor, 'reset_stock_test_data', 'qb_stock_test_data', null,
    jsonb_build_object('preview', v_preview, 'zeroed_products', v_zeroed_products));
  return jsonb_build_object('preview', v_preview, 'zeroed_products', v_zeroed_products);
end;
$$;

revoke all on function public.reset_qb_order_test_data(text) from public, anon, authenticated;
grant execute on function public.reset_qb_order_test_data(text) to service_role;

revoke all on function public.execute_qb_test_data_reset(uuid,text,text) from public, anon, authenticated;
grant execute on function public.execute_qb_test_data_reset(uuid,text,text) to service_role;

revoke all on function public.reset_qb_stock_test_data(uuid,text) from public, anon, authenticated;
grant execute on function public.reset_qb_stock_test_data(uuid,text) to service_role;

commit;
