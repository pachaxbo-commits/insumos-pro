begin;

-- Keep review state independent from warehouse quantity. A checked line may
-- legitimately contain zero or a partial quantity when the order is fulfilled
-- through an explicit external or same-day-pending origin during Delivery.
create or replace function public.save_qb_matrix_preparation_item(
  p_order_item_id uuid,
  p_expected_version integer,
  p_prepared_quantity numeric,
  p_preparation_check boolean,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_order public.qb_orders%rowtype;
  v_order_item public.qb_order_items%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
  v_item public.qb_order_preparation_items%rowtype;
  v_base numeric(18,6);
  v_status text;
  v_order_updated_at timestamptz;
begin
  select role into v_role from public.profiles where id = v_user_id and is_active = true;
  if v_user_id is null or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para preparar pedidos.';
  end if;
  if p_prepared_quantity is null or p_prepared_quantity < 0
    or length(trim(coalesce(p_idempotency_key, ''))) < 8
    or length(coalesce(p_note, '')) > 500 then
    raise exception 'Datos de preparacion invalidos.';
  end if;

  select * into v_order_item from public.qb_order_items
  where id = p_order_item_id for update;
  if v_order_item.id is null then raise exception 'Linea de pedido no encontrada.'; end if;
  select * into v_order from public.qb_orders where id = v_order_item.order_id for update;
  if v_order.status in ('cancelado', 'entregado_pendiente_recibo', 'recibo_emitido') then
    raise exception 'El pedido ya no admite preparacion.';
  end if;
  if p_prepared_quantity > v_order_item.requested_quantity then
    raise exception 'La preparacion de bodega no puede superar lo solicitado.';
  end if;
  -- preparation_check records that the line was reviewed; it is independent of the physical quantity prepared from warehouse.

  select * into v_preparation from public.qb_order_preparations
  where order_id = v_order.id for update;
  if v_preparation.id is null then
    insert into public.qb_order_preparations (order_id, status, started_by)
    values (v_order.id, 'en_preparacion', v_user_id)
    returning * into v_preparation;
  elsif v_preparation.status <> 'en_preparacion' then
    raise exception 'La preparacion no esta abierta.';
  end if;

  select * into v_item from public.qb_order_preparation_items
  where order_item_id = p_order_item_id for update;
  if v_item.id is null then
    insert into public.qb_order_preparation_items (
      preparation_id, order_item_id, product_id, requested_source_label,
      requested_quantity, requested_base_unit_id, requested_base_unit_symbol,
      requested_base_quantity, status
    ) values (
      v_preparation.id, v_order_item.id, v_order_item.product_id, v_order_item.source_label,
      v_order_item.requested_quantity, v_order_item.base_unit_id, v_order_item.base_unit_symbol,
      v_order_item.base_quantity, 'no_disponible'
    ) returning * into v_item;
  end if;
  if v_item.last_idempotency_key = p_idempotency_key then
    return jsonb_build_object('id', v_item.id, 'row_version', v_item.row_version, 'replayed', true);
  end if;
  if v_item.row_version <> p_expected_version then
    raise exception 'QB_MATRIX_CONFLICT: la preparacion cambio en otro dispositivo.'
      using errcode = '40001';
  end if;

  v_base := round(p_prepared_quantity * v_order_item.conversion_factor_to_base, 6);
  v_status := case
    when p_prepared_quantity = 0 then 'no_disponible'
    when abs(p_prepared_quantity - v_order_item.requested_quantity) <= 0.000001 then 'completo'
    else 'parcial'
  end;

  insert into public.qb_order_line_change_events (
    order_id, order_item_id, customer_account_id, stage, field_name,
    old_value, new_value, unit_label, actor_id, actor_role, correlation_key, idempotency_key
  ) values
    (v_order.id, v_order_item.id, v_order.customer_account_id, 'preparacion', 'prepared_quantity',
      to_jsonb(v_item.actual_quantity), to_jsonb(p_prepared_quantity), v_order_item.source_label,
      v_user_id, v_role, p_idempotency_key, p_idempotency_key),
    (v_order.id, v_order_item.id, v_order.customer_account_id, 'preparacion', 'preparation_check',
      to_jsonb(v_item.preparation_check), to_jsonb(p_preparation_check), null,
      v_user_id, v_role, p_idempotency_key, p_idempotency_key),
    (v_order.id, v_order_item.id, v_order.customer_account_id, 'preparacion', 'preparation_note',
      to_jsonb(v_item.notes), to_jsonb(nullif(trim(coalesce(p_note, '')), '')), null,
      v_user_id, v_role, p_idempotency_key, p_idempotency_key)
  on conflict do nothing;

  update public.qb_order_preparation_items
  set status = v_status,
      actual_allowed_unit_id = case when p_prepared_quantity > 0 then v_order_item.allowed_unit_id else null end,
      actual_source_kind = case when p_prepared_quantity > 0 then v_order_item.source_kind else null end,
      actual_source_unit_id = case when p_prepared_quantity > 0 then v_order_item.source_unit_id else null end,
      actual_product_presentation_id = case when p_prepared_quantity > 0 then v_order_item.product_presentation_id else null end,
      actual_source_label = case when p_prepared_quantity > 0 then v_order_item.source_label else null end,
      actual_quantity = p_prepared_quantity,
      actual_base_unit_id = case when p_prepared_quantity > 0 then v_order_item.base_unit_id else null end,
      actual_base_unit_symbol = case when p_prepared_quantity > 0 then v_order_item.base_unit_symbol else null end,
      actual_base_quantity = v_base,
      conversion_factor_to_base = case when p_prepared_quantity > 0 then v_order_item.conversion_factor_to_base else null end,
      conversion_snapshot_id = case when p_prepared_quantity > 0 then v_order_item.conversion_snapshot_id else null end,
      preparation_check = p_preparation_check,
      notes = nullif(trim(coalesce(p_note, '')), ''),
      prepared_by_line = v_user_id,
      prepared_at_line = now(),
      row_version = row_version + 1,
      last_idempotency_key = p_idempotency_key
  where id = v_item.id
  returning * into v_item;

  update public.qb_orders set status = 'en_preparacion' where id = v_order.id
  returning updated_at into v_order_updated_at;
  return jsonb_build_object(
    'id', v_item.id,
    'row_version', v_item.row_version,
    'status', v_item.status,
    'order_updated_at', v_order_updated_at
  );
end;
$$;

revoke all on function public.save_qb_matrix_preparation_item(uuid, integer, numeric, boolean, text, text) from public, anon;
grant execute on function public.save_qb_matrix_preparation_item(uuid, integer, numeric, boolean, text, text) to authenticated;

commit;