-- QB-5: Cuenta cliente, ubicaciones, catalogo sin precios y pedidos QB.
-- Alcance local: pedidos solicitados por cliente, sin precios, ventas, pagos, caja, recibos ni stock.

begin;

alter table public.product_categories
  add column if not exists catalog_slug text,
  add column if not exists catalog_sort_order integer not null default 0;

alter table public.products
  add column if not exists is_sellable boolean not null default true,
  add column if not exists catalog_description text,
  add column if not exists catalog_sort_order integer not null default 0,
  add column if not exists catalog_min_quantity numeric(14, 3) not null default 1,
  add column if not exists catalog_quantity_step numeric(14, 3) not null default 1;

create table if not exists public.qb_customer_locations (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  label text not null default 'Principal',
  address text not null,
  reference text,
  phone text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_customer_locations_label_check check (length(trim(label)) between 2 and 80),
  constraint qb_customer_locations_address_check check (length(trim(address)) between 5 and 300),
  constraint qb_customer_locations_reference_check check (reference is null or length(trim(reference)) <= 300),
  constraint qb_customer_locations_phone_check check (phone is null or length(trim(phone)) between 7 and 25),
  constraint qb_customer_locations_sort_order_check check (sort_order >= 0)
);

comment on table public.qb_customer_locations is
  'QB-5: ubicaciones del cliente externo para pedidos QB. No mezcla clientes internos ni profiles.';

create unique index if not exists qb_customer_locations_one_primary_idx
  on public.qb_customer_locations (customer_account_id)
  where is_primary and is_active;

create index if not exists qb_customer_locations_customer_idx
  on public.qb_customer_locations (customer_account_id, is_active, is_primary desc, sort_order);

create table if not exists public.qb_orders (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null,
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  customer_location_id uuid not null references public.qb_customer_locations(id) on delete restrict,
  status text not null default 'pendiente_preparacion',
  origin text not null default 'catalogo_qb',
  customer_notes text,
  customer_snapshot jsonb not null default '{}'::jsonb,
  location_snapshot jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  submitted_at timestamptz not null default now(),
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_orders_reference_unique unique (public_reference),
  constraint qb_orders_customer_idempotency_unique unique (customer_account_id, idempotency_key),
  constraint qb_orders_status_check check (status in ('pendiente_preparacion', 'cancelado')),
  constraint qb_orders_origin_check check (origin = 'catalogo_qb'),
  constraint qb_orders_notes_check check (customer_notes is null or length(trim(customer_notes)) <= 1000),
  constraint qb_orders_idempotency_key_check
    check (idempotency_key ~ '^[0-9a-fA-F-]{32,64}$')
);

comment on table public.qb_orders is
  'QB-5: pedidos QB solicitados por cliente. No guarda precios, totales, ventas, pagos, caja, recibos ni stock.';

create index if not exists qb_orders_status_submitted_idx
  on public.qb_orders (status, submitted_at desc);

create index if not exists qb_orders_customer_submitted_idx
  on public.qb_orders (customer_account_id, submitted_at desc);

create table if not exists public.qb_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.qb_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  allowed_unit_id uuid not null references public.qb_product_allowed_units(id) on delete restrict,
  source_kind text not null,
  source_unit_id uuid references public.qb_units(id) on delete restrict,
  product_presentation_id uuid references public.qb_product_presentations(id) on delete restrict,
  source_label text not null,
  requested_quantity numeric(18, 6) not null,
  base_unit_id uuid not null references public.qb_units(id) on delete restrict,
  base_unit_symbol text not null,
  base_quantity numeric(18, 6) not null,
  conversion_factor_to_base numeric(18, 9) not null,
  conversion_snapshot_id uuid references public.qb_conversion_snapshots(id) on delete set null,
  customer_notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_order_items_source_kind_check
    check (source_kind in ('universal_unit', 'product_presentation')),
  constraint qb_order_items_one_source_check
    check (
      (source_kind = 'universal_unit' and source_unit_id is not null and product_presentation_id is null) or
      (source_kind = 'product_presentation' and source_unit_id is null and product_presentation_id is not null)
    ),
  constraint qb_order_items_requested_quantity_check check (requested_quantity > 0),
  constraint qb_order_items_base_quantity_check check (base_quantity > 0),
  constraint qb_order_items_factor_check check (conversion_factor_to_base > 0),
  constraint qb_order_items_notes_check check (customer_notes is null or length(trim(customer_notes)) <= 500),
  constraint qb_order_items_sort_order_check check (sort_order >= 0)
);

comment on table public.qb_order_items is
  'QB-5: items solicitados sin precio. La cantidad base es tecnica y no descuenta stock.';

create index if not exists qb_order_items_order_idx
  on public.qb_order_items (order_id, sort_order);

create index if not exists qb_order_items_product_idx
  on public.qb_order_items (product_id, created_at desc);

drop trigger if exists set_qb_customer_locations_updated_at on public.qb_customer_locations;
create trigger set_qb_customer_locations_updated_at
  before update on public.qb_customer_locations
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_orders_updated_at on public.qb_orders;
create trigger set_qb_orders_updated_at
  before update on public.qb_orders
  for each row execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_qb_order_items_updated_at on public.qb_order_items;
create trigger set_qb_order_items_updated_at
  before update on public.qb_order_items
  for each row execute function public.set_current_timestamp_updated_at();

create or replace function public.update_qb_customer_profile(
  p_full_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then
    raise exception 'Nombre invalido.';
  end if;

  if p_phone is not null and length(trim(p_phone)) not between 7 and 25 then
    raise exception 'Telefono invalido.';
  end if;

  update public.customer_accounts
  set
    full_name = trim(p_full_name),
    phone = nullif(trim(coalesce(p_phone, '')), '')
  where id = v_user_id
    and is_active = true;

  if not found then
    raise exception 'Cuenta de cliente no disponible.';
  end if;
end;
$$;

create or replace function public.create_qb_catalog_order(
  p_location_id uuid,
  p_customer_notes text,
  p_items jsonb,
  p_idempotency_key text
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
  v_user_id uuid := auth.uid();
  v_customer public.customer_accounts%rowtype;
  v_location public.qb_customer_locations%rowtype;
  v_existing public.qb_orders%rowtype;
  v_order_id uuid;
  v_reference text;
  v_item jsonb;
  v_product record;
  v_allowed record;
  v_base_unit record;
  v_source_unit record;
  v_presentation record;
  v_quantity numeric(18, 6);
  v_base_quantity numeric(18, 6);
  v_factor numeric(18, 9);
  v_item_id uuid;
  v_snapshot_id uuid;
  v_sort_order integer := 0;
  v_seen_products uuid[] := '{}';
begin
  created_order_id := null;
  order_reference := null;
  result_code := 'invalid_request';

  if v_user_id is null then
    result_code := 'unauthenticated';
    return next;
    return;
  end if;

  if p_idempotency_key is null or p_idempotency_key !~ '^[0-9a-fA-F-]{32,64}$' then
    result_code := 'invalid_idempotency';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_idempotency_key, 0));

  select *
  into v_customer
  from public.customer_accounts
  where id = v_user_id
    and is_active = true;

  if not found then
    result_code := 'missing_customer';
    return next;
    return;
  end if;

  select *
  into v_existing
  from public.qb_orders
  where customer_account_id = v_user_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if found then
    created_order_id := v_existing.id;
    order_reference := v_existing.public_reference;
    result_code := 'already_created';
    return next;
    return;
  end if;

  select *
  into v_location
  from public.qb_customer_locations
  where id = p_location_id
    and customer_account_id = v_user_id
    and is_active = true;

  if not found then
    result_code := 'invalid_location';
    return next;
    return;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    result_code := 'empty_cart';
    return next;
    return;
  end if;

  if jsonb_array_length(p_items) > 30 then
    result_code := 'too_many_items';
    return next;
    return;
  end if;

  v_reference := 'QB-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.qb_orders (
    public_reference,
    customer_account_id,
    customer_location_id,
    customer_notes,
    customer_snapshot,
    location_snapshot,
    idempotency_key
  )
  values (
    v_reference,
    v_user_id,
    v_location.id,
    nullif(trim(coalesce(p_customer_notes, '')), ''),
    jsonb_build_object(
      'full_name', v_customer.full_name,
      'email', v_customer.email,
      'phone', v_customer.phone
    ),
    jsonb_build_object(
      'label', v_location.label,
      'address', v_location.address,
      'reference', v_location.reference,
      'phone', v_location.phone
    ),
    p_idempotency_key
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;
    v_quantity := nullif(v_item ->> 'quantity', '')::numeric;

    if v_quantity is null or v_quantity <= 0 or v_quantity > 10000 then
      raise exception 'Cantidad solicitada invalida.';
    end if;

    if abs(v_quantity * 1000 - round(v_quantity * 1000)) > 0.000001 then
      raise exception 'Cada cantidad admite como maximo tres decimales.';
    end if;

    select
      product.id,
      product.name,
      product.is_sellable,
      product.requires_classification,
      settings.base_unit_id,
      settings.is_qb_active,
      settings.is_visible_in_qb_catalog
    into v_product
    from public.products product
    join public.qb_product_unit_settings settings on settings.product_id = product.id
    where product.id = (v_item ->> 'product_id')::uuid
      and product.is_active = true
      and coalesce(product.is_sellable, true) = true
      and settings.is_qb_active = true
      and settings.is_visible_in_qb_catalog = true;

    if not found then
      raise exception 'Producto no disponible en el catalogo QB.';
    end if;

    if v_product.id = any(v_seen_products) then
      raise exception 'El pedido contiene un producto repetido.';
    end if;

    v_seen_products := array_append(v_seen_products, v_product.id);

    select *
    into v_allowed
    from public.qb_product_allowed_units allowed
    where allowed.id = (v_item ->> 'allowed_unit_id')::uuid
      and allowed.product_id = v_product.id
      and allowed.usage_context = 'pedido'
      and allowed.is_active = true;

    if not found then
      raise exception 'Unidad de pedido no permitida.';
    end if;

    if coalesce(v_allowed.min_quantity, 0) > 0 and v_quantity < v_allowed.min_quantity then
      raise exception 'Cantidad menor al minimo permitido.';
    end if;

    if coalesce(v_allowed.quantity_step, 0) > 0
      and abs(((v_quantity - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)) / v_allowed.quantity_step)
        - round((v_quantity - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)) / v_allowed.quantity_step)) > 0.000001
    then
      raise exception 'Cantidad no coincide con el incremento permitido.';
    end if;

    select *
    into v_base_unit
    from public.qb_units unit
    where unit.id = v_product.base_unit_id
      and unit.is_active = true;

    if not found then
      raise exception 'Unidad base QB no disponible.';
    end if;

    if v_allowed.unit_id is not null then
      select *
      into v_source_unit
      from public.qb_units unit
      where unit.id = v_allowed.unit_id
        and unit.is_active = true
        and unit.dimension_id = v_base_unit.dimension_id;

      if not found then
        raise exception 'Unidad de pedido no disponible.';
      end if;

      v_factor := v_source_unit.conversion_factor_to_base / v_base_unit.conversion_factor_to_base;
      v_base_quantity := round(v_quantity * v_factor, 6);

      insert into public.qb_order_items (
        order_id,
        product_id,
        allowed_unit_id,
        source_kind,
        source_unit_id,
        source_label,
        requested_quantity,
        base_unit_id,
        base_unit_symbol,
        base_quantity,
        conversion_factor_to_base,
        customer_notes,
        sort_order
      )
      values (
        v_order_id,
        v_product.id,
        v_allowed.id,
        'universal_unit',
        v_source_unit.id,
        v_source_unit.symbol,
        v_quantity,
        v_base_unit.id,
        v_base_unit.symbol,
        v_base_quantity,
        v_factor,
        nullif(trim(coalesce(v_item ->> 'notes', '')), ''),
        v_sort_order
      )
      returning id into v_item_id;

      insert into public.qb_conversion_snapshots (
        source_table,
        source_id,
        product_id,
        dimension_code,
        source_kind,
        source_unit_id,
        source_label,
        source_quantity,
        base_unit_id,
        base_unit_symbol,
        base_quantity,
        conversion_factor_to_base,
        snapshot,
        created_by
      )
      values (
        'qb_order_items',
        v_item_id,
        v_product.id,
        'pedido',
        'universal_unit',
        v_source_unit.id,
        v_source_unit.symbol,
        v_quantity,
        v_base_unit.id,
        v_base_unit.symbol,
        v_base_quantity,
        v_factor,
        jsonb_build_object('allowed_unit_id', v_allowed.id, 'unit_name', v_source_unit.name),
        v_user_id
      )
      returning id into v_snapshot_id;
    else
      select *
      into v_presentation
      from public.qb_product_presentations presentation
      where presentation.id = v_allowed.presentation_id
        and presentation.product_id = v_product.id
        and presentation.is_active = true
        and presentation.allow_order = true;

      if not found then
        raise exception 'Presentacion de pedido no disponible.';
      end if;

      v_factor := v_presentation.conversion_factor_to_base;
      v_base_quantity := round(v_quantity * v_factor, 6);

      insert into public.qb_order_items (
        order_id,
        product_id,
        allowed_unit_id,
        source_kind,
        product_presentation_id,
        source_label,
        requested_quantity,
        base_unit_id,
        base_unit_symbol,
        base_quantity,
        conversion_factor_to_base,
        customer_notes,
        sort_order
      )
      values (
        v_order_id,
        v_product.id,
        v_allowed.id,
        'product_presentation',
        v_presentation.id,
        v_presentation.symbol,
        v_quantity,
        v_base_unit.id,
        v_base_unit.symbol,
        v_base_quantity,
        v_factor,
        nullif(trim(coalesce(v_item ->> 'notes', '')), ''),
        v_sort_order
      )
      returning id into v_item_id;

      insert into public.qb_conversion_snapshots (
        source_table,
        source_id,
        product_id,
        dimension_code,
        source_kind,
        product_presentation_id,
        source_label,
        source_quantity,
        base_unit_id,
        base_unit_symbol,
        base_quantity,
        conversion_factor_to_base,
        snapshot,
        created_by
      )
      values (
        'qb_order_items',
        v_item_id,
        v_product.id,
        'pedido',
        'product_presentation',
        v_presentation.id,
        v_presentation.symbol,
        v_quantity,
        v_base_unit.id,
        v_base_unit.symbol,
        v_base_quantity,
        v_factor,
        jsonb_build_object('allowed_unit_id', v_allowed.id, 'presentation_name', v_presentation.name),
        v_user_id
      )
      returning id into v_snapshot_id;
    end if;

    update public.qb_order_items
    set conversion_snapshot_id = v_snapshot_id
    where id = v_item_id;
  end loop;

  created_order_id := v_order_id;
  order_reference := v_reference;
  result_code := 'created';
  return next;
end;
$$;

create or replace function public.get_qb_public_catalog()
returns table (
  product_id uuid,
  product_name text,
  public_description text,
  image_url text,
  category_id uuid,
  category_name text,
  category_slug text,
  product_sort_order integer,
  category_sort_order integer,
  allowed_unit_id uuid,
  source_kind text,
  source_label text,
  min_quantity numeric(18, 6),
  quantity_step numeric(18, 6),
  is_default boolean,
  allowed_sort_order integer
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
    category.id,
    category.name,
    category.catalog_slug,
    coalesce(product.catalog_sort_order, 0),
    coalesce(category.catalog_sort_order, 0),
    allowed.id,
    case
      when allowed.unit_id is not null then 'universal_unit'
      else 'product_presentation'
    end,
    coalesce(unit.symbol, presentation.symbol),
    coalesce(allowed.min_quantity, product.catalog_min_quantity, 1),
    coalesce(allowed.quantity_step, product.catalog_quantity_step, 1),
    allowed.is_default,
    allowed.sort_order
  from public.products product
  join public.qb_product_unit_settings settings
    on settings.product_id = product.id
   and settings.is_qb_active = true
   and settings.is_visible_in_qb_catalog = true
  join public.qb_product_allowed_units allowed
    on allowed.product_id = product.id
   and allowed.usage_context = 'pedido'
   and allowed.is_active = true
  left join public.qb_units unit
    on unit.id = allowed.unit_id
   and unit.is_active = true
  left join public.qb_product_presentations presentation
    on presentation.id = allowed.presentation_id
   and presentation.product_id = product.id
   and presentation.is_active = true
   and presentation.allow_order = true
  left join public.product_categories category
    on category.id = product.category_id
   and category.is_active = true
  where product.is_active = true
    and coalesce(product.is_sellable, true) = true
    and (
      (allowed.unit_id is not null and unit.id is not null) or
      (allowed.presentation_id is not null and presentation.id is not null)
    )
  order by
    coalesce(category.catalog_sort_order, 0),
    category.name nulls last,
    coalesce(product.catalog_sort_order, 0),
    product.name,
    allowed.is_default desc,
    allowed.sort_order,
    coalesce(unit.symbol, presentation.symbol);
$$;

revoke all on function public.update_qb_customer_profile(text, text) from public, anon;
grant execute on function public.update_qb_customer_profile(text, text) to authenticated;

revoke all on function public.create_qb_catalog_order(uuid, text, jsonb, text) from public, anon;
grant execute on function public.create_qb_catalog_order(uuid, text, jsonb, text) to authenticated;

revoke all on function public.get_qb_public_catalog() from public;
grant execute on function public.get_qb_public_catalog() to anon, authenticated;

alter table public.qb_customer_locations enable row level security;
alter table public.qb_orders enable row level security;
alter table public.qb_order_items enable row level security;

drop policy if exists "QB customers and internal roles can view locations" on public.qb_customer_locations;
create policy "QB customers and internal roles can view locations"
  on public.qb_customer_locations for select
  using (
    customer_account_id = auth.uid()
    or public.current_user_role() in ('admin', 'administrador', 'inventario')
  );

drop policy if exists "QB customers can insert own locations" on public.qb_customer_locations;
create policy "QB customers can insert own locations"
  on public.qb_customer_locations for insert
  with check (customer_account_id = auth.uid());

drop policy if exists "QB customers can update own active locations" on public.qb_customer_locations;
create policy "QB customers can update own active locations"
  on public.qb_customer_locations for update
  using (customer_account_id = auth.uid())
  with check (customer_account_id = auth.uid());

drop policy if exists "QB customers and internal roles can view orders" on public.qb_orders;
create policy "QB customers and internal roles can view orders"
  on public.qb_orders for select
  using (
    customer_account_id = auth.uid()
    or public.current_user_role() in ('admin', 'administrador', 'inventario')
  );

drop policy if exists "QB customers and internal roles can view order items" on public.qb_order_items;
create policy "QB customers and internal roles can view order items"
  on public.qb_order_items for select
  using (
    exists (
      select 1
      from public.qb_orders orders
      where orders.id = order_id
        and (
          orders.customer_account_id = auth.uid()
          or public.current_user_role() in ('admin', 'administrador', 'inventario')
        )
    )
  );

-- Sin politicas directas de insert/update/delete para qb_orders ni qb_order_items:
-- la creacion de pedidos e items ocurre exclusivamente en create_qb_catalog_order().

commit;
