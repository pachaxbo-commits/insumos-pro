-- Correcciones para la prueba del cliente: orden horizontal, unidad visible
-- persistente y confirmación protegida contra pantallas desactualizadas.
begin;

alter table public.qb_order_preparation_items
  add column if not exists display_unit_id text not null default 'original';

alter table public.qb_order_delivery_items
  add column if not exists display_unit_id text not null default 'original';

alter table public.qb_order_preparation_items
  drop constraint if exists qb_order_preparation_items_display_unit_check;
alter table public.qb_order_preparation_items
  add constraint qb_order_preparation_items_display_unit_check
  check (
    display_unit_id = 'original'
    or display_unit_id ~ '^(unit|presentation):[0-9a-fA-F-]{36}$'
  );

alter table public.qb_order_delivery_items
  drop constraint if exists qb_order_delivery_items_display_unit_check;
alter table public.qb_order_delivery_items
  add constraint qb_order_delivery_items_display_unit_check
  check (
    display_unit_id = 'original'
    or display_unit_id ~ '^(unit|presentation):[0-9a-fA-F-]{36}$'
  );

comment on column public.qb_order_preparation_items.display_unit_id is
  'Unidad elegida por Inventario para mostrar y editar la cantidad; la cantidad canónica conserva la unidad original del pedido.';
comment on column public.qb_order_delivery_items.display_unit_id is
  'Unidad elegida por Entrega para mostrar y editar la cantidad; la cantidad canónica conserva la unidad original del pedido.';

create or replace function public.save_qb_matrix_preparation_item_with_unit(
  p_order_item_id uuid,
  p_expected_version integer,
  p_prepared_quantity numeric,
  p_preparation_check boolean,
  p_actual_weight_kg numeric,
  p_display_unit_id text,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_item public.qb_order_preparation_items%rowtype;
  v_order_item public.qb_order_items%rowtype;
  v_order public.qb_orders%rowtype;
  v_old_display_unit_id text;
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if p_display_unit_id is null or not (
    p_display_unit_id = 'original'
    or p_display_unit_id ~ '^(unit|presentation):[0-9a-fA-F-]{36}$'
  ) then
    raise exception 'La unidad elegida no es válida.';
  end if;

  v_result := public.save_qb_matrix_preparation_item_with_weight(
    p_order_item_id,
    p_expected_version,
    p_prepared_quantity,
    p_preparation_check,
    p_actual_weight_kg,
    p_note,
    p_idempotency_key
  );

  select * into v_item
  from public.qb_order_preparation_items
  where order_item_id = p_order_item_id
  for update;

  if coalesce((v_result ->> 'replayed')::boolean, false) then
    return v_result || jsonb_build_object(
      'display_unit_id', v_item.display_unit_id
    );
  end if;

  v_old_display_unit_id := v_item.display_unit_id;
  update public.qb_order_preparation_items
  set display_unit_id = p_display_unit_id
  where id = v_item.id;

  if v_old_display_unit_id is distinct from p_display_unit_id then
    select * into v_order_item
    from public.qb_order_items
    where id = p_order_item_id;

    select * into v_order
    from public.qb_orders
    where id = v_order_item.order_id;

    select role into v_role
    from public.profiles
    where id = v_user_id and is_active = true;

    insert into public.qb_order_line_change_events (
      order_id, order_item_id, customer_account_id, stage, field_name,
      old_value, new_value, unit_label, actor_id, actor_role,
      correlation_key, idempotency_key
    ) values (
      v_order.id, v_order_item.id, v_order.customer_account_id,
      'preparacion', 'display_unit_id', to_jsonb(v_old_display_unit_id),
      to_jsonb(p_display_unit_id), p_display_unit_id, v_user_id, v_role,
      p_idempotency_key, p_idempotency_key
    ) on conflict do nothing;
  end if;

  return v_result || jsonb_build_object(
    'display_unit_id', p_display_unit_id
  );
end;
$$;

create or replace function public.save_qb_matrix_delivery_item_with_unit(
  p_order_item_id uuid,
  p_expected_version integer,
  p_externally_sourced_quantity numeric,
  p_delivered_quantity numeric,
  p_delivery_check boolean,
  p_actual_weight_kg numeric,
  p_display_unit_id text,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_result jsonb;
  v_item public.qb_order_delivery_items%rowtype;
  v_order_item public.qb_order_items%rowtype;
  v_order public.qb_orders%rowtype;
  v_old_display_unit_id text;
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if p_display_unit_id is null or not (
    p_display_unit_id = 'original'
    or p_display_unit_id ~ '^(unit|presentation):[0-9a-fA-F-]{36}$'
  ) then
    raise exception 'La unidad elegida no es válida.';
  end if;

  v_result := public.save_qb_matrix_delivery_item_with_weight(
    p_order_item_id,
    p_expected_version,
    p_externally_sourced_quantity,
    p_delivered_quantity,
    p_delivery_check,
    p_actual_weight_kg,
    p_note,
    p_idempotency_key
  );

  select * into v_item
  from public.qb_order_delivery_items
  where order_item_id = p_order_item_id
  for update;

  if coalesce((v_result ->> 'replayed')::boolean, false) then
    return v_result || jsonb_build_object(
      'display_unit_id', v_item.display_unit_id
    );
  end if;

  v_old_display_unit_id := v_item.display_unit_id;
  update public.qb_order_delivery_items
  set display_unit_id = p_display_unit_id
  where id = v_item.id;

  if v_old_display_unit_id is distinct from p_display_unit_id then
    select * into v_order_item
    from public.qb_order_items
    where id = p_order_item_id;

    select * into v_order
    from public.qb_orders
    where id = v_order_item.order_id;

    select role into v_role
    from public.profiles
    where id = v_user_id and is_active = true;

    insert into public.qb_order_line_change_events (
      order_id, order_item_id, customer_account_id, stage, field_name,
      old_value, new_value, unit_label, actor_id, actor_role,
      correlation_key, idempotency_key
    ) values (
      v_order.id, v_order_item.id, v_order.customer_account_id,
      'entrega', 'display_unit_id', to_jsonb(v_old_display_unit_id),
      to_jsonb(p_display_unit_id), p_display_unit_id, v_user_id, v_role,
      p_idempotency_key, p_idempotency_key
    ) on conflict do nothing;
  end if;

  return v_result || jsonb_build_object(
    'display_unit_id', p_display_unit_id
  );
end;
$$;

revoke all on function public.save_qb_matrix_preparation_item_with_unit(
  uuid, integer, numeric, boolean, numeric, text, text, text
) from public, anon;
grant execute on function public.save_qb_matrix_preparation_item_with_unit(
  uuid, integer, numeric, boolean, numeric, text, text, text
) to authenticated;

revoke all on function public.save_qb_matrix_delivery_item_with_unit(
  uuid, integer, numeric, numeric, boolean, numeric, text, text, text
) from public, anon;
grant execute on function public.save_qb_matrix_delivery_item_with_unit(
  uuid, integer, numeric, numeric, boolean, numeric, text, text, text
) to authenticated;

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
  if p_operational_date is null
    or coalesce(array_length(p_order_ids, 1), 0) = 0
    or length(trim(coalesce(p_idempotency_key, ''))) < 8
  then
    raise exception 'Solicitud de reordenamiento invalida.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('qb-operational-day:' || p_operational_date::text, 0)
  );
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
    or v_count <> (
      select count(distinct item.order_id)
      from unnest(p_order_ids) as item(order_id)
    )
  then
    raise exception 'La lista no coincide con las ordenes de la fecha.';
  end if;
  if exists (
    select 1
    from public.qb_operational_day_orders day_order
    where day_order.operational_date = p_operational_date
      and day_order.order_id = any(p_order_ids)
      and day_order.row_version <> coalesce(
        (p_expected_versions ->> day_order.order_id::text)::integer,
        -1
      )
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
    select item.order_id, item.position::integer
    from unnest(p_order_ids) with ordinality as item(order_id, position)
  ) ordered
  where day_order.order_id = ordered.order_id
    and day_order.operational_date = p_operational_date;

  insert into public.audit_logs (user_id, action, entity_type, metadata)
  values (
    v_user_id,
    'reorder_qb_operational_day_orders',
    'qb_operational_day',
    jsonb_build_object(
      'date', p_operational_date,
      'order_ids', p_order_ids,
      'idempotency_key', p_idempotency_key
    )
  );
  return jsonb_build_object('date', p_operational_date, 'count', v_count);
end;
$$;

revoke all on function public.reorder_qb_operational_day_orders(
  date, uuid[], jsonb, text
) from public, anon;
grant execute on function public.reorder_qb_operational_day_orders(
  date, uuid[], jsonb, text
) to authenticated;

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
begin
  return public.confirm_qb_matrix_delivery_v2(
    p_order_id,
    p_expected_updated_at,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) from public, anon;
grant execute on function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) to authenticated;

comment on function public.confirm_qb_matrix_delivery(
  uuid, timestamptz, text
) is
  'Confirma solo la versión observada por Entrega y rechaza cambios concurrentes.';

commit;
