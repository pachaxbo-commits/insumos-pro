begin;

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
  v_effective_weight numeric;
  v_base_unit_kg_factor numeric;
  v_physical_quantity numeric;
  v_result jsonb;
begin
  select preparation_item.*
  into v_preparation_item
  from public.qb_order_preparation_items preparation_item
  where preparation_item.order_item_id = p_order_item_id
  for update;

  if v_preparation_item.id is null
    or v_preparation_item.prepared_at_line is null
  then
    raise exception 'Inventario todavía no revisó esta línea.';
  end if;

  -- Stock uses the order base, never the commercial pricing unit.
  select unit.conversion_factor_to_base into v_base_unit_kg_factor
  from public.qb_order_items item
  join public.products product on product.id=item.product_id and product.controls_actual_weight
  join public.qb_units unit on unit.id=item.base_unit_id and unit.is_active
  join public.qb_unit_dimensions dimension on dimension.id=unit.dimension_id
    and dimension.is_active and dimension.code='peso'
  where item.id=p_order_item_id;

  -- A physical weight is optional. Never persist an inferred weight as measured.
  v_effective_weight := p_actual_weight_kg;
  if v_effective_weight is not null then
    if v_effective_weight < 0 then
      raise exception 'El peso real no puede ser negativo.';
    end if;
    if v_preparation_item.actual_weight_kg is not null
      and v_effective_weight < v_preparation_item.actual_weight_kg
      and length(trim(coalesce(p_note, ''))) < 3 then
      raise exception 'Explica por qué el peso real es menor al peso preparado.';
    end if;
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

  if coalesce((v_result ->> 'replayed')::boolean, false) then
    return v_result;
  end if;

  if v_effective_weight is not null and v_base_unit_kg_factor is not null then
    v_physical_quantity := round(
      v_effective_weight / v_base_unit_kg_factor,
      6
    );
    update public.qb_order_delivery_items
    set delivered_base_quantity = v_physical_quantity
    where order_item_id = p_order_item_id;

    v_result := v_result || jsonb_build_object(
      'actual_weight_kg', v_effective_weight,
      'delivered_base_quantity', v_physical_quantity,
      'weight_pricing_applied', false
    );
  elsif v_effective_weight is not null then
    v_result := v_result || jsonb_build_object(
      'actual_weight_kg', v_effective_weight,
      'weight_pricing_applied', false
    );
  end if;

  return v_result;
end;
$$;

create or replace function private.align_qb_receipt_weight_pricing_unit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actual_weight_kg numeric;
  v_price_unit_id uuid;
  v_price_unit_symbol text;
  v_price_unit_kg_factor numeric;
begin
  select
    delivery.actual_weight_kg,
    settings.base_price_unit_id,
    unit.symbol,
    unit.conversion_factor_to_base
  into
    v_actual_weight_kg,
    v_price_unit_id,
    v_price_unit_symbol,
    v_price_unit_kg_factor
  from public.products product
  join public.qb_product_unit_settings settings
    on settings.product_id = product.id
  join public.qb_units unit
    on unit.id = settings.base_price_unit_id and unit.is_active
  join public.qb_unit_dimensions dimension on dimension.id=unit.dimension_id
    and dimension.is_active and dimension.code='peso'
  join public.qb_order_delivery_items delivery
    on delivery.preparation_item_id = new.preparation_item_id
  where product.id = new.product_id
    and product.controls_actual_weight;

  if v_actual_weight_kg is null or v_price_unit_kg_factor is null then
    return new;
  end if;

  new.delivered_base_quantity := round(
    v_actual_weight_kg / v_price_unit_kg_factor,
    6
  );
  new.base_unit_id := v_price_unit_id;
  new.base_unit_symbol := v_price_unit_symbol;
  new.visible_unit_label := v_price_unit_symbol;
  new.pricing_unit_id := v_price_unit_id;
  new.conversion_snapshot_id := null;
  return new;
end;
$$;

revoke all on function private.align_qb_receipt_weight_pricing_unit()
from public, anon, authenticated;

commit;
