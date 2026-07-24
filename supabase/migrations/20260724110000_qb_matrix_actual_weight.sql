begin;

alter table public.qb_order_preparation_items
  add column if not exists actual_weight_kg numeric(18, 6);

alter table public.qb_order_preparation_items
  drop constraint if exists qb_order_preparation_items_actual_weight_check;

alter table public.qb_order_preparation_items
  add constraint qb_order_preparation_items_actual_weight_check
  check (actual_weight_kg is null or actual_weight_kg >= 0);

comment on column public.qb_order_preparation_items.actual_weight_kg is
  'Peso real medido en kg durante preparacion. No reemplaza cantidad solicitada ni conversion calculada.';

alter table public.qb_order_delivery_items
  add column if not exists actual_weight_kg numeric(18, 6);

alter table public.qb_order_delivery_items
  drop constraint if exists qb_order_delivery_items_actual_weight_check;

alter table public.qb_order_delivery_items
  add constraint qb_order_delivery_items_actual_weight_check
  check (actual_weight_kg is null or actual_weight_kg >= 0);

comment on column public.qb_order_delivery_items.actual_weight_kg is
  'Peso real medido en kg durante entrega. No reemplaza cantidad solicitada ni conversion calculada.';

create or replace function public.save_qb_matrix_preparation_item_with_weight(
  p_order_item_id uuid,
  p_expected_version integer,
  p_prepared_quantity numeric,
  p_preparation_check boolean,
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
  v_result jsonb;
  v_user_id uuid := auth.uid();
  v_role text;
  v_order_item public.qb_order_items%rowtype;
  v_order public.qb_orders%rowtype;
  v_item public.qb_order_preparation_items%rowtype;
  v_old_weight numeric(18, 6);
begin
  if p_actual_weight_kg is not null and p_actual_weight_kg < 0 then
    raise exception 'El peso real no puede ser negativo.';
  end if;

  v_result := public.save_qb_matrix_preparation_item(
    p_order_item_id,
    p_expected_version,
    p_prepared_quantity,
    p_preparation_check,
    p_note,
    p_idempotency_key
  );

  select *
  into v_item
  from public.qb_order_preparation_items
  where order_item_id = p_order_item_id
  for update;

  if coalesce((v_result ->> 'replayed')::boolean, false) then
    return v_result || jsonb_build_object(
      'actual_weight_kg',
      v_item.actual_weight_kg
    );
  end if;

  select *
  into v_order_item
  from public.qb_order_items
  where id = p_order_item_id;

  select *
  into v_order
  from public.qb_orders
  where id = v_order_item.order_id;

  select role
  into v_role
  from public.profiles
  where id = v_user_id;

  v_old_weight := v_item.actual_weight_kg;

  update public.qb_order_preparation_items
  set actual_weight_kg = p_actual_weight_kg
  where id = v_item.id;

  insert into public.qb_order_line_change_events (
    order_id,
    order_item_id,
    customer_account_id,
    stage,
    field_name,
    old_value,
    new_value,
    unit_label,
    actor_id,
    actor_role,
    correlation_key,
    idempotency_key
  )
  values (
    v_order.id,
    v_order_item.id,
    v_order.customer_account_id,
    'preparacion',
    'actual_weight_kg',
    to_jsonb(v_old_weight),
    to_jsonb(p_actual_weight_kg),
    'kg',
    v_user_id,
    v_role,
    p_idempotency_key,
    p_idempotency_key
  )
  on conflict do nothing;

  return v_result || jsonb_build_object(
    'actual_weight_kg',
    p_actual_weight_kg
  );
end;
$$;

create or replace function public.save_qb_matrix_delivery_item_with_weight(
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
  v_result jsonb;
  v_user_id uuid := auth.uid();
  v_role text;
  v_order_item public.qb_order_items%rowtype;
  v_order public.qb_orders%rowtype;
  v_item public.qb_order_delivery_items%rowtype;
  v_old_weight numeric(18, 6);
begin
  if p_actual_weight_kg is not null and p_actual_weight_kg < 0 then
    raise exception 'El peso real no puede ser negativo.';
  end if;

  v_result := public.save_qb_matrix_delivery_item(
    p_order_item_id,
    p_expected_version,
    p_externally_sourced_quantity,
    p_delivered_quantity,
    p_delivery_check,
    p_note,
    p_idempotency_key
  );

  select *
  into v_item
  from public.qb_order_delivery_items
  where order_item_id = p_order_item_id
  for update;

  if coalesce((v_result ->> 'replayed')::boolean, false) then
    return v_result || jsonb_build_object(
      'actual_weight_kg',
      v_item.actual_weight_kg
    );
  end if;

  select *
  into v_order_item
  from public.qb_order_items
  where id = p_order_item_id;

  select *
  into v_order
  from public.qb_orders
  where id = v_order_item.order_id;

  select role
  into v_role
  from public.profiles
  where id = v_user_id;

  v_old_weight := v_item.actual_weight_kg;

  update public.qb_order_delivery_items
  set actual_weight_kg = p_actual_weight_kg
  where id = v_item.id;

  insert into public.qb_order_line_change_events (
    order_id,
    order_item_id,
    customer_account_id,
    stage,
    field_name,
    old_value,
    new_value,
    unit_label,
    actor_id,
    actor_role,
    correlation_key,
    idempotency_key
  )
  values (
    v_order.id,
    v_order_item.id,
    v_order.customer_account_id,
    'entrega',
    'actual_weight_kg',
    to_jsonb(v_old_weight),
    to_jsonb(p_actual_weight_kg),
    'kg',
    v_user_id,
    v_role,
    p_idempotency_key,
    p_idempotency_key
  )
  on conflict do nothing;

  return v_result || jsonb_build_object(
    'actual_weight_kg',
    p_actual_weight_kg
  );
end;
$$;

revoke all on function public.save_qb_matrix_preparation_item_with_weight(
  uuid,
  integer,
  numeric,
  boolean,
  numeric,
  text,
  text
) from public, anon;

revoke all on function public.save_qb_matrix_delivery_item_with_weight(
  uuid,
  integer,
  numeric,
  numeric,
  boolean,
  numeric,
  text,
  text
) from public, anon;

grant execute on function public.save_qb_matrix_preparation_item_with_weight(
  uuid,
  integer,
  numeric,
  boolean,
  numeric,
  text,
  text
) to authenticated;

grant execute on function public.save_qb_matrix_delivery_item_with_weight(
  uuid,
  integer,
  numeric,
  numeric,
  boolean,
  numeric,
  text,
  text
) to authenticated;

commit;
