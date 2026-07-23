-- Matriz operativa: modelo normalizado, rol Entregador y auditoria por linea.
-- No importa Google Sheets ni altera movimientos o recibos historicos.

begin;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'administrador', 'ventas', 'inventario', 'entregador', 'finanzas'));

alter table public.qb_orders
  add column if not exists operational_date date;

update public.qb_orders
set operational_date = (submitted_at at time zone 'America/La_Paz')::date
where operational_date is null;

alter table public.qb_orders
  alter column operational_date set default ((now() at time zone 'America/La_Paz')::date),
  alter column operational_date set not null;

comment on column public.qb_orders.operational_date is
  'Fecha operativa explicita en America/La_Paz. El backfill inicial usa submitted_at porque qb_orders no tenia fecha de entrega.';

create index if not exists qb_orders_operational_date_status_idx
  on public.qb_orders (operational_date, status, submitted_at, id);

alter table public.qb_order_items
  add column if not exists row_version integer not null default 0;

alter table public.qb_order_items
  drop constraint if exists qb_order_items_row_version_check;

alter table public.qb_order_items
  add constraint qb_order_items_row_version_check check (row_version >= 0);

alter table public.qb_order_preparation_items
  add column if not exists preparation_check boolean not null default false,
  add column if not exists prepared_by_line uuid references public.profiles(id) on delete set null,
  add column if not exists prepared_at_line timestamptz,
  add column if not exists row_version integer not null default 0,
  add column if not exists last_idempotency_key text;

alter table public.qb_order_preparation_items
  drop constraint if exists qb_order_preparation_items_row_version_check;

alter table public.qb_order_preparation_items
  add constraint qb_order_preparation_items_row_version_check check (row_version >= 0);

comment on column public.qb_order_preparation_items.preparation_check is
  'Check independiente: preparado completamente en bodega. No representa entrega.';

create table if not exists public.qb_operational_day_orders (
  id uuid primary key default gen_random_uuid(),
  operational_date date not null,
  order_id uuid not null references public.qb_orders(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  customer_location_id uuid references public.qb_customer_locations(id) on delete set null,
  position integer not null,
  row_version integer not null default 0,
  ordered_by uuid references public.profiles(id) on delete set null,
  ordered_at timestamptz,
  last_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_operational_day_orders_order_unique unique (order_id),
  constraint qb_operational_day_orders_date_position_unique
    unique (operational_date, position) deferrable initially immediate,
  constraint qb_operational_day_orders_position_check check (position > 0),
  constraint qb_operational_day_orders_version_check check (row_version >= 0)
);

comment on table public.qb_operational_day_orders is
  'Orden horizontal de pedidos/clientes por fecha. Varias ordenes del mismo cliente permanecen inequivocas por order_id y ubicacion.';

create index if not exists qb_operational_day_orders_date_idx
  on public.qb_operational_day_orders (operational_date, position, order_id);

create table if not exists public.qb_order_delivery_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.qb_orders(id) on delete cascade,
  order_item_id uuid not null references public.qb_order_items(id) on delete cascade,
  preparation_item_id uuid references public.qb_order_preparation_items(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  source_label text not null,
  base_unit_id uuid not null references public.qb_units(id) on delete restrict,
  base_unit_symbol text not null,
  conversion_factor_to_base numeric(18, 9) not null,
  prepared_quantity_snapshot numeric(18, 6) not null default 0,
  prepared_base_quantity_snapshot numeric(18, 6) not null default 0,
  externally_sourced_quantity numeric(18, 6) not null default 0,
  externally_sourced_base_quantity numeric(18, 6) not null default 0,
  externally_sourced_by uuid references public.profiles(id) on delete set null,
  externally_sourced_at timestamptz,
  delivered_quantity numeric(18, 6) not null default 0,
  delivered_base_quantity numeric(18, 6) not null default 0,
  delivery_check boolean not null default false,
  delivery_note text,
  delivered_by uuid references public.profiles(id) on delete set null,
  delivered_at timestamptz,
  row_version integer not null default 0,
  last_idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_order_delivery_items_order_item_unique unique (order_item_id),
  constraint qb_order_delivery_items_preparation_item_unique unique (preparation_item_id),
  constraint qb_order_delivery_items_factor_check check (conversion_factor_to_base > 0),
  constraint qb_order_delivery_items_quantities_check check (
    prepared_quantity_snapshot >= 0
    and prepared_base_quantity_snapshot >= 0
    and externally_sourced_quantity >= 0
    and externally_sourced_base_quantity >= 0
    and delivered_quantity >= 0
    and delivered_base_quantity >= 0
  ),
  constraint qb_order_delivery_items_note_check
    check (delivery_note is null or length(trim(delivery_note)) <= 500),
  constraint qb_order_delivery_items_version_check check (row_version >= 0)
);

comment on table public.qb_order_delivery_items is
  'Entrega real separada de solicitado y preparado. El componente externo nunca mueve stock de bodega.';

create index if not exists qb_order_delivery_items_order_idx
  on public.qb_order_delivery_items (order_id, product_id, order_item_id);

create table if not exists public.qb_order_delivery_confirmations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.qb_orders(id) on delete cascade,
  status text not null default 'confirmado',
  confirmation_version integer not null default 1,
  idempotency_key text not null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  reopened_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_order_delivery_confirmations_order_unique unique (order_id),
  constraint qb_order_delivery_confirmations_idempotency_unique unique (idempotency_key),
  constraint qb_order_delivery_confirmations_status_check check (status in ('confirmado', 'reabierto')),
  constraint qb_order_delivery_confirmations_version_check check (confirmation_version > 0),
  constraint qb_order_delivery_confirmations_reason_check
    check (reopen_reason is null or length(trim(reopen_reason)) between 3 and 500)
);

create table if not exists public.qb_order_line_change_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.qb_orders(id) on delete restrict,
  order_item_id uuid not null references public.qb_order_items(id) on delete restrict,
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  stage text not null,
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  unit_label text,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null,
  reason text,
  correlation_key text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint qb_order_line_change_events_stage_check
    check (stage in ('solicitud', 'preparacion', 'entrega')),
  constraint qb_order_line_change_events_field_check
    check (length(trim(field_name)) between 1 and 80),
  constraint qb_order_line_change_events_reason_check
    check (reason is null or length(trim(reason)) <= 500),
  constraint qb_order_line_change_events_idempotency_unique
    unique (order_item_id, stage, field_name, idempotency_key)
);

comment on table public.qb_order_line_change_events is
  'Bitacora append-only por campo. Se escribe en la misma transaccion que la mutacion.';

create index if not exists qb_order_line_change_events_order_idx
  on public.qb_order_line_change_events (order_id, created_at desc);

create index if not exists qb_order_line_change_events_item_idx
  on public.qb_order_line_change_events (order_item_id, created_at desc);

alter table public.qb_order_delivery_movements
  alter column inventory_movement_id drop not null,
  add column if not exists delivery_item_id uuid references public.qb_order_delivery_items(id) on delete restrict,
  add column if not exists warehouse_base_quantity numeric(18, 6);

update public.qb_order_delivery_movements
set warehouse_base_quantity = delivered_base_quantity
where warehouse_base_quantity is null;

alter table public.qb_order_delivery_movements
  alter column warehouse_base_quantity set default 0,
  alter column warehouse_base_quantity set not null,
  drop constraint if exists qb_order_delivery_movements_quantity_check;

alter table public.qb_order_delivery_movements
  add constraint qb_order_delivery_movements_quantity_check
    check (delivered_base_quantity >= 0 and warehouse_base_quantity >= 0);

create unique index if not exists qb_order_delivery_movements_delivery_item_unique_idx
  on public.qb_order_delivery_movements (delivery_item_id)
  where delivery_item_id is not null;

comment on column public.qb_order_delivery_movements.delivered_base_quantity is
  'Cantidad final entregada para recibo. En filas nuevas puede diferir del componente de bodega.';
comment on column public.qb_order_delivery_movements.warehouse_base_quantity is
  'Componente preparado desde bodega que genera el movimiento de salida.';

drop trigger if exists set_qb_operational_day_orders_updated_at on public.qb_operational_day_orders;
create trigger set_qb_operational_day_orders_updated_at
  before update on public.qb_operational_day_orders
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_order_delivery_items_updated_at on public.qb_order_delivery_items;
create trigger set_qb_order_delivery_items_updated_at
  before update on public.qb_order_delivery_items
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_order_delivery_confirmations_updated_at on public.qb_order_delivery_confirmations;
create trigger set_qb_order_delivery_confirmations_updated_at
  before update on public.qb_order_delivery_confirmations
  for each row execute function public.set_current_timestamp_updated_at();

create or replace function private.register_qb_operational_day_order()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_position integer;
  v_actor uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('qb-operational-day:' || new.operational_date::text, 0));

  select coalesce(max(day_order.position), 0) + 1
  into v_position
  from public.qb_operational_day_orders day_order
  where day_order.operational_date = new.operational_date;

  select profile.id into v_actor
  from public.profiles profile
  where profile.id = auth.uid();

  insert into public.qb_operational_day_orders (
    operational_date,
    order_id,
    customer_account_id,
    customer_location_id,
    position,
    ordered_by,
    ordered_at
  )
  values (
    new.operational_date,
    new.id,
    new.customer_account_id,
    new.customer_location_id,
    v_position,
    v_actor,
    now()
  )
  on conflict (order_id) do nothing;

  return new;
end;
$$;

drop trigger if exists register_qb_operational_day_order on public.qb_orders;
create trigger register_qb_operational_day_order
  after insert on public.qb_orders
  for each row execute function private.register_qb_operational_day_order();

insert into public.qb_operational_day_orders (
  operational_date,
  order_id,
  customer_account_id,
  customer_location_id,
  position,
  ordered_at
)
select
  orders.operational_date,
  orders.id,
  orders.customer_account_id,
  orders.customer_location_id,
  row_number() over (
    partition by orders.operational_date
    order by orders.submitted_at, orders.id
  )::integer,
  now()
from public.qb_orders orders
where not exists (
  select 1
  from public.qb_operational_day_orders day_order
  where day_order.order_id = orders.id
)
on conflict (order_id) do nothing;

alter table public.qb_operational_day_orders enable row level security;
alter table public.qb_order_delivery_items enable row level security;
alter table public.qb_order_delivery_confirmations enable row level security;
alter table public.qb_order_line_change_events enable row level security;

revoke all on table public.qb_operational_day_orders from public, anon, authenticated;
revoke all on table public.qb_order_delivery_items from public, anon, authenticated;
revoke all on table public.qb_order_delivery_confirmations from public, anon, authenticated;
revoke all on table public.qb_order_line_change_events from public, anon, authenticated;

grant select on table public.qb_operational_day_orders to authenticated;
grant select on table public.qb_order_delivery_items to authenticated;
grant select on table public.qb_order_delivery_confirmations to authenticated;
grant select on table public.qb_order_line_change_events to authenticated;

drop policy if exists qb_operational_day_orders_select on public.qb_operational_day_orders;
create policy qb_operational_day_orders_select
  on public.qb_operational_day_orders for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador'));

drop policy if exists qb_order_delivery_items_select on public.qb_order_delivery_items;
create policy qb_order_delivery_items_select
  on public.qb_order_delivery_items for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador'));

drop policy if exists qb_order_delivery_confirmations_select on public.qb_order_delivery_confirmations;
create policy qb_order_delivery_confirmations_select
  on public.qb_order_delivery_confirmations for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador'));

drop policy if exists qb_order_line_change_events_admin_select on public.qb_order_line_change_events;
create policy qb_order_line_change_events_admin_select
  on public.qb_order_line_change_events for select
  using (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "QB customers and internal roles can view orders" on public.qb_orders;
create policy "QB customers and internal roles can view orders"
  on public.qb_orders for select
  using (
    customer_account_id = auth.uid()
    or public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador')
  );

drop policy if exists "QB customers and internal roles can view order items" on public.qb_order_items;
create policy "QB customers and internal roles can view order items"
  on public.qb_order_items for select
  using (
    exists (
      select 1
      from public.qb_orders orders
      where orders.id = order_id
        and (
          orders.customer_account_id = auth.uid()
          or public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador')
        )
    )
  );

drop policy if exists "Internal roles can view QB order preparations" on public.qb_order_preparations;
create policy "Internal roles can view QB order preparations"
  on public.qb_order_preparations for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador'));

drop policy if exists "Internal roles can view QB order preparation items" on public.qb_order_preparation_items;
create policy "Internal roles can view QB order preparation items"
  on public.qb_order_preparation_items for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador'));

drop policy if exists "Internal roles can view QB order delivery movements" on public.qb_order_delivery_movements;
create policy "Internal roles can view QB order delivery movements"
  on public.qb_order_delivery_movements for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador'));

drop policy if exists "Internal roles can view products" on public.products;
create policy "Internal roles can view products"
  on public.products for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador'));

drop policy if exists "Internal roles can view product categories" on public.product_categories;
create policy "Internal roles can view product categories"
  on public.product_categories for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador'));

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'qb_operational_day_orders',
    'qb_order_delivery_items',
    'qb_order_delivery_confirmations',
    'qb_order_line_change_events'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table_name);
    end if;
  end loop;
end;
$$;

commit;
