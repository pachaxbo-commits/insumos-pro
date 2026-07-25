-- Flujo básico: preparación en tiempo real, peso real exclusivo de Entrega
-- y cantidades operativas en incrementos de 0.5.

begin;

update public.products
set
  catalog_min_quantity = greatest(catalog_min_quantity, 0.5),
  catalog_quantity_step = 0.5
where is_sellable = true;

update public.qb_product_allowed_units
set
  min_quantity = greatest(min_quantity, 0.5),
  quantity_step = 0.5
where usage_context in ('pedido', 'inventario');

comment on column public.qb_order_preparation_items.actual_weight_kg is
  'Campo legado. Inventario registra cantidad, check y observación; el peso real se captura únicamente en entrega.';

alter function public.save_qb_matrix_delivery_item(
  uuid, integer, numeric, numeric, boolean, text, text
) rename to save_qb_matrix_delivery_item_finalization_v1;

create function public.save_qb_matrix_delivery_item(
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
  v_order_id uuid;
  v_original_order_status text;
  v_preparation_id uuid;
  v_original_preparation_status text;
  v_result jsonb;
  v_order_updated_at timestamptz;
begin
  select item.order_id, orders.status
  into v_order_id, v_original_order_status
  from public.qb_order_items item
  join public.qb_orders orders on orders.id = item.order_id
  where item.id = p_order_item_id
  for update of orders;

  if v_order_id is null then
    raise exception 'Línea de pedido no encontrada.';
  end if;

  if v_original_order_status in ('pendiente_preparacion', 'en_preparacion') then
    select preparation.id, preparation.status
    into v_preparation_id, v_original_preparation_status
    from public.qb_order_preparations preparation
    where preparation.order_id = v_order_id
    for update;

    if v_preparation_id is null
      or v_original_preparation_status <> 'en_preparacion'
      or not exists (
        select 1
        from public.qb_order_preparation_items preparation_item
        where preparation_item.order_item_id = p_order_item_id
          and preparation_item.prepared_at_line is not null
      )
    then
      raise exception 'Inventario todavía no revisó esta línea.';
    end if;

    update public.qb_order_preparations
    set status = 'preparado'
    where id = v_preparation_id;

    update public.qb_orders
    set status = 'preparado'
    where id = v_order_id;
  elsif v_original_order_status <> 'preparado' then
    raise exception 'El pedido ya no admite cambios de entrega.';
  end if;

  v_result := public.save_qb_matrix_delivery_item_finalization_v1(
    p_order_item_id,
    p_expected_version,
    p_externally_sourced_quantity,
    p_delivered_quantity,
    p_delivery_check,
    p_note,
    p_idempotency_key
  );

  if v_original_order_status in ('pendiente_preparacion', 'en_preparacion') then
    update public.qb_order_preparations
    set status = v_original_preparation_status
    where id = v_preparation_id;

    update public.qb_orders
    set status = v_original_order_status
    where id = v_order_id
    returning updated_at into v_order_updated_at;

    v_result := v_result || jsonb_build_object(
      'order_updated_at',
      v_order_updated_at
    );
  end if;

  return v_result;
end;
$$;

alter function public.save_qb_matrix_delivery_item_with_weight(
  uuid, integer, numeric, numeric, boolean, numeric, text, text
) rename to save_qb_matrix_delivery_item_with_weight_v1;

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
  v_preparation_item public.qb_order_preparation_items%rowtype;
  v_controls_actual_weight boolean;
  v_effective_weight numeric;
  v_result jsonb;
begin
  select preparation_item.*
  into v_preparation_item
  from public.qb_order_preparation_items preparation_item
  where preparation_item.order_item_id = p_order_item_id;

  if v_preparation_item.id is null
    or v_preparation_item.prepared_at_line is null
  then
    raise exception 'Inventario todavía no revisó esta línea.';
  end if;

  select coalesce(product.controls_actual_weight, false)
  into v_controls_actual_weight
  from public.products product
  where product.id = v_preparation_item.product_id;

  if v_controls_actual_weight then
    v_effective_weight := p_actual_weight_kg;
    if v_effective_weight is null
      and v_preparation_item.preparation_check
      and length(trim(coalesce(v_preparation_item.notes, ''))) = 0
    then
      v_effective_weight := v_preparation_item.actual_quantity;
    end if;

    if v_effective_weight is null then
      raise exception 'Entrega debe registrar el peso real de esta línea.';
    end if;
    if v_effective_weight < 0 then
      raise exception 'El peso real no puede ser negativo.';
    end if;
    if v_effective_weight < v_preparation_item.actual_quantity
      and length(trim(coalesce(p_note, ''))) < 3
    then
      raise exception 'Explica por qué el peso real es menor a la cantidad preparada.';
    end if;
  else
    v_effective_weight := null;
  end if;

  v_result := public.save_qb_matrix_delivery_item_with_weight_v1(
    p_order_item_id,
    p_expected_version,
    p_externally_sourced_quantity,
    p_delivered_quantity,
    p_delivery_check,
    v_effective_weight,
    p_note,
    p_idempotency_key
  );

  if v_controls_actual_weight then
    update public.qb_order_delivery_items
    set delivered_base_quantity = round(v_effective_weight, 6)
    where order_item_id = p_order_item_id;

    v_result := v_result || jsonb_build_object(
      'actual_weight_kg',
      v_effective_weight,
      'delivered_base_quantity',
      round(v_effective_weight, 6)
    );
  end if;

  return v_result;
end;
$$;

create or replace function public.sync_qb_delivery_preparation_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.qb_order_delivery_items
  set
    prepared_quantity_snapshot = new.actual_quantity,
    prepared_base_quantity_snapshot = new.actual_base_quantity
  where preparation_item_id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_qb_delivery_preparation_snapshot
  on public.qb_order_preparation_items;
create trigger sync_qb_delivery_preparation_snapshot
after update of actual_quantity, actual_base_quantity
on public.qb_order_preparation_items
for each row execute function public.sync_qb_delivery_preparation_snapshot();

alter function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) rename to confirm_qb_matrix_delivery_finalization_v1;

create function public.confirm_qb_matrix_delivery(
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
  v_prepared_updated_at timestamptz;
begin
  select role into v_role
  from public.profiles
  where id = v_user_id and is_active = true;
  if v_user_id is null
    or v_role not in ('admin', 'administrador', 'entregador')
  then
    raise exception 'Solo administración o entrega puede confirmar la entrega.';
  end if;

  if exists (
    select 1
    from public.qb_order_delivery_confirmations confirmation
    where confirmation.order_id = p_order_id
      and confirmation.status = 'confirmado'
      and confirmation.idempotency_key = p_idempotency_key
  ) then
    return p_order_id;
  end if;

  select * into v_order
  from public.qb_orders
  where id = p_order_id
  for update;
  if v_order.id is null
    or v_order.updated_at is distinct from p_expected_updated_at
  then
    raise exception 'QB_MATRIX_CONFLICT: el pedido cambió en otro dispositivo.'
      using errcode = '40001';
  end if;
  if v_order.status not in (
    'pendiente_preparacion',
    'en_preparacion',
    'preparado'
  ) then
    raise exception 'El pedido ya no admite confirmación de entrega.';
  end if;

  select * into v_preparation
  from public.qb_order_preparations
  where order_id = p_order_id
  for update;
  if v_preparation.id is null
    or v_preparation.status not in ('en_preparacion', 'preparado')
  then
    raise exception 'Inventario todavía no inició la preparación.';
  end if;

  if exists (
    select 1
    from public.qb_order_items order_item
    left join public.qb_order_preparation_items preparation_item
      on preparation_item.order_item_id = order_item.id
    where order_item.order_id = p_order_id
      and preparation_item.prepared_at_line is null
  ) then
    raise exception 'Inventario todavía no revisó todas las líneas.';
  end if;

  if exists (
    select 1
    from public.qb_order_items order_item
    join public.products product on product.id = order_item.product_id
    join public.qb_order_preparation_items preparation_item
      on preparation_item.order_item_id = order_item.id
    left join public.qb_order_delivery_items delivery_item
      on delivery_item.order_item_id = order_item.id
    where order_item.order_id = p_order_id
      and product.controls_actual_weight
      and (
        delivery_item.actual_weight_kg is null
        or (
          delivery_item.actual_weight_kg < preparation_item.actual_quantity
          and length(trim(coalesce(delivery_item.delivery_note, ''))) < 3
        )
      )
  ) then
    raise exception 'Completa los pesos reales y justifica los faltantes.';
  end if;

  update public.qb_order_preparations
  set
    status = 'preparado',
    prepared_by = coalesce(prepared_by, v_user_id),
    prepared_at = coalesce(prepared_at, now())
  where id = v_preparation.id;

  update public.qb_orders
  set status = 'preparado'
  where id = p_order_id
  returning updated_at into v_prepared_updated_at;

  return public.confirm_qb_matrix_delivery_finalization_v1(
    p_order_id,
    v_prepared_updated_at,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.save_qb_matrix_delivery_item(
  uuid, integer, numeric, numeric, boolean, text, text
) from public, anon;
revoke all on function public.save_qb_matrix_delivery_item_with_weight(
  uuid, integer, numeric, numeric, boolean, numeric, text, text
) from public, anon;
revoke all on function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) from public, anon;
revoke all on function public.sync_qb_delivery_preparation_snapshot()
from public, anon, authenticated;

grant execute on function public.save_qb_matrix_delivery_item(
  uuid, integer, numeric, numeric, boolean, text, text
) to authenticated;
grant execute on function public.save_qb_matrix_delivery_item_with_weight(
  uuid, integer, numeric, numeric, boolean, numeric, text, text
) to authenticated;
grant execute on function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) to authenticated;

commit;
