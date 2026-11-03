-- Isolated PostgreSQL contract fixture for migration 20261103180000.
-- It models the exact source columns and prior public view shape used by the
-- migration, with synthetic identities and rows only.
create role anon;
create role authenticated;
create schema auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.profiles (
  id uuid primary key,
  full_name text,
  role text not null,
  is_active boolean not null default true
);
create table public.qb_merchandise_receipts (
  id uuid primary key,
  receipt_date date not null,
  status text not null,
  created_by uuid references public.profiles(id)
);
create table public.products (id uuid primary key, name text not null);
create table public.qb_merchandise_receipt_lines (
  id uuid primary key,
  receipt_id uuid not null references public.qb_merchandise_receipts(id),
  product_id uuid not null references public.products(id),
  source_label text not null,
  source_quantity numeric(18,6) not null,
  unit_cost numeric(18,4),
  total_cost numeric(18,4),
  reference_unit_id uuid,
  reference_price numeric(20,8),
  reference_price_origin text,
  notes text,
  requires_classification boolean not null default false,
  actual_base_quantity_recorded boolean not null default false,
  base_quantity numeric(18,6) not null default 0,
  base_unit_id uuid,
  base_unit_symbol text not null default 'KG',
  source_kind text not null default 'universal_unit',
  allowed_unit_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_warehouse_purchase boolean not null default true
);
create or replace function public.current_user_role() returns text
language sql stable security definer set search_path = pg_catalog as $$
  select role from public.profiles
   where id = auth.uid() and is_active
$$;

create or replace view public.qb_operational_warehouse_purchases
with (security_barrier = true) as
select line.id, line.receipt_id, receipt.receipt_date, receipt.status,
  line.product_id, product.name as product_name, line.source_label,
  line.source_quantity, line.unit_cost, line.total_cost,
  line.reference_unit_id, line.reference_price, line.reference_price_origin,
  line.notes, line.requires_classification, line.actual_base_quantity_recorded,
  line.base_quantity, line.base_unit_id, line.base_unit_symbol, line.source_kind,
  line.allowed_unit_id, line.created_at, line.updated_at,
  profile.full_name as created_by_profile_name
from public.qb_merchandise_receipt_lines line
join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
join public.products product on product.id = line.product_id
left join public.profiles profile on profile.id = receipt.created_by
where line.is_warehouse_purchase and receipt.status <> 'anulado'
  and public.current_user_role() in ('admin','administrador','inventario','supervisor');
revoke all on public.qb_operational_warehouse_purchases from public, anon;
grant select on public.qb_operational_warehouse_purchases to authenticated;

insert into public.profiles (id, full_name, role) values
  ('00000000-0000-4000-8000-000000000001','Fixture Admin','administrador'),
  ('00000000-0000-4000-8000-000000000002','Fixture Supervisor','supervisor'),
  ('00000000-0000-4000-8000-000000000003','Fixture Inventory','inventario');
insert into public.qb_merchandise_receipts (id, receipt_date, status, created_by)
values ('10000000-0000-4000-8000-000000000001', date '2026-11-03', 'confirmado',
        '00000000-0000-4000-8000-000000000001');
insert into public.products (id, name)
values ('20000000-0000-4000-8000-000000000001','FICTICIO PROJECTION TEST');
insert into public.qb_merchandise_receipt_lines (
  id, receipt_id, product_id, source_label, source_quantity, unit_cost,
  total_cost, reference_price, reference_price_origin, base_quantity,
  is_warehouse_purchase
) values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'SACO', 3, 600, 1800, 760,
  'manual', 75, true
);
