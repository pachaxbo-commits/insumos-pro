-- Edición administrativa completa antes de iniciar la preparación.

begin;

create or replace function public.admin_update_qb_internal_order(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_customer_notes text,
  p_operational_date date,
  p_items jsonb
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
  v_item jsonb;
  v_product record;
  v_allowed public.qb_product_allowed_units%rowtype;
  v_base_unit public.qb_units%rowtype;
  v_source_unit public.qb_units%rowtype;
  v_presentation public.qb_product_presentations%rowtype;
  v_product_id uuid;
  v_allowed_unit_id uuid;
  v_quantity numeric(18,6);
  v_factor numeric(18,9);
  v_base_quantity numeric(18,6);
  v_validated jsonb := '[]'::jsonb;
  v_seen_products uuid[] := '{}';
  v_sort_order integer := 0;
  v_item_id uuid;
  v_snapshot_id uuid;
  v_old_snapshot_ids uuid[];
  v_position integer;
  v_current_date date := (now() at time zone 'America/La_Paz')::date;
  v_updated_at timestamptz;
begin
  select profile.role
  into v_role
  from public.profiles profile
  where profile.id = v_user_id
    and profile.is_active = true;

  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo administracion puede editar pedidos.';
  end if;

  if p_operational_date is null or p_operational_date < v_current_date then
    raise exception 'La fecha de entrega no puede ser anterior a hoy.';
  end if;
  if p_customer_notes is not null
    and length(trim(p_customer_notes)) > 1000 then
    raise exception 'Las notas generales superan el limite permitido.';
  end if;
  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 30 then
    raise exception 'El pedido debe incluir entre 1 y 30 productos.';
  end if;

  select *
  into v_order
  from public.qb_orders orders
  where orders.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido no encontrado.';
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_ORDER_EDIT_CONFLICT';
  end if;
  if v_order.status <> 'pendiente_preparacion'
    or exists (
      select 1
      from public.qb_order_preparations preparation
      where preparation.order_id = v_order.id
    )
    or exists (
      select 1
      from public.qb_order_delivery_items delivery
      where delivery.order_id = v_order.id
    )
    or exists (
      select 1
      from public.qb_receipt_orders receipt_order
      where receipt_order.order_id = v_order.id
    ) then
    raise exception 'QB_ORDER_EDIT_STARTED';
  end if;

  -- Validar y resolver todas las conversiones antes de cambiar datos.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_allowed_unit_id := (v_item ->> 'allowed_unit_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::numeric;
    exception when others then
      raise exception 'Uno de los productos tiene datos invalidos.';
    end;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 10000
      or abs(v_quantity * 1000 - round(v_quantity * 1000)) > 0.000001
      or length(trim(coalesce(v_item ->> 'notes', ''))) > 500 then
      raise exception 'Uno de los productos tiene cantidad o notas invalidas.';
    end if;
    if v_product_id = any(v_seen_products) then
      raise exception 'No repitas productos en el mismo pedido.';
    end if;
    v_seen_products := array_append(v_seen_products, v_product_id);

    select product.id, settings.base_unit_id
    into v_product
    from public.products product
    join public.qb_product_unit_settings settings
      on settings.product_id = product.id
    where product.id = v_product_id
      and product.is_active = true
      and coalesce(product.is_sellable, true) = true
      and coalesce(product.is_qb_loss_product, false) = false
      and settings.is_qb_active = true
      and settings.is_visible_in_qb_catalog = true;
    if not found then
      raise exception 'Uno de los productos ya no esta disponible.';
    end if;

    select *
    into v_allowed
    from public.qb_product_allowed_units allowed
    where allowed.id = v_allowed_unit_id
      and allowed.product_id = v_product.id
      and allowed.usage_context = 'pedido'
      and allowed.is_active = true;
    if not found
      or (
        coalesce(v_allowed.min_quantity, 0) > 0
        and v_quantity < v_allowed.min_quantity
      )
      or (
        coalesce(v_allowed.quantity_step, 0) > 0
        and abs(
          (
            (
              v_quantity
              - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)
            ) / v_allowed.quantity_step
          )
          - round(
            (
              v_quantity
              - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)
            ) / v_allowed.quantity_step
          )
        ) > 0.000001
      ) then
      raise exception 'La cantidad no coincide con la unidad seleccionada.';
    end if;

    select *
    into v_base_unit
    from public.qb_units unit
    where unit.id = v_product.base_unit_id
      and unit.is_active = true;

    if v_allowed.unit_id is not null then
      select *
      into v_source_unit
      from public.qb_units unit
      where unit.id = v_allowed.unit_id
        and unit.is_active = true
        and unit.dimension_id = v_base_unit.dimension_id;
      if not found then
        raise exception 'La unidad seleccionada ya no esta disponible.';
      end if;
      v_factor :=
        v_source_unit.conversion_factor_to_base
        / v_base_unit.conversion_factor_to_base;
      v_validated := v_validated || jsonb_build_array(
        jsonb_build_object(
          'product_id', v_product.id,
          'allowed_unit_id', v_allowed.id,
          'source_kind', 'universal_unit',
          'source_unit_id', v_source_unit.id,
          'source_label', v_source_unit.symbol,
          'requested_quantity', v_quantity,
          'base_unit_id', v_base_unit.id,
          'base_unit_symbol', v_base_unit.symbol,
          'base_quantity', round(v_quantity * v_factor, 6),
          'factor', v_factor,
          'notes', nullif(trim(coalesce(v_item ->> 'notes', '')), ''),
          'snapshot', jsonb_build_object(
            'allowed_unit_id', v_allowed.id,
            'unit_name', v_source_unit.name
          )
        )
      );
    else
      select *
      into v_presentation
      from public.qb_product_presentations presentation
      where presentation.id = v_allowed.presentation_id
        and presentation.product_id = v_product.id
        and presentation.is_active = true
        and presentation.allow_order = true;
      if not found then
        raise exception 'La presentacion seleccionada ya no esta disponible.';
      end if;
      v_factor := v_presentation.conversion_factor_to_base;
      v_validated := v_validated || jsonb_build_array(
        jsonb_build_object(
          'product_id', v_product.id,
          'allowed_unit_id', v_allowed.id,
          'source_kind', 'product_presentation',
          'product_presentation_id', v_presentation.id,
          'source_label', v_presentation.symbol,
          'requested_quantity', v_quantity,
          'base_unit_id', v_base_unit.id,
          'base_unit_symbol', v_base_unit.symbol,
          'base_quantity', round(v_quantity * v_factor, 6),
          'factor', v_factor,
          'notes', nullif(trim(coalesce(v_item ->> 'notes', '')), ''),
          'snapshot', jsonb_build_object(
            'allowed_unit_id', v_allowed.id,
            'presentation_name', v_presentation.name
          )
        )
      );
    end if;
  end loop;

  select array_agg(item.conversion_snapshot_id)
  into v_old_snapshot_ids
  from public.qb_order_items item
  where item.order_id = v_order.id
    and item.conversion_snapshot_id is not null;

  delete from public.qb_order_items item
  where item.order_id = v_order.id;

  delete from public.qb_conversion_snapshots snapshot
  where snapshot.id = any(coalesce(v_old_snapshot_ids, array[]::uuid[]));

  v_sort_order := 0;
  for v_item in select value from jsonb_array_elements(v_validated)
  loop
    v_sort_order := v_sort_order + 1;
    insert into public.qb_order_items (
      order_id,
      product_id,
      allowed_unit_id,
      source_kind,
      source_unit_id,
      product_presentation_id,
      source_label,
      requested_quantity,
      base_unit_id,
      base_unit_symbol,
      base_quantity,
      conversion_factor_to_base,
      customer_notes,
      sort_order
    )
    values (
      v_order.id,
      (v_item ->> 'product_id')::uuid,
      (v_item ->> 'allowed_unit_id')::uuid,
      v_item ->> 'source_kind',
      nullif(v_item ->> 'source_unit_id', '')::uuid,
      nullif(v_item ->> 'product_presentation_id', '')::uuid,
      v_item ->> 'source_label',
      (v_item ->> 'requested_quantity')::numeric,
      (v_item ->> 'base_unit_id')::uuid,
      v_item ->> 'base_unit_symbol',
      (v_item ->> 'base_quantity')::numeric,
      (v_item ->> 'factor')::numeric,
      nullif(v_item ->> 'notes', ''),
      v_sort_order
    )
    returning id into v_item_id;

    insert into public.qb_conversion_snapshots (
      source_table,
      source_id,
      product_id,
      dimension_code,
      source_kind,
      source_unit_id,
      product_presentation_id,
      source_label,
      source_quantity,
      base_unit_id,
      base_unit_symbol,
      base_quantity,
      conversion_factor_to_base,
      snapshot,
      created_by
    )
    values (
      'qb_order_items',
      v_item_id,
      (v_item ->> 'product_id')::uuid,
      'pedido',
      v_item ->> 'source_kind',
      nullif(v_item ->> 'source_unit_id', '')::uuid,
      nullif(v_item ->> 'product_presentation_id', '')::uuid,
      v_item ->> 'source_label',
      (v_item ->> 'requested_quantity')::numeric,
      (v_item ->> 'base_unit_id')::uuid,
      v_item ->> 'base_unit_symbol',
      (v_item ->> 'base_quantity')::numeric,
      (v_item ->> 'factor')::numeric,
      v_item -> 'snapshot',
      v_user_id
    )
    returning id into v_snapshot_id;

    update public.qb_order_items
    set conversion_snapshot_id = v_snapshot_id
    where id = v_item_id;
  end loop;

  if v_order.operational_date is distinct from p_operational_date then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'qb-operational-day:' || p_operational_date::text,
        0
      )
    );
    select coalesce(max(day_order.position), 0) + 1
    into v_position
    from public.qb_operational_day_orders day_order
    where day_order.operational_date = p_operational_date;

    update public.qb_operational_day_orders day_order
    set operational_date = p_operational_date,
        position = v_position,
        row_version = row_version + 1,
        updated_at = now()
    where day_order.order_id = v_order.id;
  end if;

  update public.qb_orders orders
  set operational_date = p_operational_date,
      customer_notes = nullif(trim(coalesce(p_customer_notes, '')), ''),
      updated_at = now()
  where orders.id = v_order.id
  returning orders.updated_at into v_updated_at;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'admin_update_qb_internal_order',
    'qb_order',
    v_order.id,
    jsonb_build_object(
      'reference', v_order.public_reference,
      'previous_operational_date', v_order.operational_date,
      'operational_date', p_operational_date,
      'item_count', jsonb_array_length(v_validated)
    )
  );

  return jsonb_build_object(
    'id', v_order.id,
    'updated_at', v_updated_at,
    'item_count', jsonb_array_length(v_validated)
  );
end;
$$;

revoke all on function public.admin_update_qb_internal_order(
  uuid, timestamptz, text, date, jsonb
) from public, anon, authenticated;

grant execute on function public.admin_update_qb_internal_order(
  uuid, timestamptz, text, date, jsonb
) to authenticated;

comment on function public.admin_update_qb_internal_order(
  uuid, timestamptz, text, date, jsonb
) is
  'Permite al administrador editar fecha, notas y productos antes de iniciar preparación.';

commit;
