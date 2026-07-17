-- QB-OPS: creacion interna de pedidos registrados o invitados por administrador.
-- Reutiliza el contrato canonico de unidades, conversiones y snapshots de QB-5/QB-10.

begin;

create or replace function public.create_qb_internal_catalog_order(
  p_order_mode text,
  p_customer_account_id uuid,
  p_customer_location_id uuid,
  p_business_name text,
  p_full_name text,
  p_phone text,
  p_email text,
  p_address text,
  p_location_label text,
  p_location_reference text,
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
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_customer public.customer_accounts%rowtype;
  v_location public.qb_customer_locations%rowtype;
  v_existing public.qb_orders%rowtype;
  v_order_id uuid;
  v_reference text;
  v_customer_snapshot jsonb;
  v_location_snapshot jsonb;
  v_item jsonb;
  v_product record;
  v_allowed public.qb_product_allowed_units%rowtype;
  v_base_unit public.qb_units%rowtype;
  v_source_unit public.qb_units%rowtype;
  v_presentation public.qb_product_presentations%rowtype;
  v_quantity numeric(18, 6);
  v_base_quantity numeric(18, 6);
  v_factor numeric(18, 9);
  v_item_id uuid;
  v_snapshot_id uuid;
  v_sort_order integer := 0;
  v_seen_products uuid[] := '{}';
  v_product_id uuid;
  v_allowed_unit_id uuid;
  v_business_name text := trim(coalesce(p_business_name, ''));
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_address text := trim(coalesce(p_address, ''));
  v_location_label text := nullif(trim(coalesce(p_location_label, '')), '');
  v_location_reference text := nullif(trim(coalesce(p_location_reference, '')), '');
begin
  created_order_id := null;
  order_reference := null;
  result_code := 'invalid_request';

  if v_user_id is null then
    result_code := 'unauthenticated';
    return next;
    return;
  end if;

  select profile.role
  into v_user_role
  from public.profiles profile
  where profile.id = v_user_id
    and profile.is_active = true;

  if v_user_role is null or v_user_role not in ('admin', 'administrador') then
    result_code := 'forbidden';
    return next;
    return;
  end if;

  if p_order_mode not in ('registered', 'guest') then
    result_code := 'invalid_mode';
    return next;
    return;
  end if;

  if p_idempotency_key is null or p_idempotency_key !~ '^[0-9a-fA-F-]{32,64}$' then
    result_code := 'invalid_idempotency';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'qb-internal-order:' || v_user_id::text || ':' || p_idempotency_key,
    0
  ));

  if p_order_mode = 'registered' then
    select *
    into v_customer
    from public.customer_accounts customer
    where customer.id = p_customer_account_id
      and customer.is_active = true;

    if not found then
      result_code := 'invalid_customer';
      return next;
      return;
    end if;

    select *
    into v_location
    from public.qb_customer_locations location
    where location.id = p_customer_location_id
      and location.customer_account_id = v_customer.id
      and location.is_active = true;

    if not found then
      result_code := 'invalid_location';
      return next;
      return;
    end if;

    select *
    into v_existing
    from public.qb_orders orders
    where orders.order_mode = 'registered'
      and orders.customer_account_id = v_customer.id
      and orders.idempotency_key = p_idempotency_key
    limit 1;

    v_customer_snapshot := jsonb_build_object(
      'business_name', v_customer.business_name,
      'full_name', v_customer.responsible_name,
      'email', v_customer.email,
      'phone', v_customer.phone
    );
    v_location_snapshot := jsonb_build_object(
      'label', v_location.label,
      'address', v_location.address,
      'reference', v_location.reference,
      'phone', v_location.phone,
      'latitude', v_location.latitude,
      'longitude', v_location.longitude,
      'google_place_id', v_location.google_place_id
    );
  else
    if p_customer_account_id is not null or p_customer_location_id is not null then
      result_code := 'invalid_identity';
      return next;
      return;
    end if;

    if length(v_business_name) not between 2 and 120
      or length(v_full_name) not between 2 and 120
      or length(v_phone) not between 7 and 25
      or regexp_replace(v_phone, '[^0-9]', '', 'g') !~ '^[0-9]{7,15}$'
      or length(v_address) not between 5 and 300
      or (v_email is not null and (
        length(v_email) > 254
        or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      ))
      or (v_location_label is not null and length(v_location_label) not between 2 and 80)
      or (v_location_reference is not null and length(v_location_reference) > 300)
    then
      result_code := 'invalid_contact';
      return next;
      return;
    end if;

    select *
    into v_existing
    from public.qb_orders orders
    where orders.order_mode = 'guest'
      and orders.idempotency_key = p_idempotency_key
    limit 1;

    v_customer_snapshot := jsonb_build_object(
      'business_name', v_business_name,
      'full_name', v_full_name,
      'phone', v_phone,
      'email', v_email
    );
    v_location_snapshot := jsonb_build_object(
      'label', v_location_label,
      'address', v_address,
      'reference', v_location_reference
    );
  end if;

  if found then
    created_order_id := v_existing.id;
    order_reference := v_existing.public_reference;
    result_code := 'already_created';
    return next;
    return;
  end if;

  if p_customer_notes is not null and length(trim(p_customer_notes)) > 1000 then
    result_code := 'invalid_notes';
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

  -- Valida el pedido completo antes de crear la cabecera.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not coalesce((v_item ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
      or not coalesce((v_item ->> 'allowed_unit_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', false)
      or not coalesce((v_item ->> 'quantity') ~ '^[0-9]+(\.[0-9]+)?$', false)
      or length(trim(coalesce(v_item ->> 'notes', ''))) > 500
    then
      result_code := 'invalid_items';
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

    select product.id, settings.base_unit_id
    into v_product
    from public.products product
    join public.qb_product_unit_settings settings on settings.product_id = product.id
    where product.id = v_product_id
      and product.is_active = true
      and coalesce(product.is_sellable, true) = true
      and coalesce(product.is_qb_loss_product, false) = false
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

    if not found
      or (coalesce(v_allowed.min_quantity, 0) > 0 and v_quantity < v_allowed.min_quantity)
      or (
        coalesce(v_allowed.quantity_step, 0) > 0
        and abs(((v_quantity - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)) / v_allowed.quantity_step)
          - round((v_quantity - coalesce(v_allowed.min_quantity, v_allowed.quantity_step)) / v_allowed.quantity_step)) > 0.000001
      )
    then
      result_code := 'invalid_unit';
      return next;
      return;
    end if;

    if exists (
      select 1
      from public.qb_units unit
      where unit.id = v_allowed.unit_id
        and upper(trim(unit.symbol)) in ('BS', 'BS.')
    ) or exists (
      select 1
      from public.qb_product_presentations presentation
      where presentation.id = v_allowed.presentation_id
        and upper(trim(presentation.symbol)) in ('BS', 'BS.')
    ) then
      result_code := 'unsupported_amount_mode';
      return next;
      return;
    end if;
  end loop;

  v_reference := 'QB-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.qb_orders (
    public_reference,
    customer_account_id,
    customer_location_id,
    order_mode,
    customer_notes,
    customer_snapshot,
    location_snapshot,
    idempotency_key
  ) values (
    v_reference,
    case when p_order_mode = 'registered' then v_customer.id else null end,
    case when p_order_mode = 'registered' then v_location.id else null end,
    p_order_mode,
    nullif(trim(coalesce(p_customer_notes, '')), ''),
    v_customer_snapshot,
    v_location_snapshot,
    p_idempotency_key
  ) returning id into v_order_id;

  v_seen_products := '{}';
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sort_order := v_sort_order + 1;
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_allowed_unit_id := (v_item ->> 'allowed_unit_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;

    select product.id, settings.base_unit_id
    into v_product
    from public.products product
    join public.qb_product_unit_settings settings on settings.product_id = product.id
    where product.id = v_product_id;

    select * into v_allowed
    from public.qb_product_allowed_units allowed
    where allowed.id = v_allowed_unit_id;

    select * into v_base_unit
    from public.qb_units unit
    where unit.id = v_product.base_unit_id and unit.is_active = true;

    if v_allowed.unit_id is not null then
      select * into v_source_unit
      from public.qb_units unit
      where unit.id = v_allowed.unit_id
        and unit.is_active = true
        and unit.dimension_id = v_base_unit.dimension_id;

      v_factor := v_source_unit.conversion_factor_to_base / v_base_unit.conversion_factor_to_base;
      v_base_quantity := round(v_quantity * v_factor, 6);

      insert into public.qb_order_items (
        order_id, product_id, allowed_unit_id, source_kind, source_unit_id,
        source_label, requested_quantity, base_unit_id, base_unit_symbol,
        base_quantity, conversion_factor_to_base, customer_notes, sort_order
      ) values (
        v_order_id, v_product.id, v_allowed.id, 'universal_unit', v_source_unit.id,
        v_source_unit.symbol, v_quantity, v_base_unit.id, v_base_unit.symbol,
        v_base_quantity, v_factor, nullif(trim(coalesce(v_item ->> 'notes', '')), ''), v_sort_order
      ) returning id into v_item_id;

      insert into public.qb_conversion_snapshots (
        source_table, source_id, product_id, dimension_code, source_kind,
        source_unit_id, source_label, source_quantity, base_unit_id,
        base_unit_symbol, base_quantity, conversion_factor_to_base, snapshot, created_by
      ) values (
        'qb_order_items', v_item_id, v_product.id, 'pedido', 'universal_unit',
        v_source_unit.id, v_source_unit.symbol, v_quantity, v_base_unit.id,
        v_base_unit.symbol, v_base_quantity, v_factor,
        jsonb_build_object('allowed_unit_id', v_allowed.id, 'unit_name', v_source_unit.name),
        v_user_id
      ) returning id into v_snapshot_id;
    else
      select * into v_presentation
      from public.qb_product_presentations presentation
      where presentation.id = v_allowed.presentation_id
        and presentation.product_id = v_product.id
        and presentation.is_active = true
        and presentation.allow_order = true;

      v_factor := v_presentation.conversion_factor_to_base;
      v_base_quantity := round(v_quantity * v_factor, 6);

      insert into public.qb_order_items (
        order_id, product_id, allowed_unit_id, source_kind, product_presentation_id,
        source_label, requested_quantity, base_unit_id, base_unit_symbol,
        base_quantity, conversion_factor_to_base, customer_notes, sort_order
      ) values (
        v_order_id, v_product.id, v_allowed.id, 'product_presentation', v_presentation.id,
        v_presentation.symbol, v_quantity, v_base_unit.id, v_base_unit.symbol,
        v_base_quantity, v_factor, nullif(trim(coalesce(v_item ->> 'notes', '')), ''), v_sort_order
      ) returning id into v_item_id;

      insert into public.qb_conversion_snapshots (
        source_table, source_id, product_id, dimension_code, source_kind,
        product_presentation_id, source_label, source_quantity, base_unit_id,
        base_unit_symbol, base_quantity, conversion_factor_to_base, snapshot, created_by
      ) values (
        'qb_order_items', v_item_id, v_product.id, 'pedido', 'product_presentation',
        v_presentation.id, v_presentation.symbol, v_quantity, v_base_unit.id,
        v_base_unit.symbol, v_base_quantity, v_factor,
        jsonb_build_object('allowed_unit_id', v_allowed.id, 'presentation_name', v_presentation.name),
        v_user_id
      ) returning id into v_snapshot_id;
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

revoke all on function public.create_qb_internal_catalog_order(
  text, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, text
) from public, anon, authenticated;

grant execute on function public.create_qb_internal_catalog_order(
  text, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, text
) to authenticated;

comment on function public.create_qb_internal_catalog_order(
  text, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, text
) is 'Crea pedidos QB desde el area interna. Solo administrador; no mueve inventario ni registra pagos.';

commit;
