-- Una línea puede conservar la cantidad comercial pedida (p. ej. 4 cabezas)
-- y registrar además el peso real. El peso sólo reemplaza la cantidad de
-- costeo cuando la unidad de precio es una unidad de peso reconocida.

begin;

-- La captura anterior ofrecía onzas de forma fija. Se registra como unidad
-- parametrizada para conservar esa opción al pasar al selector dinámico.
insert into public.qb_units (
  dimension_id,
  code,
  name,
  symbol,
  conversion_factor_to_base,
  is_base,
  is_active,
  sort_order
)
select
  dimension.id,
  'oz',
  'Onza',
  'OZ',
  0.028349523::numeric,
  false,
  true,
  25
from public.qb_unit_dimensions dimension
where dimension.code = 'peso'
on conflict (dimension_id, code) do update
set name = excluded.name,
    symbol = excluded.symbol,
    conversion_factor_to_base = excluded.conversion_factor_to_base,
    is_active = true,
    sort_order = excluded.sort_order;

create or replace function private.qb_weight_unit_kg_factor(
  p_code text,
  p_name text,
  p_symbol text
)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select unit.conversion_factor_to_base
  from public.qb_units unit
  join public.qb_unit_dimensions dimension
    on dimension.id = unit.dimension_id
  where dimension.code = 'peso'
    and dimension.is_active
    and unit.is_active
    and (
      (
        nullif(trim(p_code), '') is not null
        and lower(trim(unit.code)) = lower(trim(p_code))
      )
      or (
        nullif(trim(p_name), '') is not null
        and lower(trim(unit.name)) = lower(trim(p_name))
      )
      or (
        nullif(trim(p_symbol), '') is not null
        and lower(trim(unit.symbol)) = lower(trim(p_symbol))
      )
    )
  order by
    case
      when lower(trim(unit.code)) = lower(trim(coalesce(p_code, ''))) then 0
      when lower(trim(unit.name)) = lower(trim(coalesce(p_name, ''))) then 1
      else 2
    end,
    unit.sort_order,
    unit.id
  limit 1;
$$;

revoke all on function private.qb_weight_unit_kg_factor(text, text, text)
from public, anon, authenticated;

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
  v_requested_unit_kg_factor numeric;
  v_price_unit_kg_factor numeric;
  v_pricing_quantity numeric;
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

  select
    coalesce(product.controls_actual_weight, false),
    private.qb_weight_unit_kg_factor(unit.code, unit.name, unit.symbol)
  into v_controls_actual_weight, v_price_unit_kg_factor
  from public.products product
  left join public.qb_product_unit_settings settings
    on settings.product_id = product.id
  left join public.qb_units unit
    on unit.id = settings.base_price_unit_id
  where product.id = v_preparation_item.product_id;

  if v_controls_actual_weight then
    v_requested_unit_kg_factor := private.qb_weight_unit_kg_factor(
      '',
      v_preparation_item.requested_source_label,
      v_preparation_item.requested_base_unit_symbol
    );
    v_prepared_weight_kg := coalesce(
      v_preparation_item.actual_weight_kg,
      v_preparation_item.actual_quantity * v_requested_unit_kg_factor
    );
    v_effective_weight := p_actual_weight_kg;
    if v_effective_weight is null
      and v_preparation_item.preparation_check
      and length(trim(coalesce(v_preparation_item.notes, ''))) = 0
      and v_requested_unit_kg_factor is not null
    then
      v_effective_weight := v_prepared_weight_kg;
    end if;

    if v_effective_weight is null then
      raise exception 'Entrega debe registrar el peso real de esta línea.';
    end if;
    if v_effective_weight < 0 then
      raise exception 'El peso real no puede ser negativo.';
    end if;
    if v_preparation_item.actual_weight_kg is not null
      and v_effective_weight < v_preparation_item.actual_weight_kg
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

  if v_controls_actual_weight and v_price_unit_kg_factor is not null then
    v_pricing_quantity := round(
      v_effective_weight / v_price_unit_kg_factor,
      6
    );
    update public.qb_order_delivery_items
    set delivered_base_quantity = v_pricing_quantity
    where order_item_id = p_order_item_id;

    v_result := v_result || jsonb_build_object(
      'actual_weight_kg', v_effective_weight,
      'delivered_base_quantity', v_pricing_quantity,
      'weight_pricing_applied', true
    );
  elsif v_controls_actual_weight then
    v_result := v_result || jsonb_build_object(
      'actual_weight_kg', v_effective_weight,
      'weight_pricing_applied', false
    );
  end if;

  return v_result;
end;
$$;

comment on function public.save_qb_matrix_delivery_item_with_weight_v2(
  uuid, integer, numeric, numeric, boolean, numeric, text, text
) is
  'Guarda peso canónico en kg. Sólo lo convierte en cantidad cobrable cuando el producto tiene una unidad de precio por peso.';

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
    private.qb_weight_unit_kg_factor(unit.code, unit.name, unit.symbol)
  into
    v_actual_weight_kg,
    v_price_unit_id,
    v_price_unit_symbol,
    v_price_unit_kg_factor
  from public.products product
  join public.qb_product_unit_settings settings
    on settings.product_id = product.id
  join public.qb_units unit
    on unit.id = settings.base_price_unit_id
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

drop trigger if exists align_qb_receipt_weight_pricing_unit
  on public.qb_receipt_lines;
create trigger align_qb_receipt_weight_pricing_unit
  before insert on public.qb_receipt_lines
  for each row execute function private.align_qb_receipt_weight_pricing_unit();

update public.products
set controls_actual_weight = true
where upper(trim(name)) = 'AJO EN DIENTE'
  and controls_actual_weight = false;

commit;
