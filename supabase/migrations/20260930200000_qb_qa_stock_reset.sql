begin;

-- Stock QA is a separate operation. It never removes orders, receipts or master data.
create or replace function public.preview_qb_test_data_reset(p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true and p.role = 'administrador'
  ) then
    raise exception 'Vista previa no autorizada.';
  end if;
  if p_mode not in ('receipts', 'orders', 'stock') then
    raise exception 'Selección inválida.';
  end if;
  return jsonb_build_object(
    'mode', p_mode,
    'receipts', case when p_mode <> 'stock' then (select count(*) from public.qb_receipts) else 0 end,
    'orders', case when p_mode = 'orders' then (select count(*) from public.qb_orders) else 0 end,
    'preparations', case when p_mode = 'orders' then (select count(*) from public.qb_order_preparations) else 0 end,
    'deliveries', case when p_mode = 'orders' then (select count(*) from public.qb_order_delivery_movements) else 0 end,
    'delivery_stock_movements', case when p_mode = 'orders' then (select count(*) from public.qb_order_delivery_movements where inventory_movement_id is not null) else 0 end,
    'stock_products_nonzero', case when p_mode = 'stock' then (select count(*) from public.products where stock_current <> 0) else 0 end,
    'stock_movements', case when p_mode = 'stock' then (select count(*) from public.inventory_movements) else 0 end,
    'stock_receipts', case when p_mode = 'stock' then (select count(*) from public.qb_merchandise_receipts) else 0 end,
    'stock_lots', case when p_mode = 'stock' then (select count(*) from public.inventory_lots) else 0 end,
    'stock_dependencies', case when p_mode = 'stock' then (
      (select count(*) from public.qb_orders) +
      (select count(*) from public.orders) +
      (select count(*) from public.qb_receipts) +
      (select count(*) from public.qb_order_delivery_movements)
    ) else 0 end,
    'customers_preserved', (select count(*) from public.customer_accounts),
    'products_preserved', (select count(*) from public.products),
    'profiles_preserved', (select count(*) from public.profiles)
  );
end;
$$;

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

  -- Exclusive locks prevent concurrent receipt/delivery writes during the reset.
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

  -- Remove dependent FIFO records before their source movements and lots.
  delete from public.inventory_lot_consumptions where true;
  delete from public.inventory_lot_writeoffs where true;
  delete from public.inventory_fifo_consumption_runs where true;
  delete from public.inventory_lots where true;

  -- Initial-stock imports and merchandise receipts are operational stock history.
  -- Price/conversion import batches and all product configuration are preserved.
  delete from private.qb_operational_import_batches
  where import_type = 'initial_stock' or receipt_id is not null;
  delete from public.qb_merchandise_receipts where true;
  delete from public.inventory_movements where true;

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

revoke all on function public.preview_qb_test_data_reset(text) from public, anon;
grant execute on function public.preview_qb_test_data_reset(text) to authenticated, service_role;
revoke all on function public.reset_qb_stock_test_data(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_qb_stock_test_data(uuid, text) to service_role;

commit;
