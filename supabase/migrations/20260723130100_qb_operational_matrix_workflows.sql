-- Matriz operativa: RPCs atomicas, versionadas e idempotentes.

begin;

create or replace function public.reorder_qb_operational_day_orders(
  p_operational_date date,
  p_order_ids uuid[],
  p_expected_versions jsonb,
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
  v_count integer;
begin
  select role into v_role from public.profiles
  where id = v_user_id and is_active = true;
  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo administracion puede reordenar la matriz.';
  end if;
  if p_operational_date is null or coalesce(array_length(p_order_ids, 1), 0) = 0
    or length(trim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'Solicitud de reordenamiento invalida.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('qb-operational-day:' || p_operational_date::text, 0));
  perform 1
  from public.qb_operational_day_orders day_order
  where day_order.operational_date = p_operational_date
    and day_order.order_id = any(p_order_ids)
  for update;
  select count(*) into v_count
  from public.qb_operational_day_orders day_order
  where day_order.operational_date = p_operational_date
    and day_order.order_id = any(p_order_ids);

  if v_count <> array_length(p_order_ids, 1)
    or v_count <> (
      select count(*) from public.qb_operational_day_orders
      where operational_date = p_operational_date
    )
    or v_count <> (select count(distinct value) from unnest(p_order_ids) value) then
    raise exception 'La lista no coincide con las ordenes de la fecha.';
  end if;
  if exists (
    select 1
    from public.qb_operational_day_orders day_order
    where day_order.operational_date = p_operational_date
      and day_order.order_id = any(p_order_ids)
      and day_order.row_version <> coalesce((p_expected_versions ->> day_order.order_id::text)::integer, -1)
  ) then
    raise exception 'QB_MATRIX_CONFLICT: el orden cambio en otro dispositivo.'
      using errcode = '40001';
  end if;

  set constraints qb_operational_day_orders_date_position_unique deferred;

  update public.qb_operational_day_orders day_order
  set position = ordered.position,
      row_version = day_order.row_version + 1,
      ordered_by = v_user_id,
      ordered_at = now(),
      last_idempotency_key = p_idempotency_key
  from (
    select value as order_id, ordinality::integer as position
    from unnest(p_order_ids) with ordinality
  ) ordered
  where day_order.order_id = ordered.order_id
    and day_order.operational_date = p_operational_date;

  insert into public.audit_logs (user_id, action, entity_type, metadata)
  values (
    v_user_id, 'reorder_qb_operational_day_orders', 'qb_operational_day',
    jsonb_build_object('date', p_operational_date, 'order_ids', p_order_ids, 'idempotency_key', p_idempotency_key)
  );
  return jsonb_build_object('date', p_operational_date, 'count', v_count);
end;
$$;

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
  if p_preparation_check and abs(p_prepared_quantity - v_order_item.requested_quantity) > 0.000001 then
    raise exception 'El check completo exige preparar exactamente lo solicitado.';
  end if;

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

create or replace function public.finalize_qb_matrix_preparation(
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
begin
  select role into v_role from public.profiles where id = v_user_id and is_active = true;
  if v_user_id is null or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para finalizar preparacion.';
  end if;
  select * into v_order from public.qb_orders where id = p_order_id for update;
  if v_order.id is null or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_MATRIX_CONFLICT: el pedido cambio en otro dispositivo.' using errcode = '40001';
  end if;
  select * into v_preparation from public.qb_order_preparations where order_id = p_order_id for update;
  if v_preparation.id is null or v_preparation.status <> 'en_preparacion' then
    raise exception 'La preparacion no esta abierta.';
  end if;
  if exists (
    select 1 from public.qb_order_items order_item
    left join public.qb_order_preparation_items item on item.order_item_id = order_item.id
    where order_item.order_id = p_order_id and item.prepared_at_line is null
  ) then raise exception 'Debes revisar todas las lineas antes de finalizar.'; end if;

  update public.qb_order_preparations
  set status = 'preparado', prepared_by = v_user_id, prepared_at = now()
  where id = v_preparation.id;
  update public.qb_orders set status = 'preparado' where id = p_order_id;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (v_user_id, 'finalize_qb_matrix_preparation', 'qb_order', p_order_id,
    jsonb_build_object('idempotency_key', p_idempotency_key));
  return p_order_id;
end;
$$;

create or replace function public.save_qb_matrix_delivery_item(
  p_order_item_id uuid,
  p_expected_version integer,
  p_externally_sourced_quantity numeric,
  p_delivered_quantity numeric,
  p_delivery_check boolean,
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
  v_preparation_item public.qb_order_preparation_items%rowtype;
  v_item public.qb_order_delivery_items%rowtype;
begin
  select role into v_role from public.profiles where id = v_user_id and is_active = true;
  if v_user_id is null or v_role not in ('admin', 'administrador', 'entregador') then
    raise exception 'Solo administracion o entrega puede registrar la entrega.';
  end if;
  if p_externally_sourced_quantity is null or p_externally_sourced_quantity < 0
    or p_delivered_quantity is null or p_delivered_quantity < 0
    or length(trim(coalesce(p_idempotency_key, ''))) < 8
    or length(coalesce(p_note, '')) > 500 then
    raise exception 'Datos de entrega invalidos.';
  end if;

  select * into v_order_item from public.qb_order_items where id = p_order_item_id for update;
  if v_order_item.id is null then raise exception 'Linea de pedido no encontrada.'; end if;
  select * into v_order from public.qb_orders where id = v_order_item.order_id for update;
  if v_order.status <> 'preparado' then raise exception 'El pedido debe estar preparado.'; end if;
  select item.* into v_preparation_item
  from public.qb_order_preparation_items item
  join public.qb_order_preparations prep on prep.id = item.preparation_id
  where item.order_item_id = p_order_item_id and prep.status = 'preparado'
  for update of item;
  if v_preparation_item.id is null then raise exception 'Linea de preparacion no encontrada.'; end if;
  if p_delivered_quantity > v_preparation_item.actual_quantity + p_externally_sourced_quantity then
    raise exception 'La entrega no puede superar bodega mas abastecimiento externo.';
  end if;
  if p_delivery_check
    and abs(p_delivered_quantity - v_order_item.requested_quantity) > 0.000001
    and length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Explica la diferencia entre solicitado y entregado.';
  end if;

  insert into public.qb_order_delivery_items (
    order_id, order_item_id, preparation_item_id, product_id, source_label,
    base_unit_id, base_unit_symbol, conversion_factor_to_base,
    prepared_quantity_snapshot, prepared_base_quantity_snapshot
  ) values (
    v_order.id, v_order_item.id, v_preparation_item.id, v_order_item.product_id,
    v_order_item.source_label, v_order_item.base_unit_id, v_order_item.base_unit_symbol,
    v_order_item.conversion_factor_to_base, v_preparation_item.actual_quantity,
    v_preparation_item.actual_base_quantity
  ) on conflict (order_item_id) do nothing;

  select * into v_item from public.qb_order_delivery_items
  where order_item_id = p_order_item_id for update;
  if v_item.last_idempotency_key = p_idempotency_key then
    return jsonb_build_object('id', v_item.id, 'row_version', v_item.row_version, 'replayed', true);
  end if;
  if v_item.row_version <> p_expected_version then
    raise exception 'QB_MATRIX_CONFLICT: la entrega cambio en otro dispositivo.' using errcode = '40001';
  end if;

  insert into public.qb_order_line_change_events (
    order_id, order_item_id, customer_account_id, stage, field_name, old_value, new_value,
    unit_label, actor_id, actor_role, correlation_key, idempotency_key
  ) values
    (v_order.id, v_order_item.id, v_order.customer_account_id, 'entrega', 'externally_sourced_quantity',
      to_jsonb(v_item.externally_sourced_quantity), to_jsonb(p_externally_sourced_quantity), v_order_item.source_label,
      v_user_id, v_role, p_idempotency_key, p_idempotency_key),
    (v_order.id, v_order_item.id, v_order.customer_account_id, 'entrega', 'delivered_quantity',
      to_jsonb(v_item.delivered_quantity), to_jsonb(p_delivered_quantity), v_order_item.source_label,
      v_user_id, v_role, p_idempotency_key, p_idempotency_key),
    (v_order.id, v_order_item.id, v_order.customer_account_id, 'entrega', 'delivery_check',
      to_jsonb(v_item.delivery_check), to_jsonb(p_delivery_check), null,
      v_user_id, v_role, p_idempotency_key, p_idempotency_key),
    (v_order.id, v_order_item.id, v_order.customer_account_id, 'entrega', 'delivery_note',
      to_jsonb(v_item.delivery_note), to_jsonb(nullif(trim(coalesce(p_note, '')), '')), null,
      v_user_id, v_role, p_idempotency_key, p_idempotency_key)
  on conflict do nothing;

  update public.qb_order_delivery_items
  set externally_sourced_quantity = p_externally_sourced_quantity,
      externally_sourced_base_quantity = round(p_externally_sourced_quantity * conversion_factor_to_base, 6),
      externally_sourced_by = v_user_id,
      externally_sourced_at = now(),
      delivered_quantity = p_delivered_quantity,
      delivered_base_quantity = round(p_delivered_quantity * conversion_factor_to_base, 6),
      delivery_check = p_delivery_check,
      delivery_note = nullif(trim(coalesce(p_note, '')), ''),
      delivered_by = v_user_id,
      delivered_at = now(),
      row_version = row_version + 1,
      last_idempotency_key = p_idempotency_key
  where id = v_item.id returning * into v_item;
  return jsonb_build_object(
    'id', v_item.id,
    'row_version', v_item.row_version,
    'order_updated_at', v_order.updated_at
  );
end;
$$;

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

  select * into v_confirmation from public.qb_order_delivery_confirmations
  where order_id = p_order_id for update;
  if v_confirmation.status = 'confirmado' then
    return p_order_id;
  end if;
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

create or replace function public.reopen_qb_matrix_delivery(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
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
begin
  select role into v_role from public.profiles where id = v_user_id and is_active = true;
  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo administracion puede reabrir entregas.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Indica el motivo de reapertura.'; end if;
  select * into v_order from public.qb_orders where id = p_order_id for update;
  if v_order.id is null or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_MATRIX_CONFLICT: el pedido cambio en otro dispositivo.' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.qb_receipt_orders receipt_order
    join public.qb_receipts receipt on receipt.id = receipt_order.receipt_id
    where receipt_order.order_id = p_order_id and receipt.status <> 'borrador'
  ) then raise exception 'No se puede reabrir una entrega incluida en un recibo emitido.'; end if;
  update public.qb_order_delivery_confirmations
  set status = 'reabierto', reopened_by = v_user_id, reopened_at = now(),
      reopen_reason = trim(p_reason), idempotency_key = p_idempotency_key
  where order_id = p_order_id and status = 'confirmado';
  if not found then raise exception 'Entrega confirmada no encontrada.'; end if;
  update public.qb_orders set status = 'preparado', delivered_by = null, delivered_at = null
  where id = p_order_id;
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (v_user_id, 'reopen_qb_matrix_delivery', 'qb_order', p_order_id,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'stock_restored', false, 'reason', trim(p_reason)));
  return p_order_id;
end;
$$;

create or replace function public.admin_update_qb_requested_quantity(
  p_order_item_id uuid,
  p_expected_version integer,
  p_requested_quantity numeric,
  p_reason text,
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
  v_item public.qb_order_items%rowtype;
  v_order_updated_at timestamptz;
  v_has_downstream boolean;
begin
  select role into v_role from public.profiles where id = v_user_id and is_active = true;
  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo administracion puede corregir lo solicitado.';
  end if;
  if p_requested_quantity is null or p_requested_quantity <= 0
    or length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Correccion invalida.'; end if;
  select * into v_item from public.qb_order_items where id = p_order_item_id for update;
  if v_item.id is null or v_item.row_version <> p_expected_version then
    raise exception 'QB_MATRIX_CONFLICT: la solicitud cambio en otro dispositivo.' using errcode = '40001';
  end if;
  select * into v_order from public.qb_orders where id = v_item.order_id for update;
  if v_item.order_input_mode <> 'quantity' then
    raise exception 'Las lineas por monto no admiten correccion de cantidad en la matriz.';
  end if;
  if exists (
    select 1 from public.qb_receipt_orders receipt_order
    join public.qb_receipts receipt on receipt.id = receipt_order.receipt_id
    where receipt_order.order_id = v_order.id and receipt.status <> 'borrador'
  ) then raise exception 'El pedido ya pertenece a un recibo emitido.'; end if;
  select exists (
    select 1 from public.qb_order_preparation_items where order_item_id = v_item.id
    union all
    select 1 from public.qb_order_delivery_items where order_item_id = v_item.id
  ) into v_has_downstream;
  if exists (
    select 1 from public.qb_order_line_change_events event
    where event.order_item_id = p_order_item_id and event.stage = 'solicitud'
      and event.field_name = 'requested_quantity' and event.idempotency_key = p_idempotency_key
  ) then
    return jsonb_build_object('id', v_item.id, 'row_version', v_item.row_version, 'replayed', true);
  end if;
  insert into public.qb_order_line_change_events (
    order_id, order_item_id, customer_account_id, stage, field_name, old_value, new_value,
    unit_label, actor_id, actor_role, reason, correlation_key, idempotency_key
  ) values (
    v_order.id, v_item.id, v_order.customer_account_id, 'solicitud', 'requested_quantity',
    to_jsonb(v_item.requested_quantity), to_jsonb(p_requested_quantity), v_item.source_label,
    v_user_id, v_role, trim(p_reason), p_idempotency_key, p_idempotency_key
  );
  update public.qb_order_items
  set requested_quantity = p_requested_quantity,
      base_quantity = round(p_requested_quantity * conversion_factor_to_base, 6),
      row_version = row_version + 1
  where id = v_item.id returning * into v_item;
  update public.qb_orders set updated_at = now() where id = v_order.id
  returning updated_at into v_order_updated_at;
  return jsonb_build_object(
    'id', v_item.id,
    'row_version', v_item.row_version,
    'order_updated_at', v_order_updated_at,
    'warning', case when v_has_downstream
      then 'Ya existe preparacion o entrega; revisa las diferencias.'
      else null end
  );
end;
$$;

-- Compatibilidad de /pedidos: la confirmacion antigua delega al contrato nuevo.
create or replace function public.confirm_qb_order_delivery_versioned(
  p_order_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language sql
security definer
set search_path = pg_catalog
as $$
  select public.confirm_qb_matrix_delivery(
    p_order_id,
    p_expected_updated_at,
    'legacy-pedidos-' || p_order_id::text || '-' || extract(epoch from p_expected_updated_at)::text
  );
$$;

revoke all on function public.reorder_qb_operational_day_orders(date, uuid[], jsonb, text) from public, anon;
revoke all on function public.save_qb_matrix_preparation_item(uuid, integer, numeric, boolean, text, text) from public, anon;
revoke all on function public.finalize_qb_matrix_preparation(uuid, timestamptz, text) from public, anon;
revoke all on function public.save_qb_matrix_delivery_item(uuid, integer, numeric, numeric, boolean, text, text) from public, anon;
revoke all on function public.confirm_qb_matrix_delivery(uuid, timestamptz, text) from public, anon;
revoke all on function public.reopen_qb_matrix_delivery(uuid, timestamptz, text, text) from public, anon;
revoke all on function public.admin_update_qb_requested_quantity(uuid, integer, numeric, text, text) from public, anon;
revoke all on function public.confirm_qb_order_delivery_versioned(uuid, timestamptz) from public, anon;
revoke all on function public.confirm_qb_order_delivery(uuid) from public, anon, authenticated;
grant execute on function public.reorder_qb_operational_day_orders(date, uuid[], jsonb, text) to authenticated;
grant execute on function public.save_qb_matrix_preparation_item(uuid, integer, numeric, boolean, text, text) to authenticated;
grant execute on function public.finalize_qb_matrix_preparation(uuid, timestamptz, text) to authenticated;
grant execute on function public.save_qb_matrix_delivery_item(uuid, integer, numeric, numeric, boolean, text, text) to authenticated;
grant execute on function public.confirm_qb_matrix_delivery(uuid, timestamptz, text) to authenticated;
grant execute on function public.reopen_qb_matrix_delivery(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.admin_update_qb_requested_quantity(uuid, integer, numeric, text, text) to authenticated;
grant execute on function public.confirm_qb_order_delivery_versioned(uuid, timestamptz) to authenticated;

commit;
