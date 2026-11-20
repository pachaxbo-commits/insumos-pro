begin;

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
  if v_user_id is null or not coalesce(v_role in ('admin', 'administrador', 'inventario'), false) then
    raise exception 'No tienes permisos para preparar pedidos.';
  end if;
  if p_prepared_quantity is null or p_prepared_quantity not between 0 and 999999999
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

create or replace function private.reconcile_qb_same_day_pending_for_product(
  p_product_id uuid,
  p_operational_date date,
  p_receipt_id uuid default null,
  p_actor_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_stock numeric(18,6);
  v_source record;
  v_request public.qb_same_day_reconciliation_requests%rowtype;
  v_available numeric(18,6);
  v_amount numeric(18,6);
  v_after numeric(18,6);
  v_inventory_movement_id uuid;
  v_allocation_total numeric(18,6) := 0;
begin
  select stock_current into v_stock from public.products
   where id = p_product_id and is_active and coalesce(is_qb_loss_product,false) = false
   for update;
  if v_stock is null then raise exception 'Producto no disponible para conciliación.'; end if;

  for v_source in
    select receipt_movement.id as source_id,
           lot.id as lot_id,
           greatest(least(lot.remaining_quantity, lot.initial_quantity - coalesce(allocated.quantity,0)),0) as available
      from public.qb_merchandise_receipt_movements receipt_movement
      join public.qb_merchandise_receipts receipt on receipt.id = receipt_movement.receipt_id
      join public.inventory_lots lot on lot.source_receipt_movement_id = receipt_movement.id
      left join lateral (
        select sum(allocation.quantity) as quantity
          from public.qb_same_day_reconciliation_allocations allocation
         where allocation.source_receipt_movement_id = receipt_movement.id
      ) allocated on true
     where receipt.status = 'confirmado'
       and (receipt.confirmed_at at time zone 'America/La_Paz')::date = p_operational_date
       and (p_receipt_id is null or receipt.id = p_receipt_id)
       and receipt_movement.product_id = p_product_id
       and receipt_movement.movement_type = 'entrada'
       and receipt_movement.movement_role in ('direct_entry','classified_output')
       and receipt_movement.inventory_movement_id is not null
     order by receipt.confirmed_at, lot.received_at, lot.created_at, receipt_movement.id
     for update of lot
  loop
    v_available := v_source.available;
    while v_available > 0 and v_stock > 0 loop
      select request.* into v_request
        from public.qb_same_day_reconciliation_requests request
        join public.qb_order_delivery_movements delivery on delivery.id = request.delivery_movement_id
       where request.product_id = p_product_id
         and request.operational_date <= p_operational_date
         and request.classification = 'pending'
         and request.pending_quantity - request.reconciled_quantity >= 0.001
       order by delivery.delivered_at, delivery.id, request.id
       limit 1 for update of request;
      exit when not found;

      v_amount := trunc(least(v_available, v_stock, v_request.pending_quantity-v_request.reconciled_quantity), 3);
      exit when v_amount <= 0;
      v_after := v_stock-v_amount;
      insert into public.inventory_movements(
        product_id,movement_type,quantity,stock_before,stock_after,reason,notes,created_by
      ) values (
        p_product_id,'salida',v_amount,v_stock,v_after,'Conciliación de entrega QB',
        'Conciliación ' || v_request.id::text || ', pedido ' || v_request.order_id::text ||
        ', ingreso ' || v_source.source_id::text,p_actor_id
      ) returning id into v_inventory_movement_id;
      update public.products set stock_current = v_after where id = p_product_id;
      insert into public.qb_same_day_reconciliation_allocations(
        request_id,source_receipt_movement_id,inventory_movement_id,quantity,allocated_by
      ) values (
        v_request.id,v_source.source_id,v_inventory_movement_id,v_amount,p_actor_id
      );
      perform private.consume_inventory_fifo_for_reconciliation(
        v_request.delivery_movement_id,v_inventory_movement_id,p_product_id,v_amount
      );

      update public.qb_same_day_reconciliation_requests
         set reconciled_quantity = reconciled_quantity+v_amount,
             status = case when reconciled_quantity+v_amount >= pending_quantity then 'reconciled' else 'partial' end,
             updated_at = now()
       where id = v_request.id;
      v_available := v_available-v_amount;
      v_stock := v_after;
      v_allocation_total := v_allocation_total+v_amount;
    end loop;
  end loop;
  return v_allocation_total;
end;
$$;

create or replace function public.confirm_qb_matrix_delivery_finalization_v1(
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
  v_user uuid := auth.uid();
  v_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
  v_line record;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_inventory_movement uuid;
  v_delivery_movement uuid;
  v_request public.qb_same_day_reconciliation_requests%rowtype;
  v_day date;
  v_source_class text;
  v_source_key text;
  v_warehouse numeric(18,6);
  v_pending numeric(18,6);
begin
  select role into v_role from public.profiles where id=v_user and is_active;
  if v_user is null or not coalesce(v_role in ('admin','administrador','entregador'), false) then
    raise exception 'Solo administración o entrega puede confirmar la entrega.';
  end if;
  select * into v_order from public.qb_orders where id=p_order_id for update;
  if v_order.id is null or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_MATRIX_CONFLICT: el pedido cambió en otro dispositivo.' using errcode='40001';
  end if;
  if v_order.status <> 'preparado' then raise exception 'El pedido debe estar preparado.'; end if;
  select * into v_preparation from public.qb_order_preparations
    where order_id=p_order_id and status='preparado' for update;
  if v_preparation.id is null then raise exception 'Preparación finalizada no encontrada.'; end if;
  if exists (
    select 1 from public.qb_order_items oi
    left join public.qb_order_delivery_items di on di.order_item_id=oi.id
    where oi.order_id=p_order_id and (di.id is null or not di.delivery_check
      or coalesce(oi.conversion_factor_to_base, 0) <= 0)
  ) then raise exception 'Revisa la cantidad real y marca cada producto antes de confirmar.'; end if;

  -- All lines for a product share the same locked balance, including concurrent purchases.
  perform p.id from public.products p
  where p.id in (select product_id from public.qb_order_delivery_items where order_id=p_order_id)
  order by p.id for update;

  for v_line in
    select di.*, prep.preparation_id, oi.base_unit_symbol as requested_base_unit_symbol
      from public.qb_order_delivery_items di
      join public.qb_order_preparation_items prep on prep.id=di.preparation_item_id
      join public.qb_order_items oi on oi.id=di.order_item_id
     where di.order_id=p_order_id order by di.product_id,di.id
  loop
    select movement.id,movement.inventory_movement_id into v_delivery_movement,v_inventory_movement
      from public.qb_order_delivery_movements movement
     where movement.preparation_item_id=v_line.preparation_item_id;
    if not found then
      v_inventory_movement := null;
      select stock_current into v_before from public.products
      where id=v_line.product_id and is_active and not coalesce(is_qb_loss_product,false);
      if v_before is null then raise exception 'Producto de entrega no disponible.'; end if;
      -- The stock ledger uses thousandths. Commercial and measured quantities
      -- retain their separate six-decimal snapshots.
      v_warehouse := least(greatest(v_before,0),round(v_line.delivered_base_quantity,3));
      v_pending := round(v_line.delivered_base_quantity,3)-v_warehouse;

      update public.qb_order_delivery_items
      set warehouse_used_base_quantity=v_warehouse,
          pending_incoming_base_quantity=v_pending,
          external_definitive_base_quantity=0,
          origin_review_base_quantity=0,
          externally_sourced_base_quantity=v_pending,
          externally_sourced_quantity=round(v_pending/v_line.conversion_factor_to_base,6),
          source_origin_confirmed=true
      where id=v_line.id;
      v_line.warehouse_used_base_quantity := v_warehouse;
      v_line.pending_incoming_base_quantity := v_pending;
      v_line.external_definitive_base_quantity := 0;

      if v_warehouse > 0 then
        v_after := v_before-v_warehouse;
        insert into public.inventory_movements(product_id,movement_type,quantity,stock_before,stock_after,reason,notes,created_by)
        values(v_line.product_id,'salida',v_line.warehouse_used_base_quantity,v_before,v_after,'Entrega QB',
          'Componente confirmado desde almacén; pedido '||p_order_id::text,v_user)
        returning id into v_inventory_movement;
        update public.products set stock_current=v_after where id=v_line.product_id;
      end if;
      insert into public.qb_order_delivery_movements(
        order_id,preparation_id,preparation_item_id,product_id,inventory_movement_id,
        delivered_base_quantity,warehouse_base_quantity,delivery_item_id,delivered_by,delivered_at
      ) values(
        p_order_id,v_line.preparation_id,v_line.preparation_item_id,v_line.product_id,v_inventory_movement,
        v_line.delivered_base_quantity,v_line.warehouse_used_base_quantity,v_line.id,v_user,now()
      ) returning id into v_delivery_movement;
    else
      update public.qb_order_delivery_movements set
        delivered_base_quantity=v_line.delivered_base_quantity,
        warehouse_base_quantity=v_line.warehouse_used_base_quantity,
        delivery_item_id=v_line.id,delivered_by=v_user,delivered_at=now()
      where id=v_delivery_movement;
    end if;

    if v_line.pending_incoming_base_quantity > 0 or v_line.external_definitive_base_quantity > 0 then
      v_day := (coalesce((select delivered_at from public.qb_order_delivery_movements where id=v_delivery_movement),now()) at time zone 'America/La_Paz')::date;
      v_source_class := case when v_line.pending_incoming_base_quantity > 0 then 'pending' else 'external_definitive' end;
      v_source_key := 'delivery-origin-'||v_delivery_movement::text;
      select * into v_request from public.qb_same_day_reconciliation_requests where delivery_movement_id=v_delivery_movement for update;
      if v_request.id is null then
        insert into public.qb_same_day_reconciliation_requests(
          delivery_movement_id,delivery_item_id,order_id,product_id,operational_date,
          delivered_base_quantity,warehouse_base_quantity,externally_sourced_base_quantity,
          pending_quantity,reconciled_quantity,classification,status,classification_note,idempotency_key,classified_by
        ) values(
          v_delivery_movement,v_line.id,p_order_id,v_line.product_id,v_day,
          v_line.delivered_base_quantity,v_line.warehouse_used_base_quantity,
          v_line.pending_incoming_base_quantity+v_line.external_definitive_base_quantity,
          v_line.pending_incoming_base_quantity,0,v_source_class,v_source_class,
          'Origen registrado al confirmar la entrega.',v_source_key,v_user
        ) returning * into v_request;
        insert into public.qb_same_day_reconciliation_events(request_id,classification,pending_quantity,note,idempotency_key,actor_id)
        values(v_request.id,v_source_class,v_line.pending_incoming_base_quantity,
          'Origen registrado al confirmar la entrega.',v_source_key||'-event',v_user);
      elsif v_request.product_id<>v_line.product_id
        or v_request.delivered_base_quantity<>v_line.delivered_base_quantity
        or v_request.warehouse_base_quantity<>v_line.warehouse_used_base_quantity
        or v_request.pending_quantity<>v_line.pending_incoming_base_quantity then
        raise exception 'El origen de esta entrega ya tiene conciliación registrada; una corrección requiere el procedimiento auditado.';
      end if;
    end if;
  end loop;

  insert into public.qb_order_delivery_confirmations(order_id,status,idempotency_key,confirmed_by,confirmed_at)
  values(p_order_id,'confirmado',p_idempotency_key,v_user,now())
  on conflict(order_id) do update set status='confirmado',
    confirmation_version=public.qb_order_delivery_confirmations.confirmation_version+1,
    idempotency_key=excluded.idempotency_key,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at;
  update public.qb_orders set status='entregado_pendiente_recibo',delivered_by=v_user,delivered_at=now()
    where id=p_order_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values(v_user,'confirm_qb_matrix_delivery','qb_order',p_order_id,
    jsonb_build_object('idempotency_key',p_idempotency_key,'source_distribution','automatic'));
  return p_order_id;
end;
$$;

commit;
