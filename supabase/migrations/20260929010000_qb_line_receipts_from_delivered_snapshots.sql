-- New line-priced receipts use confirmed delivery snapshots. A product may
-- become inactive after delivery, and its catalog QB price is not the cost
-- entered later for this receipt.
begin;

create or replace function public.create_qb_receipt_line_draft(
  p_customer_account_id uuid, p_order_ids uuid[]
) returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_expected_count integer;
  v_found_count integer;
  v_receipt_id uuid;
  v_receipt_number text;
  v_line_count integer;
begin
  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador') then
    raise exception 'No tienes permisos para crear recibos QB.';
  end if;

  v_expected_count := coalesce(array_length(p_order_ids, 1), 0);
  if p_customer_account_id is null or v_expected_count = 0 then
    raise exception 'Selecciona cliente y pedidos entregados.';
  end if;

  select count(distinct id) into v_found_count
  from public.qb_orders where id = any(p_order_ids);
  if v_found_count <> v_expected_count then
    raise exception 'Uno o mas pedidos QB no existen o estan repetidos.';
  end if;

  if not exists (
    select 1 from public.customer_accounts customer
    where customer.id = p_customer_account_id and customer.is_active = true
  ) then
    raise exception 'Cliente QB no disponible.';
  end if;

  perform 1 from public.qb_orders orders
  where orders.id = any(p_order_ids) for update;

  if exists (
    select 1 from public.qb_orders orders
    where orders.id = any(p_order_ids)
      and (orders.customer_account_id <> p_customer_account_id
        or orders.status <> 'entregado_pendiente_recibo')
  ) then
    raise exception 'Solo puedes incluir pedidos entregados pendientes de recibo del mismo cliente.';
  end if;

  if exists (
    select 1 from public.qb_receipt_orders receipt_order
    where receipt_order.order_id = any(p_order_ids)
      and receipt_order.inclusion_status in ('borrador', 'emitido')
  ) then
    raise exception 'Uno o mas pedidos ya estan incluidos en un recibo activo.';
  end if;

  if exists (
    select 1 from public.qb_orders orders
    where orders.id = any(p_order_ids)
      and not exists (
        select 1 from public.qb_order_delivery_movements movement
        where movement.order_id = orders.id
      )
  ) then
    raise exception 'Todos los pedidos deben tener entrega QB-6 confirmada.';
  end if;

  -- A technical loss product is never chargeable. Inactive products remain
  -- eligible when they were delivered before catalog deactivation.
  if exists (
    select 1 from public.qb_orders orders
    join public.qb_order_preparations preparation on preparation.order_id = orders.id
    join public.qb_order_preparation_items item on item.preparation_id = preparation.id
    join public.qb_order_delivery_movements movement on movement.preparation_item_id = item.id
    join public.products product on product.id = item.product_id
    where orders.id = any(p_order_ids)
      and item.status in ('completo', 'parcial')
      and movement.delivered_base_quantity > 0
      and coalesce(product.is_qb_loss_product, false) = true
  ) then
    raise exception 'Los productos de merma no pueden incluirse en un recibo.';
  end if;

  v_receipt_number := 'QBR-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.qb_receipts (
    receipt_number, customer_account_id, period_start, period_end,
    created_by, pricing_mode
  )
  select v_receipt_number, p_customer_account_id,
    min(coalesce(orders.delivered_at, orders.submitted_at))::date,
    max(coalesce(orders.delivered_at, orders.submitted_at))::date,
    v_user_id, 'line_cost_markup'
  from public.qb_orders orders where orders.id = any(p_order_ids)
  returning id into v_receipt_id;

  insert into public.qb_receipt_orders (
    receipt_id, order_id, customer_account_id
  )
  select v_receipt_id, orders.id, orders.customer_account_id
  from public.qb_orders orders where orders.id = any(p_order_ids)
  order by orders.submitted_at, orders.id;

  update public.qb_orders set status = 'incluido_en_recibo_borrador'
  where id = any(p_order_ids);

  insert into public.qb_receipt_lines (
    receipt_id, receipt_order_id, order_id, preparation_item_id,
    product_id, product_name_snapshot, product_code_snapshot,
    category_name_snapshot, delivered_base_quantity, base_unit_id,
    base_unit_symbol, visible_unit_label, conversion_snapshot_id,
    original_base_price, base_price_used, final_unit_price, line_total
  )
  select v_receipt_id, receipt_order.id, orders.id, item.id,
    product.id, product.name, product.sku, category.name,
    movement.delivered_base_quantity, item.actual_base_unit_id,
    coalesce(item.actual_base_unit_symbol, item.requested_base_unit_symbol),
    coalesce(item.actual_source_label, item.actual_base_unit_symbol,
      item.requested_base_unit_symbol),
    item.conversion_snapshot_id,
    case when settings.base_sale_price is not null
      and settings.base_sale_price::text not in ('NaN', 'Infinity', '-Infinity')
      and settings.base_sale_price >= 0 then settings.base_sale_price else null end,
    null, null, null
  from public.qb_receipt_orders receipt_order
  join public.qb_orders orders on orders.id = receipt_order.order_id
  join public.qb_order_preparations preparation on preparation.order_id = orders.id
  join public.qb_order_preparation_items item on item.preparation_id = preparation.id
  join public.qb_order_delivery_movements movement on movement.preparation_item_id = item.id
  join public.products product on product.id = item.product_id
  left join public.product_categories category on category.id = product.category_id
  left join public.qb_product_unit_settings settings on settings.product_id = product.id
  where receipt_order.receipt_id = v_receipt_id
    and receipt_order.inclusion_status = 'borrador'
    and item.status in ('completo', 'parcial')
    and movement.delivered_base_quantity > 0
    and coalesce(product.is_qb_loss_product, false) = false
  order by orders.submitted_at, item.created_at;
  get diagnostics v_line_count = row_count;

  if v_line_count = 0 then
    raise exception 'No hay lineas entregadas cobrables para el recibo QB.';
  end if;

  perform public.recalculate_qb_receipt_totals(v_receipt_id);
  insert into public.qb_receipt_events (receipt_id, event_type, metadata, created_by)
  values (v_receipt_id, 'creado',
    jsonb_build_object('order_count', v_expected_count), v_user_id);
  return v_receipt_id;
end;
$$;

revoke all on function public.create_qb_receipt_line_draft(uuid,uuid[])
  from public, anon, authenticated;
grant execute on function public.create_qb_receipt_line_draft(uuid,uuid[])
  to authenticated;

commit;
