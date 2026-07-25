-- Entrega registra la verdad final recibida por el cliente.
-- Si Inventario dejó una línea sin tocar, se interpreta como preparación cero
-- y el entregador puede completar igualmente la cantidad o el peso real.

begin;

alter function public.save_qb_matrix_delivery_item_with_weight(
  uuid, integer, numeric, numeric, boolean, numeric, text, text
) rename to save_qb_matrix_delivery_item_with_weight_v2;

create function public.save_qb_matrix_delivery_item_with_weight(
  p_order_item_id uuid,
  p_expected_version integer,
  p_externally_sourced_quantity numeric,
  p_delivered_quantity numeric,
  p_delivery_check boolean,
  p_actual_weight_kg numeric,
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
begin
  select profile.role
  into v_role
  from public.profiles profile
  where profile.id = v_user_id
    and profile.is_active = true;

  if v_user_id is null
    or v_role not in ('admin', 'administrador', 'entregador')
  then
    raise exception 'Solo administración o entrega puede registrar la entrega.';
  end if;

  select *
  into v_order_item
  from public.qb_order_items item
  where item.id = p_order_item_id;

  if v_order_item.id is null then
    raise exception 'Línea de pedido no encontrada.';
  end if;

  select *
  into v_order
  from public.qb_orders orders
  where orders.id = v_order_item.order_id
  for update;

  if v_order.status not in (
    'pendiente_preparacion',
    'en_preparacion',
    'preparado'
  ) then
    raise exception 'El pedido ya no admite cambios de entrega.';
  end if;

  insert into public.qb_order_preparations (
    order_id,
    status,
    started_by
  )
  values (
    v_order.id,
    'en_preparacion',
    null
  )
  on conflict (order_id) do nothing;

  select *
  into v_preparation
  from public.qb_order_preparations preparation
  where preparation.order_id = v_order.id
  for update;

  if v_preparation.status = 'cancelado' then
    raise exception 'La preparación está cancelada.';
  end if;

  insert into public.qb_order_preparation_items (
    preparation_id,
    order_item_id,
    product_id,
    requested_source_label,
    requested_quantity,
    requested_base_unit_id,
    requested_base_unit_symbol,
    requested_base_quantity,
    status,
    actual_quantity,
    actual_base_quantity,
    preparation_check,
    prepared_at_line
  )
  values (
    v_preparation.id,
    v_order_item.id,
    v_order_item.product_id,
    v_order_item.source_label,
    v_order_item.requested_quantity,
    v_order_item.base_unit_id,
    v_order_item.base_unit_symbol,
    v_order_item.base_quantity,
    'no_disponible',
    0,
    0,
    false,
    now()
  )
  on conflict (order_item_id) do update
  set prepared_at_line = coalesce(
    public.qb_order_preparation_items.prepared_at_line,
    excluded.prepared_at_line
  );

  return public.save_qb_matrix_delivery_item_with_weight_v2(
    p_order_item_id,
    p_expected_version,
    p_externally_sourced_quantity,
    p_delivered_quantity,
    p_delivery_check,
    p_actual_weight_kg,
    p_note,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.save_qb_matrix_delivery_item_with_weight(
  uuid, integer, numeric, numeric, boolean, numeric, text, text
) from public, anon;

grant execute on function public.save_qb_matrix_delivery_item_with_weight(
  uuid, integer, numeric, numeric, boolean, numeric, text, text
) to authenticated;

comment on function public.save_qb_matrix_delivery_item_with_weight(
  uuid, integer, numeric, numeric, boolean, numeric, text, text
) is
  'Guarda la entrega final aun cuando Inventario no haya revisado la línea; en ese caso crea una preparación cero auditable.';

commit;
