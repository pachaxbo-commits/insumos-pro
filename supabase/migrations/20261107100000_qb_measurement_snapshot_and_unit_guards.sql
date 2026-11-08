-- Preserve the exact weight measurement entered by staff while keeping the
-- normalized kilogram value used by existing inventory and pricing contracts.
-- Also reject new order lines whose selected presentation crosses dimensions.
begin;

alter table public.qb_order_preparation_items
  add column if not exists actual_weight_value numeric(18, 6),
  add column if not exists actual_weight_unit_id uuid references public.qb_units(id) on delete restrict,
  add column if not exists actual_weight_factor_to_kg numeric(18, 9);

alter table public.qb_order_delivery_items
  add column if not exists actual_weight_value numeric(18, 6),
  add column if not exists actual_weight_unit_id uuid references public.qb_units(id) on delete restrict,
  add column if not exists actual_weight_factor_to_kg numeric(18, 9);

alter table public.qb_receipt_lines
  add column if not exists actual_weight_value numeric(18, 6),
  add column if not exists actual_weight_unit_id uuid references public.qb_units(id) on delete restrict,
  add column if not exists actual_weight_factor_to_kg numeric(18, 9),
  add column if not exists actual_weight_kg numeric(18, 6);

alter table public.qb_order_preparation_items
  drop constraint if exists qb_preparation_weight_snapshot_check;
alter table public.qb_order_preparation_items
  add constraint qb_preparation_weight_snapshot_check check (
    (actual_weight_value is null and actual_weight_unit_id is null and actual_weight_factor_to_kg is null)
    or (actual_weight_value is not null and actual_weight_value >= 0 and actual_weight_unit_id is not null
      and actual_weight_factor_to_kg is not null and actual_weight_factor_to_kg > 0
      and actual_weight_kg is not null and actual_weight_kg >= 0
      and abs(actual_weight_kg-round(actual_weight_value*actual_weight_factor_to_kg,6)) <= 0.000001)
  );

alter table public.qb_order_delivery_items
  drop constraint if exists qb_delivery_weight_snapshot_check;
alter table public.qb_order_delivery_items
  add constraint qb_delivery_weight_snapshot_check check (
    (actual_weight_value is null and actual_weight_unit_id is null and actual_weight_factor_to_kg is null)
    or (actual_weight_value is not null and actual_weight_value >= 0 and actual_weight_unit_id is not null
      and actual_weight_factor_to_kg is not null and actual_weight_factor_to_kg > 0
      and actual_weight_kg is not null and actual_weight_kg >= 0
      and abs(actual_weight_kg-round(actual_weight_value*actual_weight_factor_to_kg,6)) <= 0.000001)
  );

alter table public.qb_receipt_lines
  drop constraint if exists qb_receipt_weight_snapshot_check;
alter table public.qb_receipt_lines
  add constraint qb_receipt_weight_snapshot_check check (
    (actual_weight_value is null and actual_weight_unit_id is null and actual_weight_factor_to_kg is null)
    or (actual_weight_value is not null and actual_weight_value >= 0 and actual_weight_unit_id is not null
      and actual_weight_factor_to_kg is not null and actual_weight_factor_to_kg > 0
      and actual_weight_kg is not null and actual_weight_kg >= 0
      and abs(actual_weight_kg-round(actual_weight_value*actual_weight_factor_to_kg,6)) <= 0.000001)
  );

-- Keep the operational projection explicit and append only the non-financial
-- measurement snapshot fields needed by the matrix.
create or replace view public.qb_operational_preparation_items
with (security_barrier = true) as
select p.id,p.preparation_id,p.order_item_id,p.product_id,p.requested_source_label,p.requested_quantity,
  p.requested_base_unit_id,p.requested_base_unit_symbol,p.requested_base_quantity,p.actual_allowed_unit_id,
  p.actual_source_kind,p.actual_source_unit_id,p.actual_product_presentation_id,p.actual_source_label,
  p.actual_quantity,p.actual_base_unit_id,p.actual_base_unit_symbol,p.actual_base_quantity,p.conversion_factor_to_base,
  p.conversion_snapshot_id,p.status,p.notes,p.created_at,p.updated_at,p.preparation_check,p.prepared_by_line,
  p.prepared_at_line,p.row_version,p.last_idempotency_key,p.actual_weight_kg,p.display_unit_id,
  (select f.full_name from public.profiles f where f.id=p.prepared_by_line) prepared_by_name,
  p.actual_weight_value,p.actual_weight_unit_id,p.actual_weight_factor_to_kg
from public.qb_order_preparation_items p
where public.current_user_role() in ('admin','administrador','inventario','entregador','supervisor');
revoke all on public.qb_operational_preparation_items from public, anon;
grant select on public.qb_operational_preparation_items to authenticated;

-- Supervisor receipt projection exposes only operational measurement fields
-- in addition to its already approved commercial line projection.
create or replace view public.qb_supervisor_receipt_lines
with (security_barrier = true) as
select
  line.id, line.receipt_id, line.order_id, orders.public_reference as order_reference,
  line.product_id, line.product_name_snapshot, line.product_code_snapshot,
  line.category_name_snapshot, line.delivered_base_quantity, line.base_unit_symbol,
  line.visible_unit_label, line.order_input_mode, line.requested_amount_bs,
  line.currency_snapshot, pricing_unit.symbol as pricing_unit_symbol,
  line.estimated_base_quantity, line.fixed_line_amount, line.base_price_used,
  line.final_unit_price, line.line_total, line.cost_base_unit_snapshot, line.notes,
  line.created_at, line.actual_weight_value, line.actual_weight_unit_id,
  line.actual_weight_factor_to_kg, line.actual_weight_kg,
  weight_unit.symbol as actual_weight_unit_symbol
from public.qb_receipt_lines line
join public.qb_orders orders on orders.id = line.order_id
left join public.qb_units pricing_unit on pricing_unit.id = line.pricing_unit_id
left join public.qb_units weight_unit on weight_unit.id = line.actual_weight_unit_id
where public.current_user_role() in ('admin', 'administrador', 'supervisor');
revoke all on public.qb_supervisor_receipt_lines from public, anon;
grant select on public.qb_supervisor_receipt_lines to authenticated;

comment on column public.qb_order_preparation_items.actual_weight_value is
  'Weight value exactly as entered by staff. Null for legacy rows whose source unit is unknown.';
comment on column public.qb_order_preparation_items.actual_weight_unit_id is
  'Original selected weight unit. The normalized actual_weight_kg remains the calculation value.';
comment on column public.qb_order_preparation_items.actual_weight_factor_to_kg is
  'Conversion factor captured from the selected weight unit when measurement was saved.';

create or replace function public.save_qb_matrix_preparation_origin_with_weight_snapshot(
  p_order_item_id uuid,
  p_expected_version integer,
  p_prepared_quantity numeric,
  p_preparation_check boolean,
  p_actual_weight_value numeric,
  p_actual_weight_unit_id uuid,
  p_actual_weight_factor_to_kg numeric,
  p_display_unit_id text,
  p_note text,
  p_pending_base_quantity numeric,
  p_external_base_quantity numeric,
  p_review_base_quantity numeric,
  p_origin_plan_confirmed boolean,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_unit public.qb_units%rowtype;
  v_weight_dimension uuid;
  v_weight_kg numeric(18,6);
  v_result jsonb;
  v_item public.qb_order_preparation_items%rowtype;
  v_previous public.qb_order_preparation_items%rowtype;
  v_user uuid := auth.uid();
  v_role text;
begin
  if p_actual_weight_value is null then
    if p_actual_weight_unit_id is not null or p_actual_weight_factor_to_kg is not null then
      raise exception 'La unidad y el factor del peso requieren una medición.';
    end if;
    v_weight_kg := null;
  else
    if p_actual_weight_value < 0 or p_actual_weight_unit_id is null
      or p_actual_weight_factor_to_kg is null or p_actual_weight_factor_to_kg <= 0 then
      raise exception 'Medición de peso incompleta o inválida.';
    end if;
    select id into v_weight_dimension from public.qb_unit_dimensions
      where code = 'peso' and is_active limit 1;
    select * into v_unit from public.qb_units
      where id = p_actual_weight_unit_id and is_active
        and dimension_id = v_weight_dimension;
    if v_unit.id is null or abs(v_unit.conversion_factor_to_base - p_actual_weight_factor_to_kg) > 0.000000001 then
      raise exception 'La unidad de peso ya no coincide con su conversión vigente. Recarga la matriz.';
    end if;
    v_weight_kg := round(p_actual_weight_value * v_unit.conversion_factor_to_base, 6);
  end if;

  select * into v_previous from public.qb_order_preparation_items
    where order_item_id = p_order_item_id for update;
  v_result := public.save_qb_matrix_preparation_origin_with_unit(
    p_order_item_id, p_expected_version, p_prepared_quantity, p_preparation_check,
    v_weight_kg, p_display_unit_id, p_note, p_pending_base_quantity,
    p_external_base_quantity, p_review_base_quantity, p_origin_plan_confirmed,
    p_idempotency_key
  );
  select * into v_item from public.qb_order_preparation_items
    where order_item_id = p_order_item_id for update;
  if not coalesce((v_result->>'replayed')::boolean, false) then
    update public.qb_order_preparation_items set
      actual_weight_value = p_actual_weight_value,
      actual_weight_unit_id = p_actual_weight_unit_id,
      actual_weight_factor_to_kg = p_actual_weight_factor_to_kg
    where id = v_item.id;
    select role into v_role from public.profiles where id = v_user and is_active;
    insert into public.qb_order_line_change_events(
      order_id, order_item_id, customer_account_id, stage, field_name,
      old_value, new_value, unit_label, actor_id, actor_role,
      correlation_key, idempotency_key
    ) select oi.order_id, oi.id, o.customer_account_id, 'preparacion',
      'actual_weight_measurement',
      jsonb_build_object('value', v_previous.actual_weight_value, 'unit_id', v_previous.actual_weight_unit_id,
        'factor_to_kg', v_previous.actual_weight_factor_to_kg),
      jsonb_build_object('value', p_actual_weight_value, 'unit_id', p_actual_weight_unit_id,
        'factor_to_kg', p_actual_weight_factor_to_kg, 'kilograms', v_weight_kg),
      coalesce(v_unit.symbol, 'kg'), v_user, v_role, p_idempotency_key, p_idempotency_key
      from public.qb_order_items oi join public.qb_orders o on o.id = oi.order_id
      where oi.id = p_order_item_id
    on conflict do nothing;
  end if;
  select * into v_item from public.qb_order_preparation_items
    where order_item_id = p_order_item_id;
  return v_result || jsonb_build_object('actual_weight_kg', v_item.actual_weight_kg,
    'actual_weight_value', v_item.actual_weight_value, 'actual_weight_unit_id', v_item.actual_weight_unit_id,
    'actual_weight_factor_to_kg', v_item.actual_weight_factor_to_kg);
end;
$$;

create or replace function public.save_qb_matrix_delivery_origin_with_weight_snapshot(
  p_order_item_id uuid,
  p_expected_version integer,
  p_externally_sourced_quantity numeric,
  p_delivered_quantity numeric,
  p_delivery_check boolean,
  p_actual_weight_value numeric,
  p_actual_weight_unit_id uuid,
  p_actual_weight_factor_to_kg numeric,
  p_display_unit_id text,
  p_note text,
  p_warehouse_base_quantity numeric,
  p_pending_base_quantity numeric,
  p_external_definitive_base_quantity numeric,
  p_review_base_quantity numeric,
  p_source_origin_confirmed boolean,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_unit public.qb_units%rowtype;
  v_weight_dimension uuid;
  v_weight_kg numeric(18,6);
  v_result jsonb;
  v_item public.qb_order_delivery_items%rowtype;
  v_previous public.qb_order_delivery_items%rowtype;
  v_user uuid := auth.uid();
  v_role text;
begin
  if p_actual_weight_value is null then
    if p_actual_weight_unit_id is not null or p_actual_weight_factor_to_kg is not null then
      raise exception 'La unidad y el factor del peso requieren una medición.';
    end if;
    v_weight_kg := null;
  else
    if p_actual_weight_value < 0 or p_actual_weight_unit_id is null
      or p_actual_weight_factor_to_kg is null or p_actual_weight_factor_to_kg <= 0 then
      raise exception 'Medición de peso incompleta o inválida.';
    end if;
    select id into v_weight_dimension from public.qb_unit_dimensions
      where code = 'peso' and is_active limit 1;
    select * into v_unit from public.qb_units
      where id = p_actual_weight_unit_id and is_active
        and dimension_id = v_weight_dimension;
    if v_unit.id is null or abs(v_unit.conversion_factor_to_base - p_actual_weight_factor_to_kg) > 0.000000001 then
      raise exception 'La unidad de peso ya no coincide con su conversión vigente. Recarga la matriz.';
    end if;
    v_weight_kg := round(p_actual_weight_value * v_unit.conversion_factor_to_base, 6);
  end if;

  select * into v_previous from public.qb_order_delivery_items
    where order_item_id = p_order_item_id for update;
  v_result := public.save_qb_matrix_delivery_origin_with_unit(
    p_order_item_id, p_expected_version, p_externally_sourced_quantity,
    p_delivered_quantity, p_delivery_check, v_weight_kg, p_display_unit_id,
    p_note, p_warehouse_base_quantity, p_pending_base_quantity,
    p_external_definitive_base_quantity, p_review_base_quantity,
    p_source_origin_confirmed, p_idempotency_key
  );
  select * into v_item from public.qb_order_delivery_items
    where order_item_id = p_order_item_id for update;
  if not coalesce((v_result->>'replayed')::boolean, false) then
    update public.qb_order_delivery_items set
      actual_weight_value = p_actual_weight_value,
      actual_weight_unit_id = p_actual_weight_unit_id,
      actual_weight_factor_to_kg = p_actual_weight_factor_to_kg
    where id = v_item.id;
    select role into v_role from public.profiles where id = v_user and is_active;
    insert into public.qb_order_line_change_events(
      order_id, order_item_id, customer_account_id, stage, field_name,
      old_value, new_value, unit_label, actor_id, actor_role,
      correlation_key, idempotency_key
    ) select oi.order_id, oi.id, o.customer_account_id, 'entrega',
      'actual_weight_measurement',
      jsonb_build_object('value', v_previous.actual_weight_value, 'unit_id', v_previous.actual_weight_unit_id,
        'factor_to_kg', v_previous.actual_weight_factor_to_kg),
      jsonb_build_object('value', p_actual_weight_value, 'unit_id', p_actual_weight_unit_id,
        'factor_to_kg', p_actual_weight_factor_to_kg, 'kilograms', v_weight_kg),
      coalesce(v_unit.symbol, 'kg'), v_user, v_role, p_idempotency_key, p_idempotency_key
      from public.qb_order_items oi join public.qb_orders o on o.id = oi.order_id
      where oi.id = p_order_item_id
    on conflict do nothing;
  end if;
  select * into v_item from public.qb_order_delivery_items
    where order_item_id = p_order_item_id;
  return v_result || jsonb_build_object('actual_weight_kg', v_item.actual_weight_kg,
    'actual_weight_value', v_item.actual_weight_value, 'actual_weight_unit_id', v_item.actual_weight_unit_id,
    'actual_weight_factor_to_kg', v_item.actual_weight_factor_to_kg);
end;
$$;

revoke all on function public.save_qb_matrix_preparation_origin_with_weight_snapshot(
  uuid,integer,numeric,boolean,numeric,uuid,numeric,text,text,numeric,numeric,numeric,boolean,text
) from public, anon;
grant execute on function public.save_qb_matrix_preparation_origin_with_weight_snapshot(
  uuid,integer,numeric,boolean,numeric,uuid,numeric,text,text,numeric,numeric,numeric,boolean,text
) to authenticated;
revoke all on function public.save_qb_matrix_delivery_origin_with_weight_snapshot(
  uuid,integer,numeric,numeric,boolean,numeric,uuid,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text
) from public, anon;
grant execute on function public.save_qb_matrix_delivery_origin_with_weight_snapshot(
  uuid,integer,numeric,numeric,boolean,numeric,uuid,numeric,text,text,numeric,numeric,numeric,numeric,boolean,text
) to authenticated;

-- Preserve the delivery measurement as an immutable receipt snapshot for new
-- receipt lines. Existing receipt rows are intentionally not backfilled.
create or replace function public.snapshot_qb_receipt_line_actual_weight()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.actual_weight_value is null then
    select delivery.actual_weight_value, delivery.actual_weight_unit_id,
      delivery.actual_weight_factor_to_kg, delivery.actual_weight_kg
    into new.actual_weight_value, new.actual_weight_unit_id,
      new.actual_weight_factor_to_kg, new.actual_weight_kg
    from public.qb_order_delivery_items delivery
    where delivery.order_item_id = (
      select item.order_item_id from public.qb_order_preparation_items item
      where item.id = new.preparation_item_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists snapshot_qb_receipt_line_actual_weight on public.qb_receipt_lines;
create trigger snapshot_qb_receipt_line_actual_weight
before insert on public.qb_receipt_lines
for each row execute function public.snapshot_qb_receipt_line_actual_weight();

-- Older pricing code rewrote delivered_base_quantity from the measured weight
-- whenever a product price used a weight unit. That silently changed a
-- commercial order such as 8 UNIDADES into a weight quantity on the receipt.
-- The receipt now keeps the commercial delivered quantity and stores measured
-- weight in its independent snapshot columns above.
drop trigger if exists align_qb_receipt_weight_pricing_unit on public.qb_receipt_lines;

-- A product presentation is an explicit product-specific physical mapping;
-- unlike a universal unit conversion, it may legitimately cross dimensions
-- (for example, a measured box converted to KG). Verify the configured
-- association and its exact snapshot rather than rejecting all cross-dimension
-- mappings or accepting a stale/forged factor.
create or replace function public.guard_qb_order_item_presentation_snapshot()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare
  v_presentation public.qb_product_presentations%rowtype;
begin
  if new.source_kind <> 'product_presentation' then return new; end if;
  select * into v_presentation from public.qb_product_presentations
    where id = new.product_presentation_id and product_id = new.product_id
      and is_active and allow_order;
  if v_presentation.id is null then
    raise exception 'La presentación seleccionada ya no está disponible para pedidos.';
  end if;
  if v_presentation.base_unit_id is distinct from new.base_unit_id
    or v_presentation.symbol is distinct from new.source_label
    or new.requested_quantity <= 0
    or v_presentation.conversion_factor_to_base is null
    or v_presentation.conversion_factor_to_base <= 0
    or abs(new.conversion_factor_to_base-v_presentation.conversion_factor_to_base) > 0.000000001
    or abs(new.base_quantity-round(new.requested_quantity*v_presentation.conversion_factor_to_base,6)) > 0.000001 then
    raise exception 'La unidad o conversión de la presentación no coincide con su configuración vigente. Corrige la parametrización antes de crear el pedido.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_qb_order_item_presentation_dimension on public.qb_order_items;
drop trigger if exists guard_qb_order_item_presentation_snapshot on public.qb_order_items;
create trigger guard_qb_order_item_presentation_snapshot
before insert on public.qb_order_items
for each row execute function public.guard_qb_order_item_presentation_dimension();

commit;
