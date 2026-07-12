-- Fase 14B - Compras multiples en modo borrador
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- No ejecutar en produccion sin backup y validacion.

alter table public.products
add column if not exists requires_classification boolean not null default false;

create table if not exists public.purchase_batches (
  id uuid primary key default gen_random_uuid(),
  batch_date date not null default current_date,
  status text not null default 'borrador',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_batches_status_check check (status in ('borrador', 'confirmada', 'cancelada'))
);

create table if not exists public.purchase_batch_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.purchase_batches (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  product_name text,
  supplier_name text,
  unit_name text,
  unit_abbreviation text,
  requires_classification boolean not null default false,
  quantity numeric(14, 3) not null,
  unit_cost numeric(14, 2) not null,
  subtotal numeric(14, 2) generated always as (round(quantity * unit_cost, 2)) stored,
  payment_method text not null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_batch_lines_quantity_check check (quantity > 0),
  constraint purchase_batch_lines_unit_cost_check check (unit_cost >= 0),
  constraint purchase_batch_lines_payment_method_check check (
    payment_method in ('efectivo', 'transferencia', 'qr', 'credito')
  )
);

create index if not exists purchase_batches_status_idx on public.purchase_batches (status);
create index if not exists purchase_batches_batch_date_idx on public.purchase_batches (batch_date desc);
create index if not exists purchase_batches_created_by_idx on public.purchase_batches (created_by);
create index if not exists purchase_batch_lines_batch_id_idx on public.purchase_batch_lines (batch_id);
create index if not exists purchase_batch_lines_supplier_id_idx on public.purchase_batch_lines (supplier_id);
create index if not exists purchase_batch_lines_product_id_idx on public.purchase_batch_lines (product_id);
create index if not exists purchase_batch_lines_payment_method_idx on public.purchase_batch_lines (payment_method);

drop trigger if exists set_purchase_batches_updated_at on public.purchase_batches;
create trigger set_purchase_batches_updated_at
before update on public.purchase_batches
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_purchase_batch_lines_updated_at on public.purchase_batch_lines;
create trigger set_purchase_batch_lines_updated_at
before update on public.purchase_batch_lines
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.purchase_batches enable row level security;
alter table public.purchase_batch_lines enable row level security;

drop policy if exists "Purchase roles can view purchase batches" on public.purchase_batches;
create policy "Purchase roles can view purchase batches"
on public.purchase_batches
for select
to authenticated
using (public.current_user_role() in ('administrador', 'inventario', 'finanzas'));

drop policy if exists "Purchase roles can create purchase batches" on public.purchase_batches;
create policy "Purchase roles can create purchase batches"
on public.purchase_batches
for insert
to authenticated
with check (public.current_user_role() in ('administrador', 'inventario'));

drop policy if exists "Purchase roles can update draft purchase batches" on public.purchase_batches;
create policy "Purchase roles can update draft purchase batches"
on public.purchase_batches
for update
to authenticated
using (
  status = 'borrador'
  and public.current_user_role() in ('administrador', 'inventario')
)
with check (
  status = 'borrador'
  and public.current_user_role() in ('administrador', 'inventario')
);

drop policy if exists "Purchase roles can view purchase batch lines" on public.purchase_batch_lines;
create policy "Purchase roles can view purchase batch lines"
on public.purchase_batch_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.purchase_batches b
    where b.id = batch_id
      and public.current_user_role() in ('administrador', 'inventario', 'finanzas')
  )
);

drop policy if exists "Purchase roles can create purchase batch lines" on public.purchase_batch_lines;
create policy "Purchase roles can create purchase batch lines"
on public.purchase_batch_lines
for insert
to authenticated
with check (
  exists (
    select 1
    from public.purchase_batches b
    where b.id = batch_id
      and b.status = 'borrador'
      and public.current_user_role() in ('administrador', 'inventario')
  )
);

drop policy if exists "Purchase roles can update draft purchase batch lines" on public.purchase_batch_lines;
create policy "Purchase roles can update draft purchase batch lines"
on public.purchase_batch_lines
for update
to authenticated
using (
  exists (
    select 1
    from public.purchase_batches b
    where b.id = batch_id
      and b.status = 'borrador'
      and public.current_user_role() in ('administrador', 'inventario')
  )
)
with check (
  exists (
    select 1
    from public.purchase_batches b
    where b.id = batch_id
      and b.status = 'borrador'
      and public.current_user_role() in ('administrador', 'inventario')
  )
);

drop policy if exists "Purchase roles can delete draft purchase batch lines" on public.purchase_batch_lines;
create policy "Purchase roles can delete draft purchase batch lines"
on public.purchase_batch_lines
for delete
to authenticated
using (
  exists (
    select 1
    from public.purchase_batches b
    where b.id = batch_id
      and b.status = 'borrador'
      and public.current_user_role() in ('administrador', 'inventario')
  )
);
