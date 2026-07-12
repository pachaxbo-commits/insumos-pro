-- QB-3: Productos QB y configuracion de unidades permitidas.
-- Alcance local: completa parametrizacion por producto; no migra stock ni activa flujos operativos.

begin;

alter table public.qb_product_unit_settings
  add column if not exists base_inventory_unit_id uuid references public.qb_units(id) on delete restrict,
  add column if not exists base_price_unit_id uuid references public.qb_units(id) on delete restrict,
  add column if not exists base_sale_price numeric(18, 4),
  add column if not exists is_visible_in_qb_catalog boolean not null default false,
  add column if not exists is_classifiable boolean not null default false,
  add column if not exists classification_mode text not null default 'none',
  add column if not exists is_qb_active boolean not null default true,
  add column if not exists internal_notes text;

comment on column public.qb_product_unit_settings.base_inventory_unit_id is
  'QB-3: unidad base futura para control de inventario del producto. No modifica stock_current.';
comment on column public.qb_product_unit_settings.base_price_unit_id is
  'QB-3: unidad base futura para precio base de venta y recibos acumulativos.';
comment on column public.qb_product_unit_settings.base_sale_price is
  'QB-3: precio base de venta futuro. No modifica ventas ni precios historicos.';
comment on column public.qb_product_unit_settings.is_visible_in_qb_catalog is
  'QB-3: visibilidad futura en catalogo QB sin precios. No habilita catalogo publico.';
comment on column public.qb_product_unit_settings.is_classifiable is
  'QB-3: indica si el producto puede requerir clasificacion al ingresar mercaderia.';
comment on column public.qb_product_unit_settings.classification_mode is
  'QB-3: modo futuro de clasificacion. Valores: none, manual, percentage, weight.';
comment on column public.qb_product_unit_settings.is_qb_active is
  'QB-3: estado logico para uso futuro en modulos QB.';

update public.qb_product_unit_settings
set
  base_inventory_unit_id = coalesce(base_inventory_unit_id, inventory_unit_id, base_unit_id),
  base_price_unit_id = coalesce(base_price_unit_id, base_unit_id),
  classification_mode = case
    when is_classifiable then classification_mode
    else 'none'
  end
where base_inventory_unit_id is null
   or base_price_unit_id is null
   or (not is_classifiable and classification_mode <> 'none');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'qb_product_unit_settings_base_sale_price_check'
  ) then
    alter table public.qb_product_unit_settings
      add constraint qb_product_unit_settings_base_sale_price_check
      check (base_sale_price is null or base_sale_price >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'qb_product_unit_settings_classification_mode_check'
  ) then
    alter table public.qb_product_unit_settings
      add constraint qb_product_unit_settings_classification_mode_check
      check (classification_mode in ('none', 'manual', 'percentage', 'weight'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'qb_product_unit_settings_classifiable_mode_check'
  ) then
    alter table public.qb_product_unit_settings
      add constraint qb_product_unit_settings_classifiable_mode_check
      check (is_classifiable or classification_mode = 'none');
  end if;
end $$;

alter table public.qb_product_allowed_units
  drop constraint if exists qb_product_allowed_units_context_check;

alter table public.qb_product_allowed_units
  add constraint qb_product_allowed_units_context_check
  check (usage_context in ('pedido', 'recepcion', 'recibo', 'inventario', 'venta'));

comment on constraint qb_product_allowed_units_context_check on public.qb_product_allowed_units is
  'QB-3 agrega recibo. El valor venta se conserva solo por compatibilidad local; la UI QB-3 no lo crea.';

create table if not exists public.qb_product_classification_outputs (
  id uuid primary key default gen_random_uuid(),
  source_product_id uuid not null references public.products(id) on delete cascade,
  output_type text not null default 'product',
  output_product_id uuid references public.products(id) on delete restrict,
  label text not null,
  expected_percentage numeric(7, 4),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_product_classification_outputs_type_check
    check (output_type in ('product', 'loss')),
  constraint qb_product_classification_outputs_target_check
    check (
      (output_type = 'product' and output_product_id is not null) or
      (output_type = 'loss' and output_product_id is null)
    ),
  constraint qb_product_classification_outputs_self_check
    check (output_product_id is null or output_product_id <> source_product_id),
  constraint qb_product_classification_outputs_percentage_check
    check (expected_percentage is null or (expected_percentage >= 0 and expected_percentage <= 100)),
  constraint qb_product_classification_outputs_sort_order_check
    check (sort_order >= 0),
  constraint qb_product_classification_outputs_label_unique
    unique (source_product_id, label)
);

comment on table public.qb_product_classification_outputs is
  'QB-3: relaciones futuras de clasificacion por producto. No generan stock ni clasificacion real.';
comment on column public.qb_product_classification_outputs.source_product_id is
  'Producto que puede clasificarse al recibir mercaderia.';
comment on column public.qb_product_classification_outputs.output_product_id is
  'Producto resultado futuro, por ejemplo papa grande. Nulo cuando output_type = loss.';
comment on column public.qb_product_classification_outputs.output_type is
  'product para resultado vendible; loss para merma.';

create unique index if not exists qb_product_classification_outputs_product_unique_idx
  on public.qb_product_classification_outputs (source_product_id, output_product_id)
  where output_product_id is not null;

create index if not exists qb_product_classification_outputs_source_idx
  on public.qb_product_classification_outputs (source_product_id, is_active, sort_order);

drop trigger if exists set_qb_product_classification_outputs_updated_at on public.qb_product_classification_outputs;
create trigger set_qb_product_classification_outputs_updated_at
  before update on public.qb_product_classification_outputs
  for each row execute function public.set_current_timestamp_updated_at();

alter table public.qb_product_classification_outputs enable row level security;

drop policy if exists "Authenticated users can view QB classification outputs" on public.qb_product_classification_outputs;
create policy "Authenticated users can view QB classification outputs"
  on public.qb_product_classification_outputs for select
  using (auth.role() = 'authenticated');

drop policy if exists "Inventory roles can insert QB classification outputs" on public.qb_product_classification_outputs;
create policy "Inventory roles can insert QB classification outputs"
  on public.qb_product_classification_outputs for insert
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Inventory roles can update QB classification outputs" on public.qb_product_classification_outputs;
create policy "Inventory roles can update QB classification outputs"
  on public.qb_product_classification_outputs for update
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'))
  with check (public.current_user_role() in ('admin', 'administrador', 'inventario'));

commit;
