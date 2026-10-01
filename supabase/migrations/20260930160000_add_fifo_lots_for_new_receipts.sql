-- FIFO only for new confirmed merchandise receipts.
-- Historical stock and manual adjustments remain unvalued and untouched.

begin;

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  source_receipt_movement_id uuid not null references public.qb_merchandise_receipt_movements(id) on delete restrict,
  initial_quantity numeric(18, 6) not null,
  remaining_quantity numeric(18, 6) not null,
  unit_cost numeric(18, 4),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint inventory_lots_initial_quantity_check check (initial_quantity > 0),
  constraint inventory_lots_remaining_quantity_check check (remaining_quantity >= 0 and remaining_quantity <= initial_quantity),
  constraint inventory_lots_unit_cost_check check (unit_cost is null or unit_cost >= 0),
  constraint inventory_lots_source_unique unique (source_receipt_movement_id)
);

create index if not exists inventory_lots_fifo_idx
  on public.inventory_lots(product_id, received_at, created_at, id)
  where remaining_quantity > 0;

create table if not exists public.inventory_lot_consumptions (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid references public.inventory_lots(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  delivery_movement_id uuid not null references public.qb_order_delivery_movements(id) on delete restrict,
  inventory_movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  quantity_consumed numeric(18, 6) not null,
  unit_cost numeric(18, 4),
  total_cost numeric(18, 4),
  cost_status text not null default 'known',
  created_at timestamptz not null default now(),
  constraint inventory_lot_consumptions_quantity_check check (quantity_consumed > 0),
  constraint inventory_lot_consumptions_cost_check check (unit_cost is null or unit_cost >= 0),
  constraint inventory_lot_consumptions_total_cost_check check (total_cost is null or total_cost >= 0),
  constraint inventory_lot_consumptions_status_check check (cost_status in ('known', 'historical_unknown'))
);

create index if not exists inventory_lot_consumptions_delivery_idx
  on public.inventory_lot_consumptions(delivery_movement_id);

create table if not exists public.inventory_fifo_consumption_runs (
  inventory_movement_id uuid primary key references public.inventory_movements(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_lot_writeoffs (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  detected_delivery_movement_id uuid references public.qb_order_delivery_movements(id) on delete set null,
  quantity numeric(18, 6) not null check (quantity > 0),
  unit_cost numeric(18, 4),
  created_at timestamptz not null default now()
);

create or replace function public.create_inventory_lot_from_receipt_movement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
  v_quantity numeric(18, 6);
  v_unit_cost numeric(18, 4);
  v_received_at timestamptz;
begin
  if new.movement_type <> 'entrada' or new.movement_role not in ('direct_entry', 'classified_output') then
    return new;
  end if;

  select new.product_id,
         least(new.movement_quantity, greatest(inventory.stock_after, 0)),
         case when new.classification_result_id is null then line.total_cost / nullif(line.base_quantity, 0) else result.assigned_cost / nullif(result.base_quantity, 0) end,
         receipt.confirmed_at
    into v_product_id, v_quantity, v_unit_cost, v_received_at
    from public.qb_merchandise_receipt_lines line
    join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
    join public.inventory_movements inventory on inventory.id = new.inventory_movement_id
    left join public.qb_merchandise_receipt_classification_results result on result.id = new.classification_result_id
   where line.id = new.line_id
     and inventory.product_id = new.product_id;

  if v_product_id is null or v_quantity is null or v_quantity <= 0 then
    return new;
  end if;

  insert into public.inventory_lots (
    product_id, source_receipt_movement_id, initial_quantity, remaining_quantity, unit_cost, received_at
  ) values (
    v_product_id, new.id, v_quantity, v_quantity, v_unit_cost, coalesce(v_received_at, now())
  ) on conflict (source_receipt_movement_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_inventory_lot_after_receipt_movement on public.qb_merchandise_receipt_movements;
create trigger create_inventory_lot_after_receipt_movement
after insert on public.qb_merchandise_receipt_movements
for each row execute function public.create_inventory_lot_from_receipt_movement();

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

  -- Manual reductions may predate this delivery. Reconcile them against the
  -- oldest valued lots and keep an auditable record rather than inventing stock.
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
      case when v_lot.unit_cost is null then null else round(v_take * v_lot.unit_cost, 4) end,
      case when v_lot.unit_cost is null then 'historical_unknown' else 'known' end
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

drop trigger if exists consume_inventory_fifo_after_delivery on public.qb_order_delivery_movements;
create trigger consume_inventory_fifo_after_delivery
after insert on public.qb_order_delivery_movements
for each row execute function public.consume_inventory_fifo_for_delivery();

alter table public.inventory_lots enable row level security;
alter table public.inventory_lot_consumptions enable row level security;
alter table public.inventory_fifo_consumption_runs enable row level security;
alter table public.inventory_lot_writeoffs enable row level security;

revoke all on table public.inventory_lots, public.inventory_lot_consumptions, public.inventory_fifo_consumption_runs, public.inventory_lot_writeoffs from public, anon;
grant select on table public.inventory_lots, public.inventory_lot_consumptions, public.inventory_lot_writeoffs to authenticated;

drop policy if exists "Inventory roles can view FIFO lots" on public.inventory_lots;
create policy "Inventory roles can view FIFO lots"
  on public.inventory_lots for select to authenticated
  using (exists (
    select 1 from public.profiles profile
     where profile.id = auth.uid()
       and profile.is_active = true
       and profile.role in ('administrador', 'inventario')
  ));

drop policy if exists "Inventory roles can view FIFO consumptions" on public.inventory_lot_consumptions;
create policy "Inventory roles can view FIFO consumptions"
  on public.inventory_lot_consumptions for select to authenticated
  using (exists (
    select 1 from public.profiles profile
     where profile.id = auth.uid()
       and profile.is_active = true
       and profile.role in ('administrador', 'inventario')
  ));

create policy "Inventory roles can view FIFO writeoffs"
  on public.inventory_lot_writeoffs for select to authenticated
  using (exists (
    select 1 from public.profiles profile
     where profile.id = auth.uid()
       and profile.is_active = true
       and profile.role in ('administrador', 'inventario')
  ));

comment on table public.inventory_lots is
  'Lotes FIFO creados exclusivamente desde ingresos reales confirmados. No representa stock histórico sin costo.';
comment on table public.inventory_lot_consumptions is
  'Consumos FIFO por entrega. lot_id null identifica consumo de stock histórico sin costo conocido.';

commit;
