-- Integrate confirmed-purchase FIFO lot costs into receipt lines.
-- 1. Products without stock start at NULL in DB (Bs 0 editable in UI), never
--    pre-filled from prior manual receipt costs or unconfirmed Provisión costs.
-- 2. Products with stock delivered from warehouse lots use the exact weighted
--    FIFO cost from inventory_lot_consumptions (and survive stock reaching 0).
-- 3. Unknown historical stock or unreconciled external portions remain pending
--    without inventing rates or assuming zero cost.

begin;

alter table public.inventory_lots
  alter column unit_cost type numeric(20, 8);

alter table public.inventory_lot_consumptions
  alter column unit_cost type numeric(20, 8),
  alter column total_cost type numeric(20, 8);

alter table public.inventory_lot_writeoffs
  alter column unit_cost type numeric(20, 8);

create or replace function public.create_inventory_lot_from_receipt_movement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
  v_quantity numeric(18, 6);
  v_unit_cost numeric(20, 8);
  v_received_at timestamptz;
begin
  if new.movement_type <> 'entrada'
     or new.movement_role not in ('direct_entry', 'classified_output') then
    return new;
  end if;

  select
    new.product_id,
    least(new.movement_quantity, greatest(inventory.stock_after, 0)),
    case
      when new.classification_result_id is not null then
        case
          when result.assigned_cost is not null
               and result.assigned_cost > 0
               and result.base_quantity is not null
               and result.base_quantity > 0
            then round(result.assigned_cost / result.base_quantity, 8)
          else null
        end
      else
        case
          when line.total_cost is not null
               and line.total_cost > 0
               and line.base_quantity is not null
               and line.base_quantity > 0
            then round(line.total_cost / line.base_quantity, 8)
          when line.reference_price is not null
               and line.reference_price > 0
               and ref_unit.id is not null
               and base_unit.id is not null
               and ref_dim.is_active
               and ref_dim.code = 'peso'
               and ref_unit.is_active
               and base_unit.is_active
               and ref_unit.dimension_id = base_unit.dimension_id
               and lower(coalesce(ref_unit.code, '')) <> 'cuartilla'
               and lower(coalesce(base_unit.code, '')) <> 'cuartilla'
               and ref_unit.conversion_factor_to_base > 0
               and base_unit.conversion_factor_to_base > 0
            then round(
              line.reference_price * base_unit.conversion_factor_to_base
                / ref_unit.conversion_factor_to_base,
              8
            )
          else null
        end
    end,
    coalesce(receipt.confirmed_at, clock_timestamp())
    into v_product_id, v_quantity, v_unit_cost, v_received_at
    from public.qb_merchandise_receipt_lines line
    join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
    join public.inventory_movements inventory on inventory.id = new.inventory_movement_id
    left join public.qb_merchandise_receipt_classification_results result
      on result.id = new.classification_result_id
    left join public.qb_units ref_unit on ref_unit.id = line.reference_unit_id
    left join public.qb_unit_dimensions ref_dim on ref_dim.id = ref_unit.dimension_id
    left join public.qb_units base_unit on base_unit.id = line.base_unit_id
   where line.id = new.line_id
     and inventory.product_id = new.product_id;

  if v_product_id is null or v_quantity is null or v_quantity <= 0 then
    return new;
  end if;

  insert into public.inventory_lots (
    product_id, source_receipt_movement_id, initial_quantity, remaining_quantity, unit_cost, received_at
  ) values (
    v_product_id, new.id, v_quantity, v_quantity, v_unit_cost, v_received_at
  ) on conflict (source_receipt_movement_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_inventory_lot_from_receipt_movement() from public, anon, authenticated;

create or replace function public.consume_inventory_fifo_for_delivery()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_remaining numeric(18, 6) := new.warehouse_base_quantity;
  v_take numeric(18, 6);
  v_stock_before numeric(18, 6);
  v_movement_quantity numeric(18, 6);
  v_lot_total numeric(18, 6);
  v_gap numeric(18, 6);
  v_lot record;
begin
  if new.inventory_movement_id is null or coalesce(v_remaining, 0) <= 0 then
    return new;
  end if;

  select movement.stock_before, movement.quantity
    into v_stock_before, v_movement_quantity
    from public.inventory_movements movement
   where movement.id = new.inventory_movement_id
     and movement.product_id = new.product_id
     and movement.movement_type = 'salida';
  if v_stock_before is null or v_movement_quantity <> v_remaining then
    raise exception 'La salida de inventario no coincide con la cantidad retirada de bodega.';
  end if;

  insert into public.inventory_fifo_consumption_runs(inventory_movement_id)
  values (new.inventory_movement_id)
  on conflict (inventory_movement_id) do nothing;

  if not found then
    return new;
  end if;

  select coalesce(sum(remaining_quantity), 0) into v_lot_total
    from public.inventory_lots where product_id = new.product_id;

  v_gap := greatest(v_lot_total - greatest(v_stock_before, 0), 0);
  if v_gap > 0 then
    for v_lot in
      select id, remaining_quantity, unit_cost from public.inventory_lots
       where product_id = new.product_id and remaining_quantity > 0
       order by received_at, created_at, id for update
    loop
      exit when v_gap <= 0;
      v_take := least(v_gap, v_lot.remaining_quantity);
      update public.inventory_lots set remaining_quantity = remaining_quantity - v_take where id = v_lot.id;
      insert into public.inventory_lot_writeoffs(lot_id, detected_delivery_movement_id, quantity, unit_cost)
      values (v_lot.id, new.id, v_take, v_lot.unit_cost);
      v_gap := v_gap - v_take;
    end loop;
  end if;

  select coalesce(sum(remaining_quantity), 0) into v_lot_total
    from public.inventory_lots where product_id = new.product_id;
  v_take := least(v_remaining, greatest(v_stock_before - v_lot_total, 0));
  if v_take > 0 then
    insert into public.inventory_lot_consumptions (
      lot_id, product_id, delivery_movement_id, inventory_movement_id,
      quantity_consumed, unit_cost, total_cost, cost_status
    ) values (null, new.product_id, new.id, new.inventory_movement_id,
              v_take, null, null, 'historical_unknown');
    v_remaining := v_remaining - v_take;
  end if;

  for v_lot in
    select id, remaining_quantity, unit_cost
      from public.inventory_lots
     where product_id = new.product_id
       and remaining_quantity > 0
     order by received_at, created_at, id
     for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_lot.remaining_quantity);

    update public.inventory_lots
       set remaining_quantity = remaining_quantity - v_take
     where id = v_lot.id;

    insert into public.inventory_lot_consumptions (
      lot_id, product_id, delivery_movement_id, inventory_movement_id,
      quantity_consumed, unit_cost, total_cost, cost_status
    ) values (
      v_lot.id, new.product_id, new.id, new.inventory_movement_id,
      v_take, v_lot.unit_cost,
      case when v_lot.unit_cost is null or v_lot.unit_cost <= 0 then null else round(v_take * v_lot.unit_cost, 8) end,
      case when v_lot.unit_cost is null or v_lot.unit_cost <= 0 then 'historical_unknown' else 'known' end
    );

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    insert into public.inventory_lot_consumptions (
      lot_id, product_id, delivery_movement_id, inventory_movement_id,
      quantity_consumed, unit_cost, total_cost, cost_status
    ) values (
      null, new.product_id, new.id, new.inventory_movement_id,
      v_remaining, null, null, 'historical_unknown'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.consume_inventory_fifo_for_delivery() from public, anon, authenticated;

create or replace function private.consume_inventory_fifo_for_reconciliation(
  p_delivery_movement_id uuid,
  p_inventory_movement_id uuid,
  p_product_id uuid,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_remaining numeric(18, 6) := p_quantity;
  v_take numeric(18, 6);
  v_stock_before numeric(18, 6);
  v_movement_quantity numeric(18, 6);
  v_lot_total numeric(18, 6);
  v_gap numeric(18, 6);
  v_lot record;
begin
  select movement.stock_before, movement.quantity
    into v_stock_before, v_movement_quantity
    from public.inventory_movements movement
   where movement.id = p_inventory_movement_id
     and movement.product_id = p_product_id
     and movement.movement_type = 'salida';
  if v_stock_before is null or v_movement_quantity <> p_quantity then
    raise exception 'La salida de conciliación no coincide con su cantidad.';
  end if;

  insert into public.inventory_fifo_consumption_runs(inventory_movement_id)
  values (p_inventory_movement_id) on conflict do nothing;
  if not found then return; end if;

  select coalesce(sum(remaining_quantity), 0) into v_lot_total
    from public.inventory_lots where product_id = p_product_id;
  v_gap := greatest(v_lot_total - greatest(v_stock_before, 0), 0);
  if v_gap > 0 then
    for v_lot in
      select id, remaining_quantity, unit_cost from public.inventory_lots
       where product_id = p_product_id and remaining_quantity > 0
       order by received_at, created_at, id for update
    loop
      exit when v_gap <= 0;
      v_take := least(v_gap, v_lot.remaining_quantity);
      update public.inventory_lots set remaining_quantity = remaining_quantity - v_take where id = v_lot.id;
      insert into public.inventory_lot_writeoffs(lot_id, detected_delivery_movement_id, quantity, unit_cost)
      values (v_lot.id, p_delivery_movement_id, v_take, v_lot.unit_cost);
      v_gap := v_gap - v_take;
    end loop;
  end if;

  select coalesce(sum(remaining_quantity), 0) into v_lot_total
    from public.inventory_lots where product_id = p_product_id;
  v_take := least(v_remaining, greatest(v_stock_before - v_lot_total, 0));
  if v_take > 0 then
    insert into public.inventory_lot_consumptions(
      lot_id, product_id, delivery_movement_id, inventory_movement_id, quantity_consumed, unit_cost, total_cost, cost_status
    ) values (null, p_product_id, p_delivery_movement_id, p_inventory_movement_id, v_take, null, null, 'historical_unknown');
    v_remaining := v_remaining - v_take;
  end if;

  for v_lot in
    select id, remaining_quantity, unit_cost from public.inventory_lots
     where product_id = p_product_id and remaining_quantity > 0
     order by received_at, created_at, id for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_lot.remaining_quantity);
    update public.inventory_lots set remaining_quantity = remaining_quantity - v_take where id = v_lot.id;
    insert into public.inventory_lot_consumptions(
      lot_id, product_id, delivery_movement_id, inventory_movement_id, quantity_consumed, unit_cost, total_cost, cost_status
    ) values (
      v_lot.id, p_product_id, p_delivery_movement_id, p_inventory_movement_id, v_take, v_lot.unit_cost,
      case when v_lot.unit_cost is null or v_lot.unit_cost <= 0 then null else round(v_take * v_lot.unit_cost, 8) end,
      case when v_lot.unit_cost is null or v_lot.unit_cost <= 0 then 'historical_unknown' else 'known' end
    );
    v_remaining := v_remaining - v_take;
  end loop;
  if v_remaining > 0 then
    insert into public.inventory_lot_consumptions(
      lot_id, product_id, delivery_movement_id, inventory_movement_id, quantity_consumed, unit_cost, total_cost, cost_status
    ) values (null, p_product_id, p_delivery_movement_id, p_inventory_movement_id, v_remaining, null, null, 'historical_unknown');
  end if;
end;
$$;

revoke all on function private.consume_inventory_fifo_for_reconciliation(uuid, uuid, uuid, numeric) from public, anon, authenticated;

-- Remove old purchase-snapshot precharge trigger (replaced by FIFO lot consumptions).
drop trigger if exists zz_snapshot_warehouse_purchase_cost_on_receipt_line on public.qb_receipt_lines;
drop trigger if exists qb_snapshot_fifo_cost_on_new_receipt_line on public.qb_receipt_lines;

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

  -- Preserve explicit configured cost-basis rules when present.
  if new.cost_rule_id is not null then
    return new;
  end if;

  -- Clean initialization: never inherit Provisión precharge, latest warehouse
  -- purchase without FIFO consumption, or prior manual receipt cost memory.
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
comment on function public.snapshot_fifo_cost_for_new_receipt_line() is
  'Computes weighted FIFO cost snapshot for new receipt lines solely from inventory_lot_consumptions linked to confirmed purchases.';

create or replace function private.qb_set_receipt_cost_suggestion()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return public.snapshot_fifo_cost_for_new_receipt_line();
end;
$$;

revoke all on function private.qb_set_receipt_cost_suggestion() from public, anon, authenticated;

drop trigger if exists zzzz_qb_set_receipt_cost_suggestion on public.qb_receipt_lines;
create trigger zzzz_qb_set_receipt_cost_suggestion
  before insert on public.qb_receipt_lines
  for each row execute function public.snapshot_fifo_cost_for_new_receipt_line();

create or replace function private.guard_qb_configured_receipt_cost()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.receipt_cost_saved_at is distinct from old.receipt_cost_saved_at
     and new.cost_source in ('manual', 'fifo')
     and current_setting('qb.line_pricing_write', true) = 'enabled' then
    return new;
  end if;
  if old.cost_rule_id is not null and old.cost_basis_snapshot is not null then
    if new.cost_base_unit_snapshot is distinct from old.cost_base_unit_snapshot then
      raise exception 'QB_CONFIGURED_COST_OVERRIDE_FORBIDDEN';
    end if;
    new.cost_total_input_precise := old.cost_total_input_precise;
    new.cost_source := old.cost_source;
    new.cost_calculation_status := old.cost_calculation_status;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_qb_configured_receipt_cost() from public, anon, authenticated;

create or replace function private.guard_qb_legacy_receipt_cost_on_edit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.receipt_cost_saved_at is distinct from old.receipt_cost_saved_at
     and new.cost_source in ('manual', 'fifo')
     and current_setting('qb.line_pricing_write', true) = 'enabled' then
    return new;
  end if;
  if private.qb_legacy_receipt_cost_needs_review(old)
    and (new.cost_base_unit_snapshot is distinct from old.cost_base_unit_snapshot
      or new.cost_source is distinct from old.cost_source
      or new.cost_total_input_precise is distinct from old.cost_total_input_precise
      or new.sale_price_independent_snapshot is distinct from old.sale_price_independent_snapshot)
    and current_setting('qb.legacy_cost_review_line', true) is distinct from old.id::text then
    raise exception 'Usa la revisión de costo histórico para modificar esta línea.';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_qb_legacy_receipt_cost_on_edit() from public, anon, authenticated;

create or replace function public.protect_warehouse_purchase_receipt_cost()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if (new.cost_source = 'purchase_snapshot'
      or (new.cost_source is null and old.cost_source in ('manual', 'fifo', 'configured_rule')))
    and (old.warehouse_purchase_line_id is not null
      or old.cost_source is null
      or old.cost_source in ('manual', 'fifo', 'configured_rule'))
    and (
      new.cost_base_unit_snapshot is distinct from old.cost_base_unit_snapshot
      or new.cost_total_input_precise is distinct from old.cost_total_input_precise
      or old.cost_source in ('manual', 'fifo', 'configured_rule')
      or old.cost_source is null
    ) then
    new.cost_base_unit_snapshot := old.cost_base_unit_snapshot;
    new.cost_total_input_precise := old.cost_total_input_precise;
    new.cost_source := old.cost_source;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_warehouse_purchase_receipt_cost() from public, anon, authenticated;

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

    v_keep_fifo := v_existing.cost_source = 'fifo'
      and v_existing.cost_base_unit_snapshot is not null
      and round(v_cost, 8) = round(v_existing.cost_base_unit_snapshot, 8);

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

-- Never auto-fill draft receipt cost inputs from prior manual receipt costs.
create or replace function public.get_qb_draft_receipt_cost_suggestions(p_receipts uuid[])
returns table(line_id uuid, suggested_cost numeric)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('admin', 'administrador'), false) then
    raise exception 'Acceso denegado.' using errcode = '42501';
  end if;

  return query
    select l.id, null::numeric
      from public.qb_receipt_lines l
      join public.qb_receipts r on r.id = l.receipt_id
     where r.id = any(p_receipts)
       and r.status = 'borrador'
       and r.pricing_mode = 'line_cost_markup';
end;
$$;

revoke all on function public.get_qb_draft_receipt_cost_suggestions(uuid[]) from public, anon, authenticated;
grant execute on function public.get_qb_draft_receipt_cost_suggestions(uuid[]) to authenticated;

create or replace function private.qb_convert_unit_cost(
  p_cost numeric,
  p_source_unit_id uuid,
  p_target_unit_id uuid
) returns numeric
language sql
stable
set search_path = pg_catalog
as $$
  select case
    when p_cost is null or p_cost < 0 or p_source_unit_id is null or p_target_unit_id is null then null
    when p_source_unit_id = p_target_unit_id then round(p_cost, 8)
    else (
      select round(p_cost * target.conversion_factor_to_base / source.conversion_factor_to_base, 8)
        from public.qb_units source
        join public.qb_units target on target.id = p_target_unit_id
        join public.qb_unit_dimensions dim on dim.id = target.dimension_id
       where source.id = p_source_unit_id
         and source.dimension_id = target.dimension_id
         and source.is_active
         and target.is_active
         and dim.is_active
         and dim.code <> 'legacy_dump'
         and lower(coalesce(source.code, '')) <> 'cuartilla'
         and lower(coalesce(target.code, '')) <> 'cuartilla'
         and source.conversion_factor_to_base > 0
         and target.conversion_factor_to_base > 0
       limit 1
    )
  end;
$$;

revoke all on function private.qb_convert_unit_cost(numeric, uuid, uuid) from public, anon, authenticated;

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
  previous_purchase_cost_unit_symbol text
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
  prev_cost as (
    select
      tl.line_id,
      coalesce(
        case
          when prev_rec.cost_value is not null
               and (prev_pur.cost_value is null or prev_rec.event_at >= prev_pur.event_at)
            then prev_rec.cost_value
          else prev_pur.cost_value
        end
      ) as prev_value,
      case
        when prev_rec.cost_value is not null
             and (prev_pur.cost_value is null or prev_rec.event_at >= prev_pur.event_at)
          then tl.base_unit_symbol
        when prev_pur.cost_value is not null
          then tl.base_unit_symbol
        else null
      end as prev_symbol
    from target_lines tl
    left join lateral (
      select
        private.qb_convert_unit_cost(lp.cost_base_unit_snapshot, lp.base_unit_id, tl.base_unit_id) as cost_value,
        coalesce(lp.receipt_cost_saved_at, rp.issued_at, rp.created_at) as event_at
      from public.qb_receipt_lines lp
      join public.qb_receipts rp on rp.id = lp.receipt_id
      where lp.product_id = tl.product_id
        and rp.id <> tl.receipt_id
        and rp.status in ('borrador', 'emitido')
        and rp.pricing_mode = 'line_cost_markup'
        and lp.cost_base_unit_snapshot is not null
        and (lp.receipt_cost_saved_at is not null or lp.cost_source in ('manual', 'fifo', 'configured_rule'))
        and (coalesce(rp.issued_at, rp.created_at), rp.id)
          < (coalesce(tl.receipt_issued_at, tl.receipt_created_at), tl.receipt_id)
        and private.qb_convert_unit_cost(lp.cost_base_unit_snapshot, lp.base_unit_id, tl.base_unit_id) is not null
      order by coalesce(lp.receipt_cost_saved_at, rp.issued_at, rp.created_at) desc, lp.id desc
      limit 1
    ) prev_rec on true
    left join lateral (
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
          and (
            tl.delivery_movement_id is null
            or not exists (
              select 1
              from public.inventory_lot_consumptions c
              join public.inventory_lots lot on lot.id = c.lot_id
              join public.qb_merchandise_receipt_movements rm on rm.id = lot.source_receipt_movement_id
              where c.delivery_movement_id = tl.delivery_movement_id
                and rm.line_id = ml.id
            )
          )
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
          and (
            tl.delivery_movement_id is null
            or not exists (
              select 1
              from public.inventory_lot_consumptions c
              join public.inventory_lots lot on lot.id = c.lot_id
              join public.qb_merchandise_receipt_movements rm on rm.id = lot.source_receipt_movement_id
              where c.delivery_movement_id = tl.delivery_movement_id
                and rm.classification_result_id = cr.id
            )
          )
      ) candidate
      where candidate.cost_value is not null
      order by candidate.event_at desc, candidate.line_created_at desc, candidate.line_id desc
      limit 1
    ) prev_pur on true
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
    pc.prev_value as previous_purchase_cost_value,
    pc.prev_symbol as previous_purchase_cost_unit_symbol
  from target_lines tl
  left join fifo_stats fs on fs.line_id = tl.line_id
  left join prev_cost pc on pc.line_id = tl.line_id;
end;
$$;

revoke all on function public.get_qb_receipt_lines_fifo_context(uuid[]) from public, anon, authenticated;
grant execute on function public.get_qb_receipt_lines_fifo_context(uuid[]) to authenticated;

commit;
