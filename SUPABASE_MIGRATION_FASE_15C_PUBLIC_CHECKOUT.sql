-- Fase 15C - Checkout invitado seguro y pedidos publicos controlados
-- PENDIENTE DE APLICAR EN SUPABASE STAGING DESPUES DE FASE 15B.
-- No ejecutar en produccion sin backup y validacion completa en staging.

begin;

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
      -- Estados vigentes propuestos para el flujo publico.
      'borrador',
      'pendiente_revision',
      'en_preparacion',
      'listo_para_confirmar',
      'confirmado_cliente',
      'entregado',
      'cancelado',
      -- Estados heredados de Fase 13, conservados por compatibilidad.
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

  -- Serializa reintentos y solicitudes concurrentes de la misma fuente.
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

  -- Primera pasada: valida todo y calcula con precios confiables de la base.
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

  -- Segunda pasada: las filas siguen bloqueadas y se guardan snapshots.
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

commit;
