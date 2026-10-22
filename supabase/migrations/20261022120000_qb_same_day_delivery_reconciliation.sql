-- Same-day reconciliation for externally sourced delivery quantities.
-- No historical delivery is classified automatically. An operator must explicitly
-- identify the part still pending a warehouse purchase before it can be reconciled.
begin;

create table if not exists public.qb_same_day_reconciliation_requests (
  id uuid primary key default gen_random_uuid(),
  delivery_movement_id uuid not null unique references public.qb_order_delivery_movements(id) on delete restrict,
  delivery_item_id uuid not null unique references public.qb_order_delivery_items(id) on delete restrict,
  order_id uuid not null references public.qb_orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  operational_date date not null,
  delivered_base_quantity numeric(18,6) not null,
  warehouse_base_quantity numeric(18,6) not null,
  externally_sourced_base_quantity numeric(18,6) not null,
  pending_quantity numeric(18,6) not null default 0,
  reconciled_quantity numeric(18,6) not null default 0,
  classification text not null,
  status text not null,
  classification_note text,
  idempotency_key text not null unique,
  classified_by uuid references public.profiles(id) on delete set null,
  classified_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_same_day_reconciliation_quantities_check check (
    delivered_base_quantity >= 0 and warehouse_base_quantity >= 0
    and externally_sourced_base_quantity >= 0 and pending_quantity >= 0
    and reconciled_quantity >= 0 and reconciled_quantity <= pending_quantity
    and pending_quantity <= externally_sourced_base_quantity
  ),
  constraint qb_same_day_reconciliation_classification_check
    check (classification in ('pending', 'external_definitive', 'review')),
  constraint qb_same_day_reconciliation_status_check
    check (status in ('pending', 'partial', 'reconciled', 'external_definitive', 'review')),
  constraint qb_same_day_reconciliation_note_check
    check (classification_note is null or length(trim(classification_note)) <= 500),
  constraint qb_same_day_reconciliation_pending_status_check check (
    (classification = 'pending' and pending_quantity > 0 and status in ('pending','partial','reconciled'))
    or (classification = 'external_definitive' and pending_quantity = 0 and reconciled_quantity = 0 and status = 'external_definitive')
    or (classification = 'review' and pending_quantity = 0 and reconciled_quantity = 0 and status = 'review')
  )
);

create index if not exists qb_same_day_reconciliation_queue_idx
  on public.qb_same_day_reconciliation_requests(product_id, operational_date, status, classified_at, id)
  where classification = 'pending' and reconciled_quantity < pending_quantity;

create table if not exists public.qb_same_day_reconciliation_allocations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.qb_same_day_reconciliation_requests(id) on delete restrict,
  source_receipt_movement_id uuid not null references public.qb_merchandise_receipt_movements(id) on delete restrict,
  inventory_movement_id uuid not null unique references public.inventory_movements(id) on delete restrict,
  quantity numeric(18,6) not null check (quantity > 0),
  allocated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint qb_same_day_reconciliation_source_unique unique(request_id, source_receipt_movement_id)
);

create index if not exists qb_same_day_reconciliation_allocation_request_idx
  on public.qb_same_day_reconciliation_allocations(request_id, created_at, id);

create table if not exists public.qb_same_day_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.qb_same_day_reconciliation_requests(id) on delete restrict,
  classification text not null check (classification in ('pending','external_definitive','review')),
  pending_quantity numeric(18,6) not null check (pending_quantity >= 0),
  note text,
  idempotency_key text not null unique,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.qb_same_day_reconciliation_requests enable row level security;
alter table public.qb_same_day_reconciliation_allocations enable row level security;
alter table public.qb_same_day_reconciliation_events enable row level security;

revoke all on public.qb_same_day_reconciliation_requests,
  public.qb_same_day_reconciliation_allocations,
  public.qb_same_day_reconciliation_events from public, anon, authenticated;
grant select on public.qb_same_day_reconciliation_requests,
  public.qb_same_day_reconciliation_allocations,
  public.qb_same_day_reconciliation_events to authenticated;

create policy "Operational roles can view same-day reconciliation"
  on public.qb_same_day_reconciliation_requests for select to authenticated
  using (exists (
    select 1 from public.profiles profile where profile.id = auth.uid()
      and profile.is_active and profile.role in ('admin','administrador','inventario','entregador')
  ));
create policy "Operational roles can view same-day reconciliation allocations"
  on public.qb_same_day_reconciliation_allocations for select to authenticated
  using (exists (
    select 1 from public.profiles profile where profile.id = auth.uid()
      and profile.is_active and profile.role in ('admin','administrador','inventario','entregador')
  ));
create policy "Operational roles can view same-day reconciliation events"
  on public.qb_same_day_reconciliation_events for select to authenticated
  using (exists (
    select 1 from public.profiles profile where profile.id = auth.uid()
      and profile.is_active and profile.role in ('admin','administrador','inventario','entregador')
  ));

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
  v_remaining numeric(18,6) := p_quantity;
  v_take numeric(18,6);
  v_stock_before numeric(18,6);
  v_movement_quantity numeric(18,6);
  v_lot_total numeric(18,6);
  v_gap numeric(18,6);
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

  select coalesce(sum(remaining_quantity),0) into v_lot_total
    from public.inventory_lots where product_id = p_product_id;
  v_gap := greatest(v_lot_total - greatest(v_stock_before,0),0);
  if v_gap > 0 then
    for v_lot in
      select id, remaining_quantity, unit_cost from public.inventory_lots
       where product_id = p_product_id and remaining_quantity > 0
       order by received_at, created_at, id for update
    loop
      exit when v_gap <= 0;
      v_take := least(v_gap,v_lot.remaining_quantity);
      update public.inventory_lots set remaining_quantity = remaining_quantity - v_take where id = v_lot.id;
      insert into public.inventory_lot_writeoffs(lot_id,detected_delivery_movement_id,quantity,unit_cost)
      values (v_lot.id,p_delivery_movement_id,v_take,v_lot.unit_cost);
      v_gap := v_gap - v_take;
    end loop;
  end if;

  select coalesce(sum(remaining_quantity),0) into v_lot_total
    from public.inventory_lots where product_id = p_product_id;
  v_take := least(v_remaining,greatest(v_stock_before-v_lot_total,0));
  if v_take > 0 then
    insert into public.inventory_lot_consumptions(
      lot_id,product_id,delivery_movement_id,inventory_movement_id,quantity_consumed,unit_cost,total_cost,cost_status
    ) values (null,p_product_id,p_delivery_movement_id,p_inventory_movement_id,v_take,null,null,'historical_unknown');
    v_remaining := v_remaining-v_take;
  end if;

  for v_lot in
    select id,remaining_quantity,unit_cost from public.inventory_lots
     where product_id = p_product_id and remaining_quantity > 0
     order by received_at,created_at,id for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining,v_lot.remaining_quantity);
    update public.inventory_lots set remaining_quantity = remaining_quantity-v_take where id = v_lot.id;
    insert into public.inventory_lot_consumptions(
      lot_id,product_id,delivery_movement_id,inventory_movement_id,quantity_consumed,unit_cost,total_cost,cost_status
    ) values (
      v_lot.id,p_product_id,p_delivery_movement_id,p_inventory_movement_id,v_take,v_lot.unit_cost,
      case when v_lot.unit_cost is null then null else round(v_take*v_lot.unit_cost,4) end,
      case when v_lot.unit_cost is null then 'historical_unknown' else 'known' end
    );
    v_remaining := v_remaining-v_take;
  end loop;
  if v_remaining > 0 then
    insert into public.inventory_lot_consumptions(
      lot_id,product_id,delivery_movement_id,inventory_movement_id,quantity_consumed,unit_cost,total_cost,cost_status
    ) values (null,p_product_id,p_delivery_movement_id,p_inventory_movement_id,v_remaining,null,null,'historical_unknown');
  end if;
end;
$$;

create or replace function private.reconcile_qb_same_day_pending_for_product(
  p_product_id uuid,
  p_operational_date date,
  p_receipt_id uuid default null,
  p_actor_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_stock numeric(18,6);
  v_source record;
  v_request public.qb_same_day_reconciliation_requests%rowtype;
  v_available numeric(18,6);
  v_amount numeric(18,6);
  v_after numeric(18,6);
  v_inventory_movement_id uuid;
  v_allocation_total numeric(18,6) := 0;
begin
  -- Never reconcile a prior Bolivia operating day retroactively.
  if p_operational_date <> (now() at time zone 'America/La_Paz')::date then return 0; end if;

  select stock_current into v_stock from public.products
   where id = p_product_id and is_active and coalesce(is_qb_loss_product,false) = false
   for update;
  if v_stock is null then raise exception 'Producto no disponible para conciliación.'; end if;

  for v_source in
    select receipt_movement.id as source_id,
           lot.id as lot_id,
           greatest(least(lot.remaining_quantity, lot.initial_quantity - coalesce(allocated.quantity,0)),0) as available
      from public.qb_merchandise_receipt_movements receipt_movement
      join public.qb_merchandise_receipts receipt on receipt.id = receipt_movement.receipt_id
      join public.inventory_lots lot on lot.source_receipt_movement_id = receipt_movement.id
      left join lateral (
        select sum(allocation.quantity) as quantity
          from public.qb_same_day_reconciliation_allocations allocation
         where allocation.source_receipt_movement_id = receipt_movement.id
      ) allocated on true
     where receipt.status = 'confirmado'
       and (receipt.confirmed_at at time zone 'America/La_Paz')::date = p_operational_date
       and (p_receipt_id is null or receipt.id = p_receipt_id)
       and receipt_movement.product_id = p_product_id
       and receipt_movement.movement_type = 'entrada'
       and receipt_movement.movement_role in ('direct_entry','classified_output')
       and receipt_movement.inventory_movement_id is not null
     order by receipt.confirmed_at, lot.received_at, lot.created_at, receipt_movement.id
     for update of lot
  loop
    v_available := v_source.available;
    while v_available > 0 and v_stock > 0 loop
      select request.* into v_request
        from public.qb_same_day_reconciliation_requests request
        join public.qb_order_delivery_movements delivery on delivery.id = request.delivery_movement_id
       where request.product_id = p_product_id
         and request.operational_date = p_operational_date
         and request.classification = 'pending'
         and request.reconciled_quantity < request.pending_quantity
         and (delivery.delivered_at at time zone 'America/La_Paz')::date = p_operational_date
       order by delivery.delivered_at, delivery.id, request.id
       limit 1 for update of request skip locked;
      exit when not found;

      v_amount := least(v_available, v_stock, v_request.pending_quantity-v_request.reconciled_quantity);
      exit when v_amount <= 0;
      v_after := v_stock-v_amount;
      insert into public.inventory_movements(
        product_id,movement_type,quantity,stock_before,stock_after,reason,notes,created_by
      ) values (
        p_product_id,'salida',v_amount,v_stock,v_after,'Conciliación de entrega del mismo día',
        'Conciliación ' || v_request.id::text || ', pedido ' || v_request.order_id::text ||
        ', ingreso ' || v_source.source_id::text,p_actor_id
      ) returning id into v_inventory_movement_id;
      update public.products set stock_current = v_after where id = p_product_id;
      insert into public.qb_same_day_reconciliation_allocations(
        request_id,source_receipt_movement_id,inventory_movement_id,quantity,allocated_by
      ) values (
        v_request.id,v_source.source_id,v_inventory_movement_id,v_amount,p_actor_id
      );
      perform private.consume_inventory_fifo_for_reconciliation(
        v_request.delivery_movement_id,v_inventory_movement_id,p_product_id,v_amount
      );

      update public.qb_same_day_reconciliation_requests
         set reconciled_quantity = reconciled_quantity+v_amount,
             status = case when reconciled_quantity+v_amount >= pending_quantity then 'reconciled' else 'partial' end,
             updated_at = now()
       where id = v_request.id;
      v_available := v_available-v_amount;
      v_stock := v_after;
      v_allocation_total := v_allocation_total+v_amount;
    end loop;
  end loop;
  return v_allocation_total;
end;
$$;

create or replace function private.reconcile_qb_same_day_after_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
  v_day date;
begin
  if old.status = 'confirmado' or new.status <> 'confirmado' or new.confirmed_at is null then return new; end if;
  v_day := (new.confirmed_at at time zone 'America/La_Paz')::date;
  for v_product_id in
    select distinct movement.product_id
      from public.qb_merchandise_receipt_movements movement
     where movement.receipt_id = new.id
       and movement.movement_type = 'entrada'
       and movement.movement_role in ('direct_entry','classified_output')
       and movement.product_id is not null
     order by movement.product_id
  loop
    perform private.reconcile_qb_same_day_pending_for_product(v_product_id,v_day,new.id,new.confirmed_by);
  end loop;
  return new;
end;
$$;

create or replace function private.prevent_reopen_with_pending_same_day_reconciliation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if old.status = 'confirmado' and new.status = 'reabierto' and exists (
    select 1
      from public.qb_same_day_reconciliation_requests request
     where request.order_id = old.order_id
       and request.classification = 'pending'
       and request.reconciled_quantity > 0
  ) then
    raise exception 'Esta entrega ya tiene stock conciliado. Regulariza la conciliación con una corrección auditada antes de reabrirla.';
  end if;
  if old.status = 'confirmado' and new.status = 'reabierto' and exists (
    select 1
      from public.qb_same_day_reconciliation_requests request
     where request.order_id = old.order_id
       and request.classification = 'pending'
       and request.reconciled_quantity = 0
  ) then
    raise exception 'Clasifica o deriva a revisión la cantidad pendiente antes de reabrir la entrega.';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_reopen_with_pending_same_day_reconciliation on public.qb_order_delivery_confirmations;
create trigger prevent_reopen_with_pending_same_day_reconciliation
before update of status on public.qb_order_delivery_confirmations
for each row execute function private.prevent_reopen_with_pending_same_day_reconciliation();

drop trigger if exists reconcile_qb_same_day_after_receipt on public.qb_merchandise_receipts;
create trigger reconcile_qb_same_day_after_receipt
after update of status on public.qb_merchandise_receipts
for each row execute function private.reconcile_qb_same_day_after_receipt();

create or replace function public.classify_qb_same_day_delivery_source(
  p_delivery_movement_id uuid,
  p_classification text,
  p_pending_quantity numeric,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_delivery public.qb_order_delivery_movements%rowtype;
  v_item public.qb_order_delivery_items%rowtype;
  v_confirmation public.qb_order_delivery_confirmations%rowtype;
  v_request public.qb_same_day_reconciliation_requests%rowtype;
  v_delivered_external numeric(18,6);
  v_day date;
  v_reconciled numeric(18,6) := 0;
begin
  select role into v_role from public.profiles where id = v_user and is_active;
  if v_user is null or v_role not in ('admin','administrador','entregador') then
    raise exception 'No tienes permiso para clasificar el origen de la entrega.';
  end if;
  if length(trim(coalesce(p_idempotency_key,''))) < 8 or length(trim(coalesce(p_idempotency_key,''))) > 200 then
    raise exception 'Clave de idempotencia no válida.';
  end if;
  if p_classification not in ('pending','external_definitive','review') then
    raise exception 'Clasificación de abastecimiento no válida.';
  end if;
  if length(trim(coalesce(p_note,''))) < 3 or length(trim(p_note)) > 500 then
    raise exception 'Explica brevemente el origen de esta cantidad.';
  end if;

  select * into v_delivery from public.qb_order_delivery_movements
   where id = p_delivery_movement_id for update;
  if v_delivery.id is null then raise exception 'No se encontró la entrega.'; end if;
  select * into v_confirmation from public.qb_order_delivery_confirmations
   where order_id = v_delivery.order_id for update;
  if v_confirmation.status <> 'confirmado' then raise exception 'La entrega no está confirmada.'; end if;
  select * into v_item from public.qb_order_delivery_items
   where id = v_delivery.delivery_item_id for update;
  if v_item.id is null or not v_item.delivery_check then raise exception 'La línea de entrega no está confirmada.'; end if;
  if v_delivery.delivered_at is null then raise exception 'La fecha física de entrega no está disponible; requiere revisión manual.'; end if;
  if v_delivery.delivered_base_quantity <= 0 or v_delivery.warehouse_base_quantity < 0 then
    raise exception 'Las cantidades de la entrega no son conciliables.';
  end if;
  v_delivered_external := greatest(v_delivery.delivered_base_quantity-v_delivery.warehouse_base_quantity,0);
  if p_classification <> 'review' and (v_delivered_external <= 0 or v_item.externally_sourced_base_quantity <= 0
     or abs(v_delivered_external-v_item.externally_sourced_base_quantity) > 0.000001) then
    raise exception 'La cantidad externa no coincide con la entrega; marca el caso para revisión administrativa.';
  end if;
  if p_classification = 'pending' then
    if p_pending_quantity is null or p_pending_quantity <= 0 or p_pending_quantity > v_delivered_external then
      raise exception 'La cantidad pendiente debe ser positiva y no superar el abastecimiento externo.';
    end if;
  elsif coalesce(p_pending_quantity,0) <> 0 then
    raise exception 'La clasificación externa o de revisión no admite cantidad pendiente.';
  end if;

  v_day := (v_delivery.delivered_at at time zone 'America/La_Paz')::date;
  if p_classification = 'pending' and v_day <> (now() at time zone 'America/La_Paz')::date then
    raise exception 'La conciliación automática solo puede prepararse durante la misma jornada operativa; deriva el caso a revisión.';
  end if;

  select * into v_request from public.qb_same_day_reconciliation_requests
   where delivery_movement_id = p_delivery_movement_id for update;
  if found then
    if v_request.idempotency_key = p_idempotency_key then
      return jsonb_build_object('request_id',v_request.id,'status',v_request.status,'pending_quantity',v_request.pending_quantity,'reconciled_quantity',v_request.reconciled_quantity,'replayed',true);
    end if;
    if v_request.classification <> 'pending' or v_request.reconciled_quantity > 0
       or p_classification not in ('external_definitive','review') then
      raise exception 'La clasificación ya existe. No puede modificarse después de una conciliación.';
    end if;
    update public.qb_same_day_reconciliation_requests
       set classification = p_classification, status = p_classification,
           pending_quantity = 0, classification_note = trim(p_note),
           idempotency_key = p_idempotency_key, classified_by = v_user,
           classified_at = now(), updated_at = now()
     where id = v_request.id returning * into v_request;
  else
    insert into public.qb_same_day_reconciliation_requests(
      delivery_movement_id,delivery_item_id,order_id,product_id,operational_date,
      delivered_base_quantity,warehouse_base_quantity,externally_sourced_base_quantity,
      pending_quantity,reconciled_quantity,classification,status,classification_note,idempotency_key,classified_by
    ) values (
      v_delivery.id,v_item.id,v_delivery.order_id,v_delivery.product_id,v_day,
      v_delivery.delivered_base_quantity,v_delivery.warehouse_base_quantity,v_item.externally_sourced_base_quantity,
      case when p_classification = 'pending' then p_pending_quantity else 0 end,0,p_classification,p_classification,
      trim(p_note),p_idempotency_key,v_user
    ) returning * into v_request;
  end if;
  insert into public.qb_same_day_reconciliation_events(request_id,classification,pending_quantity,note,idempotency_key,actor_id)
  values (v_request.id,p_classification,case when p_classification='pending' then p_pending_quantity else 0 end,trim(p_note),p_idempotency_key,v_user);

  if p_classification = 'pending' then
    v_reconciled := private.reconcile_qb_same_day_pending_for_product(v_delivery.product_id,v_day,null,v_user);
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values (v_user,'classify_qb_same_day_delivery_source','qb_order_delivery_movement',v_delivery.id,
    jsonb_build_object('request_id',v_request.id,'classification',p_classification,'pending_quantity',case when p_classification='pending' then p_pending_quantity else 0 end,'reconciled_now',v_reconciled,'operational_date',v_day,'idempotency_key',p_idempotency_key));
  select * into v_request from public.qb_same_day_reconciliation_requests where id = v_request.id;
  return jsonb_build_object('request_id',v_request.id,'status',v_request.status,'pending_quantity',v_request.pending_quantity,'reconciled_quantity',v_request.reconciled_quantity,'reconciled_now',v_reconciled,'replayed',false);
end;
$$;

revoke all on function public.classify_qb_same_day_delivery_source(uuid,text,numeric,text,text) from public,anon;
grant execute on function public.classify_qb_same_day_delivery_source(uuid,text,numeric,text,text) to authenticated;
revoke all on function private.consume_inventory_fifo_for_reconciliation(uuid,uuid,uuid,numeric) from public,anon,authenticated;
revoke all on function private.reconcile_qb_same_day_pending_for_product(uuid,date,uuid,uuid) from public,anon,authenticated;
revoke all on function private.reconcile_qb_same_day_after_receipt() from public,anon,authenticated;
revoke all on function private.prevent_reopen_with_pending_same_day_reconciliation() from public,anon,authenticated;

commit;
