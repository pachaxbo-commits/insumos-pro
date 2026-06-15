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

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text,
  nit text,
  phone text,
  email text,
  address text,
  customer_type text not null default 'contado',
  credit_limit numeric(14, 2) not null default 0,
  current_balance numeric(14, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customers_customer_type_check check (customer_type in ('contado', 'credito')),
  constraint customers_credit_limit_check check (credit_limit >= 0),
  constraint customers_current_balance_check check (current_balance >= 0)
);

create index if not exists customers_name_idx on public.customers (name);
create unique index if not exists customers_name_unique_idx on public.customers (name);
create index if not exists customers_nit_idx on public.customers (nit);
create index if not exists customers_customer_type_idx on public.customers (customer_type);
create index if not exists customers_is_active_idx on public.customers (is_active);

drop trigger if exists set_customers_updated_at on public.customers;

create trigger set_customers_updated_at
before update on public.customers
for each row
execute function public.set_current_timestamp_updated_at();

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  sale_date date not null default current_date,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  payment_type text not null default 'contado',
  status text not null default 'borrador',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sales_payment_type_check check (payment_type in ('contado', 'transferencia', 'qr', 'credito')),
  constraint sales_status_check check (status in ('borrador', 'confirmada', 'anulada')),
  constraint sales_subtotal_check check (subtotal >= 0),
  constraint sales_discount_check check (discount >= 0),
  constraint sales_total_check check (total >= 0)
);

create index if not exists sales_customer_id_idx on public.sales (customer_id);
create index if not exists sales_sale_date_idx on public.sales (sale_date desc);
create index if not exists sales_status_idx on public.sales (status);
create index if not exists sales_payment_type_idx on public.sales (payment_type);
create index if not exists sales_created_by_idx on public.sales (created_by);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(14, 2) not null,
  unit_price numeric(14, 2) not null,
  subtotal numeric(14, 2) not null,
  constraint sale_items_quantity_check check (quantity > 0),
  constraint sale_items_unit_price_check check (unit_price >= 0),
  constraint sale_items_subtotal_check check (subtotal >= 0)
);

create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);

create table if not exists public.accounts_receivable (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  amount numeric(14, 2) not null,
  balance numeric(14, 2) not null,
  status text not null default 'pendiente',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint accounts_receivable_sale_unique unique (sale_id),
  constraint accounts_receivable_status_check check (status in ('pendiente', 'pagada', 'parcial', 'anulada')),
  constraint accounts_receivable_amount_check check (amount >= 0),
  constraint accounts_receivable_balance_check check (balance >= 0)
);

create index if not exists accounts_receivable_customer_id_idx on public.accounts_receivable (customer_id);
create index if not exists accounts_receivable_status_idx on public.accounts_receivable (status);

drop trigger if exists set_accounts_receivable_updated_at on public.accounts_receivable;

create trigger set_accounts_receivable_updated_at
before update on public.accounts_receivable
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.accounts_receivable enable row level security;

drop policy if exists "Allowed roles can view customers" on public.customers;
create policy "Allowed roles can view customers"
on public.customers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas', 'inventario', 'finanzas')
  )
);

drop policy if exists "Sales roles can insert customers" on public.customers;
create policy "Sales roles can insert customers"
on public.customers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas')
  )
);

drop policy if exists "Sales roles can update customers" on public.customers;
create policy "Sales roles can update customers"
on public.customers
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas')
  )
);

drop policy if exists "Allowed roles can view sales" on public.sales;
create policy "Allowed roles can view sales"
on public.sales
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas', 'inventario', 'finanzas')
  )
);

drop policy if exists "Sales roles can insert sales" on public.sales;
create policy "Sales roles can insert sales"
on public.sales
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas')
  )
);

drop policy if exists "Sales roles can update sales" on public.sales;
create policy "Sales roles can update sales"
on public.sales
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas')
  )
);

drop policy if exists "Allowed roles can view sale items" on public.sale_items;
create policy "Allowed roles can view sale items"
on public.sale_items
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas', 'inventario', 'finanzas')
  )
);

drop policy if exists "Sales roles can insert sale items" on public.sale_items;
create policy "Sales roles can insert sale items"
on public.sale_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas')
  )
);

drop policy if exists "Allowed roles can view accounts receivable" on public.accounts_receivable;
create policy "Allowed roles can view accounts receivable"
on public.accounts_receivable
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas', 'finanzas')
  )
);

drop policy if exists "Sales roles can insert accounts receivable" on public.accounts_receivable;
create policy "Sales roles can insert accounts receivable"
on public.accounts_receivable
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'ventas')
  )
);

create or replace function public.create_sale_draft(
  p_customer_id uuid,
  p_sale_date date,
  p_payment_type text,
  p_discount numeric,
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
  v_sale_id uuid;
  v_subtotal numeric(14, 2) := 0;
  v_discount numeric(14, 2) := coalesce(p_discount, 0);
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14, 2);
  v_unit_price numeric(14, 2);
  v_item_subtotal numeric(14, 2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para crear ventas.';
  end if;

  if p_payment_type not in ('contado', 'transferencia', 'qr', 'credito') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if v_discount < 0 then
    raise exception 'El descuento no puede ser negativo.';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id and is_active = true) then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un item a la venta.';
  end if;

  insert into public.sales (
    customer_id,
    sale_date,
    subtotal,
    discount,
    total,
    payment_type,
    status,
    notes,
    created_by
  )
  values (
    p_customer_id,
    p_sale_date,
    0,
    v_discount,
    0,
    p_payment_type,
    'borrador',
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_price := (v_item ->> 'unit_price')::numeric;

    if v_quantity <= 0 then
      raise exception 'La cantidad de un item debe ser mayor a cero.';
    end if;

    if v_unit_price < 0 then
      raise exception 'El precio unitario no puede ser negativo.';
    end if;

    if not exists (select 1 from public.products where id = v_product_id and is_active = true) then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_item_subtotal := round(v_quantity * v_unit_price, 2);
    v_subtotal := v_subtotal + v_item_subtotal;

    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      subtotal
    )
    values (
      v_sale_id,
      v_product_id,
      v_quantity,
      v_unit_price,
      v_item_subtotal
    );
  end loop;

  if v_discount > v_subtotal then
    raise exception 'El descuento no puede superar el subtotal.';
  end if;

  update public.sales
  set subtotal = v_subtotal,
      discount = v_discount,
      total = v_subtotal - v_discount
  where id = v_sale_id;

  return v_sale_id;
end;
$$;

create or replace function public.confirm_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_sale record;
  v_customer record;
  v_item record;
  v_stock_before numeric(14, 2);
  v_stock_after numeric(14, 2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para confirmar ventas.';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_sale.status = 'confirmada' then
    raise exception 'La venta ya fue confirmada.';
  end if;

  if v_sale.status <> 'borrador' then
    raise exception 'Solo se pueden confirmar ventas en borrador.';
  end if;

  if not exists (select 1 from public.sale_items where sale_id = p_sale_id) then
    raise exception 'La venta no tiene items.';
  end if;

  select *
  into v_customer
  from public.customers
  where id = v_sale.customer_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  if v_sale.payment_type = 'credito' then
    if v_customer.customer_type <> 'credito' then
      raise exception 'El cliente no esta habilitado para ventas a credito.';
    end if;

    if v_customer.current_balance + v_sale.total > v_customer.credit_limit then
      raise exception 'La venta supera el limite de credito del cliente.';
    end if;
  end if;

  for v_item in
    select product_id, quantity
    from public.sale_items
    where sale_id = p_sale_id
  loop
    select stock_current
    into v_stock_before
    from public.products
    where id = v_item.product_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_stock_after := v_stock_before - v_item.quantity;

    if v_stock_after < 0 then
      raise exception 'Stock insuficiente para confirmar la venta.';
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
      v_item.product_id,
      'salida',
      v_item.quantity,
      v_stock_before,
      v_stock_after,
      'Venta confirmada',
      'Venta ' || p_sale_id::text,
      v_user_id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  if v_sale.payment_type = 'credito' then
    update public.customers
    set current_balance = current_balance + v_sale.total
    where id = v_sale.customer_id;

    insert into public.accounts_receivable (
      sale_id,
      customer_id,
      amount,
      balance,
      status
    )
    values (
      p_sale_id,
      v_sale.customer_id,
      v_sale.total,
      v_sale.total,
      'pendiente'
    );
  end if;

  update public.sales
  set status = 'confirmada'
  where id = p_sale_id;
end;
$$;

create or replace function public.cancel_sale_draft(p_sale_id uuid)
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

  if v_user_role is null or v_user_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para anular ventas.';
  end if;

  select status into v_status
  from public.sales
  where id = p_sale_id
  for update;

  if v_status is null then
    raise exception 'Venta no encontrada.';
  end if;

  if v_status <> 'borrador' then
    raise exception 'Solo se pueden anular ventas en borrador.';
  end if;

  update public.sales
  set status = 'anulada'
  where id = p_sale_id;
end;
$$;

revoke all on function public.create_sale_draft(uuid, date, text, numeric, text, jsonb) from public;
grant execute on function public.create_sale_draft(uuid, date, text, numeric, text, jsonb) to authenticated;

revoke all on function public.confirm_sale(uuid) from public;
grant execute on function public.confirm_sale(uuid) to authenticated;

revoke all on function public.cancel_sale_draft(uuid) from public;
grant execute on function public.cancel_sale_draft(uuid) to authenticated;

insert into public.customers (
  name,
  business_name,
  nit,
  phone,
  email,
  address,
  customer_type,
  credit_limit,
  current_balance,
  is_active
)
values
  ('Restaurante El Buen Sabor', 'El Buen Sabor SRL', '10203040', '700-20001', 'compras@buensabor.demo', 'Zona central demo', 'credito', 12000, 0, true),
  ('Pollos Don Raul', 'Don Raul Gastronomia', '20406080', '700-20002', 'pedidos@donraul.demo', 'Av. Comercial demo', 'contado', 0, 0, true),
  ('Hotel Valle Verde', 'Valle Verde Hoteles', '30102030', '700-20003', 'abastecimiento@valleverde.demo', 'Zona hotelera demo', 'credito', 25000, 0, true),
  ('Mercado Express Norte', 'Mercado Express Norte', '40908070', '700-20004', null, 'Sucursal norte demo', 'contado', 0, 0, true)
on conflict (name) do update
set
  business_name = excluded.business_name,
  nit = excluded.nit,
  phone = excluded.phone,
  email = excluded.email,
  address = excluded.address,
  customer_type = excluded.customer_type,
  credit_limit = excluded.credit_limit,
  is_active = excluded.is_active;

alter table public.accounts_receivable
add column if not exists paid_amount numeric(14, 2) not null default 0,
add column if not exists due_date date,
add column if not exists notes text;

alter table public.accounts_receivable
drop constraint if exists accounts_receivable_status_check;

alter table public.accounts_receivable
add constraint accounts_receivable_status_check
check (status in ('pendiente', 'parcial', 'pagada', 'vencida'));

alter table public.accounts_receivable
drop constraint if exists accounts_receivable_amount_check;

alter table public.accounts_receivable
add constraint accounts_receivable_amount_check check (amount >= 0);

alter table public.accounts_receivable
drop constraint if exists accounts_receivable_balance_check;

alter table public.accounts_receivable
add constraint accounts_receivable_balance_check check (balance >= 0);

alter table public.accounts_receivable
drop constraint if exists accounts_receivable_paid_amount_check;

alter table public.accounts_receivable
add constraint accounts_receivable_paid_amount_check check (paid_amount >= 0);

update public.accounts_receivable
set paid_amount = greatest(amount - balance, 0)
where paid_amount = 0;

create index if not exists accounts_receivable_due_date_idx on public.accounts_receivable (due_date);

create table if not exists public.accounts_payable (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers (id) on delete restrict,
  purchase_id uuid references public.purchases (id) on delete restrict,
  amount numeric(14, 2) not null,
  paid_amount numeric(14, 2) not null default 0,
  balance numeric(14, 2) not null,
  due_date date,
  status text not null default 'pendiente',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint accounts_payable_purchase_unique unique (purchase_id),
  constraint accounts_payable_status_check check (status in ('pendiente', 'parcial', 'pagada', 'vencida')),
  constraint accounts_payable_amount_check check (amount >= 0),
  constraint accounts_payable_paid_amount_check check (paid_amount >= 0),
  constraint accounts_payable_balance_check check (balance >= 0)
);

create index if not exists accounts_payable_supplier_id_idx on public.accounts_payable (supplier_id);
create index if not exists accounts_payable_status_idx on public.accounts_payable (status);
create index if not exists accounts_payable_due_date_idx on public.accounts_payable (due_date);

drop trigger if exists set_accounts_payable_updated_at on public.accounts_payable;

create trigger set_accounts_payable_updated_at
before update on public.accounts_payable
for each row
execute function public.set_current_timestamp_updated_at();

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_type text not null,
  customer_id uuid references public.customers (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  sale_id uuid references public.sales (id) on delete set null,
  purchase_id uuid references public.purchases (id) on delete set null,
  accounts_receivable_id uuid references public.accounts_receivable (id) on delete set null,
  accounts_payable_id uuid references public.accounts_payable (id) on delete set null,
  amount numeric(14, 2) not null,
  payment_method text not null,
  payment_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint payments_type_check check (payment_type in ('cobro_cliente', 'pago_proveedor', 'ingreso_manual', 'gasto_manual')),
  constraint payments_method_check check (payment_method in ('efectivo', 'transferencia', 'qr', 'tarjeta', 'otro')),
  constraint payments_amount_check check (amount > 0)
);

create index if not exists payments_payment_type_idx on public.payments (payment_type);
create index if not exists payments_payment_date_idx on public.payments (payment_date desc);
create index if not exists payments_customer_id_idx on public.payments (customer_id);
create index if not exists payments_supplier_id_idx on public.payments (supplier_id);
create index if not exists payments_accounts_receivable_id_idx on public.payments (accounts_receivable_id);
create index if not exists payments_accounts_payable_id_idx on public.payments (accounts_payable_id);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null,
  source_type text not null,
  source_id uuid,
  amount numeric(14, 2) not null,
  payment_method text not null,
  movement_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint cash_movements_type_check check (movement_type in ('ingreso', 'egreso')),
  constraint cash_movements_source_type_check check (source_type in ('venta', 'compra', 'cobro_cliente', 'pago_proveedor', 'gasto_manual', 'ingreso_manual')),
  constraint cash_movements_method_check check (payment_method in ('efectivo', 'transferencia', 'qr', 'tarjeta', 'otro')),
  constraint cash_movements_amount_check check (amount > 0)
);

create index if not exists cash_movements_movement_type_idx on public.cash_movements (movement_type);
create index if not exists cash_movements_source_type_idx on public.cash_movements (source_type);
create index if not exists cash_movements_movement_date_idx on public.cash_movements (movement_date desc);

alter table public.accounts_payable enable row level security;
alter table public.payments enable row level security;
alter table public.cash_movements enable row level security;

drop policy if exists "Allowed roles can view accounts receivable" on public.accounts_receivable;
create policy "Allowed roles can view accounts receivable"
on public.accounts_receivable
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas', 'ventas')
  )
);

drop policy if exists "Finance roles can update accounts receivable" on public.accounts_receivable;
create policy "Finance roles can update accounts receivable"
on public.accounts_receivable
for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas')
  )
);

drop policy if exists "Finance roles can insert accounts receivable" on public.accounts_receivable;
create policy "Finance roles can insert accounts receivable"
on public.accounts_receivable
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas', 'ventas')
  )
);

drop policy if exists "Finance roles can view accounts payable" on public.accounts_payable;
create policy "Finance roles can view accounts payable"
on public.accounts_payable
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas')
  )
);

drop policy if exists "Finance roles can mutate accounts payable" on public.accounts_payable;
create policy "Finance roles can mutate accounts payable"
on public.accounts_payable
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas')
  )
);

drop policy if exists "Finance roles can view payments" on public.payments;
create policy "Finance roles can view payments"
on public.payments
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas')
  )
);

drop policy if exists "Finance roles can insert payments" on public.payments;
create policy "Finance roles can insert payments"
on public.payments
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas')
  )
);

drop policy if exists "Finance roles can view cash movements" on public.cash_movements;
create policy "Finance roles can view cash movements"
on public.cash_movements
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas')
  )
);

drop policy if exists "Finance roles can insert cash movements" on public.cash_movements;
create policy "Finance roles can insert cash movements"
on public.cash_movements
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.role in ('administrador', 'finanzas')
  )
);

create or replace function public.get_finance_status(
  p_balance numeric,
  p_amount numeric,
  p_due_date date
)
returns text
language plpgsql
stable
as $$
begin
  if p_balance <= 0 then
    return 'pagada';
  end if;

  if p_due_date is not null and p_due_date < current_date then
    return 'vencida';
  end if;

  if p_balance < p_amount then
    return 'parcial';
  end if;

  return 'pendiente';
end;
$$;

create or replace function public.assert_finance_role()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'finanzas') then
    raise exception 'No tienes permisos para gestionar finanzas.';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.register_customer_payment(
  p_accounts_receivable_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_account record;
  v_new_paid numeric(14, 2);
  v_new_balance numeric(14, 2);
  v_payment_id uuid;
begin
  v_user_id := public.assert_finance_role();

  if p_payment_method not in ('efectivo', 'transferencia', 'qr', 'tarjeta', 'otro') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  select *
  into v_account
  from public.accounts_receivable
  where id = p_accounts_receivable_id
  for update;

  if not found then
    raise exception 'Cuenta por cobrar no encontrada.';
  end if;

  if v_account.balance <= 0 then
    raise exception 'La cuenta por cobrar ya esta pagada.';
  end if;

  if p_amount > v_account.balance then
    raise exception 'El pago no puede ser mayor al saldo pendiente.';
  end if;

  v_new_paid := v_account.paid_amount + p_amount;
  v_new_balance := v_account.balance - p_amount;

  insert into public.payments (
    payment_type,
    customer_id,
    sale_id,
    accounts_receivable_id,
    amount,
    payment_method,
    payment_date,
    notes,
    created_by
  )
  values (
    'cobro_cliente',
    v_account.customer_id,
    v_account.sale_id,
    p_accounts_receivable_id,
    p_amount,
    p_payment_method,
    p_payment_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_payment_id;

  insert into public.cash_movements (
    movement_type,
    source_type,
    source_id,
    amount,
    payment_method,
    movement_date,
    notes,
    created_by
  )
  values (
    'ingreso',
    'cobro_cliente',
    v_payment_id,
    p_amount,
    p_payment_method,
    p_payment_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  );

  update public.accounts_receivable
  set paid_amount = v_new_paid,
      balance = v_new_balance,
      status = public.get_finance_status(v_new_balance, amount, due_date)
  where id = p_accounts_receivable_id;

  update public.customers
  set current_balance = greatest(current_balance - p_amount, 0)
  where id = v_account.customer_id;

  return v_payment_id;
end;
$$;

create or replace function public.register_supplier_payment(
  p_accounts_payable_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_account record;
  v_new_paid numeric(14, 2);
  v_new_balance numeric(14, 2);
  v_payment_id uuid;
begin
  v_user_id := public.assert_finance_role();

  if p_payment_method not in ('efectivo', 'transferencia', 'qr', 'tarjeta', 'otro') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  select *
  into v_account
  from public.accounts_payable
  where id = p_accounts_payable_id
  for update;

  if not found then
    raise exception 'Cuenta por pagar no encontrada.';
  end if;

  if v_account.balance <= 0 then
    raise exception 'La cuenta por pagar ya esta pagada.';
  end if;

  if p_amount > v_account.balance then
    raise exception 'El pago no puede ser mayor al saldo pendiente.';
  end if;

  v_new_paid := v_account.paid_amount + p_amount;
  v_new_balance := v_account.balance - p_amount;

  insert into public.payments (
    payment_type,
    supplier_id,
    purchase_id,
    accounts_payable_id,
    amount,
    payment_method,
    payment_date,
    notes,
    created_by
  )
  values (
    'pago_proveedor',
    v_account.supplier_id,
    v_account.purchase_id,
    p_accounts_payable_id,
    p_amount,
    p_payment_method,
    p_payment_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_payment_id;

  insert into public.cash_movements (
    movement_type,
    source_type,
    source_id,
    amount,
    payment_method,
    movement_date,
    notes,
    created_by
  )
  values (
    'egreso',
    'pago_proveedor',
    v_payment_id,
    p_amount,
    p_payment_method,
    p_payment_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  );

  update public.accounts_payable
  set paid_amount = v_new_paid,
      balance = v_new_balance,
      status = public.get_finance_status(v_new_balance, amount, due_date)
  where id = p_accounts_payable_id;

  return v_payment_id;
end;
$$;

create or replace function public.register_manual_cash_movement(
  p_source_type text,
  p_amount numeric,
  p_payment_method text,
  p_movement_date date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_payment_id uuid;
  v_movement_type text;
  v_payment_type text;
begin
  v_user_id := public.assert_finance_role();

  if p_source_type not in ('ingreso_manual', 'gasto_manual') then
    raise exception 'Tipo de movimiento manual invalido.';
  end if;

  if p_payment_method not in ('efectivo', 'transferencia', 'qr', 'tarjeta', 'otro') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  v_movement_type := case when p_source_type = 'ingreso_manual' then 'ingreso' else 'egreso' end;
  v_payment_type := case when p_source_type = 'ingreso_manual' then 'ingreso_manual' else 'gasto_manual' end;

  insert into public.payments (
    payment_type,
    amount,
    payment_method,
    payment_date,
    notes,
    created_by
  )
  values (
    v_payment_type,
    p_amount,
    p_payment_method,
    p_movement_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_payment_id;

  insert into public.cash_movements (
    movement_type,
    source_type,
    source_id,
    amount,
    payment_method,
    movement_date,
    notes,
    created_by
  )
  values (
    v_movement_type,
    p_source_type,
    v_payment_id,
    p_amount,
    p_payment_method,
    p_movement_date,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  );

  return v_payment_id;
end;
$$;

create or replace function public.confirm_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_sale record;
  v_customer record;
  v_item record;
  v_stock_before numeric(14, 2);
  v_stock_after numeric(14, 2);
  v_payment_method text;
  v_payment_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role is null or v_user_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para confirmar ventas.';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_sale.status = 'confirmada' then
    raise exception 'La venta ya fue confirmada.';
  end if;

  if v_sale.status <> 'borrador' then
    raise exception 'Solo se pueden confirmar ventas en borrador.';
  end if;

  if not exists (select 1 from public.sale_items where sale_id = p_sale_id) then
    raise exception 'La venta no tiene items.';
  end if;

  select *
  into v_customer
  from public.customers
  where id = v_sale.customer_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  if v_sale.payment_type = 'credito' then
    if v_customer.customer_type <> 'credito' then
      raise exception 'El cliente no esta habilitado para ventas a credito.';
    end if;

    if v_customer.current_balance + v_sale.total > v_customer.credit_limit then
      raise exception 'La venta supera el limite de credito del cliente.';
    end if;
  end if;

  for v_item in
    select product_id, quantity
    from public.sale_items
    where sale_id = p_sale_id
  loop
    select stock_current
    into v_stock_before
    from public.products
    where id = v_item.product_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_stock_after := v_stock_before - v_item.quantity;

    if v_stock_after < 0 then
      raise exception 'Stock insuficiente para confirmar la venta.';
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
      v_item.product_id,
      'salida',
      v_item.quantity,
      v_stock_before,
      v_stock_after,
      'Venta confirmada',
      'Venta ' || p_sale_id::text,
      v_user_id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  if v_sale.payment_type = 'credito' then
    update public.customers
    set current_balance = current_balance + v_sale.total
    where id = v_sale.customer_id;

    insert into public.accounts_receivable (
      sale_id,
      customer_id,
      amount,
      paid_amount,
      balance,
      due_date,
      status,
      notes
    )
    values (
      p_sale_id,
      v_sale.customer_id,
      v_sale.total,
      0,
      v_sale.total,
      v_sale.sale_date + 15,
      public.get_finance_status(v_sale.total, v_sale.total, v_sale.sale_date + 15),
      'Venta a credito'
    );
  else
    v_payment_method := case
      when v_sale.payment_type = 'contado' then 'efectivo'
      when v_sale.payment_type in ('transferencia', 'qr') then v_sale.payment_type
      else 'otro'
    end;

    insert into public.payments (
      payment_type,
      customer_id,
      sale_id,
      amount,
      payment_method,
      payment_date,
      notes,
      created_by
    )
    values (
      'cobro_cliente',
      v_sale.customer_id,
      p_sale_id,
      v_sale.total,
      v_payment_method,
      v_sale.sale_date,
      'Venta de contado confirmada',
      v_user_id
    )
    returning id into v_payment_id;

    insert into public.cash_movements (
      movement_type,
      source_type,
      source_id,
      amount,
      payment_method,
      movement_date,
      notes,
      created_by
    )
    values (
      'ingreso',
      'venta',
      v_payment_id,
      v_sale.total,
      v_payment_method,
      v_sale.sale_date,
      'Venta confirmada',
      v_user_id
    );
  end if;

  update public.sales
  set status = 'confirmada'
  where id = p_sale_id;
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
  v_payment_method text;
  v_payment_id uuid;
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

  if not found then
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

  if v_purchase.payment_status = 'pagada' then
    v_payment_method := case
      when v_purchase.payment_method in ('efectivo', 'transferencia', 'qr') then v_purchase.payment_method
      else 'otro'
    end;

    insert into public.payments (
      payment_type,
      supplier_id,
      purchase_id,
      amount,
      payment_method,
      payment_date,
      notes,
      created_by
    )
    values (
      'pago_proveedor',
      v_purchase.supplier_id,
      p_purchase_id,
      v_purchase.total,
      v_payment_method,
      v_purchase.purchase_date,
      'Compra pagada al confirmar',
      v_user_id
    )
    returning id into v_payment_id;

    insert into public.cash_movements (
      movement_type,
      source_type,
      source_id,
      amount,
      payment_method,
      movement_date,
      notes,
      created_by
    )
    values (
      'egreso',
      'compra',
      v_payment_id,
      v_purchase.total,
      v_payment_method,
      v_purchase.purchase_date,
      'Compra confirmada pagada',
      v_user_id
    );
  else
    insert into public.accounts_payable (
      supplier_id,
      purchase_id,
      amount,
      paid_amount,
      balance,
      due_date,
      status,
      notes
    )
    values (
      v_purchase.supplier_id,
      p_purchase_id,
      v_purchase.total,
      0,
      v_purchase.total,
      v_purchase.purchase_date + 15,
      public.get_finance_status(v_purchase.total, v_purchase.total, v_purchase.purchase_date + 15),
      'Compra pendiente o parcial'
    )
    on conflict (purchase_id) do nothing;
  end if;

  update public.purchases
  set status = 'confirmada'
  where id = p_purchase_id;
end;
$$;

revoke all on function public.assert_finance_role() from public;
grant execute on function public.assert_finance_role() to authenticated;

revoke all on function public.register_customer_payment(uuid, numeric, text, date, text) from public;
grant execute on function public.register_customer_payment(uuid, numeric, text, date, text) to authenticated;

revoke all on function public.register_supplier_payment(uuid, numeric, text, date, text) from public;
grant execute on function public.register_supplier_payment(uuid, numeric, text, date, text) to authenticated;

revoke all on function public.register_manual_cash_movement(text, numeric, text, date, text) from public;
grant execute on function public.register_manual_cash_movement(text, numeric, text, date, text) to authenticated;
