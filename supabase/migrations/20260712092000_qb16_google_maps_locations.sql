-- QB-16: ubicaciones visuales para clientes, sin alterar snapshots historicos.

alter table public.qb_customer_locations
  add column if not exists latitude numeric(10, 7),
  add column if not exists longitude numeric(10, 7),
  add column if not exists google_place_id text;

alter table public.qb_customer_locations
  drop constraint if exists qb_customer_locations_coordinates_check,
  add constraint qb_customer_locations_coordinates_check check (
    (latitude is null and longitude is null)
    or (
      latitude is not null
      and longitude is not null
      and latitude between -90 and 90
      and longitude between -180 and 180
    )
  ),
  drop constraint if exists qb_customer_locations_google_place_id_check,
  add constraint qb_customer_locations_google_place_id_check check (
    google_place_id is null or length(trim(google_place_id)) between 1 and 200
  ),
  drop constraint if exists qb_customer_locations_phone_check,
  add constraint qb_customer_locations_phone_check check (
    phone is null
    or (
      length(trim(phone)) between 7 and 25
      and phone ~ '^\+?[0-9() -]+$'
      and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 7 and 15
    )
  );

do $$
begin
  if exists (
    select 1
    from public.qb_customer_locations
    where is_active = true and is_primary = true
    group by customer_account_id
    having count(*) > 1
  ) then
    raise exception 'QB16_DUPLICATE_ACTIVE_PRIMARY_LOCATIONS';
  end if;
end;
$$;

create unique index if not exists qb_customer_locations_one_active_primary_idx
  on public.qb_customer_locations (customer_account_id)
  where is_active = true and is_primary = true;

comment on column public.qb_customer_locations.latitude is
  'QB-16: latitud opcional elegida por el cliente. Debe coexistir con longitude.';
comment on column public.qb_customer_locations.longitude is
  'QB-16: longitud opcional elegida por el cliente. Debe coexistir con latitude.';
comment on column public.qb_customer_locations.google_place_id is
  'QB-16: identificador opcional de Google Places; no reemplaza la direccion editable.';

-- QB-16 permite que el invitado confirme una direccion manual sin coordenadas.
-- Si existe una coordenada, ambas deben formar un par valido; un Place ID nunca
-- se conserva sin el punto que lo origino.
alter table public.qb_orders
  drop constraint if exists qb_orders_identity_by_mode_check,
  add constraint qb_orders_identity_by_mode_check check (
    order_mode not in ('registered', 'guest')
    or (
      order_mode = 'registered'
      and customer_account_id is not null
      and customer_location_id is not null
    )
    or (
      order_mode = 'guest'
      and customer_account_id is null
      and customer_location_id is null
      and jsonb_typeof(customer_snapshot) = 'object'
      and length(trim(coalesce(customer_snapshot ->> 'business_name', ''))) > 0
      and length(trim(coalesce(customer_snapshot ->> 'full_name', ''))) > 0
      and length(trim(coalesce(customer_snapshot ->> 'phone', ''))) > 0
      and jsonb_typeof(location_snapshot) = 'object'
      and length(trim(coalesce(location_snapshot ->> 'address', ''))) > 0
      and (
        (
          location_snapshot ->> 'latitude' is null
          and location_snapshot ->> 'longitude' is null
          and location_snapshot ->> 'google_place_id' is null
        )
        or (
          jsonb_typeof(location_snapshot -> 'latitude') = 'number'
          and (location_snapshot ->> 'latitude')::numeric between -90 and 90
          and jsonb_typeof(location_snapshot -> 'longitude') = 'number'
          and (location_snapshot ->> 'longitude')::numeric between -180 and 180
        )
      )
    )
  );

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
    or ((p_latitude is null) <> (p_longitude is null))
    or (p_latitude is not null and trim(p_latitude) !~ '^-?[0-9]+(\.[0-9]+)?$')
    or (p_longitude is not null and trim(p_longitude) !~ '^-?[0-9]+(\.[0-9]+)?$')
    or (p_latitude is null and v_google_place_id is not null) then
    result_code := 'invalid_location';
    return next;
    return;
  end if;

  if p_latitude is not null then
    v_latitude := trim(p_latitude)::numeric;
    v_longitude := trim(p_longitude)::numeric;

    if v_latitude < -90 or v_latitude > 90
      or v_longitude < -180 or v_longitude > 180 then
      result_code := 'invalid_location';
      return next;
      return;
    end if;
  else
    v_latitude := null;
    v_longitude := null;
    v_google_place_id := null;
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

create or replace function public.save_own_qb_customer_location(
  p_id uuid,
  p_label text,
  p_address text,
  p_reference text,
  p_phone text,
  p_latitude numeric,
  p_longitude numeric,
  p_google_place_id text,
  p_is_primary boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_label text := pg_catalog.btrim(pg_catalog.coalesce(p_label, ''));
  v_address text := pg_catalog.btrim(pg_catalog.coalesce(p_address, ''));
  v_reference text := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_reference, '')), '');
  v_phone text := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_phone, '')), '');
  v_place_id text := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_google_place_id, '')), '');
  v_existing_primary boolean := false;
  v_make_primary boolean;
  v_location_id uuid;
begin
  if v_user_id is null then
    raise exception 'QB16_UNAUTHENTICATED';
  end if;

  if not exists (
    select 1
    from public.customer_accounts account
    where account.id = v_user_id and account.is_active = true
  ) then
    raise exception 'QB16_CUSTOMER_UNAVAILABLE';
  end if;

  if pg_catalog.length(v_label) not between 2 and 80
    or pg_catalog.length(v_address) not between 5 and 300
    or (v_reference is not null and pg_catalog.length(v_reference) > 300)
    or (
      v_phone is not null
      and (
        pg_catalog.length(v_phone) not between 7 and 25
        or v_phone !~ '^\+?[0-9() -]+$'
        or pg_catalog.length(pg_catalog.regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 7 and 15
      )
    )
    or (v_place_id is not null and pg_catalog.length(v_place_id) > 200)
    or ((p_latitude is null) <> (p_longitude is null))
    or (p_latitude is not null and p_latitude not between -90 and 90)
    or (p_longitude is not null and p_longitude not between -180 and 180)
  then
    raise exception 'QB16_INVALID_LOCATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qb16-location:' || v_user_id::text, 0)
  );

  if p_id is not null then
    select location.is_primary
    into v_existing_primary
    from public.qb_customer_locations location
    where location.id = p_id
      and location.customer_account_id = v_user_id
      and location.is_active = true
    for update;

    if not found then
      raise exception 'QB16_LOCATION_NOT_FOUND';
    end if;
  end if;

  v_make_primary := pg_catalog.coalesce(p_is_primary, false)
    or v_existing_primary
    or not exists (
      select 1
      from public.qb_customer_locations location
      where location.customer_account_id = v_user_id
        and location.is_active = true
        and (p_id is null or location.id <> p_id)
    );

  if v_make_primary then
    update public.qb_customer_locations
    set is_primary = false
    where customer_account_id = v_user_id and is_primary = true;
  end if;

  if p_id is null then
    insert into public.qb_customer_locations (
      customer_account_id,
      label,
      address,
      reference,
      phone,
      latitude,
      longitude,
      google_place_id,
      is_primary
    ) values (
      v_user_id,
      v_label,
      v_address,
      v_reference,
      v_phone,
      p_latitude,
      p_longitude,
      v_place_id,
      v_make_primary
    )
    returning id into v_location_id;
  else
    update public.qb_customer_locations
    set label = v_label,
        address = v_address,
        reference = v_reference,
        phone = v_phone,
        latitude = p_latitude,
        longitude = p_longitude,
        google_place_id = v_place_id,
        is_primary = v_make_primary
    where id = p_id
      and customer_account_id = v_user_id
      and is_active = true
    returning id into v_location_id;
  end if;

  return v_location_id;
end;
$$;

create or replace function public.set_own_qb_customer_location_primary(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_count integer;
begin
  if v_user_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.customer_accounts account
    where account.id = v_user_id and account.is_active = true
  ) then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qb16-location:' || v_user_id::text, 0)
  );

  if not exists (
    select 1 from public.qb_customer_locations location
    where location.id = p_id
      and location.customer_account_id = v_user_id
      and location.is_active = true
  ) then
    return false;
  end if;

  update public.qb_customer_locations
  set is_primary = false
  where customer_account_id = v_user_id
    and is_active = true
    and is_primary = true;

  update public.qb_customer_locations
  set is_primary = true
  where id = p_id
    and customer_account_id = v_user_id
    and is_active = true;

  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception 'QB16_LOCATION_NOT_FOUND';
  end if;

  return true;
end;
$$;

create or replace function public.deactivate_own_qb_customer_location(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_was_primary boolean;
  v_replacement_id uuid;
begin
  if v_user_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.customer_accounts account
    where account.id = v_user_id and account.is_active = true
  ) then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('qb16-location:' || v_user_id::text, 0)
  );

  select location.is_primary
  into v_was_primary
  from public.qb_customer_locations location
  where location.id = p_id
    and location.customer_account_id = v_user_id
    and location.is_active = true
  for update;

  if not found then
    return false;
  end if;

  update public.qb_customer_locations
  set is_active = false, is_primary = false
  where id = p_id and customer_account_id = v_user_id;

  if v_was_primary then
    select location.id
    into v_replacement_id
    from public.qb_customer_locations location
    where location.customer_account_id = v_user_id
      and location.is_active = true
    order by location.sort_order, location.created_at, location.id
    limit 1
    for update;

    if v_replacement_id is not null then
      update public.qb_customer_locations
      set is_primary = true
      where id = v_replacement_id and customer_account_id = v_user_id;
    end if;
  end if;

  return true;
end;
$$;

create or replace function public.qb16_set_registered_location_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
declare
  v_location record;
begin
  if new.customer_location_id is null then
    return new;
  end if;

  select location.latitude, location.longitude, location.google_place_id
  into v_location
  from public.qb_customer_locations location
  where location.id = new.customer_location_id
    and location.customer_account_id = new.customer_account_id
    and location.is_active = true;

  if not found then
    raise exception 'QB16_INVALID_REGISTERED_LOCATION';
  end if;

  new.location_snapshot := (
    pg_catalog.coalesce(new.location_snapshot, '{}'::jsonb)
      - 'latitude'
      - 'longitude'
      - 'google_place_id'
    ) || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'latitude', v_location.latitude,
      'longitude', v_location.longitude,
      'google_place_id', v_location.google_place_id
    ));

  return new;
end;
$$;

drop trigger if exists qb16_registered_location_snapshot on public.qb_orders;
create trigger qb16_registered_location_snapshot
  before insert on public.qb_orders
  for each row execute function public.qb16_set_registered_location_snapshot();

revoke all on function public.save_own_qb_customer_location(uuid, text, text, text, text, numeric, numeric, text, boolean) from public, anon;
revoke all on function public.set_own_qb_customer_location_primary(uuid) from public, anon;
revoke all on function public.deactivate_own_qb_customer_location(uuid) from public, anon;

revoke insert, update, delete
on table public.qb_customer_locations
from anon, authenticated;

grant execute on function public.save_own_qb_customer_location(uuid, text, text, text, text, numeric, numeric, text, boolean) to authenticated;
grant execute on function public.set_own_qb_customer_location_primary(uuid) to authenticated;
grant execute on function public.deactivate_own_qb_customer_location(uuid) to authenticated;
