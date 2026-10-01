begin;

create or replace function public.snapshot_fifo_cost_for_new_receipt_line()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_pricing_mode text;
  v_delivery record;
  v_delivery_count integer;
  v_quantity numeric(18, 6);
  v_cost numeric(20, 8);
  v_unknown integer;
begin
  if new.cost_base_unit_snapshot is not null then return new; end if;
  select receipt.pricing_mode into v_pricing_mode
    from public.qb_receipts receipt where receipt.id = new.receipt_id;
  if v_pricing_mode <> 'line_cost_markup' then return new; end if;

  select count(*) into v_delivery_count from public.qb_order_delivery_movements
   where preparation_item_id = new.preparation_item_id;
  if v_delivery_count <> 1 then return new; end if;

  select movement.id, movement.delivered_base_quantity, movement.warehouse_base_quantity
    into v_delivery
    from public.qb_order_delivery_movements movement
   where movement.preparation_item_id = new.preparation_item_id;
  if not found or v_delivery.warehouse_base_quantity is null
     or v_delivery.warehouse_base_quantity <= 0
     or v_delivery.delivered_base_quantity <> v_delivery.warehouse_base_quantity then
    return new;
  end if;

  select coalesce(sum(consumption.quantity_consumed), 0),
         coalesce(sum(consumption.total_cost), 0),
         count(*) filter (where consumption.cost_status <> 'known' or consumption.total_cost is null)
    into v_quantity, v_cost, v_unknown
    from public.inventory_lot_consumptions consumption
   where consumption.delivery_movement_id = v_delivery.id;

  if v_unknown = 0 and v_quantity = v_delivery.warehouse_base_quantity
     and new.delivered_base_quantity = v_delivery.delivered_base_quantity then
    new.cost_total_input_precise := v_cost;
    new.cost_base_unit_snapshot := round(v_cost / new.delivered_base_quantity, 8);
    new.cost_source := 'fifo';
  end if;
  return new;
end;
$$;

drop trigger if exists qb_snapshot_fifo_cost_on_new_receipt_line on public.qb_receipt_lines;
create trigger qb_snapshot_fifo_cost_on_new_receipt_line
before insert on public.qb_receipt_lines
for each row execute function public.snapshot_fifo_cost_for_new_receipt_line();

commit;
