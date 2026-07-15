-- QB-11: backend server-only para pedidos invitados del catalogo QB.
-- No habilita INSERT directo, checkout visual, Auth, recibos ni movimientos de stock.

begin;

lock table public.qb_orders in share row exclusive mode;

do $preflight$
begin
  if exists (
    select 1
    from public.qb_orders
    where order_mode = 'guest'
  ) then
    raise exception
      'QB-11 preflight: existen pedidos guest sin vinculacion privada de idempotencia.';
  end if;
end
$preflight$;

create schema if not exists private;

create table private.qb_guest_order_rate_limits (
  id bigint generated always as identity primary key,
  request_fingerprint_hash text not null,
  phone_hash text not null,
  attempted_at timestamptz not null default now(),
  constraint qb_guest_order_rate_limits_fingerprint_check
    check (request_fingerprint_hash ~ '^[0-9a-f]{64}$'),
  constraint qb_guest_order_rate_limits_phone_check
    check (phone_hash ~ '^[0-9a-f]{64}$')
);

comment on table private.qb_guest_order_rate_limits is
  'QB-11: conserva solo hashes HMAC no reversibles. Limite: 5 intentos por huella o telefono en 15 minutos; retencion maxima operativa de 7 dias.';

create index qb_guest_order_rate_limits_fingerprint_idx
  on private.qb_guest_order_rate_limits (request_fingerprint_hash, attempted_at desc);

create index qb_guest_order_rate_limits_phone_idx
  on private.qb_guest_order_rate_limits (phone_hash, attempted_at desc);

create index qb_guest_order_rate_limits_attempted_at_idx
  on private.qb_guest_order_rate_limits (attempted_at);

alter table private.qb_guest_order_rate_limits enable row level security;
revoke all on table private.qb_guest_order_rate_limits
  from public, anon, authenticated, service_role;
revoke all on sequence private.qb_guest_order_rate_limits_id_seq
  from public, anon, authenticated, service_role;

create table private.qb_guest_order_idempotency (
  idempotency_key text primary key,
  request_payload_hash text not null,
  order_id uuid not null unique
    references public.qb_orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint qb_guest_order_idempotency_key_check
    check (idempotency_key ~ '^[0-9a-fA-F-]{32,64}$'),
  constraint qb_guest_order_idempotency_payload_hash_check
    check (request_payload_hash ~ '^[0-9a-f]{64}$')
);

comment on table private.qb_guest_order_idempotency is
  'QB-11: vincula una clave idempotente con el HMAC canonico del payload y su pedido guest; no conserva el payload en texto plano.';

alter table private.qb_guest_order_idempotency enable row level security;
revoke all on table private.qb_guest_order_idempotency
  from public, anon, authenticated, service_role;

create or replace function public.create_qb_guest_catalog_order(
  p_business_name text,
  p_full_name text,
  p_phone text,
  p_phone_normalized text,
  p_email text,
  p_address text,
  p_latitude text,
  p_longitude text,
  p_label text,
  p_reference text,
  p_google_place_id text,
  p_customer_notes text,
  p_items jsonb,
  p_idempotency_key text,
  p_request_payload_hash text,
  p_request_fingerprint_hash text,
  p_phone_hash text
)
returns table (
  created_order_id uuid,
  order_reference text,
  order_status text,
  order_created_at timestamptz,
  result_code text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, private
as $$
declare
  v_business_name text := trim(coalesce(p_business_name, ''));
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_phone_normalized text := trim(coalesce(p_phone_normalized, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_address text := trim(coalesce(p_address, ''));
  v_label text := nullif(trim(coalesce(p_label, '')), '');
  v_reference_note text := nullif(trim(coalesce(p_reference, '')), '');
  v_google_place_id text := nullif(trim(coalesce(p_google_place_id, '')), '');
  v_customer_notes text := nullif(trim(coalesce(p_customer_notes, '')), '');
  v_latitude numeric;
  v_longitude numeric;
  v_idempotency record;
  v_order_id uuid;
  v_reference text;
  v_created_status text;
  v_created_at timestamptz;
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
  v_product_id uuid;
  v_allowed_unit_id uuid;
  v_attempt_count integer;
  v_fingerprint_lock bigint;
  v_phone_lock bigint;
  v_first_rate_lock bigint;
  v_second_rate_lock bigint;
begin
  created_order_id := null;
  order_reference := null;
  order_status := null;
  order_created_at := null;
  result_code := 'invalid_request';

  if p_idempotency_key is null
    or p_idempotency_key !~ '^[0-9a-fA-F-]{32,64}$' then
    result_code := 'invalid_idempotency';
    return next;
    return;
  end if;

  if p_request_payload_hash is null
    or p_request_payload_hash !~ '^[0-9a-f]{64}$' then
    result_code := 'invalid_payload_hash';
    return next;
    return;
  end if;

  if p_request_fingerprint_hash is null
    or p_request_fingerprint_hash !~ '^[0-9a-f]{64}$'
    or p_phone_hash is null
    or p_phone_hash !~ '^[0-9a-f]{64}$' then
    result_code := 'invalid_request';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('qb-guest:' || p_idempotency_key, 0)
  );

  select
    idempotency.request_payload_hash,
    orders.id,
    orders.public_reference,
    orders.status,
    orders.created_at
  into v_idempotency
  from private.qb_guest_order_idempotency idempotency
  join public.qb_orders orders
    on orders.id = idempotency.order_id
   and orders.order_mode = 'guest'
  where idempotency.idempotency_key = p_idempotency_key;

  if found then
    if v_idempotency.request_payload_hash <> p_request_payload_hash then
      result_code := 'idempotency_conflict';
      return next;
      return;
    end if;

    created_order_id := v_idempotency.id;
    order_reference := v_idempotency.public_reference;
    order_status := v_idempotency.status;
    order_created_at := v_idempotency.created_at;
    result_code := 'already_created';
    return next;
    return;
  end if;

  v_fingerprint_lock := hashtextextended(
    'qb-guest-rate:' || p_request_fingerprint_hash,
    0
  );
  v_phone_lock := hashtextextended(
    'qb-guest-rate:' || p_phone_hash,
    0
  );
  v_first_rate_lock := least(v_fingerprint_lock, v_phone_lock);
  v_second_rate_lock := greatest(v_fingerprint_lock, v_phone_lock);

  perform pg_advisory_xact_lock(v_first_rate_lock);
  if v_second_rate_lock <> v_first_rate_lock then
    perform pg_advisory_xact_lock(v_second_rate_lock);
  end if;

  delete from private.qb_guest_order_rate_limits
  where attempted_at < now() - interval '7 days';

  select greatest(
    count(*) filter (
      where attempts.request_fingerprint_hash = p_request_fingerprint_hash
    ),
    count(*) filter (
      where attempts.phone_hash = p_phone_hash
    )
  )
  into v_attempt_count
  from private.qb_guest_order_rate_limits attempts
  where attempts.attempted_at >= now() - interval '15 minutes';

  if v_attempt_count >= 5 then
    result_code := 'rate_limited';
    return next;
    return;
  end if;

  insert into private.qb_guest_order_rate_limits (
    request_fingerprint_hash,
    phone_hash
  ) values (
    p_request_fingerprint_hash,
    p_phone_hash
  );

  if length(v_business_name) < 2 or length(v_business_name) > 120
    or length(v_full_name) < 2 or length(v_full_name) > 120
    or length(v_phone) < 7 or length(v_phone) > 25
    or v_phone_normalized !~ '^\+?[0-9]{7,15}$'
    or (v_email is not null and (
      length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )) then
    result_code := 'invalid_contact';
    return next;
    return;
  end if;

  if length(v_address) < 5 or length(v_address) > 300
    or (v_label is not null and length(v_label) > 80)
    or (v_label is not null and length(v_label) < 2)
    or (v_reference_note is not null and length(v_reference_note) > 300)
    or (v_google_place_id is not null and length(v_google_place_id) > 200)
    or p_latitude is null
    or trim(p_latitude) !~ '^-?[0-9]+(\.[0-9]+)?$'
    or p_longitude is null
    or trim(p_longitude) !~ '^-?[0-9]+(\.[0-9]+)?$' then
    result_code := 'invalid_location';
    return next;
    return;
  end if;

  v_latitude := trim(p_latitude)::numeric;
  v_longitude := trim(p_longitude)::numeric;

  if v_latitude < -90 or v_latitude > 90
    or v_longitude < -180 or v_longitude > 180 then
    result_code := 'invalid_location';
    return next;
    return;
  end if;

  if v_customer_notes is not null and length(v_customer_notes) > 1000 then
    result_code := 'invalid_notes';
    return next;
    return;
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0 then
    result_code := 'empty_cart';
    return next;
    return;
  end if;

  if jsonb_array_length(p_items) > 30 then
    result_code := 'too_many_items';
    return next;
    return;
  end if;

  -- Primera pasada: valida el pedido completo antes de crear su cabecera.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not coalesce((v_item ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
      or not coalesce((v_item ->> 'allowed_unit_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false) then
      result_code := 'invalid_items';
      return next;
      return;
    end if;

    if not coalesce((v_item ->> 'quantity') ~ '^[0-9]+(\.[0-9]+)?$', false) then
      result_code := 'invalid_quantity';
      return next;
      return;
    end if;

    v_product_id := (v_item ->> 'product_id')::uuid;
    v_allowed_unit_id := (v_item ->> 'allowed_unit_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;

    if v_quantity <= 0 or v_quantity > 10000
      or abs(v_quantity * 1000 - round(v_quantity * 1000)) > 0.000001 then
      result_code := 'invalid_quantity';
      return next;
      return;
    end if;

    if length(trim(coalesce(v_item ->> 'notes', ''))) > 500 then
      result_code := 'invalid_items';
      return next;
      return;
    end if;

    select
      product.id,
      settings.base_unit_id
    into v_product
    from public.products product
    join public.qb_product_unit_settings settings
      on settings.product_id = product.id
    where product.id = v_product_id
      and product.is_active = true
      and coalesce(product.is_sellable, true) = true
      and settings.is_qb_active = true
      and settings.is_visible_in_qb_catalog = true;

    if not found then
      result_code := 'product_unavailable';
      return next;
      return;
    end if;

    if v_product.id = any(v_seen_products) then
      result_code := 'duplicate_product';
      return next;
      return;
    end if;

    v_seen_products := array_append(v_seen_products, v_product.id);

    select *
    into v_allowed
    from public.qb_product_allowed_units allowed
    where allowed.id = v_allowed_unit_id
      and allowed.product_id = v_product.id
      and allowed.usage_context = 'pedido'
      and allowed.is_active = true;

    if not found then
      result_code := 'unit_unavailable';
      return next;
      return;
    end if;

    if coalesce(v_allowed.min_quantity, 0) > 0
      and v_quantity < v_allowed.min_quantity then
      result_code := 'invalid_quantity';
      return next;
      return;
    end if;

    if coalesce(v_allowed.quantity_step, 0) > 0
      and abs(((v_quantity - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)) / v_allowed.quantity_step)
        - round((v_quantity - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)) / v_allowed.quantity_step)) > 0.000001 then
      result_code := 'invalid_quantity';
      return next;
      return;
    end if;

    select *
    into v_base_unit
    from public.qb_units unit
    where unit.id = v_product.base_unit_id
      and unit.is_active = true;

    if not found then
      result_code := 'unit_unavailable';
      return next;
      return;
    end if;

    if v_allowed.unit_id is not null then
      select *
      into v_source_unit
      from public.qb_units unit
      where unit.id = v_allowed.unit_id
        and unit.is_active = true
        and unit.dimension_id = v_base_unit.dimension_id;

      if not found then
        result_code := 'unit_unavailable';
        return next;
        return;
      end if;
    else
      select *
      into v_presentation
      from public.qb_product_presentations presentation
      where presentation.id = v_allowed.presentation_id
        and presentation.product_id = v_product.id
        and presentation.is_active = true
        and presentation.allow_order = true;

      if not found then
        result_code := 'unit_unavailable';
        return next;
        return;
      end if;
    end if;
  end loop;

  v_reference := 'QB-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.qb_orders (
    public_reference,
    order_mode,
    customer_account_id,
    customer_location_id,
    customer_notes,
    customer_snapshot,
    location_snapshot,
    idempotency_key
  ) values (
    v_reference,
    'guest',
    null,
    null,
    v_customer_notes,
    jsonb_build_object(
      'business_name', v_business_name,
      'full_name', v_full_name,
      'phone', v_phone,
      'phone_normalized', v_phone_normalized,
      'email', v_email
    ),
    jsonb_build_object(
      'label', v_label,
      'address', v_address,
      'latitude', v_latitude,
      'longitude', v_longitude,
      'google_place_id', v_google_place_id,
      'reference', v_reference_note
    ),
    p_idempotency_key
  )
  returning id, status, created_at
  into v_order_id, v_created_status, v_created_at;

  -- Segunda pasada: crea lineas y snapshots con las conversiones ya validadas.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_allowed_unit_id := (v_item ->> 'allowed_unit_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;

    select product.id, settings.base_unit_id
    into strict v_product
    from public.products product
    join public.qb_product_unit_settings settings
      on settings.product_id = product.id
    where product.id = v_product_id
      and product.is_active = true
      and coalesce(product.is_sellable, true) = true
      and settings.is_qb_active = true
      and settings.is_visible_in_qb_catalog = true;

    select *
    into strict v_allowed
    from public.qb_product_allowed_units allowed
    where allowed.id = v_allowed_unit_id
      and allowed.product_id = v_product.id
      and allowed.usage_context = 'pedido'
      and allowed.is_active = true;

    select *
    into strict v_base_unit
    from public.qb_units unit
    where unit.id = v_product.base_unit_id
      and unit.is_active = true;

    if v_allowed.unit_id is not null then
      select *
      into strict v_source_unit
      from public.qb_units unit
      where unit.id = v_allowed.unit_id
        and unit.is_active = true
        and unit.dimension_id = v_base_unit.dimension_id;

      v_factor := v_source_unit.conversion_factor_to_base /
        v_base_unit.conversion_factor_to_base;
      v_base_quantity := round(v_quantity * v_factor, 6);

      insert into public.qb_order_items (
        order_id, product_id, allowed_unit_id, source_kind,
        source_unit_id, source_label, requested_quantity,
        base_unit_id, base_unit_symbol, base_quantity,
        conversion_factor_to_base, customer_notes, sort_order
      ) values (
        v_order_id, v_product.id, v_allowed.id, 'universal_unit',
        v_source_unit.id, v_source_unit.symbol, v_quantity,
        v_base_unit.id, v_base_unit.symbol, v_base_quantity,
        v_factor, nullif(trim(coalesce(v_item ->> 'notes', '')), ''), v_sort_order
      )
      returning id into v_item_id;

      insert into public.qb_conversion_snapshots (
        source_table, source_id, product_id, dimension_code,
        source_kind, source_unit_id, source_label, source_quantity,
        base_unit_id, base_unit_symbol, base_quantity,
        conversion_factor_to_base, snapshot, created_by
      ) values (
        'qb_order_items', v_item_id, v_product.id, 'pedido',
        'universal_unit', v_source_unit.id, v_source_unit.symbol, v_quantity,
        v_base_unit.id, v_base_unit.symbol, v_base_quantity,
        v_factor,
        jsonb_build_object('allowed_unit_id', v_allowed.id, 'unit_name', v_source_unit.name),
        null
      )
      returning id into v_snapshot_id;
    else
      select *
      into strict v_presentation
      from public.qb_product_presentations presentation
      where presentation.id = v_allowed.presentation_id
        and presentation.product_id = v_product.id
        and presentation.is_active = true
        and presentation.allow_order = true;

      v_factor := v_presentation.conversion_factor_to_base;
      v_base_quantity := round(v_quantity * v_factor, 6);

      insert into public.qb_order_items (
        order_id, product_id, allowed_unit_id, source_kind,
        product_presentation_id, source_label, requested_quantity,
        base_unit_id, base_unit_symbol, base_quantity,
        conversion_factor_to_base, customer_notes, sort_order
      ) values (
        v_order_id, v_product.id, v_allowed.id, 'product_presentation',
        v_presentation.id, v_presentation.symbol, v_quantity,
        v_base_unit.id, v_base_unit.symbol, v_base_quantity,
        v_factor, nullif(trim(coalesce(v_item ->> 'notes', '')), ''), v_sort_order
      )
      returning id into v_item_id;

      insert into public.qb_conversion_snapshots (
        source_table, source_id, product_id, dimension_code,
        source_kind, product_presentation_id, source_label, source_quantity,
        base_unit_id, base_unit_symbol, base_quantity,
        conversion_factor_to_base, snapshot, created_by
      ) values (
        'qb_order_items', v_item_id, v_product.id, 'pedido',
        'product_presentation', v_presentation.id, v_presentation.symbol, v_quantity,
        v_base_unit.id, v_base_unit.symbol, v_base_quantity,
        v_factor,
        jsonb_build_object('allowed_unit_id', v_allowed.id, 'presentation_name', v_presentation.name),
        null
      )
      returning id into v_snapshot_id;
    end if;

    update public.qb_order_items
    set conversion_snapshot_id = v_snapshot_id
    where id = v_item_id;
  end loop;

  insert into private.qb_guest_order_idempotency (
    idempotency_key,
    request_payload_hash,
    order_id
  ) values (
    p_idempotency_key,
    p_request_payload_hash,
    v_order_id
  );

  created_order_id := v_order_id;
  order_reference := v_reference;
  order_status := v_created_status;
  order_created_at := v_created_at;
  result_code := 'created';
  return next;
end;
$$;

comment on function public.create_qb_guest_catalog_order(
  text, text, text, text, text, text, text, text,
  text, text, text, text, jsonb, text, text, text, text
) is
  'QB-11: crea atomicamente un pedido guest sin cuenta, ubicacion persistente, precio, recibo ni movimiento de stock. Solo service_role puede ejecutarla.';

revoke all on function public.create_qb_guest_catalog_order(
  text, text, text, text, text, text, text, text,
  text, text, text, text, jsonb, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.create_qb_guest_catalog_order(
  text, text, text, text, text, text, text, text,
  text, text, text, text, jsonb, text, text, text, text
) to service_role;

commit;
