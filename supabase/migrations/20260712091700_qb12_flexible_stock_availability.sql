-- QB-12: make inventory informative and allow deliveries to leave negative stock.

alter table public.products
  drop constraint if exists products_stock_current_check;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_stock_after_check;

create or replace function public.confirm_qb_order_delivery(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_order public.qb_orders%rowtype;
  v_preparation public.qb_order_preparations%rowtype;
  v_item public.qb_order_preparation_items%rowtype;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_movement_id uuid;
  v_delivered_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para confirmar entregas QB.';
  end if;

  select *
  into v_order
  from public.qb_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido QB no encontrado.';
  end if;

  if v_order.status <> 'preparado' then
    raise exception 'Solo se pueden entregar pedidos QB preparados.';
  end if;

  if exists (select 1 from public.qb_order_delivery_movements where order_id = p_order_id) then
    raise exception 'Este pedido QB ya tiene descuento de stock por entrega.';
  end if;

  select *
  into v_preparation
  from public.qb_order_preparations
  where order_id = p_order_id
    and status = 'preparado'
  for update;

  if v_preparation.id is null then
    raise exception 'Preparacion QB no encontrada o no preparada.';
  end if;

  for v_item in
    select *
    from public.qb_order_preparation_items
    where preparation_id = v_preparation.id
    order by created_at, id
  loop
    if v_item.status = 'no_disponible' then
      if v_item.actual_base_quantity <> 0 then
        raise exception 'Linea no disponible con cantidad preparada invalida.';
      end if;
      continue;
    end if;

    if v_item.actual_base_quantity <= 0 or v_item.conversion_factor_to_base is null or v_item.conversion_factor_to_base <= 0 then
      raise exception 'Linea preparada con cantidad o factor invalido.';
    end if;

    if v_item.conversion_snapshot_id is null or not exists (
      select 1
      from public.qb_conversion_snapshots snapshot
      where snapshot.id = v_item.conversion_snapshot_id
        and snapshot.source_table = 'qb_order_preparation_items'
        and snapshot.source_id = v_item.id
        and snapshot.product_id = v_item.product_id
        and abs(snapshot.source_quantity - v_item.actual_quantity) <= 0.001
        and abs(snapshot.base_quantity - v_item.actual_base_quantity) <= 0.001
    ) then
      raise exception 'Snapshot de conversion de preparacion invalido.';
    end if;

    select stock_current
    into v_stock_before
    from public.products product
    where product.id = v_item.product_id
      and product.is_active = true
      and coalesce(product.is_qb_loss_product, false) = false
    for update;

    if v_stock_before is null then
      raise exception 'Producto de entrega no disponible.';
    end if;

    v_stock_after := v_stock_before - v_item.actual_base_quantity;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reason,
      notes,
      created_by
    )
    values (
      v_item.product_id,
      'salida',
      v_item.actual_base_quantity,
      v_stock_before,
      v_stock_after,
      'Entrega QB',
      'Entrega QB pedido ' || p_order_id::text || ', preparacion ' || v_preparation.id::text || ', item ' || v_item.id::text,
      v_user_id
    )
    returning id into v_movement_id;

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;

    insert into public.qb_order_delivery_movements (
      order_id,
      preparation_id,
      preparation_item_id,
      product_id,
      inventory_movement_id,
      delivered_base_quantity,
      delivered_by
    )
    values (
      p_order_id,
      v_preparation.id,
      v_item.id,
      v_item.product_id,
      v_movement_id,
      v_item.actual_base_quantity,
      v_user_id
    );

    v_delivered_count := v_delivered_count + 1;
  end loop;

  if v_delivered_count = 0 then
    raise exception 'No hay cantidades preparadas para entregar.';
  end if;

  update public.qb_orders
  set status = 'entregado_pendiente_recibo',
      delivered_by = v_user_id,
      delivered_at = now()
  where id = p_order_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'confirm_qb_order_delivery',
    'qb_order',
    p_order_id,
    jsonb_build_object(
      'preparation_id', v_preparation.id,
      'movement_count', v_delivered_count
    )
  );

  return p_order_id;
end;
$$;

comment on function public.confirm_qb_order_delivery(uuid) is
  'Confirma una entrega QB, descuenta la cantidad realmente entregada y permite existencia negativa.';
