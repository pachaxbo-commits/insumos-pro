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
  -- Nunca asignar perfiles o roles internos automaticamente desde Auth.
  -- Fase 15E reemplaza esta funcion para crear solo customer_accounts sin privilegios.
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
-- Fase 12A: los usuarios autenticados no pueden actualizar su perfil desde cliente.
-- Cambios de rol, activacion o datos administrativos deben hacerse con RPC/admin seguro.

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
  stock_current numeric(14, 3) not null default 0,
  stock_min numeric(14, 3) not null default 0,
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

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  movement_type text not null,
  quantity numeric(14, 3) not null,
  stock_before numeric(14, 3) not null,
  stock_after numeric(14, 3) not null,
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
-- Fase 12A: no se permiten inserts directos desde cliente.
-- Usar public.register_inventory_movement(...) o RPCs de compras/ventas.

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
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_quantity numeric(14, 3);
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
  quantity numeric(14, 3) not null,
  unit_cost numeric(14, 4) not null,
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
-- Fase 12A: no se permiten inserts directos de compras.
-- Usar public.create_purchase_draft(...).

drop policy if exists "Inventory roles can update purchases" on public.purchases;
-- Fase 12A: no se permiten updates directos de compras.
-- Usar public.confirm_purchase(...) o public.cancel_purchase_draft(...).

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
-- Fase 12A: no se permiten inserts directos de items de compra.
-- Usar public.create_purchase_draft(...).

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
  v_quantity numeric(14, 3);
  v_unit_cost numeric(14, 4);
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
  quantity numeric(14, 3) not null,
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
-- Fase 12A: no se permiten inserts directos de ventas.
-- Usar public.create_sale_draft(...).

drop policy if exists "Sales roles can update sales" on public.sales;
-- Fase 12A: no se permiten updates directos de ventas.
-- Usar public.confirm_sale(...) o public.cancel_sale_draft(...).

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
-- Fase 12A: no se permiten inserts directos de items de venta.
-- Usar public.create_sale_draft(...).

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
-- Fase 12A: no se permiten inserts directos de CxC desde cliente.
-- La CxC se crea al confirmar venta a credito o mediante migracion controlada.

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
  v_quantity numeric(14, 3);
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
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
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
-- Fase 12A: no se permiten updates directos de CxC.
-- Usar public.register_customer_payment(...).

drop policy if exists "Finance roles can insert accounts receivable" on public.accounts_receivable;
-- Fase 12A: no se permiten inserts directos de CxC desde cliente.
-- La CxC se crea al confirmar venta a credito o mediante migracion controlada.

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
-- Fase 12A: no se permiten mutaciones directas de CxP.
-- La CxP se crea al confirmar compra pendiente/parcial y se paga por RPC.

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
-- Fase 12A: no se permiten inserts directos de pagos.
-- Usar RPCs financieras validadas.

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
-- Fase 12A: no se permiten inserts directos de caja.
-- Usar RPCs financieras validadas o confirmaciones de venta/compra.

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
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
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

-- Fase 8: indices de apoyo para reportes y exportaciones.
-- No crean tablas nuevas; optimizan filtros por fecha, estado, metodo y relaciones frecuentes.
create index if not exists sales_status_sale_date_idx
on public.sales (status, sale_date desc);

create index if not exists sales_payment_type_sale_date_idx
on public.sales (payment_type, sale_date desc);

create index if not exists sale_items_sale_id_idx
on public.sale_items (sale_id);

create index if not exists sale_items_product_id_idx
on public.sale_items (product_id);

create index if not exists purchases_status_purchase_date_idx
on public.purchases (status, purchase_date desc);

create index if not exists purchases_payment_method_purchase_date_idx
on public.purchases (payment_method, purchase_date desc);

create index if not exists purchase_items_purchase_id_idx
on public.purchase_items (purchase_id);

create index if not exists purchase_items_product_id_idx
on public.purchase_items (product_id);

create index if not exists inventory_movements_type_created_at_idx
on public.inventory_movements (movement_type, created_at desc);

create index if not exists payments_method_date_idx
on public.payments (payment_method, payment_date desc);

create index if not exists cash_movements_method_date_idx
on public.cash_movements (payment_method, movement_date desc);

-- Fase 10: auditoria, bitacora y seguridad operativa.
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
  limit 1
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.admin_update_profile(
  p_profile_id uuid,
  p_full_name text,
  p_role text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_target_role text;
  v_target_is_active boolean;
  v_other_active_admins integer;
begin
  v_actor_id := auth.uid();
  v_actor_role := public.current_user_role();

  if v_actor_role <> 'administrador' then
    raise exception 'Solo un administrador puede modificar perfiles.';
  end if;

  if p_profile_id is null then
    raise exception 'Perfil invalido.';
  end if;

  if p_role not in ('administrador', 'ventas', 'inventario', 'finanzas') then
    raise exception 'Rol invalido.';
  end if;

  select role, is_active
  into v_target_role, v_target_is_active
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'Perfil no encontrado.';
  end if;

  if p_profile_id = v_actor_id and p_role <> v_target_role then
    raise exception 'No puedes cambiar tu propio rol.';
  end if;

  if p_profile_id = v_actor_id and coalesce(p_is_active, false) = false then
    raise exception 'No puedes desactivar tu propio usuario.';
  end if;

  if v_target_role = 'administrador'
    and v_target_is_active = true
    and (p_role <> 'administrador' or coalesce(p_is_active, false) = false)
  then
    select count(*)
    into v_other_active_admins
    from public.profiles
    where role = 'administrador'
      and is_active = true
      and id <> p_profile_id;

    if coalesce(v_other_active_admins, 0) < 1 then
      raise exception 'No se puede dejar el sistema sin al menos un administrador activo.';
    end if;
  end if;

  update public.profiles
  set full_name = nullif(trim(coalesce(p_full_name, '')), ''),
      role = p_role,
      is_active = coalesce(p_is_active, false)
  where id = p_profile_id;
end;
$$;

revoke all on function public.admin_update_profile(uuid, text, text, boolean) from public;
grant execute on function public.admin_update_profile(uuid, text, text, boolean) to authenticated;

drop policy if exists "Admins can view profiles" on public.profiles;
create policy "Admins can view profiles"
on public.profiles
for select
to authenticated
using (public.current_user_role() = 'administrador');

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_user_id_idx
on public.audit_logs (user_id);

create index if not exists audit_logs_action_idx
on public.audit_logs (action);

create index if not exists audit_logs_entity_type_idx
on public.audit_logs (entity_type);

create index if not exists audit_logs_entity_id_idx
on public.audit_logs (entity_id);

create index if not exists audit_logs_created_at_idx
on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "Admins can view audit logs" on public.audit_logs;
create policy "Admins can view audit logs"
on public.audit_logs
for select
to authenticated
using (public.current_user_role() = 'administrador');

drop policy if exists "Authenticated users can insert own audit logs" on public.audit_logs;
revoke insert, update, delete on table public.audit_logs from anon, authenticated;

-- Fase 12D: anulacion contable segura de ventas y compras confirmadas.
alter table public.sales
add column if not exists canceled_reason text,
add column if not exists canceled_by uuid references public.profiles (id) on delete set null,
add column if not exists canceled_at timestamptz,
add column if not exists reversal_status text not null default 'none';

alter table public.purchases
add column if not exists canceled_reason text,
add column if not exists canceled_by uuid references public.profiles (id) on delete set null,
add column if not exists canceled_at timestamptz,
add column if not exists reversal_status text not null default 'none';

alter table public.sales
drop constraint if exists sales_reversal_status_check;

alter table public.sales
add constraint sales_reversal_status_check
check (reversal_status in ('none', 'reversed', 'blocked'));

alter table public.purchases
drop constraint if exists purchases_reversal_status_check;

alter table public.purchases
add constraint purchases_reversal_status_check
check (reversal_status in ('none', 'reversed', 'blocked'));

alter table public.accounts_receivable
drop constraint if exists accounts_receivable_status_check;

alter table public.accounts_receivable
add constraint accounts_receivable_status_check
check (status in ('pendiente', 'parcial', 'pagada', 'vencida', 'anulada'));

alter table public.accounts_payable
drop constraint if exists accounts_payable_status_check;

alter table public.accounts_payable
add constraint accounts_payable_status_check
check (status in ('pendiente', 'parcial', 'pagada', 'vencida', 'anulada'));

create index if not exists sales_reversal_status_idx on public.sales (reversal_status);
create index if not exists purchases_reversal_status_idx on public.purchases (reversal_status);
create index if not exists inventory_movements_product_created_at_idx on public.inventory_movements (product_id, created_at desc);
create index if not exists payments_sale_id_idx on public.payments (sale_id);
create index if not exists payments_purchase_id_idx on public.payments (purchase_id);
create index if not exists cash_movements_source_id_idx on public.cash_movements (source_id);

create or replace function public.assert_admin_role()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role <> 'administrador' then
    raise exception 'Solo un administrador puede anular operaciones confirmadas.';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.cancel_confirmed_sale(
  p_sale_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_sale record;
  v_item record;
  v_account record;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_payment_count integer;
  v_payment_method text;
  v_now timestamptz;
begin
  v_user_id := public.assert_admin_role();
  v_now := timezone('utc', now());

  if p_sale_id is null then
    raise exception 'Venta invalida.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'El motivo de anulacion debe tener al menos 10 caracteres.';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_sale.reversal_status = 'reversed' or v_sale.status = 'anulada' then
    raise exception 'La venta ya fue anulada y no puede revertirse nuevamente.';
  end if;

  if v_sale.status <> 'confirmada' then
    raise exception 'Solo se pueden anular ventas confirmadas.';
  end if;

  if not exists (select 1 from public.sale_items where sale_id = p_sale_id) then
    raise exception 'La venta no tiene items para revertir.';
  end if;

  if v_sale.payment_type = 'credito' then
    select *
    into v_account
    from public.accounts_receivable
    where sale_id = p_sale_id
    for update;

    if not found then
      raise exception 'No se encontro la cuenta por cobrar de la venta a credito.';
    end if;

    select count(*)
    into v_payment_count
    from public.payments
    where accounts_receivable_id = v_account.id
       or sale_id = p_sale_id;

    if coalesce(v_account.paid_amount, 0) > 0 or v_payment_count > 0 then
      raise exception 'La venta tiene pagos aplicados. Reversa o regulariza esos pagos antes de anular automaticamente.';
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
    for update;

    if not found then
      raise exception 'Producto no encontrado al revertir stock de venta.';
    end if;

    v_stock_after := v_stock_before + v_item.quantity;

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
      'devolucion',
      v_item.quantity,
      v_stock_before,
      v_stock_after,
      'Anulacion de venta confirmada',
      'Anulacion venta ' || p_sale_id::text || '. Motivo: ' || trim(p_reason),
      v_user_id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  if v_sale.payment_type = 'credito' then
    update public.customers
    set current_balance = greatest(current_balance - v_account.balance, 0)
    where id = v_sale.customer_id;

    update public.accounts_receivable
    set balance = 0,
        paid_amount = 0,
        status = 'anulada',
        notes = concat_ws(' | ', nullif(notes, ''), 'Anulada por venta ' || p_sale_id::text || ': ' || trim(p_reason))
    where id = v_account.id;
  else
    v_payment_method := case
      when v_sale.payment_type = 'contado' then 'efectivo'
      when v_sale.payment_type in ('transferencia', 'qr') then v_sale.payment_type
      else 'otro'
    end;

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
      'venta',
      p_sale_id,
      v_sale.total,
      v_payment_method,
      current_date,
      'Reversion de caja por anulacion de venta. Motivo: ' || trim(p_reason),
      v_user_id
    );
  end if;

  update public.sales
  set status = 'anulada',
      reversal_status = 'reversed',
      canceled_reason = trim(p_reason),
      canceled_by = v_user_id,
      canceled_at = v_now
  where id = p_sale_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'cancel_confirmed_sale',
    'sale',
    p_sale_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'total', v_sale.total,
      'payment_type', v_sale.payment_type,
      'reversal_status', 'reversed'
    )
  );
end;
$$;

create or replace function public.cancel_confirmed_purchase(
  p_purchase_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_purchase record;
  v_item record;
  v_account record;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_entry_created_at timestamptz;
  v_payment_count integer;
  v_now timestamptz;
  v_has_account boolean := false;
begin
  v_user_id := public.assert_admin_role();
  v_now := timezone('utc', now());

  if p_purchase_id is null then
    raise exception 'Compra invalida.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'El motivo de anulacion debe tener al menos 10 caracteres.';
  end if;

  select *
  into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'Compra no encontrada.';
  end if;

  if v_purchase.reversal_status = 'reversed' or v_purchase.status = 'cancelada' then
    raise exception 'La compra ya fue anulada y no puede revertirse nuevamente.';
  end if;

  if v_purchase.status <> 'confirmada' then
    raise exception 'Solo se pueden anular compras confirmadas.';
  end if;

  if v_purchase.payment_status in ('pagada', 'parcial') then
    raise exception 'La compra tiene estado de pago aplicado. Regulariza o reversa pagos antes de anular automaticamente.';
  end if;

  select count(*)
  into v_payment_count
  from public.payments
  where purchase_id = p_purchase_id;

  if v_payment_count > 0 then
    raise exception 'La compra tiene pagos registrados. Reversa o regulariza esos pagos antes de anular automaticamente.';
  end if;

  select *
  into v_account
  from public.accounts_payable
  where purchase_id = p_purchase_id
  for update;

  if found then
    v_has_account := true;

    if coalesce(v_account.paid_amount, 0) > 0 then
      raise exception 'La cuenta por pagar tiene pagos aplicados. Regulariza esos pagos antes de anular automaticamente.';
    end if;
  end if;

  for v_item in
    select product_id, quantity
    from public.purchase_items
    where purchase_id = p_purchase_id
  loop
    select max(created_at)
    into v_entry_created_at
    from public.inventory_movements
    where product_id = v_item.product_id
      and movement_type = 'entrada'
      and reason = 'Compra confirmada'
      and notes = 'Compra ' || p_purchase_id::text;

    if v_entry_created_at is null then
      raise exception 'No se encontro el movimiento original de inventario para esta compra.';
    end if;

    if exists (
      select 1
      from public.inventory_movements
      where product_id = v_item.product_id
        and created_at > v_entry_created_at
        and not (
          reason = 'Compra confirmada'
          and notes = 'Compra ' || p_purchase_id::text
        )
    ) then
      raise exception 'Existen movimientos posteriores sobre productos de esta compra. Requiere devolucion o ajuste controlado antes de anular.';
    end if;

    select stock_current
    into v_stock_before
    from public.products
    where id = v_item.product_id
    for update;

    if not found then
      raise exception 'Producto no encontrado al revertir stock de compra.';
    end if;

    if v_stock_before < v_item.quantity then
      raise exception 'Stock insuficiente para revertir la compra sin dejar inventario negativo.';
    end if;

    v_stock_after := v_stock_before - v_item.quantity;

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
      'Anulacion de compra confirmada',
      'Anulacion compra ' || p_purchase_id::text || '. Motivo: ' || trim(p_reason),
      v_user_id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  if v_has_account then
    update public.accounts_payable
    set balance = 0,
        paid_amount = 0,
        status = 'anulada',
        notes = concat_ws(' | ', nullif(notes, ''), 'Anulada por compra ' || p_purchase_id::text || ': ' || trim(p_reason))
    where id = v_account.id;
  end if;

  update public.purchases
  set status = 'cancelada',
      reversal_status = 'reversed',
      canceled_reason = trim(p_reason),
      canceled_by = v_user_id,
      canceled_at = v_now
  where id = p_purchase_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'cancel_confirmed_purchase',
    'purchase',
    p_purchase_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'total', v_purchase.total,
      'payment_status', v_purchase.payment_status,
      'reversal_status', 'reversed'
    )
  );
end;
$$;

revoke all on function public.assert_admin_role() from public;
grant execute on function public.assert_admin_role() to authenticated;

revoke all on function public.cancel_confirmed_sale(uuid, text) from public;
grant execute on function public.cancel_confirmed_sale(uuid, text) to authenticated;

revoke all on function public.cancel_confirmed_purchase(uuid, text) from public;
grant execute on function public.cancel_confirmed_purchase(uuid, text) to authenticated;


-- Fase 13 - Pedidos moviles, preparacion con cantidad real y venta confirmada
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- No ejecutar en produccion sin backup y validacion.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  order_date date not null default current_date,
  requested_delivery_date date,
  status text not null default 'recibido',
  payment_type text not null default 'contado',
  estimated_total numeric(14, 2) not null default 0,
  final_total numeric(14, 2) not null default 0,
  notes text,
  sale_id uuid unique references public.sales (id) on delete set null,
  prepared_by uuid references public.profiles (id) on delete set null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  prepared_at timestamptz,
  confirmed_at timestamptz,
  constraint orders_status_check check (
    status in (
      'recibido',
      'en_preparacion',
      'preparado_completo',
      'preparado_incompleto',
      'confirmado',
      'entregado',
      'cancelado'
    )
  ),
  constraint orders_payment_type_check check (payment_type in ('contado', 'transferencia', 'qr', 'credito')),
  constraint orders_estimated_total_check check (estimated_total >= 0),
  constraint orders_final_total_check check (final_total >= 0)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text,
  unit_name text,
  unit_abbreviation text,
  requested_quantity numeric(14, 3) not null,
  actual_quantity numeric(14, 3) not null default 0,
  unit_price numeric(14, 2) not null,
  estimated_subtotal numeric(14, 2) not null default 0,
  final_subtotal numeric(14, 2) not null default 0,
  status text not null default 'pendiente',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_items_status_check check (status in ('pendiente', 'preparado', 'parcial', 'sin_stock', 'cancelado')),
  constraint order_items_requested_quantity_check check (requested_quantity > 0),
  constraint order_items_actual_quantity_check check (actual_quantity >= 0),
  constraint order_items_unit_price_check check (unit_price >= 0),
  constraint order_items_estimated_subtotal_check check (estimated_subtotal >= 0),
  constraint order_items_final_subtotal_check check (final_subtotal >= 0)
);

create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_order_date_idx on public.orders (order_date desc);
create index if not exists orders_created_by_idx on public.orders (created_by);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists order_items_status_idx on public.order_items (status);

alter table public.order_items add column if not exists product_name text;
alter table public.order_items add column if not exists unit_name text;
alter table public.order_items add column if not exists unit_abbreviation text;

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at
before update on public.order_items
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Sales roles can view orders" on public.orders;
create policy "Sales roles can view orders"
on public.orders
for select
to authenticated
using (public.current_user_role() in ('administrador', 'ventas'));

drop policy if exists "Sales roles can view order items" on public.order_items;
create policy "Sales roles can view order items"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.current_user_role() in ('administrador', 'ventas')
  )
);

create or replace function public.recalculate_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set estimated_total = coalesce((
        select sum(estimated_subtotal)
        from public.order_items
        where order_id = p_order_id
      ), 0),
      final_total = coalesce((
        select sum(final_subtotal)
        from public.order_items
        where order_id = p_order_id
      ), 0)
  where id = p_order_id;
end;
$$;

create or replace function public.create_order(
  p_customer_id uuid,
  p_order_date date,
  p_payment_type text,
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
  v_role text;
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_requested_quantity numeric(14, 3);
  v_unit_price numeric(14, 2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para crear pedidos.';
  end if;

  if p_payment_type not in ('contado', 'transferencia', 'qr', 'credito') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener al menos un item.';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id and is_active = true) then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  insert into public.orders (
    customer_id,
    order_date,
    payment_type,
    notes,
    created_by
  )
  values (
    p_customer_id,
    coalesce(p_order_date, current_date),
    p_payment_type,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_requested_quantity := (v_item ->> 'requested_quantity')::numeric;

    if v_requested_quantity is null or v_requested_quantity <= 0 then
      raise exception 'La cantidad solicitada debe ser mayor a cero.';
    end if;

    select p.id, p.name, p.sale_price, u.name as unit_name, u.abbreviation as unit_abbreviation
    into v_product
    from public.products p
    left join public.units_of_measure u on u.id = p.unit_id
    where p.id = (v_item ->> 'product_id')::uuid
      and p.is_active = true;

    if not found then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_unit_price := coalesce(nullif((v_item ->> 'unit_price')::numeric, 0), v_product.sale_price);

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit_name,
      unit_abbreviation,
      requested_quantity,
      unit_price,
      estimated_subtotal
    )
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.unit_name,
      v_product.unit_abbreviation,
      v_requested_quantity,
      v_unit_price,
      round(v_requested_quantity * v_unit_price, 2)
    );
  end loop;

  perform public.recalculate_order_totals(v_order_id);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'create_order',
    'order',
    v_order_id,
    jsonb_build_object('customer_id', p_customer_id, 'payment_type', p_payment_type)
  );

  return v_order_id;
end;
$$;

create or replace function public.prepare_order_item(
  p_order_item_id uuid,
  p_status text,
  p_actual_quantity numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_item record;
  v_next_order_status text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para preparar pedidos.';
  end if;

  if p_status not in ('pendiente', 'preparado', 'parcial', 'sin_stock', 'cancelado') then
    raise exception 'Estado de item invalido.';
  end if;

  select oi.*, o.status as order_status
  into v_item
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
  for update;

  if not found then
    raise exception 'Item de pedido no encontrado.';
  end if;

  if v_item.order_status in ('confirmado', 'entregado', 'cancelado') then
    raise exception 'No se puede preparar un pedido cerrado.';
  end if;

  if p_status in ('preparado', 'parcial') and (p_actual_quantity is null or p_actual_quantity <= 0) then
    raise exception 'La cantidad real debe ser mayor a cero.';
  end if;

  if p_status in ('parcial', 'sin_stock') and length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'Indica un motivo cuando el item queda parcial o sin stock.';
  end if;

  if p_status in ('sin_stock', 'cancelado', 'pendiente') then
    p_actual_quantity := 0;
  end if;

  update public.order_items
  set status = p_status,
      actual_quantity = coalesce(p_actual_quantity, 0),
      final_subtotal = round(coalesce(p_actual_quantity, 0) * unit_price, 2),
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_order_item_id;

  if exists (
    select 1 from public.order_items
    where order_id = v_item.order_id
      and status = 'pendiente'
  ) then
    v_next_order_status := 'en_preparacion';
  elsif exists (
    select 1 from public.order_items
    where order_id = v_item.order_id
      and status in ('parcial', 'sin_stock', 'cancelado')
  ) then
    v_next_order_status := 'preparado_incompleto';
  else
    v_next_order_status := 'preparado_completo';
  end if;

  update public.orders
  set status = v_next_order_status,
      prepared_by = v_user_id,
      prepared_at = timezone('utc', now())
  where id = v_item.order_id;

  perform public.recalculate_order_totals(v_item.order_id);
end;
$$;

create or replace function public.confirm_prepared_order(
  p_order_id uuid,
  p_payment_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_order record;
  v_item record;
  v_sale_id uuid;
  v_subtotal numeric(14, 2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para confirmar pedidos.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if v_order.sale_id is not null or v_order.status = 'confirmado' then
    raise exception 'El pedido ya fue confirmado.';
  end if;

  if v_order.status not in ('preparado_completo', 'preparado_incompleto') then
    raise exception 'El pedido debe estar preparado antes de confirmar la venta.';
  end if;

  if exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and status = 'pendiente'
  ) then
    raise exception 'El pedido todavia tiene items pendientes.';
  end if;

  if not exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and actual_quantity > 0
      and status in ('preparado', 'parcial')
  ) then
    raise exception 'El pedido no tiene items preparados para vender.';
  end if;

  if p_payment_type not in ('contado', 'transferencia', 'qr', 'credito') then
    raise exception 'Metodo de pago invalido.';
  end if;

  select coalesce(sum(final_subtotal), 0)
  into v_subtotal
  from public.order_items
  where order_id = p_order_id
    and actual_quantity > 0
    and status in ('preparado', 'parcial');

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
    v_order.customer_id,
    current_date,
    v_subtotal,
    0,
    v_subtotal,
    p_payment_type,
    'borrador',
    concat_ws(' | ', 'Venta generada desde pedido ' || p_order_id::text, nullif(v_order.notes, '')),
    v_user_id
  )
  returning id into v_sale_id;

  for v_item in
    select *
    from public.order_items
    where order_id = p_order_id
      and actual_quantity > 0
      and status in ('preparado', 'parcial')
  loop
    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      subtotal
    )
    values (
      v_sale_id,
      v_item.product_id,
      v_item.actual_quantity,
      v_item.unit_price,
      v_item.final_subtotal
    );
  end loop;

  update public.orders
  set status = 'confirmado',
      payment_type = p_payment_type,
      sale_id = v_sale_id,
      confirmed_by = v_user_id,
      confirmed_at = timezone('utc', now())
  where id = p_order_id;

  perform public.confirm_sale(v_sale_id);
  perform public.recalculate_order_totals(p_order_id);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'confirm_sale',
    'sale',
    v_sale_id,
    jsonb_build_object('origin', 'order', 'order_id', p_order_id, 'payment_type', p_payment_type, 'total', v_subtotal)
  );

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'confirm_order',
    'order',
    p_order_id,
    jsonb_build_object('sale_id', v_sale_id, 'payment_type', p_payment_type, 'final_total', v_subtotal)
  );

  return v_sale_id;
end;
$$;

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_order record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para cancelar pedidos.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Indica un motivo de cancelacion.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if v_order.status in ('confirmado', 'entregado') then
    raise exception 'No se puede cancelar un pedido ya confirmado o entregado.';
  end if;

  update public.orders
  set status = 'cancelado',
      notes = concat_ws(' | ', nullif(notes, ''), 'Cancelado: ' || trim(p_reason))
  where id = p_order_id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'cancel_order',
    'order',
    p_order_id,
    jsonb_build_object('reason', trim(p_reason))
  );
end;
$$;

revoke all on function public.recalculate_order_totals(uuid) from public;
revoke all on function public.create_order(uuid, date, text, text, jsonb) from public;
revoke all on function public.prepare_order_item(uuid, text, numeric, text) from public;
revoke all on function public.confirm_prepared_order(uuid, text) from public;
revoke all on function public.cancel_order(uuid, text) from public;

grant execute on function public.create_order(uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.prepare_order_item(uuid, text, numeric, text) to authenticated;
grant execute on function public.confirm_prepared_order(uuid, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;


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
  line_revision integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_batch_lines_quantity_check check (quantity > 0),
  constraint purchase_batch_lines_unit_cost_check check (unit_cost >= 0),
  constraint purchase_batch_lines_line_revision_check check (line_revision > 0),
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


-- =====================================================
-- Fase 14C - Confirmacion segura de compras multiples
-- =====================================================


-- Fase 14C - Confirmacion segura de compras multiples
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- No ejecutar en produccion sin backup y validacion.

alter table public.purchases
add column if not exists purchase_batch_id uuid references public.purchase_batches (id) on delete set null;

alter table public.purchase_batches
add column if not exists confirmed_by uuid references public.profiles (id) on delete set null;

alter table public.purchase_batches
add column if not exists confirmed_at timestamptz;

alter table public.purchase_batches
add column if not exists child_purchase_ids uuid[] not null default '{}'::uuid[];

alter table public.purchase_batches
add column if not exists confirmation_summary jsonb not null default '{}'::jsonb;

create index if not exists purchases_purchase_batch_id_idx on public.purchases (purchase_batch_id);

drop function if exists public.confirm_purchase_batch(uuid);

create or replace function public.confirm_purchase_batch(p_batch_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_batch record;
  v_group record;
  v_line record;
  v_purchase_id uuid;
  v_child_purchase_ids uuid[] := '{}';
  v_payment_status text;
  v_purchase_total numeric(14, 2);
  v_summary jsonb;
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

  if v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para confirmar compras multiples.';
  end if;

  select *
  into v_batch
  from public.purchase_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Compra multiple no encontrada.';
  end if;

  if v_batch.status = 'confirmada' then
    raise exception 'La compra multiple ya fue confirmada.';
  end if;

  if v_batch.status <> 'borrador' then
    raise exception 'Solo se pueden confirmar compras multiples en borrador.';
  end if;

  if not exists (select 1 from public.purchase_batch_lines where batch_id = p_batch_id) then
    raise exception 'La compra multiple debe tener al menos una linea.';
  end if;

  if exists (
    select 1
    from public.purchase_batch_lines
    where batch_id = p_batch_id
      and requires_classification = true
  ) then
    raise exception 'Este producto requiere clasificacion de ingreso antes de confirmar.';
  end if;

  if exists (
    select 1
    from public.purchase_batch_lines
    where batch_id = p_batch_id
      and (
        product_id is null
        or supplier_id is null
        or quantity <= 0
        or unit_cost < 0
        or payment_method not in ('efectivo', 'transferencia', 'qr', 'credito')
      )
  ) then
    raise exception 'La compra multiple tiene lineas incompletas o invalidas.';
  end if;

  for v_group in
    select
      supplier_id,
      payment_method,
      sum(subtotal) as total
    from public.purchase_batch_lines
    where batch_id = p_batch_id
    group by supplier_id, payment_method
    order by supplier_id, payment_method
  loop
    v_payment_status := case
      when v_group.payment_method = 'credito' then 'pendiente'
      else 'pagada'
    end;

    v_purchase_total := round(v_group.total, 2);

    insert into public.purchases (
      supplier_id,
      purchase_date,
      status,
      payment_status,
      payment_method,
      subtotal,
      total,
      notes,
      created_by,
      purchase_batch_id
    )
    values (
      v_group.supplier_id,
      v_batch.batch_date,
      'borrador',
      v_payment_status,
      v_group.payment_method,
      v_purchase_total,
      v_purchase_total,
      concat_ws(' | ', 'Compra hija generada desde compra multiple ' || p_batch_id::text, nullif(v_batch.notes, '')),
      v_user_id,
      p_batch_id
    )
    returning id into v_purchase_id;

    for v_line in
      select *
      from public.purchase_batch_lines
      where batch_id = p_batch_id
        and supplier_id = v_group.supplier_id
        and payment_method = v_group.payment_method
      order by sort_order, created_at
    loop
      insert into public.purchase_items (
        purchase_id,
        product_id,
        quantity,
        unit_cost,
        subtotal
      )
      values (
        v_purchase_id,
        v_line.product_id,
        v_line.quantity,
        v_line.unit_cost,
        v_line.subtotal
      );
    end loop;

    perform public.confirm_purchase(v_purchase_id);

    insert into public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      v_user_id,
      'confirm_purchase',
      'purchase',
      v_purchase_id,
      jsonb_build_object(
        'origin', 'purchase_batch',
        'purchase_batch_id', p_batch_id,
        'payment_method', v_group.payment_method,
        'total', v_purchase_total
      )
    );

    v_child_purchase_ids := array_append(v_child_purchase_ids, v_purchase_id);
  end loop;

  select jsonb_build_object(
    'total', coalesce(sum(subtotal), 0),
    'cash', coalesce(sum(subtotal) filter (where payment_method = 'efectivo'), 0),
    'qr_transfer', coalesce(sum(subtotal) filter (where payment_method in ('qr', 'transferencia')), 0),
    'credit', coalesce(sum(subtotal) filter (where payment_method = 'credito'), 0),
    'child_purchases_count', coalesce(array_length(v_child_purchase_ids, 1), 0),
    'child_purchase_ids', to_jsonb(v_child_purchase_ids)
  )
  into v_summary
  from public.purchase_batch_lines
  where batch_id = p_batch_id;

  update public.purchase_batches
  set status = 'confirmada',
      confirmed_by = v_user_id,
      confirmed_at = timezone('utc', now()),
      child_purchase_ids = v_child_purchase_ids,
      confirmation_summary = v_summary
  where id = p_batch_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'confirm_purchase_batch',
    'purchase_batch',
    p_batch_id,
    v_summary
  );

  return v_child_purchase_ids;
end;
$$;

revoke all on function public.confirm_purchase_batch(uuid) from public;
grant execute on function public.confirm_purchase_batch(uuid) to authenticated;


-- =====================================================
-- Fase 15C - Checkout invitado seguro
-- =====================================================

alter table public.orders
  alter column customer_id drop not null,
  add column if not exists origin text not null default 'interno',
  add column if not exists public_reference text,
  add column if not exists contact_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists delivery_type text,
  add column if not exists delivery_address text,
  add column if not exists delivery_time_window text,
  add column if not exists expected_payment_method text,
  add column if not exists version integer not null default 1,
  add column if not exists public_idempotency_key_hash text,
  add column if not exists submitted_at timestamptz;

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'borrador',
      'pendiente_revision',
      'en_preparacion',
      'listo_para_confirmar',
      'confirmado_cliente',
      'entregado',
      'cancelado',
      'recibido',
      'preparado_completo',
      'preparado_incompleto',
      'confirmado'
    )
  );

alter table public.orders
  drop constraint if exists orders_origin_check;

alter table public.orders
  add constraint orders_origin_check
  check (origin in ('interno', 'catalogo_invitado'));

alter table public.orders
  drop constraint if exists orders_delivery_type_check;

alter table public.orders
  add constraint orders_delivery_type_check
  check (delivery_type is null or delivery_type in ('delivery', 'recojo'));

alter table public.orders
  drop constraint if exists orders_expected_payment_method_check;

alter table public.orders
  add constraint orders_expected_payment_method_check
  check (
    expected_payment_method is null
    or expected_payment_method in ('efectivo', 'qr', 'mixto')
  );

alter table public.orders
  drop constraint if exists orders_version_check;

alter table public.orders
  add constraint orders_version_check
  check (version >= 1);

alter table public.orders
  drop constraint if exists orders_public_snapshot_check;

alter table public.orders
  add constraint orders_public_snapshot_check
  check (
    origin <> 'catalogo_invitado'
    or (
      public_reference is not null
      and jsonb_typeof(contact_snapshot) = 'object'
      and length(trim(coalesce(contact_snapshot ->> 'name', ''))) >= 2
      and length(trim(coalesce(contact_snapshot ->> 'phone', ''))) >= 7
      and delivery_type is not null
      and length(trim(coalesce(delivery_time_window, ''))) >= 3
      and expected_payment_method is not null
      and submitted_at is not null
      and (
        delivery_type <> 'delivery'
        or length(trim(coalesce(delivery_address, ''))) >= 5
      )
    )
  );

create unique index if not exists orders_public_reference_unique_idx
on public.orders (public_reference)
where public_reference is not null;

create unique index if not exists orders_public_idempotency_unique_idx
on public.orders (public_idempotency_key_hash)
where public_idempotency_key_hash is not null;

create index if not exists orders_origin_status_created_at_idx
on public.orders (origin, status, created_at desc);

alter table public.order_items
  add column if not exists catalog_availability_snapshot text;

alter table public.order_items
  drop constraint if exists order_items_catalog_availability_snapshot_check;

alter table public.order_items
  add constraint order_items_catalog_availability_snapshot_check
  check (
    catalog_availability_snapshot is null
    or catalog_availability_snapshot in ('disponible', 'consultar', 'agotado')
  );

create table if not exists public.public_order_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  idempotency_key_hash text not null,
  accepted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint public_order_attempts_ip_hash_check
    check (ip_hash ~ '^[a-f0-9]{64}$'),
  constraint public_order_attempts_idempotency_hash_check
    check (idempotency_key_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists public_order_attempts_ip_created_at_idx
on public.public_order_submission_attempts (ip_hash, created_at desc);

alter table public.public_order_submission_attempts enable row level security;

revoke all on table public.public_order_submission_attempts from anon, authenticated;
revoke select, insert, update, delete on table public.orders, public.order_items from anon;
revoke insert, update, delete on table public.orders, public.order_items from authenticated;

create or replace function public.create_public_catalog_order(
  p_contact_name text,
  p_phone text,
  p_delivery_type text,
  p_delivery_address text,
  p_delivery_time_window text,
  p_expected_payment_method text,
  p_notes text,
  p_items jsonb,
  p_ip_hash text,
  p_idempotency_key_hash text
)
returns table (
  created_order_id uuid,
  order_reference text,
  result_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt_id uuid;
  v_existing_order record;
  v_item jsonb;
  v_product record;
  v_product_id uuid;
  v_quantity numeric(14, 3);
  v_total numeric(14, 2) := 0;
  v_order_id uuid;
  v_reference text;
  v_payment_type text;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$'
    or p_idempotency_key_hash is null
    or p_idempotency_key_hash !~ '^[a-f0-9]{64}$'
  then
    created_order_id := null;
    order_reference := null;
    result_code := 'invalid_request';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));

  select id, public_reference
  into v_existing_order
  from public.orders
  where public_idempotency_key_hash = p_idempotency_key_hash
  limit 1;

  if found then
    created_order_id := v_existing_order.id;
    order_reference := v_existing_order.public_reference;
    result_code := 'already_created';
    return next;
    return;
  end if;

  if (
    select count(*)
    from public.public_order_submission_attempts
    where ip_hash = p_ip_hash
      and created_at >= timezone('utc', now()) - interval '15 minutes'
  ) >= 5 then
    insert into public.public_order_submission_attempts (
      ip_hash,
      idempotency_key_hash,
      accepted
    )
    values (p_ip_hash, p_idempotency_key_hash, false);

    created_order_id := null;
    order_reference := null;
    result_code := 'rate_limited';
    return next;
    return;
  end if;

  insert into public.public_order_submission_attempts (
    ip_hash,
    idempotency_key_hash,
    accepted
  )
  values (p_ip_hash, p_idempotency_key_hash, false)
  returning id into v_attempt_id;

  if length(trim(coalesce(p_contact_name, ''))) < 2
    or length(trim(coalesce(p_contact_name, ''))) > 120
    or p_phone is null
    or p_phone !~ '^\+?[0-9]{7,15}$'
  then
    created_order_id := null;
    order_reference := null;
    result_code := 'invalid_contact';
    return next;
    return;
  end if;

  if p_delivery_type not in ('delivery', 'recojo')
    or length(trim(coalesce(p_delivery_time_window, ''))) < 3
    or length(trim(coalesce(p_delivery_time_window, ''))) > 100
    or (
      p_delivery_type = 'delivery'
      and (
        length(trim(coalesce(p_delivery_address, ''))) < 5
        or length(trim(coalesce(p_delivery_address, ''))) > 300
      )
    )
  then
    created_order_id := null;
    order_reference := null;
    result_code := 'invalid_delivery';
    return next;
    return;
  end if;

  if p_expected_payment_method not in ('efectivo', 'qr', 'mixto') then
    created_order_id := null;
    order_reference := null;
    result_code := 'invalid_payment';
    return next;
    return;
  end if;

  if length(coalesce(p_notes, '')) > 1000 then
    created_order_id := null;
    order_reference := null;
    result_code := 'invalid_notes';
    return next;
    return;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    created_order_id := null;
    order_reference := null;
    result_code := 'invalid_items';
    return next;
    return;
  end if;

  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    created_order_id := null;
    order_reference := null;
    result_code := 'invalid_items';
    return next;
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item ->> 'product_id', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      or coalesce(item ->> 'quantity', '') !~ '^[0-9]+([.][0-9]{1,3})?$'
  ) then
    created_order_id := null;
    order_reference := null;
    result_code := 'invalid_items';
    return next;
    return;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    group by item ->> 'product_id'
    having count(*) > 1
  ) then
    created_order_id := null;
    order_reference := null;
    result_code := 'duplicate_product';
    return next;
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric(14, 3);

    if v_quantity <= 0 or v_quantity > 10000 then
      created_order_id := null;
      order_reference := null;
      result_code := 'invalid_quantity';
      return next;
      return;
    end if;

    select
      product.id,
      product.name,
      product.sale_price,
      product.catalog_min_quantity,
      product.catalog_quantity_step,
      product.catalog_availability,
      unit.name as unit_name,
      unit.abbreviation as unit_abbreviation
    into v_product
    from public.products product
    join public.product_categories category
      on category.id = product.category_id
     and category.is_active = true
     and category.is_catalog_visible = true
    join public.units_of_measure unit
      on unit.id = product.unit_id
     and unit.is_active = true
    where product.id = v_product_id
      and product.is_active = true
      and product.is_sellable = true
      and product.is_catalog_visible = true
      and product.requires_classification = false
      and product.sale_price > 0
    for share of product;

    if not found then
      created_order_id := null;
      order_reference := null;
      result_code := 'product_unavailable';
      return next;
      return;
    end if;

    if v_product.catalog_availability = 'agotado' then
      created_order_id := null;
      order_reference := null;
      result_code := 'product_sold_out';
      return next;
      return;
    end if;

    if v_quantity < v_product.catalog_min_quantity
      or mod(
        v_quantity - v_product.catalog_min_quantity,
        v_product.catalog_quantity_step
      ) <> 0
    then
      created_order_id := null;
      order_reference := null;
      result_code := 'invalid_quantity_step';
      return next;
      return;
    end if;

    v_total := v_total + round(v_quantity * v_product.sale_price, 2);
  end loop;

  v_total := round(v_total, 2);
  v_reference := 'PED-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_payment_type := case
    when p_expected_payment_method = 'qr' then 'qr'
    else 'contado'
  end;

  insert into public.orders (
    customer_id,
    order_date,
    status,
    payment_type,
    estimated_total,
    final_total,
    notes,
    created_by,
    origin,
    public_reference,
    contact_snapshot,
    delivery_type,
    delivery_address,
    delivery_time_window,
    expected_payment_method,
    version,
    public_idempotency_key_hash,
    submitted_at
  )
  values (
    null,
    current_date,
    'pendiente_revision',
    v_payment_type,
    v_total,
    0,
    nullif(trim(coalesce(p_notes, '')), ''),
    null,
    'catalogo_invitado',
    v_reference,
    jsonb_build_object(
      'name', trim(p_contact_name),
      'phone', p_phone
    ),
    p_delivery_type,
    case
      when p_delivery_type = 'delivery' then trim(p_delivery_address)
      else null
    end,
    trim(p_delivery_time_window),
    p_expected_payment_method,
    1,
    p_idempotency_key_hash,
    timezone('utc', now())
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric(14, 3);

    select
      product.id,
      product.name,
      product.sale_price,
      product.catalog_availability,
      unit.name as unit_name,
      unit.abbreviation as unit_abbreviation
    into strict v_product
    from public.products product
    join public.units_of_measure unit on unit.id = product.unit_id
    where product.id = v_product_id;

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit_name,
      unit_abbreviation,
      requested_quantity,
      actual_quantity,
      unit_price,
      estimated_subtotal,
      final_subtotal,
      status,
      catalog_availability_snapshot
    )
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.unit_name,
      v_product.unit_abbreviation,
      v_quantity,
      0,
      v_product.sale_price,
      round(v_quantity * v_product.sale_price, 2),
      0,
      'pendiente',
      v_product.catalog_availability
    );
  end loop;

  update public.public_order_submission_attempts
  set accepted = true
  where id = v_attempt_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    null,
    'create_public_order',
    'order',
    v_order_id,
    jsonb_build_object(
      'origin', 'catalogo_invitado',
      'public_reference', v_reference,
      'items_count', jsonb_array_length(p_items),
      'estimated_total', v_total,
      'delivery_type', p_delivery_type,
      'expected_payment_method', p_expected_payment_method,
      'version', 1
    )
  );

  created_order_id := v_order_id;
  order_reference := v_reference;
  result_code := 'created';
  return next;
end;
$$;

create or replace function public.link_public_order_customer(
  p_order_id uuid,
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_order record;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para revisar pedidos publicos.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if v_order.origin <> 'catalogo_invitado'
    or v_order.status <> 'pendiente_revision'
    or v_order.customer_id is not null
  then
    raise exception 'El pedido ya fue revisado o no corresponde al catalogo publico.';
  end if;

  if not exists (
    select 1
    from public.customers
    where id = p_customer_id
      and is_active = true
  ) then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  update public.orders
  set customer_id = p_customer_id,
      status = 'recibido'
  where id = p_order_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'link_public_order_customer',
    'order',
    p_order_id,
    jsonb_build_object(
      'customer_id', p_customer_id,
      'origin', 'catalogo_invitado'
    )
  );
end;
$$;

create or replace function public.prevent_unlinked_public_order_item_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.orders
    where id = new.order_id
      and origin = 'catalogo_invitado'
      and customer_id is null
  ) then
    raise exception 'Vincula un cliente antes de preparar el pedido publico.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_unlinked_public_order_item_update
on public.order_items;

create trigger prevent_unlinked_public_order_item_update
before update on public.order_items
for each row
execute function public.prevent_unlinked_public_order_item_update();

revoke all on function public.create_public_catalog_order(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_public_catalog_order(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  text
) to service_role;

revoke all on function public.link_public_order_customer(uuid, uuid) from public;
grant execute on function public.link_public_order_customer(uuid, uuid) to authenticated;

revoke all on function public.prevent_unlinked_public_order_item_update() from public;


-- =====================================================
-- Fase 15B - Catalogo publico seguro de solo lectura
-- =====================================================

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

-- =====================================================
-- Fase 14D - Clasificacion segura de ingresos
-- =====================================================
-- Fase 14D - Clasificacion segura de ingresos en compras multiples
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- No ejecutar en produccion sin backup y validacion.

alter table public.products
alter column stock_current type numeric(14, 3),
alter column stock_min type numeric(14, 3);

alter table public.inventory_movements
alter column quantity type numeric(14, 3),
alter column stock_before type numeric(14, 3),
alter column stock_after type numeric(14, 3);

alter table public.purchase_items
alter column quantity type numeric(14, 3),
alter column unit_cost type numeric(14, 4);

create table if not exists public.purchase_batch_line_classifications (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.purchase_batches (id) on delete cascade,
  batch_line_id uuid not null unique references public.purchase_batch_lines (id) on delete cascade,
  base_product_id uuid not null references public.products (id) on delete restrict,
  base_product_name text not null,
  base_quantity numeric(14, 3) not null,
  base_unit_name text,
  base_unit_abbreviation text,
  original_subtotal numeric(14, 2) not null,
  waste_quantity numeric(14, 3) not null default 0,
  waste_unit_name text,
  waste_unit_abbreviation text,
  distribution_method text not null default 'valor_venta',
  status text not null default 'lista',
  line_revision integer not null default 1,
  notes text,
  classified_by uuid references public.profiles (id) on delete set null,
  classified_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_batch_line_classifications_status_check check (status in ('borrador', 'lista')),
  constraint purchase_batch_line_classifications_base_quantity_check check (base_quantity > 0),
  constraint purchase_batch_line_classifications_original_subtotal_check check (original_subtotal >= 0),
  constraint purchase_batch_line_classifications_waste_quantity_check check (waste_quantity >= 0),
  constraint purchase_batch_line_classifications_line_revision_check check (line_revision > 0)
);

create table if not exists public.purchase_batch_classification_results (
  id uuid primary key default gen_random_uuid(),
  classification_id uuid not null references public.purchase_batch_line_classifications (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  unit_name text,
  unit_abbreviation text,
  quantity numeric(14, 3) not null,
  sale_price_snapshot numeric(14, 2) not null,
  sale_value numeric(14, 2) not null,
  assigned_cost numeric(14, 2) not null,
  unit_cost numeric(14, 4) not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint purchase_batch_classification_results_quantity_check check (quantity > 0),
  constraint purchase_batch_classification_results_sale_price_check check (sale_price_snapshot >= 0),
  constraint purchase_batch_classification_results_sale_value_check check (sale_value >= 0),
  constraint purchase_batch_classification_results_assigned_cost_check check (assigned_cost >= 0),
  constraint purchase_batch_classification_results_unit_cost_check check (unit_cost >= 0)
);

create index if not exists purchase_batch_line_classifications_batch_id_idx
on public.purchase_batch_line_classifications (batch_id);

create index if not exists purchase_batch_classification_results_classification_id_idx
on public.purchase_batch_classification_results (classification_id);

create index if not exists purchase_batch_classification_results_product_id_idx
on public.purchase_batch_classification_results (product_id);

drop trigger if exists set_purchase_batch_line_classifications_updated_at
on public.purchase_batch_line_classifications;

create trigger set_purchase_batch_line_classifications_updated_at
before update on public.purchase_batch_line_classifications
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.purchase_batch_line_classifications enable row level security;
alter table public.purchase_batch_classification_results enable row level security;

drop policy if exists "Purchase roles can view line classifications" on public.purchase_batch_line_classifications;
create policy "Purchase roles can view line classifications"
on public.purchase_batch_line_classifications
for select
to authenticated
using (public.current_user_role() in ('administrador', 'inventario', 'finanzas'));

drop policy if exists "Purchase roles can view classification results" on public.purchase_batch_classification_results;
create policy "Purchase roles can view classification results"
on public.purchase_batch_classification_results
for select
to authenticated
using (
  exists (
    select 1
    from public.purchase_batch_line_classifications c
    where c.id = classification_id
      and public.current_user_role() in ('administrador', 'inventario', 'finanzas')
  )
);

drop policy if exists "Purchase managers can delete draft line classifications" on public.purchase_batch_line_classifications;
create policy "Purchase managers can delete draft line classifications"
on public.purchase_batch_line_classifications
for delete
to authenticated
using (
  public.current_user_role() in ('administrador', 'inventario')
  and exists (
    select 1
    from public.purchase_batches batch
    where batch.id = purchase_batch_line_classifications.batch_id
      and batch.status = 'borrador'
  )
);

-- Fase 14D.1: revision atomica y snapshots controlados por base de datos.
create or replace function public.prepare_purchase_batch_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product record;
  v_supplier_name text;
  v_batch_status text;
  v_relevant_change boolean := false;
begin
  if tg_op = 'UPDATE' and new.batch_id is distinct from old.batch_id then
    raise exception 'No se puede mover una linea a otra compra multiple.';
  end if;

  select batch.status
  into v_batch_status
  from public.purchase_batches batch
  where batch.id = new.batch_id
  for update;

  if not found then
    raise exception 'Compra multiple no encontrada.';
  end if;

  if v_batch_status <> 'borrador' then
    raise exception 'Solo se pueden editar lineas de compras multiples en borrador.';
  end if;

  select
    product.name,
    product.requires_classification,
    unit.name as unit_name,
    unit.abbreviation as unit_abbreviation
  into v_product
  from public.products product
  left join public.units_of_measure unit on unit.id = product.unit_id
  where product.id = new.product_id
    and product.is_active = true;

  if not found then
    raise exception 'Producto no encontrado o inactivo.';
  end if;

  select supplier.name
  into v_supplier_name
  from public.suppliers supplier
  where supplier.id = new.supplier_id
    and supplier.is_active = true;

  if not found then
    raise exception 'Proveedor no encontrado o inactivo.';
  end if;

  if tg_op = 'INSERT' then
    new.line_revision := 1;
  else
    v_relevant_change :=
      old.product_id is distinct from new.product_id
      or old.quantity is distinct from new.quantity
      or old.unit_cost is distinct from new.unit_cost
      or old.unit_name is distinct from v_product.unit_name
      or old.unit_abbreviation is distinct from v_product.unit_abbreviation
      or old.requires_classification is distinct from v_product.requires_classification;

    if v_relevant_change then
      delete from public.purchase_batch_line_classifications
      where batch_line_id = old.id;
      new.line_revision := old.line_revision + 1;
    else
      new.line_revision := old.line_revision;
    end if;
  end if;

  new.product_name := v_product.name;
  new.supplier_name := v_supplier_name;
  new.unit_name := v_product.unit_name;
  new.unit_abbreviation := v_product.unit_abbreviation;
  new.requires_classification := v_product.requires_classification;

  return new;
end;
$$;

drop trigger if exists prepare_purchase_batch_line_integrity
on public.purchase_batch_lines;

create trigger prepare_purchase_batch_line_integrity
before insert or update on public.purchase_batch_lines
for each row
execute function public.prepare_purchase_batch_line();

create or replace function public.guard_purchase_batch_line_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_status text;
begin
  select batch.status
  into v_batch_status
  from public.purchase_batches batch
  where batch.id = old.batch_id
  for update;

  if not found or v_batch_status <> 'borrador' then
    raise exception 'Solo se pueden eliminar lineas de compras multiples en borrador.';
  end if;

  return old;
end;
$$;

drop trigger if exists guard_purchase_batch_line_delete
on public.purchase_batch_lines;

create trigger guard_purchase_batch_line_delete
before delete on public.purchase_batch_lines
for each row
execute function public.guard_purchase_batch_line_delete();

create or replace function public.sync_draft_batch_lines_from_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_name text;
  v_unit_abbreviation text;
begin
  select unit.name, unit.abbreviation
  into v_unit_name, v_unit_abbreviation
  from public.units_of_measure unit
  where unit.id = new.unit_id;

  update public.purchase_batch_lines line
  set product_name = new.name,
      unit_name = v_unit_name,
      unit_abbreviation = v_unit_abbreviation,
      requires_classification = new.requires_classification
  from public.purchase_batches batch
  where line.product_id = new.id
    and batch.id = line.batch_id
    and batch.status = 'borrador';

  return new;
end;
$$;

drop trigger if exists sync_draft_batch_lines_from_product
on public.products;

create trigger sync_draft_batch_lines_from_product
after update of name, unit_id, requires_classification on public.products
for each row
when (
  old.name is distinct from new.name
  or old.unit_id is distinct from new.unit_id
  or old.requires_classification is distinct from new.requires_classification
)
execute function public.sync_draft_batch_lines_from_product();

create or replace function public.sync_draft_batch_lines_from_unit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.purchase_batch_lines line
  set unit_name = new.name,
      unit_abbreviation = new.abbreviation
  from public.purchase_batches batch,
       public.products product
  where product.unit_id = new.id
    and line.product_id = product.id
    and batch.id = line.batch_id
    and batch.status = 'borrador';

  return new;
end;
$$;

drop trigger if exists sync_draft_batch_lines_from_unit
on public.units_of_measure;

create trigger sync_draft_batch_lines_from_unit
after update of name, abbreviation on public.units_of_measure
for each row
when (
  old.name is distinct from new.name
  or old.abbreviation is distinct from new.abbreviation
)
execute function public.sync_draft_batch_lines_from_unit();

revoke all on function public.prepare_purchase_batch_line() from public, anon, authenticated;
revoke all on function public.guard_purchase_batch_line_delete() from public, anon, authenticated;
revoke all on function public.sync_draft_batch_lines_from_product() from public, anon, authenticated;
revoke all on function public.sync_draft_batch_lines_from_unit() from public, anon, authenticated;

drop policy if exists "Purchase managers can delete draft line classifications"
on public.purchase_batch_line_classifications;
revoke delete on table public.purchase_batch_line_classifications from anon, authenticated;

revoke insert, update on table public.purchase_batch_lines from anon, authenticated;
grant insert (
  batch_id,
  product_id,
  supplier_id,
  quantity,
  unit_cost,
  payment_method,
  notes,
  sort_order
) on table public.purchase_batch_lines to authenticated;
grant update (
  product_id,
  supplier_id,
  quantity,
  unit_cost,
  payment_method,
  notes,
  sort_order
) on table public.purchase_batch_lines to authenticated;

drop function if exists public.save_purchase_batch_line_classification(uuid, numeric, jsonb, text);

create or replace function public.save_purchase_batch_line_classification(
  p_batch_line_id uuid,
  p_waste_quantity numeric,
  p_results jsonb,
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
  v_line record;
  v_batch record;
  v_classification_id uuid;
  v_results_count integer;
  v_manual_count integer;
  v_sale_value_total numeric(14, 2);
  v_assigned_total numeric(14, 2);
  v_difference numeric(14, 2);
  v_same_unit boolean;
  v_quantity_total numeric(14, 3);
  v_waste_quantity numeric(14, 3);
  v_waste_unit_name text;
  v_waste_unit_abbreviation text;
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

  if v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para clasificar ingresos.';
  end if;

  if p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) = 0 then
    raise exception 'Agrega al menos un producto resultante. La clasificacion con 100%% de merma no esta permitida por ahora.';
  end if;

  select
    line.*,
    product.requires_classification as product_requires_classification
  into v_line
  from public.purchase_batch_lines line
  join public.products product on product.id = line.product_id
  where line.id = p_batch_line_id
  for update of line;

  if not found then
    raise exception 'Linea de compra multiple no encontrada.';
  end if;

  select *
  into v_batch
  from public.purchase_batches
  where id = v_line.batch_id
  for update;

  if not found then
    raise exception 'Compra multiple no encontrada.';
  end if;

  if v_batch.status <> 'borrador' then
    raise exception 'Solo se pueden clasificar lineas de compras multiples en borrador.';
  end if;

  if v_line.product_requires_classification is not true then
    raise exception 'El producto real de esta linea no requiere clasificacion de ingreso.';
  end if;

  if p_waste_quantity is null or p_waste_quantity < 0 then
    raise exception 'La merma no puede ser negativa.';
  end if;

  v_waste_quantity := p_waste_quantity;

  drop table if exists pg_temp.tmp_purchase_classification_results;

  create temp table pg_temp.tmp_purchase_classification_results (
    sort_order integer generated always as identity,
    product_id uuid not null,
    product_name text,
    unit_name text,
    unit_abbreviation text,
    quantity numeric(14, 3) not null,
    sale_price_snapshot numeric(14, 2),
    sale_value numeric(14, 2),
    assigned_cost numeric(14, 2),
    unit_cost numeric(14, 4)
  ) on commit drop;

  insert into pg_temp.tmp_purchase_classification_results (
    product_id,
    quantity,
    assigned_cost
  )
  select
    (item ->> 'product_id')::uuid,
    (item ->> 'quantity')::numeric,
    nullif(item ->> 'assigned_cost', '')::numeric
  from jsonb_array_elements(p_results) as item;

  if exists (
    select 1
    from pg_temp.tmp_purchase_classification_results
    where quantity <= 0
  ) then
    raise exception 'Las cantidades resultantes deben ser mayores a cero.';
  end if;

  if exists (
    select 1
    from pg_temp.tmp_purchase_classification_results
    where assigned_cost < 0
  ) then
    raise exception 'Los costos asignados no pueden ser negativos.';
  end if;

  if exists (
    select 1
    from pg_temp.tmp_purchase_classification_results
    where product_id = v_line.product_id
  ) then
    raise exception 'El producto base no puede ser un producto resultante.';
  end if;

  if exists (
    select product_id
    from pg_temp.tmp_purchase_classification_results
    group by product_id
    having count(*) > 1
  ) then
    raise exception 'No repitas productos resultantes en la misma clasificacion.';
  end if;

  update pg_temp.tmp_purchase_classification_results tmp
  set product_name = p.name,
      unit_name = u.name,
      unit_abbreviation = u.abbreviation,
      sale_price_snapshot = p.sale_price,
      sale_value = round(tmp.quantity * p.sale_price, 2)
  from public.products p
  left join public.units_of_measure u on u.id = p.unit_id
  where p.id = tmp.product_id
    and p.is_active = true;

  if exists (
    select 1
    from pg_temp.tmp_purchase_classification_results
    where product_name is null
  ) then
    raise exception 'Todos los productos resultantes deben existir y estar activos.';
  end if;

  select count(*), count(assigned_cost)
  into v_results_count, v_manual_count
  from pg_temp.tmp_purchase_classification_results;

  if v_manual_count = v_results_count then
    select round(sum(assigned_cost), 2)
    into v_assigned_total
    from pg_temp.tmp_purchase_classification_results;

    if round(v_assigned_total, 2) <> round(v_line.subtotal, 2) then
      raise exception 'Los costos asignados deben sumar exactamente el subtotal original.';
    end if;
  else
    if v_manual_count > 0 then
      raise exception 'Completa todos los costos asignados o deja todos vacios para distribuir automaticamente.';
    end if;

    if exists (
      select 1
      from pg_temp.tmp_purchase_classification_results
      where sale_price_snapshot <= 0
    ) then
      raise exception 'Un producto resultante no tiene precio de venta valido. Asigna costos manualmente.';
    end if;

    select round(sum(sale_value), 2)
    into v_sale_value_total
    from pg_temp.tmp_purchase_classification_results;

    if v_sale_value_total <= 0 then
      raise exception 'No se pudo distribuir costos porque el valor de venta resultante es cero.';
    end if;

    update pg_temp.tmp_purchase_classification_results
    set assigned_cost = round(v_line.subtotal * sale_value / v_sale_value_total, 2);

    select round(v_line.subtotal - sum(assigned_cost), 2)
    into v_difference
    from pg_temp.tmp_purchase_classification_results;

    update pg_temp.tmp_purchase_classification_results
    set assigned_cost = assigned_cost + v_difference
    where sort_order = (
      select max(sort_order)
      from pg_temp.tmp_purchase_classification_results
    );
  end if;

  select round(sum(assigned_cost), 2)
  into v_assigned_total
  from pg_temp.tmp_purchase_classification_results;

  if round(v_assigned_total, 2) <> round(v_line.subtotal, 2) then
    raise exception 'La distribucion de costos no coincide con el subtotal original.';
  end if;

  update pg_temp.tmp_purchase_classification_results
  set unit_cost = round(assigned_cost / quantity, 4);

  select coalesce(sum(quantity), 0)
  into v_quantity_total
  from pg_temp.tmp_purchase_classification_results;

  select bool_and(coalesce(unit_abbreviation, '') = coalesce(v_line.unit_abbreviation, ''))
  into v_same_unit
  from pg_temp.tmp_purchase_classification_results;

  if v_same_unit and abs((v_quantity_total + v_waste_quantity) - v_line.quantity) > 0.001 then
    raise exception 'La cantidad clasificada mas merma debe coincidir con la cantidad original.';
  end if;

  select unit_name, unit_abbreviation
  into v_waste_unit_name, v_waste_unit_abbreviation
  from pg_temp.tmp_purchase_classification_results
  order by sort_order
  limit 1;

  delete from public.purchase_batch_line_classifications
  where batch_line_id = p_batch_line_id;

  insert into public.purchase_batch_line_classifications (
    batch_id,
    batch_line_id,
    base_product_id,
    base_product_name,
    base_quantity,
    base_unit_name,
    base_unit_abbreviation,
    original_subtotal,
    waste_quantity,
    waste_unit_name,
    waste_unit_abbreviation,
    distribution_method,
    status,
    line_revision,
    notes,
    classified_by
  )
  values (
    v_line.batch_id,
    v_line.id,
    v_line.product_id,
    coalesce(v_line.product_name, 'Producto base'),
    v_line.quantity,
    v_line.unit_name,
    v_line.unit_abbreviation,
    v_line.subtotal,
    v_waste_quantity,
    v_waste_unit_name,
    v_waste_unit_abbreviation,
    'valor_venta',
    'lista',
    v_line.line_revision,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_classification_id;

  insert into public.purchase_batch_classification_results (
    classification_id,
    product_id,
    product_name,
    unit_name,
    unit_abbreviation,
    quantity,
    sale_price_snapshot,
    sale_value,
    assigned_cost,
    unit_cost,
    sort_order
  )
  select
    v_classification_id,
    product_id,
    product_name,
    unit_name,
    unit_abbreviation,
    quantity,
    sale_price_snapshot,
    sale_value,
    assigned_cost,
    unit_cost,
    sort_order
  from pg_temp.tmp_purchase_classification_results
  order by sort_order;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'save_purchase_batch_line_classification',
    'purchase_batch',
    v_line.batch_id,
    jsonb_build_object(
      'batch_line_id', p_batch_line_id,
      'line_revision', v_line.line_revision,
      'base_product_id', v_line.product_id,
      'waste_quantity', v_waste_quantity,
      'original_subtotal', v_line.subtotal,
      'results_count', v_results_count
    )
  );

  return v_classification_id;
end;
$$;

drop function if exists public.confirm_purchase_batch(uuid);

create or replace function public.confirm_purchase_batch(p_batch_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_batch record;
  v_group record;
  v_item record;
  v_purchase_id uuid;
  v_child_purchase_ids uuid[] := '{}';
  v_payment_status text;
  v_purchase_total numeric(14, 2);
  v_summary jsonb;
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

  if v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para confirmar compras multiples.';
  end if;

  select *
  into v_batch
  from public.purchase_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Compra multiple no encontrada.';
  end if;

  if v_batch.status = 'confirmada' then
    raise exception 'La compra multiple ya fue confirmada.';
  end if;

  if v_batch.status <> 'borrador' then
    raise exception 'Solo se pueden confirmar compras multiples en borrador.';
  end if;

  if not exists (select 1 from public.purchase_batch_lines where batch_id = p_batch_id) then
    raise exception 'La compra multiple debe tener al menos una linea.';
  end if;

  if exists (
    select 1
    from public.purchase_batch_lines line
    join public.products product on product.id = line.product_id
    where line.batch_id = p_batch_id
      and product.requires_classification = true
      and not exists (
        select 1
        from public.purchase_batch_line_classifications classification
        where classification.batch_line_id = line.id
          and classification.batch_id = line.batch_id
          and classification.base_product_id = line.product_id
          and classification.base_quantity = line.quantity
          and classification.original_subtotal = line.subtotal
          and classification.base_unit_abbreviation is not distinct from line.unit_abbreviation
          and classification.line_revision = line.line_revision
          and classification.status = 'lista'
          and exists (
            select 1
            from public.purchase_batch_classification_results result
            where result.classification_id = classification.id
          )
          and not exists (
            select 1
            from public.purchase_batch_classification_results result
            where result.classification_id = classification.id
              and result.product_id = line.product_id
          )
          and (
            select round(coalesce(sum(result.assigned_cost), 0), 2)
            from public.purchase_batch_classification_results result
            where result.classification_id = classification.id
          ) = round(line.subtotal, 2)
      )
  ) then
    raise exception 'Este producto requiere una clasificacion vigente antes de confirmar.';
  end if;

  if exists (
    select 1
    from public.purchase_batch_lines
    where batch_id = p_batch_id
      and (
        product_id is null
        or supplier_id is null
        or quantity <= 0
        or unit_cost < 0
        or payment_method not in ('efectivo', 'transferencia', 'qr', 'credito')
      )
  ) then
    raise exception 'La compra multiple tiene lineas incompletas o invalidas.';
  end if;

  for v_group in
    with expanded_items as (
      select
        line.supplier_id,
        line.payment_method,
        line.product_id,
        line.quantity,
        line.unit_cost,
        line.subtotal
      from public.purchase_batch_lines line
      join public.products product on product.id = line.product_id
      where line.batch_id = p_batch_id
        and product.requires_classification = false

      union all

      select
        line.supplier_id,
        line.payment_method,
        result.product_id,
        result.quantity,
        result.unit_cost,
        result.assigned_cost as subtotal
      from public.purchase_batch_lines line
      join public.products product
        on product.id = line.product_id
       and product.requires_classification = true
      join public.purchase_batch_line_classifications classification
        on classification.batch_line_id = line.id
       and classification.batch_id = line.batch_id
       and classification.base_product_id = line.product_id
       and classification.base_quantity = line.quantity
       and classification.original_subtotal = line.subtotal
       and classification.base_unit_abbreviation is not distinct from line.unit_abbreviation
       and classification.line_revision = line.line_revision
       and classification.status = 'lista'
      join public.purchase_batch_classification_results result
        on result.classification_id = classification.id
      where line.batch_id = p_batch_id
    )
    select
      supplier_id,
      payment_method,
      round(sum(subtotal), 2) as total
    from expanded_items
    group by supplier_id, payment_method
    order by supplier_id, payment_method
  loop
    v_payment_status := case
      when v_group.payment_method = 'credito' then 'pendiente'
      else 'pagada'
    end;

    v_purchase_total := round(v_group.total, 2);

    insert into public.purchases (
      supplier_id,
      purchase_date,
      status,
      payment_status,
      payment_method,
      subtotal,
      total,
      notes,
      created_by,
      purchase_batch_id
    )
    values (
      v_group.supplier_id,
      v_batch.batch_date,
      'borrador',
      v_payment_status,
      v_group.payment_method,
      v_purchase_total,
      v_purchase_total,
      concat_ws(' | ', 'Compra hija generada desde compra multiple ' || p_batch_id::text, nullif(v_batch.notes, '')),
      v_user_id,
      p_batch_id
    )
    returning id into v_purchase_id;

    for v_item in
      with expanded_items as (
        select
          line.supplier_id,
          line.payment_method,
          line.product_id,
          line.quantity,
          line.unit_cost,
          line.subtotal,
          line.sort_order,
          line.created_at
        from public.purchase_batch_lines line
        join public.products product on product.id = line.product_id
        where line.batch_id = p_batch_id
          and product.requires_classification = false

        union all

        select
          line.supplier_id,
          line.payment_method,
          result.product_id,
          result.quantity,
          result.unit_cost,
          result.assigned_cost as subtotal,
          line.sort_order,
          result.created_at
        from public.purchase_batch_lines line
        join public.products product
          on product.id = line.product_id
         and product.requires_classification = true
        join public.purchase_batch_line_classifications classification
          on classification.batch_line_id = line.id
         and classification.batch_id = line.batch_id
         and classification.base_product_id = line.product_id
         and classification.base_quantity = line.quantity
         and classification.original_subtotal = line.subtotal
         and classification.base_unit_abbreviation is not distinct from line.unit_abbreviation
         and classification.line_revision = line.line_revision
         and classification.status = 'lista'
        join public.purchase_batch_classification_results result
          on result.classification_id = classification.id
        where line.batch_id = p_batch_id
      )
      select *
      from expanded_items
      where supplier_id = v_group.supplier_id
        and payment_method = v_group.payment_method
      order by sort_order, created_at
    loop
      insert into public.purchase_items (
        purchase_id,
        product_id,
        quantity,
        unit_cost,
        subtotal
      )
      values (
        v_purchase_id,
        v_item.product_id,
        v_item.quantity,
        v_item.unit_cost,
        v_item.subtotal
      );
    end loop;

    perform public.confirm_purchase(v_purchase_id);

    insert into public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      v_user_id,
      'confirm_purchase',
      'purchase',
      v_purchase_id,
      jsonb_build_object(
        'origin', 'purchase_batch',
        'purchase_batch_id', p_batch_id,
        'payment_method', v_group.payment_method,
        'total', v_purchase_total
      )
    );

    v_child_purchase_ids := array_append(v_child_purchase_ids, v_purchase_id);
  end loop;

  select jsonb_build_object(
    'total', coalesce(sum(line.subtotal), 0),
    'cash', coalesce(sum(line.subtotal) filter (where line.payment_method = 'efectivo'), 0),
    'qr_transfer', coalesce(sum(line.subtotal) filter (where line.payment_method in ('qr', 'transferencia')), 0),
    'credit', coalesce(sum(line.subtotal) filter (where line.payment_method = 'credito'), 0),
    'classified_lines_count', coalesce(
      count(*) filter (where product.requires_classification = true),
      0
    ),
    'child_purchases_count', coalesce(array_length(v_child_purchase_ids, 1), 0),
    'child_purchase_ids', to_jsonb(v_child_purchase_ids)
  )
  into v_summary
  from public.purchase_batch_lines line
  join public.products product on product.id = line.product_id
  where line.batch_id = p_batch_id;

  update public.purchase_batches
  set status = 'confirmada',
      confirmed_by = v_user_id,
      confirmed_at = timezone('utc', now()),
      child_purchase_ids = v_child_purchase_ids,
      confirmation_summary = v_summary
  where id = p_batch_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'confirm_purchase_batch',
    'purchase_batch',
    p_batch_id,
    v_summary
  );

  return v_child_purchase_ids;
end;
$$;

revoke all on function public.save_purchase_batch_line_classification(uuid, numeric, jsonb, text) from public;
grant execute on function public.save_purchase_batch_line_classification(uuid, numeric, jsonb, text) to authenticated;

revoke all on function public.confirm_purchase_batch(uuid) from public;
grant execute on function public.confirm_purchase_batch(uuid) to authenticated;
