-- Preparación y Entrega capturan el peso en la unidad elegida por el usuario.
-- La aplicación convierte siempre a kg antes de guardar, por lo que las
-- comparaciones entre etapas deben usar el peso canónico y no la cantidad
-- solicitada en su unidad comercial.

begin;

comment on column public.qb_order_preparation_items.actual_weight_kg is
  'Peso real preparado, almacenado canónicamente en kg. La captura admite kg, g, lb y oz.';

comment on column public.qb_order_delivery_items.actual_weight_kg is
  'Peso real entregado, almacenado canónicamente en kg. La captura admite kg, g, lb y oz.';

create or replace function public.save_qb_matrix_delivery_item_with_weight_v2(
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
  v_prepared_weight_kg numeric;
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
    v_prepared_weight_kg := coalesce(
      v_preparation_item.actual_weight_kg,
      v_preparation_item.actual_quantity
    );
    v_effective_weight := p_actual_weight_kg;
    if v_effective_weight is null
      and v_preparation_item.preparation_check
      and length(trim(coalesce(v_preparation_item.notes, ''))) = 0
    then
      v_effective_weight := v_prepared_weight_kg;
    end if;

    if v_effective_weight is null then
      raise exception 'Entrega debe registrar el peso real de esta línea.';
    end if;
    if v_effective_weight < 0 then
      raise exception 'El peso real no puede ser negativo.';
    end if;
    if v_effective_weight < v_prepared_weight_kg
      and length(trim(coalesce(p_note, ''))) < 3
    then
      raise exception 'Explica por qué el peso real es menor al peso preparado.';
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

create or replace function public.confirm_qb_matrix_delivery_v2(
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
          delivery_item.actual_weight_kg
            < coalesce(
              preparation_item.actual_weight_kg,
              preparation_item.actual_quantity
            )
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

comment on function public.save_qb_matrix_delivery_item_with_weight_v2(
  uuid, integer, numeric, numeric, boolean, numeric, text, text
) is
  'Guarda peso entregado en kg y compara faltantes contra el peso real preparado en kg.';

comment on function public.confirm_qb_matrix_delivery_v2(
  uuid, timestamptz, text
) is
  'Confirma la entrega comparando pesos canónicos de Preparación y Entrega.';

commit;
