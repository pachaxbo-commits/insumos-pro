-- Fase 15B - Catalogo publico seguro de solo lectura
-- PENDIENTE DE APLICAR EN SUPABASE STAGING DESPUES DE FASE 14D.1.
-- No ejecutar en produccion sin backup y validacion completa en staging.

begin;

alter table public.product_categories
  add column if not exists is_catalog_visible boolean not null default false,
  add column if not exists catalog_slug text,
  add column if not exists catalog_sort_order integer not null default 0;

alter table public.product_categories
  drop constraint if exists product_categories_catalog_slug_check;

alter table public.product_categories
  add constraint product_categories_catalog_slug_check
  check (
    catalog_slug is null
    or catalog_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

alter table public.product_categories
  drop constraint if exists product_categories_catalog_visibility_check;

alter table public.product_categories
  add constraint product_categories_catalog_visibility_check
  check (is_catalog_visible = false or catalog_slug is not null);

alter table public.product_categories
  drop constraint if exists product_categories_catalog_sort_order_check;

alter table public.product_categories
  add constraint product_categories_catalog_sort_order_check
  check (catalog_sort_order >= 0);

create unique index if not exists product_categories_catalog_slug_unique_idx
on public.product_categories (catalog_slug)
where catalog_slug is not null;

create index if not exists product_categories_catalog_visibility_idx
on public.product_categories (is_catalog_visible, catalog_sort_order);

alter table public.products
  add column if not exists is_sellable boolean not null default true,
  add column if not exists is_catalog_visible boolean not null default false,
  add column if not exists catalog_description text,
  add column if not exists catalog_sort_order integer not null default 0,
  add column if not exists catalog_min_quantity numeric(14, 3) not null default 1,
  add column if not exists catalog_quantity_step numeric(14, 3) not null default 1,
  add column if not exists catalog_availability text not null default 'consultar';

alter table public.products
  drop constraint if exists products_catalog_availability_check;

alter table public.products
  add constraint products_catalog_availability_check
  check (catalog_availability in ('disponible', 'consultar', 'agotado'));

alter table public.products
  drop constraint if exists products_catalog_sort_order_check;

alter table public.products
  add constraint products_catalog_sort_order_check
  check (catalog_sort_order >= 0);

alter table public.products
  drop constraint if exists products_catalog_min_quantity_check;

alter table public.products
  add constraint products_catalog_min_quantity_check
  check (catalog_min_quantity > 0);

alter table public.products
  drop constraint if exists products_catalog_quantity_step_check;

alter table public.products
  add constraint products_catalog_quantity_step_check
  check (catalog_quantity_step > 0);

alter table public.products
  drop constraint if exists products_catalog_publication_check;

alter table public.products
  add constraint products_catalog_publication_check
  check (
    is_catalog_visible = false
    or (
      is_sellable = true
      and requires_classification = false
      and sale_price > 0
    )
  );

create index if not exists products_catalog_visibility_idx
on public.products (
  is_catalog_visible,
  is_sellable,
  catalog_availability,
  category_id,
  catalog_sort_order
);

-- No se concede SELECT anonimo sobre tablas operativas. Esta RPC devuelve
-- exclusivamente campos aptos para el escaparate publico.
create or replace function public.get_public_catalog()
returns table (
  product_id uuid,
  product_name text,
  public_description text,
  image_url text,
  reference_price numeric(14, 2),
  unit_name text,
  unit_abbreviation text,
  category_id uuid,
  category_name text,
  category_slug text,
  minimum_quantity numeric(14, 3),
  quantity_step numeric(14, 3),
  availability text,
  product_sort_order integer,
  category_sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    product.id,
    product.name,
    product.catalog_description,
    product.image_url,
    product.sale_price,
    unit.name,
    unit.abbreviation,
    category.id,
    category.name,
    category.catalog_slug,
    product.catalog_min_quantity,
    product.catalog_quantity_step,
    product.catalog_availability,
    product.catalog_sort_order,
    category.catalog_sort_order
  from public.products product
  join public.product_categories category
    on category.id = product.category_id
   and category.is_active = true
   and category.is_catalog_visible = true
   and category.catalog_slug is not null
  join public.units_of_measure unit
    on unit.id = product.unit_id
   and unit.is_active = true
  where product.is_active = true
    and product.is_sellable = true
    and product.is_catalog_visible = true
    and product.requires_classification = false
    and product.sale_price > 0
  order by
    category.catalog_sort_order,
    category.name,
    product.catalog_sort_order,
    product.name;
$$;

revoke select, insert, update, delete
on table public.products, public.product_categories, public.units_of_measure
from anon;

revoke all on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon, authenticated;

commit;
