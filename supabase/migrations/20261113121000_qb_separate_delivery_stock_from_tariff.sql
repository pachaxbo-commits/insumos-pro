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
  v_line record;
begin
  if not exists(select 1 from public.qb_receipts r
    where r.id=new.receipt_id and r.pricing_mode='line_cost_markup') then
    return new;
  end if;
  -- Price the delivered commercial quantity in the saved order base.
  -- The separate measurement snapshot never selects the sale tariff.
  select d.delivered_quantity,i.source_label,i.base_unit_id,i.base_unit_symbol,
    i.conversion_factor_to_base,i.conversion_snapshot_id
  into v_line
  from public.qb_order_preparation_items p
  join public.qb_order_items i on i.id=p.order_item_id
  join public.qb_order_delivery_items d on d.order_item_id=i.id and d.preparation_item_id=p.id
  where p.id=new.preparation_item_id and i.product_id=new.product_id and i.order_input_mode='quantity';
  if found and v_line.delivered_quantity>0 and v_line.conversion_factor_to_base>0 then
    new.delivered_base_quantity := round(v_line.delivered_quantity*v_line.conversion_factor_to_base,6);
    new.base_unit_id := v_line.base_unit_id;
    new.base_unit_symbol := v_line.base_unit_symbol;
    new.visible_unit_label := v_line.source_label;
    new.pricing_unit_id := v_line.base_unit_id;
    new.conversion_snapshot_id := v_line.conversion_snapshot_id;
    new.commercial_quantity_snapshot := v_line.delivered_quantity;
    new.commercial_unit_label_snapshot := v_line.source_label;
    new.commercial_conversion_factor_snapshot := v_line.conversion_factor_to_base;
    if new.cost_source='purchase_snapshot' and new.cost_base_unit_snapshot is not null then
      new.cost_total_input_precise := round(new.delivered_base_quantity*new.cost_base_unit_snapshot,8);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.align_qb_receipt_weight_pricing_unit()
from public, anon, authenticated;

create or replace function private.snapshot_qb_receipt_cost_rule()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_allowed_id uuid;
  v_rule public.qb_product_cost_rules%rowtype;
  v_unit public.qb_units%rowtype;
  v_commercial record;
  v_quantity numeric(20,8);
  v_total numeric(20,8);
begin
  if not exists (select 1 from public.qb_receipts receipt
    where receipt.id=new.receipt_id and receipt.pricing_mode='line_cost_markup') then
    return new;
  end if;
  -- New receipt lines use the catalog's sale snapshot independently of cost.
  new.sale_price_independent_snapshot := true;
  -- Earlier receipt writers may populate base_price_used from Provisión cost.
  -- Resolve sale solely from the configured tariff and its explicit unit.
  new.base_price_used := null;
  select round(settings.base_sale_price * target.conversion_factor_to_base
    / reference.conversion_factor_to_base, 4)
  into new.base_price_used
  from public.qb_product_unit_settings settings
  join public.qb_units reference on reference.id=settings.base_price_unit_id
  join public.qb_units target on target.id=new.base_unit_id
    and (target.dimension_id=reference.dimension_id or
      (target.code='kg' and target.conversion_factor_to_base=1 and upper(trim(reference.symbol))='KG'
       and reference.conversion_factor_to_base=1 and exists(select 1 from public.qb_unit_dimensions rd
         where rd.id=reference.dimension_id and rd.code='legacy_dump')))
  join public.qb_unit_dimensions dimension on dimension.id=target.dimension_id
  where settings.product_id=new.product_id and settings.base_sale_price>0
    and settings.base_sale_price::text not in ('NaN','Infinity','-Infinity')
    and reference.is_active and target.is_active and dimension.is_active
    and reference.conversion_factor_to_base>0 and target.conversion_factor_to_base>0
    and (dimension.code<>'legacy_dump' or target.id=reference.id);
  select delivery.delivered_quantity, item.source_label, item.conversion_factor_to_base
    into v_commercial
  from public.qb_order_preparation_items preparation
  join public.qb_order_items item on item.id=preparation.order_item_id
  join public.qb_order_delivery_items delivery on delivery.order_item_id=item.id
    and delivery.preparation_item_id=preparation.id
  where preparation.id=new.preparation_item_id and item.product_id=new.product_id
    and item.order_input_mode='quantity' and delivery.delivered_quantity>=0
    and item.conversion_factor_to_base>0 and nullif(trim(item.source_label),'') is not null;
  if found then
    new.commercial_quantity_snapshot := v_commercial.delivered_quantity;
    new.commercial_unit_label_snapshot := v_commercial.source_label;
    new.commercial_conversion_factor_snapshot := v_commercial.conversion_factor_to_base;
  end if;
  select order_item.allowed_unit_id into v_allowed_id
  from public.qb_order_preparation_items preparation
  join public.qb_order_items order_item on order_item.id=preparation.order_item_id
  where preparation.id=new.preparation_item_id and order_item.product_id=new.product_id;
  if v_allowed_id is null then
    new.cost_calculation_status := 'unconfigured';
    return new;
  end if;
  select * into v_rule from public.qb_product_cost_rules
  where product_id=new.product_id and order_allowed_unit_id=v_allowed_id and is_active;
  if not found then
    new.cost_calculation_status := 'unconfigured';
    return new;
  end if;

  new.cost_rule_id := v_rule.id;
  new.cost_basis_snapshot := v_rule.cost_basis;
  new.cost_rate_snapshot := v_rule.rate_amount;
  new.cost_reference_unit_id_snapshot := v_rule.reference_weight_unit_id;
  new.cost_reference_factor_to_kg_snapshot := v_rule.reference_factor_to_kg;
  new.cost_rule_snapshot := jsonb_build_object(
    'rule_id',v_rule.id,'product_id',v_rule.product_id,
    'order_allowed_unit_id',v_rule.order_allowed_unit_id,'basis',v_rule.cost_basis,
    'rate_amount',v_rule.rate_amount,'rate_currency','BOB',
    'reference_weight_unit_id',v_rule.reference_weight_unit_id,
    'reference_factor_to_kg',v_rule.reference_factor_to_kg,
    'rule_row_version',v_rule.row_version,'captured_at',now()
  );
  if v_rule.cost_basis='commercial_unit' then
    new.cost_reference_unit_id_snapshot := null;
    new.cost_reference_unit_symbol_snapshot := coalesce(new.commercial_unit_label_snapshot,new.visible_unit_label);
    new.cost_quantity_snapshot := new.commercial_quantity_snapshot;
    if new.commercial_quantity_snapshot is null or new.commercial_quantity_snapshot<=0
      or new.commercial_unit_label_snapshot is null then
      new.cost_calculation_status := 'pending_quantity';
      new.cost_base_unit_snapshot := null;
      new.cost_total_input_precise := null;
      new.cost_source := null;
      return new;
    end if;
    v_quantity := new.commercial_quantity_snapshot;
  else
    select unit.* into v_unit
    from public.qb_units unit join public.qb_unit_dimensions dimension on dimension.id=unit.dimension_id
    where unit.id=v_rule.reference_weight_unit_id and unit.is_active and dimension.is_active
      and dimension.code='peso' and upper(trim(dimension.base_unit_code))='KG'
      and abs(unit.conversion_factor_to_base-v_rule.reference_factor_to_kg)<=0.000000001;
    if v_unit.id is null or v_rule.reference_factor_to_kg is null or v_rule.reference_factor_to_kg<=0 then
      new.cost_calculation_status := 'invalid_reference';
      new.cost_base_unit_snapshot := null;
      new.cost_total_input_precise := null;
      new.cost_source := null;
      return new;
    end if;
    new.cost_reference_unit_symbol_snapshot := v_unit.symbol;
    if new.actual_weight_kg is null or new.actual_weight_kg<=0 then
      new.cost_calculation_status := 'pending_weight';
      new.cost_quantity_snapshot := null;
      new.cost_base_unit_snapshot := null;
      new.cost_total_input_precise := null;
      new.cost_source := null;
      return new;
    end if;
    v_quantity := round(new.actual_weight_kg/v_rule.reference_factor_to_kg,8);
    new.cost_quantity_snapshot := v_quantity;
  end if;
  v_total := round(v_quantity*v_rule.rate_amount,8);
  new.cost_base_unit_snapshot := case when new.delivered_base_quantity>0
    then round(v_total/new.delivered_base_quantity,8) else null end;
  new.cost_total_input_precise := v_total;
  new.cost_source := 'configured_rule';
  new.cost_calculation_status := 'ready';
  return new;
end;
$$;
revoke all on function private.snapshot_qb_receipt_cost_rule() from public, anon, authenticated;
commit;
