-- Una repeticion con la misma clave debe responder sin duplicar stock,
-- movimientos, auditoria, entrega ni recibos.

begin;

create or replace function public.confirm_qb_matrix_delivery(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
  v_line record;
  v_strict boolean;
  v_stock_before numeric(14,3);
  v_stock_after numeric(14,3);
  v_movement_id uuid;
  v_confirmation public.qb_order_delivery_confirmations%rowtype;
begin
  select role into v_role from public.profiles where id = v_user_id and is_active = true;
  if v_user_id is null or v_role not in ('admin', 'administrador', 'entregador') then
    raise exception 'Solo administracion o entrega puede confirmar la entrega.';
  end if;
  if length(trim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'Clave de idempotencia invalida.';
  end if;

  select * into v_confirmation
  from public.qb_order_delivery_confirmations
  where order_id = p_order_id
  for update;

  if v_confirmation.status = 'confirmado'
    and v_confirmation.idempotency_key = p_idempotency_key
  then
    return p_order_id;
  end if;

  select * into v_order from public.qb_orders where id = p_order_id for update;
  if v_order.id is null or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_MATRIX_CONFLICT: el pedido cambio en otro dispositivo.' using errcode = '40001';
  end if;
  if v_order.status <> 'preparado' then raise exception 'El pedido debe estar preparado.'; end if;
  select * into v_preparation from public.qb_order_preparations
  where order_id = p_order_id and status = 'preparado' for update;
  if v_preparation.id is null then raise exception 'Preparacion finalizada no encontrada.'; end if;
  if exists (
    select 1 from public.qb_order_items order_item
    left join public.qb_order_delivery_items delivery on delivery.order_item_id = order_item.id
    where order_item.order_id = p_order_id and coalesce(delivery.delivery_check, false) = false
  ) then raise exception 'Todas las lineas deben tener check de entrega.'; end if;
  if not exists (
    select 1 from public.qb_order_delivery_items
    where order_id = p_order_id and delivered_base_quantity > 0
  ) then raise exception 'Debe existir al menos una cantidad entregada.'; end if;

  select strict_stock_control into v_strict from public.qb_operational_settings
  where id = 'main' for share;

  for v_line in
    select delivery.*, prep_item.preparation_id
    from public.qb_order_delivery_items delivery
    join public.qb_order_preparation_items prep_item on prep_item.id = delivery.preparation_item_id
    where delivery.order_id = p_order_id
    order by delivery.id
  loop
    select movement.inventory_movement_id into v_movement_id
    from public.qb_order_delivery_movements movement
    where movement.preparation_item_id = v_line.preparation_item_id;

    if not found then
      v_movement_id := null;
      if v_line.prepared_base_quantity_snapshot > 0 then
        select stock_current into v_stock_before from public.products
        where id = v_line.product_id and is_active = true and coalesce(is_qb_loss_product, false) = false
        for update;
        if v_stock_before is null then raise exception 'Producto de bodega no disponible.'; end if;
        if v_strict and v_stock_before < v_line.prepared_base_quantity_snapshot then
          raise exception 'QB_STOCK_INSUFFICIENT: existencia insuficiente para el componente de bodega.'
            using errcode = 'P0001';
        end if;
        v_stock_after := v_stock_before - v_line.prepared_base_quantity_snapshot;
        insert into public.inventory_movements (
          product_id, movement_type, quantity, stock_before, stock_after, reason, notes, created_by
        ) values (
          v_line.product_id, 'salida', v_line.prepared_base_quantity_snapshot,
          v_stock_before, v_stock_after, 'Entrega QB',
          'Componente de bodega de matriz, pedido ' || p_order_id::text, v_user_id
        ) returning id into v_movement_id;
        update public.products set stock_current = v_stock_after where id = v_line.product_id;
      end if;
      insert into public.qb_order_delivery_movements (
        order_id, preparation_id, preparation_item_id, product_id, inventory_movement_id,
        delivered_base_quantity, warehouse_base_quantity, delivery_item_id, delivered_by
      ) values (
        p_order_id, v_line.preparation_id, v_line.preparation_item_id, v_line.product_id,
        v_movement_id, v_line.delivered_base_quantity, v_line.prepared_base_quantity_snapshot,
        v_line.id, v_user_id
      );
    else
      update public.qb_order_delivery_movements
      set delivered_base_quantity = v_line.delivered_base_quantity,
          delivery_item_id = v_line.id,
          delivered_by = v_user_id,
          delivered_at = now()
      where preparation_item_id = v_line.preparation_item_id;
    end if;
  end loop;

  insert into public.qb_order_delivery_confirmations (
    order_id, status, idempotency_key, confirmed_by, confirmed_at
  ) values (p_order_id, 'confirmado', p_idempotency_key, v_user_id, now())
  on conflict (order_id) do update
  set status = 'confirmado',
      confirmation_version = public.qb_order_delivery_confirmations.confirmation_version + 1,
      idempotency_key = excluded.idempotency_key,
      confirmed_by = excluded.confirmed_by,
      confirmed_at = excluded.confirmed_at;

  update public.qb_orders
  set status = 'entregado_pendiente_recibo', delivered_by = v_user_id, delivered_at = now()
  where id = p_order_id;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (v_user_id, 'confirm_qb_matrix_delivery', 'qb_order', p_order_id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'stock_component', 'prepared_only'));
  return p_order_id;
end;
$$;

revoke all on function public.confirm_qb_matrix_delivery(uuid, timestamptz, text)
from public, anon;
grant execute on function public.confirm_qb_matrix_delivery(uuid, timestamptz, text)
to authenticated;

commit;
