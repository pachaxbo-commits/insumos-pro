-- Migration: 20261116233000_qb_fifo_override_guards_and_distinct_cost_references.sql
-- 1. Ensure configured cost rules (qb_product_cost_rules) never override FIFO on new receipts
--    nor prefill cost when there is no warehouse stock (starts in Bs 0).
-- 2. Protect confirmed FIFO cost from accidental in-table editing in set_qb_receipt_line_pricing,
--    while preserving cost_source = 'fifo' on factor/surcharge edits, and providing an explicit
--    audited action (override_qb_receipt_fifo_cost) without mutating lots or consumptions.
-- 3. Clearly differentiate historical references in get_qb_receipt_lines_fifo_context:
--    - previous sale price (customer/product)
--    - previous confirmed purchase cost (strictly from confirmed purchases)
--    - previous manual receipt cost (strictly from manual receipt entries)

begin;

-- 1. Update snapshot_qb_receipt_cost_rule to NOT assign cost rules to line_cost_markup receipts.
create or replace function private.snapshot_qb_receipt_cost_rule()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_commercial record;
begin
  if not exists (
    select 1 from public.qb_receipts receipt
     where receipt.id = new.receipt_id and receipt.pricing_mode = 'line_cost_markup'
  ) then
    return new;
  end if;

  -- New receipt lines use the catalog's sale snapshot independently of cost.
  new.sale_price_independent_snapshot := true;
  new.base_price_used := null;

  select round(
    settings.base_sale_price * target.conversion_factor_to_base / reference.conversion_factor_to_base,
    4
  )
  into new.base_price_used
  from public.qb_product_unit_settings settings
  join public.qb_units reference on reference.id = settings.base_price_unit_id
  join public.qb_units target on target.id = new.base_unit_id
    and (
      target.dimension_id = reference.dimension_id
      or (
        target.code = 'kg'
        and target.conversion_factor_to_base = 1
        and upper(trim(reference.symbol)) = 'KG'
        and reference.conversion_factor_to_base = 1
        and exists (
          select 1 from public.qb_unit_dimensions rd
           where rd.id = reference.dimension_id and rd.code = 'legacy_dump'
        )
      )
    )
  join public.qb_unit_dimensions dimension on dimension.id = target.dimension_id
  where settings.product_id = new.product_id
    and settings.base_sale_price > 0
    and settings.base_sale_price::text not in ('NaN', 'Infinity', '-Infinity')
    and reference.is_active
    and target.is_active
    and dimension.is_active
    and reference.conversion_factor_to_base > 0
    and target.conversion_factor_to_base > 0
    and (dimension.code <> 'legacy_dump' or target.id = reference.id);

  select delivery.delivered_quantity, item.source_label, item.conversion_factor_to_base
    into v_commercial
  from public.qb_order_preparation_items preparation
  join public.qb_order_items item on item.id = preparation.order_item_id
  join public.qb_order_delivery_items delivery on delivery.order_item_id = item.id
    and delivery.preparation_item_id = preparation.id
  where preparation.id = new.preparation_item_id
    and item.product_id = new.product_id
    and item.order_input_mode = 'quantity'
    and delivery.delivered_quantity >= 0
    and item.conversion_factor_to_base > 0
    and nullif(trim(item.source_label), '') is not null;

  if found then
    new.commercial_quantity_snapshot := v_commercial.delivered_quantity;
    new.commercial_unit_label_snapshot := v_commercial.source_label;
    new.commercial_conversion_factor_snapshot := v_commercial.conversion_factor_to_base;
  end if;

  -- Under the agreed flow, cost rules in qb_product_cost_rules NEVER determine
  -- cost for new receipts in line_cost_markup mode:
  -- - Delivered warehouse stock uses FIFO from confirmed purchases.
  -- - Products without stock start in Bs 0 (null in DB).
  new.cost_rule_id := null;
  new.cost_basis_snapshot := null;
  new.cost_rate_snapshot := null;
  new.cost_reference_unit_id_snapshot := null;
  new.cost_reference_unit_symbol_snapshot := null;
  new.cost_reference_factor_to_kg_snapshot := null;
  new.cost_quantity_snapshot := null;
  new.cost_rule_snapshot := null;
  new.cost_calculation_status := 'unconfigured';

  return new;
end;
$$;

revoke all on function private.snapshot_qb_receipt_cost_rule() from public, anon, authenticated;

-- 2. Update snapshot_fifo_cost_for_new_receipt_line to remove cost_rule_id early return
create or replace function public.snapshot_fifo_cost_for_new_receipt_line()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_pricing_mode text;
  v_delivery_count integer;
  v_delivery public.qb_order_delivery_movements%rowtype;
  v_delivery_item public.qb_order_delivery_items%rowtype;
  v_reconciled_qty numeric(18, 6) := 0;
  v_external_qty numeric(18, 6) := 0;
  v_unreconciled_external numeric(18, 6) := 0;
  v_expected_fifo_qty numeric(18, 6) := 0;
  v_consumed_qty numeric(18, 6) := 0;
  v_fifo_total_cost numeric(20, 8) := 0;
  v_unknown_count integer := 0;
  v_last_purchase_line_id uuid;
  v_ref_unit_id uuid;
  v_ref_price numeric(20, 8);
  v_factor_total numeric;
begin
  select receipt.pricing_mode
    into v_pricing_mode
    from public.qb_receipts receipt
   where receipt.id = new.receipt_id;

  if v_pricing_mode is distinct from 'line_cost_markup' then
    return new;
  end if;

  -- Clean initialization: never inherit legacy rules, Provisión precharge,
  -- unconsumed warehouse purchases, or prior manual receipt memory.
  new.cost_base_unit_snapshot := null;
  new.cost_total_input_precise := null;
  new.cost_total_precise := null;
  new.cost_source := null;
  new.receipt_cost_saved_at := null;
  new.sale_price_independent_snapshot := false;
  new.cost_rule_id := null;
  new.cost_basis_snapshot := null;
  new.cost_rate_snapshot := null;
  new.cost_reference_unit_id_snapshot := null;
  new.cost_reference_unit_symbol_snapshot := null;
  new.cost_reference_factor_to_kg_snapshot := null;
  new.cost_quantity_snapshot := null;
  new.cost_rule_snapshot := null;
  new.cost_calculation_status := 'unconfigured';
  new.warehouse_purchase_line_id := null;
  new.purchase_cost_reference_unit_id := null;
  new.purchase_cost_reference_value := null;
  if new.order_input_mode = 'quantity' then
    new.base_price_used := null;
    new.final_unit_price := null;
    new.line_total := null;
    new.sale_total_precise := null;
    new.profit_unit_precise := null;
    new.profit_total_precise := null;
  end if;

  if new.preparation_item_id is null or coalesce(new.delivered_base_quantity, 0) <= 0 then
    return new;
  end if;

  select count(*)
    into v_delivery_count
    from public.qb_order_delivery_movements movement
   where movement.preparation_item_id = new.preparation_item_id;

  if v_delivery_count <> 1 then
    return new;
  end if;

  select *
    into v_delivery
    from public.qb_order_delivery_movements movement
   where movement.preparation_item_id = new.preparation_item_id;

  if not found then
    return new;
  end if;

  select *
    into v_delivery_item
    from public.qb_order_delivery_items item
   where item.id = v_delivery.delivery_item_id;

  select coalesce(req.reconciled_quantity, 0)
    into v_reconciled_qty
    from public.qb_same_day_reconciliation_requests req
   where req.delivery_movement_id = v_delivery.id;

  v_reconciled_qty := coalesce(v_reconciled_qty, 0);

  if v_delivery_item.id is not null then
    v_external_qty := greatest(
      coalesce(v_delivery_item.externally_sourced_base_quantity, 0),
      coalesce(v_delivery_item.external_definitive_base_quantity, 0)
        + coalesce(v_delivery_item.pending_incoming_base_quantity, 0)
        + coalesce(v_delivery_item.origin_review_base_quantity, 0)
    );
  else
    v_external_qty := greatest(
      coalesce(v_delivery.delivered_base_quantity, 0) - coalesce(v_delivery.warehouse_base_quantity, 0),
      0
    );
  end if;

  v_unreconciled_external := greatest(v_external_qty - v_reconciled_qty, 0);
  v_expected_fifo_qty := coalesce(v_delivery.warehouse_base_quantity, 0) + v_reconciled_qty;

  if v_expected_fifo_qty <= 0 or v_unreconciled_external > 0.000001 then
    return new;
  end if;

  select
    coalesce(sum(consumption.quantity_consumed), 0),
    coalesce(
      sum(round(consumption.quantity_consumed * coalesce(consumption.unit_cost, lot.unit_cost), 8))
      filter (
        where consumption.cost_status = 'known'
          and consumption.total_cost is not null
          and coalesce(consumption.unit_cost, lot.unit_cost) is not null
          and coalesce(consumption.unit_cost, lot.unit_cost) > 0
      ),
      0
    ),
    count(*) filter (
      where consumption.cost_status <> 'known'
        or consumption.total_cost is null
        or coalesce(consumption.unit_cost, lot.unit_cost) is null
        or coalesce(consumption.unit_cost, lot.unit_cost) <= 0
    )
    into v_consumed_qty, v_fifo_total_cost, v_unknown_count
    from public.inventory_lot_consumptions consumption
    left join public.inventory_lots lot on lot.id = consumption.lot_id
   where consumption.delivery_movement_id = v_delivery.id;

  if v_unknown_count = 0
     and abs(v_consumed_qty - v_expected_fifo_qty) <= 0.000001
     and v_fifo_total_cost > 0 then
    select purchase_line.id, purchase_line.reference_unit_id, purchase_line.reference_price
      into v_last_purchase_line_id, v_ref_unit_id, v_ref_price
      from public.inventory_lot_consumptions consumption
      join public.inventory_lots lot on lot.id = consumption.lot_id
      join public.qb_merchandise_receipt_movements receipt_movement
        on receipt_movement.id = lot.source_receipt_movement_id
      join public.qb_merchandise_receipt_lines purchase_line
        on purchase_line.id = receipt_movement.line_id
     where consumption.delivery_movement_id = v_delivery.id
     order by lot.received_at desc, consumption.created_at desc, consumption.id desc
     limit 1;

    new.cost_total_input_precise := round(v_fifo_total_cost, 8);
    new.cost_base_unit_snapshot := round(v_fifo_total_cost / new.delivered_base_quantity, 8);
    new.cost_total_precise := round(v_fifo_total_cost, 8);
    new.cost_source := 'fifo';
    new.cost_calculation_status := 'ready';
    new.receipt_cost_saved_at := now();
    new.warehouse_purchase_line_id := v_last_purchase_line_id;
    new.purchase_cost_reference_unit_id := v_ref_unit_id;
    new.purchase_cost_reference_value := v_ref_price;

    v_factor_total := coalesce(new.distance_factor_percent, 0)
      + coalesce(new.exigency_factor_percent, 0)
      + coalesce(new.weather_factor_percent, 0)
      + coalesce(new.extraordinary_factor_percent, 0);

    if new.order_input_mode = 'amount_bs' then
      new.sale_total_precise := new.fixed_line_amount;
      new.line_total := new.fixed_line_amount;
      new.profit_unit_precise := round(new.fixed_line_amount / new.delivered_base_quantity - new.cost_base_unit_snapshot, 8);
      new.profit_total_precise := round(new.sale_total_precise - new.cost_total_precise, 8);
    else
      new.base_price_used := round(new.cost_base_unit_snapshot, 4);
      new.final_unit_price := round(new.cost_base_unit_snapshot * (1 + v_factor_total / 100), 4);
      new.sale_total_precise := round(new.delivered_base_quantity * new.cost_base_unit_snapshot * (1 + v_factor_total / 100), 8);
      new.line_total := round(new.sale_total_precise, 2);
      new.profit_unit_precise := round(new.cost_base_unit_snapshot * v_factor_total / 100, 8);
      new.profit_total_precise := round(new.sale_total_precise - new.cost_total_precise, 8);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.snapshot_fifo_cost_for_new_receipt_line() from public, anon, authenticated;

-- 3. Update set_qb_receipt_line_pricing to guard FIFO costs from accidental in-table modification
create or replace function public.set_qb_receipt_line_pricing(p_receipt_id uuid, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_line jsonb;
  v_id uuid;
  v_existing public.qb_receipt_lines%rowtype;
  v_cost numeric;
  v_total numeric;
  v_dist numeric;
  v_exig numeric;
  v_weather numeric;
  v_extra numeric;
  v_note text;
  v_count integer := 0;
  v_keep_fifo boolean;
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('admin', 'administrador'), false) then
    raise exception 'QB_RECEIPT_ADMIN_WRITE_REQUIRED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.qb_receipts
     where id = p_receipt_id and status = 'borrador' and pricing_mode = 'line_cost_markup'
     for update
  ) then
    raise exception 'QB_LINE_PRICING_REQUIRES_DRAFT';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'QB_LINE_PRICING_INVALID_LINES';
  end if;

  perform set_config('qb.line_pricing_write', 'enabled', true);

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_id := (v_line ->> 'line_id')::uuid;
    v_cost := nullif(trim(v_line ->> 'cost_base_unit'), '')::numeric;
    v_total := nullif(trim(v_line ->> 'cost_total'), '')::numeric;
    v_dist := (v_line ->> 'distance_factor_percent')::numeric;
    v_exig := (v_line ->> 'exigency_factor_percent')::numeric;
    v_weather := (v_line ->> 'weather_factor_percent')::numeric;
    v_extra := (v_line ->> 'extraordinary_factor_percent')::numeric;
    v_note := nullif(trim(coalesce(v_line ->> 'notes', '')), '');

    if (v_cost is not null and (v_cost::text in ('NaN', 'Infinity', '-Infinity') or v_cost < 0 or v_cost > 99999999))
      or (v_total is not null and (v_total::text in ('NaN', 'Infinity', '-Infinity') or v_total < 0 or v_total > 999999999999))
      or v_dist is null or v_exig is null or v_weather is null or v_extra is null
      or v_dist::text in ('NaN', 'Infinity', '-Infinity')
      or v_exig::text in ('NaN', 'Infinity', '-Infinity')
      or v_weather::text in ('NaN', 'Infinity', '-Infinity')
      or v_extra::text in ('NaN', 'Infinity', '-Infinity')
      or least(v_dist, v_exig, v_weather, v_extra) < 0
      or greatest(v_dist, v_exig, v_weather, v_extra) > 1000
      or v_dist <> round(v_dist, 3) or v_exig <> round(v_exig, 3)
      or v_weather <> round(v_weather, 3) or v_extra <> round(v_extra, 3)
      or length(coalesce(v_note, '')) > 500 then
      raise exception 'QB_LINE_PRICING_INVALID_VALUE';
    end if;

    select * into v_existing
      from public.qb_receipt_lines
     where id = v_id and receipt_id = p_receipt_id
     for update;
    if not found then
      raise exception 'QB_LINE_PRICING_LINE_NOT_FOUND';
    end if;

    if v_existing.order_input_mode = 'amount_bs'
       and (v_dist + v_exig + v_weather + v_extra) <> 0 then
      raise exception 'QB_AMOUNT_RECEIPT_FIXED_SALE';
    end if;

    if v_cost is null or v_total is not null then
      raise exception 'Indica una tarifa de costo en la unidad de la línea.';
    end if;

    -- If the line already has a confirmed FIFO cost from inventory lots:
    if v_existing.cost_source = 'fifo' and v_existing.cost_base_unit_snapshot is not null then
      if round(v_cost, 8) <> round(v_existing.cost_base_unit_snapshot, 8) then
        raise exception 'QB_FIFO_COST_OVERRIDE_REQUIRES_EXPLICIT_ACTION: La tarifa calculada por FIFO no puede modificarse directamente en la tabla. Usa la acción de corrección excepcional con motivo de auditoría.'
          using errcode = '42500';
      end if;
      v_keep_fifo := true;
    else
      v_keep_fifo := false;
    end if;

    update public.qb_receipt_lines set
      receipt_cost_saved_at = clock_timestamp(),
      sale_price_independent_snapshot = false,
      cost_rule_id = null,
      cost_basis_snapshot = null,
      cost_rate_snapshot = null,
      cost_reference_unit_id_snapshot = null,
      cost_reference_unit_symbol_snapshot = null,
      cost_reference_factor_to_kg_snapshot = null,
      cost_quantity_snapshot = null,
      cost_rule_snapshot = null,
      cost_calculation_status = case when v_keep_fifo then 'ready' else 'manual_override' end,
      cost_base_unit_snapshot = case when v_keep_fifo then v_existing.cost_base_unit_snapshot else v_cost end,
      cost_total_input_precise = case when v_keep_fifo then v_existing.cost_total_input_precise else null end,
      cost_source = case when v_keep_fifo then 'fifo' else 'manual' end,
      distance_factor_percent = v_dist,
      exigency_factor_percent = v_exig,
      weather_factor_percent = v_weather,
      extraordinary_factor_percent = v_extra,
      notes = v_note
    where id = v_id and receipt_id = p_receipt_id;

    v_count := v_count + 1;
  end loop;

  perform public.recalculate_qb_receipt_totals(p_receipt_id);

  insert into public.qb_receipt_events(receipt_id, event_type, metadata, created_by)
  values (
    p_receipt_id,
    'lineas_editadas',
    jsonb_build_object('line_count', v_count, 'pricing_mode', 'line_cost_markup'),
    auth.uid()
  );

  return p_receipt_id;
end;
$$;

revoke all on function public.set_qb_receipt_line_pricing(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_qb_receipt_line_pricing(uuid, jsonb) to authenticated;

-- Allow the exceptional audit event type in qb_receipt_events
alter table public.qb_receipt_events
  drop constraint if exists qb_receipt_events_type_check;

alter table public.qb_receipt_events
  add constraint qb_receipt_events_type_check check (
    event_type in (
      'creado',
      'lineas_editadas',
      'precio_base_actualizado',
      'emitido',
      'anulado',
      'reemplazado',
      'control_actualizado',
      'costos_compra_actualizados',
      'costo_fifo_corregido_manualmente'
    )
  );

-- 4. Explicit exceptional action to override a FIFO cost with audit trail
create or replace function public.override_qb_receipt_fifo_cost(
  p_receipt_id uuid,
  p_line_id uuid,
  p_new_cost numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_existing public.qb_receipt_lines%rowtype;
  v_trimmed_reason text;
  v_new_cost numeric;
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('admin', 'administrador'), false) then
    raise exception 'QB_RECEIPT_ADMIN_WRITE_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.qb_receipts
     where id = p_receipt_id and status = 'borrador' and pricing_mode = 'line_cost_markup'
     for update
  ) then
    raise exception 'QB_LINE_PRICING_REQUIRES_DRAFT';
  end if;

  v_trimmed_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_trimmed_reason is null or length(v_trimmed_reason) < 3 or length(v_trimmed_reason) > 500 then
    raise exception 'Debes indicar un motivo de corrección válido (mínimo 3 caracteres).';
  end if;

  v_new_cost := p_new_cost;
  if v_new_cost is null
     or v_new_cost::text in ('NaN', 'Infinity', '-Infinity')
     or v_new_cost < 0
     or v_new_cost > 99999999 then
    raise exception 'Indica una tarifa de costo válida.';
  end if;

  select * into v_existing
    from public.qb_receipt_lines
   where id = p_line_id and receipt_id = p_receipt_id
   for update;
  if not found then
    raise exception 'QB_LINE_PRICING_LINE_NOT_FOUND';
  end if;

  perform set_config('qb.line_pricing_write', 'enabled', true);

  -- Updates only the receipt line and marks it as manual override with audit notes.
  -- Does NOT mutate inventory_lots or inventory_lot_consumptions.
  update public.qb_receipt_lines set
    cost_base_unit_snapshot = round(v_new_cost, 8),
    cost_total_input_precise = null,
    cost_source = 'manual',
    cost_calculation_status = 'manual_override',
    receipt_cost_saved_at = clock_timestamp(),
    notes = case
      when notes is null or trim(notes) = '' then 'Corrección excepcional FIFO: ' || v_trimmed_reason
      else notes || ' | Corrección excepcional FIFO: ' || v_trimmed_reason
    end
  where id = p_line_id and receipt_id = p_receipt_id;

  perform public.recalculate_qb_receipt_totals(p_receipt_id);

  insert into public.qb_receipt_events(receipt_id, event_type, metadata, created_by)
  values (
    p_receipt_id,
    'costo_fifo_corregido_manualmente',
    jsonb_build_object(
      'line_id', p_line_id,
      'product_id', v_existing.product_id,
      'previous_cost_source', v_existing.cost_source,
      'previous_cost', v_existing.cost_base_unit_snapshot,
      'new_cost', round(v_new_cost, 8),
      'reason', v_trimmed_reason
    ),
    auth.uid()
  );

  return p_receipt_id;
end;
$$;

revoke all on function public.override_qb_receipt_fifo_cost(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.override_qb_receipt_fifo_cost(uuid, uuid, numeric, text) to authenticated;

-- 5. Clearly distinguish confirmed purchase cost reference from manual prior cost in get_qb_receipt_lines_fifo_context
drop function if exists public.get_qb_receipt_lines_fifo_context(uuid[]);

create or replace function public.get_qb_receipt_lines_fifo_context(p_receipts uuid[])
returns table(
  line_id uuid,
  warehouse_base_quantity numeric,
  external_base_quantity numeric,
  fifo_known_quantity numeric,
  fifo_known_total_cost numeric,
  fifo_unknown_quantity numeric,
  fifo_lot_count integer,
  fifo_lots_summary text,
  previous_purchase_cost_value numeric,
  previous_purchase_cost_unit_symbol text,
  previous_manual_cost_value numeric,
  previous_manual_cost_unit_symbol text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('admin', 'administrador'), false) then
    raise exception 'Acceso denegado.' using errcode = '42501';
  end if;

  if p_receipts is null or coalesce(array_length(p_receipts, 1), 0) = 0 then
    return;
  end if;

  return query
  with target_lines as (
    select
      l.id as line_id,
      l.receipt_id,
      l.product_id,
      l.preparation_item_id,
      l.base_unit_id,
      l.base_unit_symbol,
      r.created_at as receipt_created_at,
      r.issued_at as receipt_issued_at,
      dm.id as delivery_movement_id,
      dm.delivered_at as delivery_at,
      dm.warehouse_base_quantity as raw_warehouse_qty,
      dm.delivered_base_quantity as raw_delivered_qty,
      di.id as delivery_item_id,
      di.externally_sourced_base_quantity,
      di.external_definitive_base_quantity,
      di.pending_incoming_base_quantity,
      di.origin_review_base_quantity,
      coalesce(req.reconciled_quantity, 0) as reconciled_qty,
      inv_u.symbol as inventory_unit_symbol
    from public.qb_receipt_lines l
    join public.qb_receipts r on r.id = l.receipt_id
    left join lateral (
      select m.*
        from public.qb_order_delivery_movements m
       where m.preparation_item_id = l.preparation_item_id
       order by m.created_at desc, m.id desc
       limit 1
    ) dm on (
      select count(*) from public.qb_order_delivery_movements cnt
       where cnt.preparation_item_id = l.preparation_item_id
    ) = 1
    left join public.qb_order_delivery_items di on di.id = dm.delivery_item_id
    left join public.qb_same_day_reconciliation_requests req on req.delivery_movement_id = dm.id
    left join public.qb_product_unit_settings pus on pus.product_id = l.product_id
    left join public.qb_units inv_u
      on inv_u.id = coalesce(pus.base_inventory_unit_id, pus.inventory_unit_id, pus.base_unit_id)
   where r.id = any(p_receipts)
  ),
  fifo_stats as (
    select
      tl.line_id,
      coalesce(
        sum(c.quantity_consumed) filter (
          where c.cost_status = 'known'
            and c.total_cost is not null
            and coalesce(c.unit_cost, lot.unit_cost) is not null
            and coalesce(c.unit_cost, lot.unit_cost) > 0
        ),
        0
      ) as known_qty,
      coalesce(
        sum(round(c.quantity_consumed * coalesce(c.unit_cost, lot.unit_cost), 8)) filter (
          where c.cost_status = 'known'
            and c.total_cost is not null
            and coalesce(c.unit_cost, lot.unit_cost) is not null
            and coalesce(c.unit_cost, lot.unit_cost) > 0
        ),
        0
      ) as known_cost,
      coalesce(
        sum(c.quantity_consumed) filter (
          where c.cost_status <> 'known'
            or c.total_cost is null
            or coalesce(c.unit_cost, lot.unit_cost) is null
            or coalesce(c.unit_cost, lot.unit_cost) <= 0
        ),
        0
      ) as unknown_qty,
      count(distinct c.lot_id) filter (
        where c.cost_status = 'known'
          and c.total_cost is not null
          and coalesce(c.unit_cost, lot.unit_cost) is not null
          and coalesce(c.unit_cost, lot.unit_cost) > 0
      )::integer as lot_count,
      string_agg(
        case
          when c.cost_status = 'known'
               and c.total_cost is not null
               and coalesce(c.unit_cost, lot.unit_cost) is not null
               and coalesce(c.unit_cost, lot.unit_cost) > 0
            then trim_scale(round(c.quantity_consumed, 4))::text
              || ' ' || coalesce(tl.inventory_unit_symbol, tl.base_unit_symbol)
              || ' × Bs '
              || case
                   when round(coalesce(c.unit_cost, lot.unit_cost), 4) <> round(coalesce(c.unit_cost, lot.unit_cost), 2)
                     then to_char(round(coalesce(c.unit_cost, lot.unit_cost), 4), 'FM999999990.0099')
                   else to_char(round(coalesce(c.unit_cost, lot.unit_cost), 2), 'FM999999990.00')
                 end
          else trim_scale(round(c.quantity_consumed, 4))::text
            || ' ' || coalesce(tl.inventory_unit_symbol, tl.base_unit_symbol)
            || ' × Sin costo'
        end,
        ' + '
        order by lot.received_at asc nulls first, c.created_at asc, c.id asc
      ) as lots_summary
    from target_lines tl
    join public.inventory_lot_consumptions c on c.delivery_movement_id = tl.delivery_movement_id
    left join public.inventory_lots lot on lot.id = c.lot_id
   group by tl.line_id
  ),
  latest_consumed_purchase as (
    select distinct on (tl.line_id)
      tl.line_id,
      coalesce(rm.line_id, cr.line_id) as latest_line_id
    from target_lines tl
    join public.inventory_lot_consumptions c on c.delivery_movement_id = tl.delivery_movement_id
    join public.inventory_lots lot on lot.id = c.lot_id
    left join public.qb_merchandise_receipt_movements rm on rm.id = lot.source_receipt_movement_id
    left join public.qb_merchandise_receipt_lines ml on ml.id = rm.line_id
    left join public.qb_merchandise_receipt_classification_results cr on cr.id = rm.classification_result_id
    left join public.qb_merchandise_receipt_lines cl on cl.id = cr.line_id
    left join public.qb_merchandise_receipts mr on mr.id = coalesce(ml.receipt_id, cl.receipt_id)
    where coalesce(rm.line_id, cr.line_id) is not null
    order by tl.line_id, coalesce(mr.confirmed_at, lot.received_at) desc, c.created_at desc
  ),
  prev_purchase as (
    select distinct on (tl.line_id)
      tl.line_id,
      pur.cost_value,
      tl.base_unit_symbol as unit_symbol
    from target_lines tl
    left join latest_consumed_purchase lcp on lcp.line_id = tl.line_id
    cross join lateral (
      select candidate.cost_value, candidate.event_at
      from (
        select
          private.qb_convert_unit_cost(
            case
              when ml.total_cost is not null and ml.total_cost > 0 and ml.base_quantity > 0
                then round(ml.total_cost / ml.base_quantity, 8)
              when ml.reference_price is not null and ml.reference_price > 0 and ml.reference_unit_id is not null
                then private.qb_convert_unit_cost(ml.reference_price, ml.reference_unit_id, ml.base_unit_id)
              else null
            end,
            ml.base_unit_id,
            tl.base_unit_id
          ) as cost_value,
          mr.confirmed_at as event_at,
          ml.created_at as line_created_at,
          ml.id as line_id
        from public.qb_merchandise_receipt_lines ml
        join public.qb_merchandise_receipts mr on mr.id = ml.receipt_id
        where ml.product_id = tl.product_id
          and not ml.requires_classification
          and mr.status = 'confirmado'
          and mr.confirmed_at <= coalesce(tl.delivery_at, tl.receipt_issued_at, tl.receipt_created_at)
          and (lcp.latest_line_id is null or ml.id <> lcp.latest_line_id)
        union all
        select
          private.qb_convert_unit_cost(
            round(cr.assigned_cost / cr.base_quantity, 8),
            ml.base_unit_id,
            tl.base_unit_id
          ) as cost_value,
          mr.confirmed_at as event_at,
          ml.created_at as line_created_at,
          ml.id as line_id
        from public.qb_merchandise_receipt_classification_results cr
        join public.qb_merchandise_receipt_lines ml on ml.id = cr.line_id
        join public.qb_merchandise_receipts mr on mr.id = ml.receipt_id
        where cr.output_type = 'product'
          and cr.output_product_id = tl.product_id
          and cr.base_quantity > 0
          and cr.assigned_cost > 0
          and mr.status = 'confirmado'
          and mr.confirmed_at <= coalesce(tl.delivery_at, tl.receipt_issued_at, tl.receipt_created_at)
          and (lcp.latest_line_id is null or ml.id <> lcp.latest_line_id)
      ) candidate
      where candidate.cost_value is not null
      order by candidate.event_at desc, candidate.line_created_at desc, candidate.line_id desc
      limit 1
    ) pur
    where pur.cost_value is not null
  ),
  prev_manual as (
    select distinct on (tl.line_id)
      tl.line_id,
      private.qb_convert_unit_cost(lp.cost_base_unit_snapshot, lp.base_unit_id, tl.base_unit_id) as cost_value,
      tl.base_unit_symbol as unit_symbol
    from target_lines tl
    join public.qb_receipt_lines lp on lp.product_id = tl.product_id
    join public.qb_receipts rp on rp.id = lp.receipt_id
    where rp.id <> tl.receipt_id
      and rp.status in ('borrador', 'emitido')
      and rp.pricing_mode = 'line_cost_markup'
      and lp.cost_source = 'manual'
      and lp.cost_base_unit_snapshot is not null
      and (coalesce(rp.issued_at, rp.created_at), rp.id)
        < (coalesce(tl.receipt_issued_at, tl.receipt_created_at), tl.receipt_id)
      and private.qb_convert_unit_cost(lp.cost_base_unit_snapshot, lp.base_unit_id, tl.base_unit_id) is not null
    order by tl.line_id, coalesce(lp.receipt_cost_saved_at, rp.issued_at, rp.created_at) desc, lp.id desc
  )
  select
    tl.line_id,
    case
      when tl.delivery_movement_id is null then null::numeric
      else coalesce(tl.raw_warehouse_qty, 0) + tl.reconciled_qty
    end as warehouse_base_quantity,
    case
      when tl.delivery_movement_id is null then null::numeric
      when tl.delivery_item_id is not null then
        greatest(
          greatest(
            coalesce(tl.externally_sourced_base_quantity, 0),
            coalesce(tl.external_definitive_base_quantity, 0)
              + coalesce(tl.pending_incoming_base_quantity, 0)
              + coalesce(tl.origin_review_base_quantity, 0)
          ) - tl.reconciled_qty,
          0
        )
      else greatest(coalesce(tl.raw_delivered_qty, 0) - coalesce(tl.raw_warehouse_qty, 0) - tl.reconciled_qty, 0)
    end as external_base_quantity,
    coalesce(fs.known_qty, 0)::numeric as fifo_known_quantity,
    coalesce(fs.known_cost, 0)::numeric as fifo_known_total_cost,
    coalesce(fs.unknown_qty, 0)::numeric as fifo_unknown_quantity,
    coalesce(fs.lot_count, 0)::integer as fifo_lot_count,
    fs.lots_summary,
    pp.cost_value as previous_purchase_cost_value,
    pp.unit_symbol as previous_purchase_cost_unit_symbol,
    pm.cost_value as previous_manual_cost_value,
    pm.unit_symbol as previous_manual_cost_unit_symbol
  from target_lines tl
  left join fifo_stats fs on fs.line_id = tl.line_id
  left join prev_purchase pp on pp.line_id = tl.line_id
  left join prev_manual pm on pm.line_id = tl.line_id;
end;
$$;

revoke all on function public.get_qb_receipt_lines_fifo_context(uuid[]) from public, anon, authenticated;
grant execute on function public.get_qb_receipt_lines_fifo_context(uuid[]) to authenticated;

commit;
