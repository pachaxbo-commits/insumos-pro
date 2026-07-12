-- QB-9.4: complete the verified product baseline and restrict direct product reads.
-- Catalog visibility remains canonical in qb_product_unit_settings.is_visible_in_qb_catalog.

begin;

alter table public.products
  add column if not exists sku text,
  add column if not exists supplier_name text;

alter table public.audit_logs
  add column if not exists ip_address text,
  add column if not exists user_agent text;

-- The isolated QB-9.1 baseline used stock_minimum. Preserve it for compatibility,
-- but copy its value only when the canonical stock_min column has just been added.
do $$
declare
  had_stock_min boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'stock_min'
  ) into had_stock_min;

  if not had_stock_min then
    alter table public.products
      add column stock_min numeric(14, 3) not null default 0;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'products'
        and column_name = 'stock_minimum'
    ) then
      update public.products set stock_min = stock_minimum;
    end if;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.products
    where sku is not null
    group by sku
    having count(*) > 1
  ) then
    raise exception 'QB-9.4 cannot enforce SKU uniqueness: duplicate non-null SKU values exist';
  end if;
end;
$$;

create unique index if not exists products_sku_qb94_uidx
  on public.products(sku);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_stock_min_qb94_check'
  ) then
    alter table public.products
      add constraint products_stock_min_qb94_check check (stock_min >= 0);
  end if;
end;
$$;

comment on column public.products.sku is
  'Canonical product identifier verified in the historical product baseline.';
comment on column public.products.stock_min is
  'Canonical minimum stock used by active product, inventory and QB reporting modules.';
comment on column public.products.supplier_name is
  'Optional base product supplier reference; it does not activate legacy purchasing.';
comment on column public.audit_logs.ip_address is
  'Optional request address required by the active Fase 12C audit contract.';
comment on column public.audit_logs.user_agent is
  'Optional request user agent required by the active Fase 12C audit contract.';

alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.units_of_measure enable row level security;
alter table public.inventory_movements enable row level security;

revoke all on table
  public.products,
  public.product_categories,
  public.units_of_measure,
  public.inventory_movements
from anon, authenticated;

grant select, insert, update on table
  public.products,
  public.product_categories,
  public.units_of_measure
to authenticated;

grant select on table public.inventory_movements to authenticated;

drop policy if exists "Authenticated users can view products" on public.products;
drop policy if exists "Internal roles can view products" on public.products;
create policy "Internal roles can view products"
  on public.products for select
  to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can insert products" on public.products;
create policy "Internal roles can insert products"
  on public.products for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can update products" on public.products;
create policy "Internal roles can update products"
  on public.products for update
  to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'))
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view product categories" on public.product_categories;
drop policy if exists "Internal roles can view product categories" on public.product_categories;
create policy "Internal roles can view product categories"
  on public.product_categories for select
  to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can insert product categories" on public.product_categories;
create policy "Internal roles can insert product categories"
  on public.product_categories for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can update product categories" on public.product_categories;
create policy "Internal roles can update product categories"
  on public.product_categories for update
  to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'))
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view units" on public.units_of_measure;
drop policy if exists "Internal roles can view units" on public.units_of_measure;
create policy "Internal roles can view units"
  on public.units_of_measure for select
  to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can insert units" on public.units_of_measure;
create policy "Internal roles can insert units"
  on public.units_of_measure for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can update units" on public.units_of_measure;
create policy "Internal roles can update units"
  on public.units_of_measure for update
  to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'))
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Internal roles can view inventory movements" on public.inventory_movements;
create policy "Internal roles can view inventory movements"
  on public.inventory_movements for select
  to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

commit;
