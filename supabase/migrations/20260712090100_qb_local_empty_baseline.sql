-- QB-9.1 local isolated baseline for an empty Supabase stack.
-- This file is only for local validation. It is not a replacement for the
-- production/staging baseline and does not use SUPABASE_SCHEMA.sql.

begin;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'inventario',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('admin', 'administrador', 'ventas', 'inventario', 'finanzas'))
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_current_timestamp_updated_at();

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_product_categories_updated_at on public.product_categories;
create trigger set_product_categories_updated_at
before update on public.product_categories
for each row execute function public.set_current_timestamp_updated_at();

create table if not exists public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_units_of_measure_updated_at on public.units_of_measure;
create trigger set_units_of_measure_updated_at
before update on public.units_of_measure
for each row execute function public.set_current_timestamp_updated_at();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category_id uuid references public.product_categories(id) on delete set null,
  unit_id uuid references public.units_of_measure(id) on delete set null,
  stock_current numeric(14, 3) not null default 0,
  stock_minimum numeric(14, 3) not null default 0,
  purchase_price numeric(14, 4) not null default 0,
  sale_price numeric(14, 4) not null default 0,
  image_url text,
  requires_classification boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_stock_current_check check (stock_current >= 0),
  constraint products_stock_minimum_check check (stock_minimum >= 0),
  constraint products_purchase_price_check check (purchase_price >= 0),
  constraint products_sale_price_check check (sale_price >= 0)
);

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_current_timestamp_updated_at();

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  movement_type text not null,
  quantity numeric(18, 6) not null,
  stock_before numeric(18, 6) not null,
  stock_after numeric(18, 6) not null,
  reason text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_type_check check (movement_type in ('entrada', 'salida', 'ajuste', 'merma')),
  constraint inventory_movements_quantity_check check (quantity >= 0),
  constraint inventory_movements_stock_after_check check (stock_after >= 0)
);

create index if not exists inventory_movements_product_created_at_idx
on public.inventory_movements(product_id, created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_current_timestamp_updated_at();

-- Minimal legacy order shape required only by Fase 15E compatibility RPCs.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  public_reference text,
  origin text,
  public_idempotency_key_hash text,
  status text not null default 'borrador',
  estimated_total numeric(14, 2) not null default 0,
  final_total numeric(14, 2) not null default 0,
  expected_payment_method text,
  delivery_type text,
  delivery_time_window text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row execute function public.set_current_timestamp_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  unit_name text,
  unit_abbreviation text,
  requested_quantity numeric(18, 6) not null default 0,
  actual_quantity numeric(18, 6) not null default 0,
  estimated_subtotal numeric(14, 2) not null default 0,
  final_subtotal numeric(14, 2) not null default 0,
  status text not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at
before update on public.order_items
for each row execute function public.set_current_timestamp_updated_at();

-- Placeholder legacy tables referenced by Fase 12A policy hardening.
create table if not exists public.purchases (id uuid primary key default gen_random_uuid());
create table if not exists public.purchase_items (id uuid primary key default gen_random_uuid());
create table if not exists public.sales (id uuid primary key default gen_random_uuid());
create table if not exists public.sale_items (id uuid primary key default gen_random_uuid());
create table if not exists public.accounts_receivable (id uuid primary key default gen_random_uuid());
create table if not exists public.accounts_payable (id uuid primary key default gen_random_uuid());
create table if not exists public.payments (id uuid primary key default gen_random_uuid());
create table if not exists public.cash_movements (id uuid primary key default gen_random_uuid());

alter table public.profiles enable row level security;
alter table public.product_categories enable row level security;
alter table public.units_of_measure enable row level security;
alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Authenticated users can view active profiles" on public.profiles;
create policy "Authenticated users can view active profiles"
on public.profiles for select
to authenticated
using (is_active = true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Authenticated users can view products" on public.products;
create policy "Authenticated users can view products"
on public.products for select
to authenticated
using (true);

drop policy if exists "Authenticated users can view product categories" on public.product_categories;
create policy "Authenticated users can view product categories"
on public.product_categories for select
to authenticated
using (true);

drop policy if exists "Authenticated users can view units" on public.units_of_measure;
create policy "Authenticated users can view units"
on public.units_of_measure for select
to authenticated
using (true);

grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant all on all routines in schema public to service_role;

commit;
