create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'ventas',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_role_check
    check (role in ('administrador', 'ventas', 'inventario', 'finanzas'))
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_is_active_idx on public.profiles (is_active);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_current_timestamp_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'ventas',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create extension if not exists pgcrypto;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_categories_name_unique unique (name)
);

create index if not exists product_categories_is_active_idx
on public.product_categories (is_active);

drop trigger if exists set_product_categories_updated_at on public.product_categories;

create trigger set_product_categories_updated_at
before update on public.product_categories
for each row
execute function public.set_current_timestamp_updated_at();

create table if not exists public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  abbreviation text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint units_of_measure_name_unique unique (name),
  constraint units_of_measure_abbreviation_unique unique (abbreviation)
);

create index if not exists units_of_measure_is_active_idx
on public.units_of_measure (is_active);

drop trigger if exists set_units_of_measure_updated_at on public.units_of_measure;

create trigger set_units_of_measure_updated_at
before update on public.units_of_measure
for each row
execute function public.set_current_timestamp_updated_at();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  category_id uuid references public.product_categories (id) on delete set null,
  unit_id uuid references public.units_of_measure (id) on delete set null,
  stock_current numeric(14, 2) not null default 0,
  stock_min numeric(14, 2) not null default 0,
  purchase_price numeric(14, 2) not null default 0,
  sale_price numeric(14, 2) not null default 0,
  supplier_name text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint products_sku_unique unique (sku),
  constraint products_stock_current_check check (stock_current >= 0),
  constraint products_stock_min_check check (stock_min >= 0),
  constraint products_purchase_price_check check (purchase_price >= 0),
  constraint products_sale_price_check check (sale_price >= 0)
);

create index if not exists products_name_idx on public.products (name);
create index if not exists products_sku_idx on public.products (sku);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_unit_id_idx on public.products (unit_id);
create index if not exists products_is_active_idx on public.products (is_active);

drop trigger if exists set_products_updated_at on public.products;

create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.product_categories enable row level security;
alter table public.units_of_measure enable row level security;
alter table public.products enable row level security;

drop policy if exists "Allowed roles can view product categories" on public.product_categories;
create policy "Allowed roles can view product categories"
on public.product_categories
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario', 'ventas')
  )
);

drop policy if exists "Inventory roles can insert product categories" on public.product_categories;
create policy "Inventory roles can insert product categories"
on public.product_categories
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

drop policy if exists "Inventory roles can update product categories" on public.product_categories;
create policy "Inventory roles can update product categories"
on public.product_categories
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

drop policy if exists "Allowed roles can view units of measure" on public.units_of_measure;
create policy "Allowed roles can view units of measure"
on public.units_of_measure
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario', 'ventas')
  )
);

drop policy if exists "Inventory roles can insert units of measure" on public.units_of_measure;
create policy "Inventory roles can insert units of measure"
on public.units_of_measure
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

drop policy if exists "Inventory roles can update units of measure" on public.units_of_measure;
create policy "Inventory roles can update units of measure"
on public.units_of_measure
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

drop policy if exists "Allowed roles can view products" on public.products;
create policy "Allowed roles can view products"
on public.products
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario', 'ventas')
  )
);

drop policy if exists "Inventory roles can insert products" on public.products;
create policy "Inventory roles can insert products"
on public.products
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

drop policy if exists "Inventory roles can update products" on public.products;
create policy "Inventory roles can update products"
on public.products
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

insert into public.product_categories (name, description, is_active)
values
  ('Verduras', 'Productos frescos por peso o unidad.', true),
  ('Abarrotes', 'Insumos secos de alta rotacion.', true),
  ('Condimentos', 'Especias, sazonadores y mezclas.', true),
  ('Aceites', 'Aceites y grasas para cocina.', true)
on conflict (name) do update
set
  description = excluded.description,
  is_active = excluded.is_active;

insert into public.units_of_measure (name, abbreviation, is_active)
values
  ('Kilogramo', 'kg', true),
  ('Unidad', 'unidad', true),
  ('Caja', 'caja', true),
  ('Bolsa', 'bolsa', true),
  ('Paquete', 'paquete', true),
  ('Litro', 'litro', true)
on conflict (name) do update
set
  abbreviation = excluded.abbreviation,
  is_active = excluded.is_active;

insert into public.products (
  name,
  sku,
  category_id,
  unit_id,
  stock_current,
  stock_min,
  purchase_price,
  sale_price,
  supplier_name,
  is_active
)
values
  (
    'Tomate perita',
    'VER-TOM-001',
    (select id from public.product_categories where name = 'Verduras'),
    (select id from public.units_of_measure where abbreviation = 'kg'),
    120,
    40,
    4.50,
    6.50,
    'Proveedor demo verduras',
    true
  ),
  (
    'Papa holandesa',
    'VER-PAP-001',
    (select id from public.product_categories where name = 'Verduras'),
    (select id from public.units_of_measure where abbreviation = 'kg'),
    85,
    60,
    3.20,
    4.80,
    'Proveedor demo verduras',
    true
  ),
  (
    'Cebolla roja',
    'VER-CEB-001',
    (select id from public.product_categories where name = 'Verduras'),
    (select id from public.units_of_measure where abbreviation = 'kg'),
    38,
    60,
    2.90,
    4.20,
    'Proveedor demo verduras',
    true
  ),
  (
    'Locoto fresco',
    'VER-LOC-001',
    (select id from public.product_categories where name = 'Verduras'),
    (select id from public.units_of_measure where abbreviation = 'kg'),
    0,
    25,
    8.00,
    12.00,
    'Proveedor demo verduras',
    true
  ),
  (
    'Arroz premium 50 kg',
    'ABA-ARR-050',
    (select id from public.product_categories where name = 'Abarrotes'),
    (select id from public.units_of_measure where abbreviation = 'bolsa'),
    42,
    15,
    320.00,
    390.00,
    'Proveedor demo abarrotes',
    true
  ),
  (
    'Aceite vegetal 5 L',
    'ACE-VEG-005',
    (select id from public.product_categories where name = 'Aceites'),
    (select id from public.units_of_measure where abbreviation = 'litro'),
    18,
    20,
    42.00,
    58.00,
    'Proveedor demo aceites',
    true
  ),
  (
    'Condimento mixto',
    'CON-MIX-001',
    (select id from public.product_categories where name = 'Condimentos'),
    (select id from public.units_of_measure where abbreviation = 'paquete'),
    64,
    18,
    9.50,
    14.00,
    'Proveedor demo condimentos',
    true
  )
on conflict (sku) do update
set
  name = excluded.name,
  category_id = excluded.category_id,
  unit_id = excluded.unit_id,
  stock_current = excluded.stock_current,
  stock_min = excluded.stock_min,
  purchase_price = excluded.purchase_price,
  sale_price = excluded.sale_price,
  supplier_name = excluded.supplier_name,
  is_active = excluded.is_active;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  movement_type text not null,
  quantity numeric(14, 2) not null,
  stock_before numeric(14, 2) not null,
  stock_after numeric(14, 2) not null,
  reason text not null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint inventory_movements_type_check
    check (movement_type in ('entrada', 'salida', 'ajuste', 'merma', 'devolucion')),
  constraint inventory_movements_quantity_check check (quantity > 0),
  constraint inventory_movements_stock_before_check check (stock_before >= 0),
  constraint inventory_movements_stock_after_check check (stock_after >= 0)
);

create index if not exists inventory_movements_product_id_idx
on public.inventory_movements (product_id);

create index if not exists inventory_movements_movement_type_idx
on public.inventory_movements (movement_type);

create index if not exists inventory_movements_created_at_idx
on public.inventory_movements (created_at desc);

create index if not exists inventory_movements_created_by_idx
on public.inventory_movements (created_by);

alter table public.inventory_movements enable row level security;

drop policy if exists "Allowed roles can view inventory movements" on public.inventory_movements;
create policy "Allowed roles can view inventory movements"
on public.inventory_movements
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario', 'ventas')
  )
);

drop policy if exists "Inventory roles can insert inventory movements" on public.inventory_movements;
create policy "Inventory roles can insert inventory movements"
on public.inventory_movements
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

create or replace function public.register_inventory_movement(
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_stock_before numeric(14, 2);
  v_stock_after numeric(14, 2);
  v_quantity numeric(14, 2);
  v_movement_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role
  into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para registrar movimientos de inventario.';
  end if;

  if p_movement_type not in ('entrada', 'salida', 'ajuste', 'merma', 'devolucion') then
    raise exception 'Tipo de movimiento invalido.';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  select stock_current
  into v_stock_before
  from public.products
  where id = p_product_id
    and is_active = true
  for update;

  if v_stock_before is null then
    raise exception 'Producto no encontrado o inactivo.';
  end if;

  if p_movement_type in ('entrada', 'devolucion') then
    v_stock_after := v_stock_before + p_quantity;
    v_quantity := p_quantity;
  elsif p_movement_type in ('salida', 'merma') then
    v_stock_after := v_stock_before - p_quantity;
    v_quantity := p_quantity;
  else
    v_stock_after := p_quantity;
    v_quantity := abs(v_stock_after - v_stock_before);

    if v_quantity = 0 then
      raise exception 'El ajuste no cambia el stock actual.';
    end if;
  end if;

  if v_stock_after < 0 then
    raise exception 'El movimiento dejaria stock negativo. Ajusta la cantidad.';
  end if;

  insert into public.inventory_movements (
    product_id,
    movement_type,
    quantity,
    stock_before,
    stock_after,
    reason,
    notes,
    created_by
  )
  values (
    p_product_id,
    p_movement_type,
    v_quantity,
    v_stock_before,
    v_stock_after,
    trim(p_reason),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_movement_id;

  update public.products
  set stock_current = v_stock_after
  where id = p_product_id;

  return v_movement_id;
end;
$$;

revoke all on function public.register_inventory_movement(uuid, text, numeric, text, text) from public;
grant execute on function public.register_inventory_movement(uuid, text, numeric, text, text) to authenticated;

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint suppliers_name_unique unique (name)
);

create index if not exists suppliers_name_idx on public.suppliers (name);
create index if not exists suppliers_is_active_idx on public.suppliers (is_active);

drop trigger if exists set_suppliers_updated_at on public.suppliers;

create trigger set_suppliers_updated_at
before update on public.suppliers
for each row
execute function public.set_current_timestamp_updated_at();

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers (id) on delete set null,
  purchase_date date not null default current_date,
  status text not null default 'borrador',
  payment_status text not null default 'pendiente',
  payment_method text not null default 'transferencia',
  subtotal numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchases_status_check check (status in ('borrador', 'confirmada', 'cancelada')),
  constraint purchases_payment_status_check check (payment_status in ('pagada', 'pendiente', 'parcial')),
  constraint purchases_payment_method_check check (payment_method in ('efectivo', 'transferencia', 'qr', 'credito')),
  constraint purchases_subtotal_check check (subtotal >= 0),
  constraint purchases_total_check check (total >= 0)
);

create index if not exists purchases_supplier_id_idx on public.purchases (supplier_id);
create index if not exists purchases_status_idx on public.purchases (status);
create index if not exists purchases_payment_status_idx on public.purchases (payment_status);
create index if not exists purchases_purchase_date_idx on public.purchases (purchase_date desc);
create index if not exists purchases_created_by_idx on public.purchases (created_by);

drop trigger if exists set_purchases_updated_at on public.purchases;

create trigger set_purchases_updated_at
before update on public.purchases
for each row
execute function public.set_current_timestamp_updated_at();

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(14, 2) not null,
  unit_cost numeric(14, 2) not null,
  subtotal numeric(14, 2) not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint purchase_items_quantity_check check (quantity > 0),
  constraint purchase_items_unit_cost_check check (unit_cost >= 0),
  constraint purchase_items_subtotal_check check (subtotal >= 0)
);

create index if not exists purchase_items_purchase_id_idx on public.purchase_items (purchase_id);
create index if not exists purchase_items_product_id_idx on public.purchase_items (product_id);

alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists "Allowed roles can view suppliers" on public.suppliers;
create policy "Allowed roles can view suppliers"
on public.suppliers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario', 'finanzas')
  )
);

drop policy if exists "Inventory roles can insert suppliers" on public.suppliers;
create policy "Inventory roles can insert suppliers"
on public.suppliers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

drop policy if exists "Inventory roles can update suppliers" on public.suppliers;
create policy "Inventory roles can update suppliers"
on public.suppliers
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

drop policy if exists "Allowed roles can view purchases" on public.purchases;
create policy "Allowed roles can view purchases"
on public.purchases
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario', 'finanzas')
  )
);

drop policy if exists "Inventory roles can insert purchases" on public.purchases;
create policy "Inventory roles can insert purchases"
on public.purchases
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

drop policy if exists "Inventory roles can update purchases" on public.purchases;
create policy "Inventory roles can update purchases"
on public.purchases
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

drop policy if exists "Allowed roles can view purchase items" on public.purchase_items;
create policy "Allowed roles can view purchase items"
on public.purchase_items
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario', 'finanzas')
  )
);

drop policy if exists "Inventory roles can insert purchase items" on public.purchase_items;
create policy "Inventory roles can insert purchase items"
on public.purchase_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'inventario')
  )
);

create or replace function public.create_purchase_draft(
  p_supplier_id uuid,
  p_purchase_date date,
  p_payment_status text,
  p_payment_method text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_purchase_id uuid;
  v_total numeric(14, 2) := 0;
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14, 2);
  v_unit_cost numeric(14, 2);
  v_subtotal numeric(14, 2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para crear compras.';
  end if;

  if p_payment_status not in ('pagada', 'pendiente', 'parcial') then
    raise exception 'Estado de pago invalido.';
  end if;

  if p_payment_method not in ('efectivo', 'transferencia', 'qr', 'credito') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if not exists (select 1 from public.suppliers where id = p_supplier_id and is_active = true) then
    raise exception 'Proveedor no encontrado o inactivo.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un item a la compra.';
  end if;

  insert into public.purchases (
    supplier_id,
    purchase_date,
    status,
    payment_status,
    payment_method,
    subtotal,
    total,
    notes,
    created_by
  )
  values (
    p_supplier_id,
    p_purchase_date,
    'borrador',
    p_payment_status,
    p_payment_method,
    0,
    0,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_cost := (v_item ->> 'unit_cost')::numeric;

    if v_quantity <= 0 then
      raise exception 'La cantidad de un item debe ser mayor a cero.';
    end if;

    if v_unit_cost < 0 then
      raise exception 'El costo unitario no puede ser negativo.';
    end if;

    if not exists (select 1 from public.products where id = v_product_id and is_active = true) then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_subtotal := round(v_quantity * v_unit_cost, 2);
    v_total := v_total + v_subtotal;

    insert into public.purchase_items (
      purchase_id,
      product_id,
      quantity,
      unit_cost,
      subtotal
    )
    values (
      v_purchase_id,
      v_product_id,
      v_quantity,
      v_unit_cost,
      v_subtotal
    );
  end loop;

  update public.purchases
  set subtotal = v_total,
      total = v_total
  where id = v_purchase_id;

  return v_purchase_id;
end;
$$;

create or replace function public.confirm_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_purchase record;
  v_item record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para confirmar compras.';
  end if;

  select *
  into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;

  if v_purchase.id is null then
    raise exception 'Compra no encontrada.';
  end if;

  if v_purchase.status = 'confirmada' then
    raise exception 'La compra ya fue confirmada.';
  end if;

  if v_purchase.status <> 'borrador' then
    raise exception 'Solo se pueden confirmar compras en borrador.';
  end if;

  if not exists (select 1 from public.purchase_items where purchase_id = p_purchase_id) then
    raise exception 'La compra no tiene items.';
  end if;

  for v_item in
    select product_id, quantity
    from public.purchase_items
    where purchase_id = p_purchase_id
  loop
    perform public.register_inventory_movement(
      v_item.product_id,
      'entrada',
      v_item.quantity,
      'Compra confirmada',
      'Compra ' || p_purchase_id::text
    );
  end loop;

  update public.purchases
  set status = 'confirmada'
  where id = p_purchase_id;
end;
$$;

create or replace function public.cancel_purchase_draft(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_status text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para cancelar compras.';
  end if;

  select status into v_status
  from public.purchases
  where id = p_purchase_id
  for update;

  if v_status is null then
    raise exception 'Compra no encontrada.';
  end if;

  if v_status <> 'borrador' then
    raise exception 'Solo se pueden cancelar compras en borrador.';
  end if;

  update public.purchases
  set status = 'cancelada'
  where id = p_purchase_id;
end;
$$;

revoke all on function public.create_purchase_draft(uuid, date, text, text, text, jsonb) from public;
grant execute on function public.create_purchase_draft(uuid, date, text, text, text, jsonb) to authenticated;

revoke all on function public.confirm_purchase(uuid) from public;
grant execute on function public.confirm_purchase(uuid) to authenticated;

revoke all on function public.cancel_purchase_draft(uuid) from public;
grant execute on function public.cancel_purchase_draft(uuid) to authenticated;

insert into public.suppliers (name, contact_name, phone, address, notes, is_active)
values
  ('Agricola Don Pepe', 'Jose Perez', '700-10001', 'Mercado mayorista demo', 'Proveedor demo de verduras.', true),
  ('Distribuidora El Sol', 'Carla Rojas', '700-10002', 'Zona industrial demo', 'Proveedor demo de aceites y abarrotes.', true),
  ('Sabores del Valle', 'Mario Vargas', '700-10003', 'Av. Comercial demo', 'Proveedor demo de condimentos.', true)
on conflict (name) do update
set
  contact_name = excluded.contact_name,
  phone = excluded.phone,
  address = excluded.address,
  notes = excluded.notes,
  is_active = excluded.is_active;
