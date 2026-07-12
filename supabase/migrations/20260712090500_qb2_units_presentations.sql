-- QB-2: Parametrizacion de unidades, conversiones y presentaciones por producto.
-- Alcance local: prepara estructura y datos base; no migra inventario ni activa flujos operativos.

begin;

create table if not exists public.qb_unit_dimensions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  base_unit_code text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_unit_dimensions_code_unique unique (code),
  constraint qb_unit_dimensions_code_check check (code ~ '^[a-z0-9_]+$'),
  constraint qb_unit_dimensions_sort_order_check check (sort_order >= 0)
);

comment on table public.qb_unit_dimensions is
  'QB-2: dimensiones globales para conversiones universales, por ejemplo peso o unidad.';
comment on column public.qb_unit_dimensions.base_unit_code is
  'Codigo de la unidad base esperada para esta dimension; la unidad base real vive en qb_units.';

create table if not exists public.qb_units (
  id uuid primary key default gen_random_uuid(),
  dimension_id uuid not null references public.qb_unit_dimensions(id) on delete restrict,
  code text not null,
  name text not null,
  symbol text not null,
  conversion_factor_to_base numeric(18, 9) not null,
  is_base boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_units_dimension_code_unique unique (dimension_id, code),
  constraint qb_units_dimension_symbol_unique unique (dimension_id, symbol),
  constraint qb_units_code_check check (code ~ '^[a-z0-9_]+$'),
  constraint qb_units_factor_check check (conversion_factor_to_base > 0),
  constraint qb_units_sort_order_check check (sort_order >= 0)
);

comment on table public.qb_units is
  'QB-2: unidades universales por dimension. El factor convierte 1 unidad a la unidad base de su dimension.';
comment on column public.qb_units.conversion_factor_to_base is
  'Cantidad de unidad base equivalente a 1 unidad de esta fila. Ej: 1 lb = 0.453592 kg.';

create unique index if not exists qb_units_one_base_per_dimension_idx
  on public.qb_units (dimension_id)
  where is_base;

create table if not exists public.qb_product_unit_settings (
  product_id uuid primary key references public.products(id) on delete cascade,
  base_unit_id uuid not null references public.qb_units(id) on delete restrict,
  inventory_unit_id uuid references public.qb_units(id) on delete restrict,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.qb_product_unit_settings is
  'QB-2: unidad base parametrica por producto. No modifica stock_current ni historial.';

create table if not exists public.qb_product_presentations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  symbol text not null,
  contained_quantity numeric(18, 6) not null,
  contained_unit_id uuid not null references public.qb_units(id) on delete restrict,
  base_quantity numeric(18, 6) not null,
  base_unit_id uuid not null references public.qb_units(id) on delete restrict,
  conversion_factor_to_base numeric(18, 9) not null,
  allow_purchase boolean not null default false,
  allow_order boolean not null default false,
  allow_sale boolean not null default false,
  allow_inventory boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_product_presentations_product_name_unique unique (product_id, name),
  constraint qb_product_presentations_product_symbol_unique unique (product_id, symbol),
  constraint qb_product_presentations_contained_quantity_check check (contained_quantity > 0),
  constraint qb_product_presentations_base_quantity_check check (base_quantity > 0),
  constraint qb_product_presentations_factor_check check (conversion_factor_to_base > 0),
  constraint qb_product_presentations_sort_order_check check (sort_order >= 0)
);

comment on table public.qb_product_presentations is
  'QB-2: presentaciones especificas por producto, por ejemplo carga, saco, caja, bandeja.';
comment on column public.qb_product_presentations.contained_quantity is
  'Cantidad contenida en la presentacion, medida en contained_unit_id. Ej: 10 arrobas.';
comment on column public.qb_product_presentations.base_quantity is
  'Equivalencia de 1 presentacion en la unidad base parametrica del producto.';

create index if not exists qb_product_presentations_product_idx
  on public.qb_product_presentations (product_id, is_active, sort_order);

create table if not exists public.qb_product_allowed_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  usage_context text not null,
  unit_id uuid references public.qb_units(id) on delete restrict,
  presentation_id uuid references public.qb_product_presentations(id) on delete cascade,
  is_default boolean not null default false,
  quantity_step numeric(18, 6),
  min_quantity numeric(18, 6),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_product_allowed_units_context_check
    check (usage_context in ('pedido', 'venta', 'recepcion', 'inventario')),
  constraint qb_product_allowed_units_one_target_check
    check ((unit_id is not null and presentation_id is null) or (unit_id is null and presentation_id is not null)),
  constraint qb_product_allowed_units_step_check check (quantity_step is null or quantity_step > 0),
  constraint qb_product_allowed_units_min_check check (min_quantity is null or min_quantity > 0),
  constraint qb_product_allowed_units_sort_order_check check (sort_order >= 0)
);

comment on table public.qb_product_allowed_units is
  'QB-2: unidades o presentaciones habilitadas por producto y contexto futuro de uso.';

create unique index if not exists qb_product_allowed_units_unit_unique_idx
  on public.qb_product_allowed_units (product_id, usage_context, unit_id)
  where unit_id is not null;

create unique index if not exists qb_product_allowed_units_presentation_unique_idx
  on public.qb_product_allowed_units (product_id, usage_context, presentation_id)
  where presentation_id is not null;

create unique index if not exists qb_product_allowed_units_default_unique_idx
  on public.qb_product_allowed_units (product_id, usage_context)
  where is_default and is_active;

create index if not exists qb_product_allowed_units_product_idx
  on public.qb_product_allowed_units (product_id, usage_context, is_active, sort_order);

create table if not exists public.qb_conversion_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_table text,
  source_id uuid,
  product_id uuid references public.products(id) on delete set null,
  dimension_code text not null,
  source_kind text not null,
  source_unit_id uuid references public.qb_units(id) on delete set null,
  product_presentation_id uuid references public.qb_product_presentations(id) on delete set null,
  source_label text not null,
  source_quantity numeric(18, 6) not null,
  base_unit_id uuid references public.qb_units(id) on delete set null,
  base_unit_symbol text not null,
  base_quantity numeric(18, 6) not null,
  conversion_factor_to_base numeric(18, 9) not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint qb_conversion_snapshots_source_kind_check
    check (source_kind in ('universal_unit', 'product_presentation')),
  constraint qb_conversion_snapshots_source_quantity_check check (source_quantity > 0),
  constraint qb_conversion_snapshots_base_quantity_check check (base_quantity > 0),
  constraint qb_conversion_snapshots_factor_check check (conversion_factor_to_base > 0)
);

comment on table public.qb_conversion_snapshots is
  'QB-2: estructura futura para congelar conversiones en compras, pedidos y recibos sin usarlas aun.';

create index if not exists qb_conversion_snapshots_source_idx
  on public.qb_conversion_snapshots (source_table, source_id);

create index if not exists qb_conversion_snapshots_product_idx
  on public.qb_conversion_snapshots (product_id, created_at desc);

drop trigger if exists set_qb_unit_dimensions_updated_at on public.qb_unit_dimensions;
create trigger set_qb_unit_dimensions_updated_at
  before update on public.qb_unit_dimensions
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_units_updated_at on public.qb_units;
create trigger set_qb_units_updated_at
  before update on public.qb_units
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_product_unit_settings_updated_at on public.qb_product_unit_settings;
create trigger set_qb_product_unit_settings_updated_at
  before update on public.qb_product_unit_settings
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_product_presentations_updated_at on public.qb_product_presentations;
create trigger set_qb_product_presentations_updated_at
  before update on public.qb_product_presentations
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_product_allowed_units_updated_at on public.qb_product_allowed_units;
create trigger set_qb_product_allowed_units_updated_at
  before update on public.qb_product_allowed_units
  for each row execute function public.set_current_timestamp_updated_at();

insert into public.qb_unit_dimensions (code, name, base_unit_code, sort_order)
values
  ('peso', 'Peso', 'kg', 10),
  ('unidad', 'Unidad', 'unidad', 20)
on conflict (code) do nothing;

with peso_dimension as (
  select id from public.qb_unit_dimensions where code = 'peso'
),
unidad_dimension as (
  select id from public.qb_unit_dimensions where code = 'unidad'
)
insert into public.qb_units (
  dimension_id,
  code,
  name,
  symbol,
  conversion_factor_to_base,
  is_base,
  sort_order
)
select id, code, name, symbol, conversion_factor_to_base, is_base, sort_order
from (
  select
    peso_dimension.id,
    values_table.code,
    values_table.name,
    values_table.symbol,
    values_table.conversion_factor_to_base,
    values_table.is_base,
    values_table.sort_order
  from peso_dimension
  cross join (
    values
      ('kg', 'Kilogramo', 'kg', 1::numeric, true, 10),
      ('libra', 'Libra', 'lb', 0.453592::numeric, false, 20),
      ('arroba', 'Arroba', '@', 11.25::numeric, false, 30),
      ('cuartilla', 'Cuartilla', 'cuartilla', 2.7::numeric, false, 40)
  ) as values_table(code, name, symbol, conversion_factor_to_base, is_base, sort_order)
  union all
  select
    unidad_dimension.id,
    'unidad',
    'Unidad',
    'unidad',
    1::numeric,
    true,
    10
  from unidad_dimension
) as seed_units
on conflict (dimension_id, code) do nothing;

alter table public.qb_unit_dimensions enable row level security;
alter table public.qb_units enable row level security;
alter table public.qb_product_unit_settings enable row level security;
alter table public.qb_product_presentations enable row level security;
alter table public.qb_product_allowed_units enable row level security;
alter table public.qb_conversion_snapshots enable row level security;

drop policy if exists "Authenticated users can view QB unit dimensions" on public.qb_unit_dimensions;
create policy "Authenticated users can view QB unit dimensions"
  on public.qb_unit_dimensions for select
  using (auth.role() = 'authenticated');

drop policy if exists "Inventory roles can manage QB unit dimensions" on public.qb_unit_dimensions;
drop policy if exists "Inventory roles can insert QB unit dimensions" on public.qb_unit_dimensions;
create policy "Inventory roles can insert QB unit dimensions"
  on public.qb_unit_dimensions for insert
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can update QB unit dimensions" on public.qb_unit_dimensions;
create policy "Inventory roles can update QB unit dimensions"
  on public.qb_unit_dimensions for update
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'))
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB units" on public.qb_units;
create policy "Authenticated users can view QB units"
  on public.qb_units for select
  using (auth.role() = 'authenticated');

drop policy if exists "Inventory roles can manage QB units" on public.qb_units;
drop policy if exists "Inventory roles can insert QB units" on public.qb_units;
create policy "Inventory roles can insert QB units"
  on public.qb_units for insert
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can update QB units" on public.qb_units;
create policy "Inventory roles can update QB units"
  on public.qb_units for update
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'))
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB product unit settings" on public.qb_product_unit_settings;
create policy "Authenticated users can view QB product unit settings"
  on public.qb_product_unit_settings for select
  using (auth.role() = 'authenticated');

drop policy if exists "Inventory roles can manage QB product unit settings" on public.qb_product_unit_settings;
drop policy if exists "Inventory roles can insert QB product unit settings" on public.qb_product_unit_settings;
create policy "Inventory roles can insert QB product unit settings"
  on public.qb_product_unit_settings for insert
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can update QB product unit settings" on public.qb_product_unit_settings;
create policy "Inventory roles can update QB product unit settings"
  on public.qb_product_unit_settings for update
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'))
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB product presentations" on public.qb_product_presentations;
create policy "Authenticated users can view QB product presentations"
  on public.qb_product_presentations for select
  using (auth.role() = 'authenticated');

drop policy if exists "Inventory roles can manage QB product presentations" on public.qb_product_presentations;
drop policy if exists "Inventory roles can insert QB product presentations" on public.qb_product_presentations;
create policy "Inventory roles can insert QB product presentations"
  on public.qb_product_presentations for insert
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can update QB product presentations" on public.qb_product_presentations;
create policy "Inventory roles can update QB product presentations"
  on public.qb_product_presentations for update
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'))
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB product allowed units" on public.qb_product_allowed_units;
create policy "Authenticated users can view QB product allowed units"
  on public.qb_product_allowed_units for select
  using (auth.role() = 'authenticated');

drop policy if exists "Inventory roles can manage QB product allowed units" on public.qb_product_allowed_units;
drop policy if exists "Inventory roles can insert QB product allowed units" on public.qb_product_allowed_units;
create policy "Inventory roles can insert QB product allowed units"
  on public.qb_product_allowed_units for insert
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can update QB product allowed units" on public.qb_product_allowed_units;
create policy "Inventory roles can update QB product allowed units"
  on public.qb_product_allowed_units for update
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'))
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB conversion snapshots" on public.qb_conversion_snapshots;
create policy "Authenticated users can view QB conversion snapshots"
  on public.qb_conversion_snapshots for select
  using (auth.role() = 'authenticated');

drop policy if exists "Inventory roles can create QB conversion snapshots" on public.qb_conversion_snapshots;
create policy "Inventory roles can create QB conversion snapshots"
  on public.qb_conversion_snapshots for insert
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

commit;
