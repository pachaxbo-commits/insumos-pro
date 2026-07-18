-- QB-17: pedidos por importe objetivo en bolivianos sin modelar BS como unidad fisica.

begin;

alter table public.qb_product_unit_settings
  add column if not exists supports_amount_bs boolean not null default false;

comment on column public.qb_product_unit_settings.supports_amount_bs is
  'QB-17: la fuente comercial admite solicitar este producto por importe. La disponibilidad efectiva exige precio y unidad fisica validos.';

with source_bs(category_name, product_name) as (
  values
    ('FRUTAS FRESCAS', 'MANZANA ROJA'),
    ('FRUTAS FRESCAS', 'MANZANA ROJA CRIOLLA'),
    ('FRUTAS FRESCAS', 'MANZANA VERDE'),
    ('FRUTAS FRESCAS', 'PAPAYA'),
    ('VERDURAS', 'ACHOJCHA'),
    ('VERDURAS', 'AJI UCHU'),
    ('VERDURAS', 'AJI UCHU ROJO'),
    ('VERDURAS', 'AJI UCHU ROJO AMARILLO'),
    ('VERDURAS', 'AJI FRESCO AMARILLO PER'),
    ('VERDURAS', 'AJO EN DIENTE'),
    ('VERDURAS', 'AJO PELADO'),
    ('VERDURAS', 'ARVEJA'),
    ('VERDURAS', 'ARVEJA PELADA'),
    ('VERDURAS', 'CEBOLLA VERDE'),
    ('VERDURAS', 'ESPINACA'),
    ('VERDURAS', 'HABA'),
    ('VERDURAS', 'FLOR DE JAMAICA FRESCA'),
    ('VERDURAS', 'NABO'),
    ('VERDURAS', 'PAPA LISA'),
    ('VERDURAS', 'RABANO'),
    ('VERDURAS', 'REMOLACHA'),
    ('VERDURAS', 'VAINITA ESCABECHE'),
    ('VERDURAS', 'VAINITA'),
    ('ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', 'SULTANA'),
    ('ABARROTES (GRANOS, AZÚCAR Y FRUTOS SECOS)', 'CIRUELA PASA'),
    ('CONDIMENTOS, ESPECIAS Y ADITIVOS', 'AJI COLORANTE AMARILLO'),
    ('CONDIMENTOS, ESPECIAS Y ADITIVOS', 'ANÍS'),
    ('CONDIMENTOS, ESPECIAS Y ADITIVOS', 'CANELA RAMA'),
    ('CONDIMENTOS, ESPECIAS Y ADITIVOS', 'CLAVO DE OLOR'),
    ('CONDIMENTOS, ESPECIAS Y ADITIVOS', 'LAUREL'),
    ('CONDIMENTOS, ESPECIAS Y ADITIVOS', 'NUEZ MOSCADA POLVO')
)
update public.qb_product_unit_settings settings
set supports_amount_bs = true,
    updated_at = pg_catalog.now()
from public.products product
join public.product_categories category on category.id = product.category_id
join source_bs source
  on source.category_name = category.name
 and source.product_name = product.name
where settings.product_id = product.id;

alter table public.qb_order_items
  add column if not exists order_input_mode text not null default 'quantity',
  add column if not exists requested_amount_bs numeric(18, 2),
  add column if not exists estimated_requested_quantity numeric(18, 3),
  add column if not exists estimated_base_quantity numeric(18, 6);

alter table public.qb_order_items
  drop constraint if exists qb_order_items_qb17_input_check;

alter table public.qb_order_items
  add constraint qb_order_items_qb17_input_check check (
    (
      order_input_mode = 'quantity'
      and requested_amount_bs is null
      and estimated_requested_quantity is null
      and estimated_base_quantity is null
    )
    or
    (
      order_input_mode = 'amount_bs'
      and requested_amount_bs > 0
      and estimated_requested_quantity > 0
      and estimated_base_quantity > 0
      and requested_quantity = estimated_requested_quantity
      and base_quantity = estimated_base_quantity
    )
  );

comment on column public.qb_order_items.order_input_mode is
  'QB-17: quantity conserva el pedido fisico; amount_bs conserva una intencion monetaria convertida por el servidor.';
comment on column public.qb_order_items.requested_amount_bs is
  'QB-17: importe BOB original solicitado por el cliente; nunca se utiliza como cantidad de inventario.';
comment on column public.qb_order_items.estimated_requested_quantity is
  'QB-17: cantidad fisica estimada en la unidad interna de precio, redondeada a 3 decimales.';
comment on column public.qb_order_items.estimated_base_quantity is
  'QB-17: cantidad fisica estimada en unidad base, redondeada a 6 decimales.';

create table if not exists private.qb_order_amount_snapshots (
  order_item_id uuid primary key references public.qb_order_items(id) on delete restrict,
  pricing_unit_id uuid not null references public.qb_units(id) on delete restrict,
  price_base_snapshot numeric(18, 4) not null,
  conversion_factor_snapshot numeric(18, 9) not null,
  rounding_policy_snapshot text not null,
  currency_snapshot text not null,
  calculation_version text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint qb_order_amount_snapshots_price_check check (price_base_snapshot > 0),
  constraint qb_order_amount_snapshots_factor_check check (conversion_factor_snapshot > 0),
  constraint qb_order_amount_snapshots_rounding_check check (
    rounding_policy_snapshot = 'round_half_away_from_zero_pricing_3_base_6'
  ),
  constraint qb_order_amount_snapshots_currency_check check (currency_snapshot = 'BOB'),
  constraint qb_order_amount_snapshots_version_check check (calculation_version = 'qb17-v1')
);

comment on table private.qb_order_amount_snapshots is
  'QB-17: precio y conversion internos e inmutables para lineas solicitadas por importe; no se exponen al catalogo publico.';

revoke all on table private.qb_order_amount_snapshots from public, anon, authenticated;

create or replace function private.prepare_qb17_order_items(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_item jsonb;
  v_mode text;
  v_product_id uuid;
  v_amount numeric(18, 2);
  v_price numeric(18, 4);
  v_pricing_unit_id uuid;
  v_pricing_factor numeric(18, 9);
  v_base_factor numeric(18, 9);
  v_allowed_unit_id uuid;
  v_estimated_quantity numeric(18, 3);
  v_estimated_base numeric(18, 6);
  v_normalized jsonb := '[]'::jsonb;
  v_amounts jsonb := '[]'::jsonb;
begin
  if p_items is null
    or pg_catalog.jsonb_typeof(p_items) <> 'array'
    or pg_catalog.jsonb_array_length(p_items) = 0
    or pg_catalog.jsonb_array_length(p_items) > 30 then
    raise exception 'QB17_INVALID_ITEMS';
  end if;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_items)
  loop
    v_mode := coalesce(nullif(v_item ->> 'input_mode', ''), 'quantity');

    if v_mode = 'quantity' then
      v_normalized := v_normalized || pg_catalog.jsonb_build_array(
        (v_item - 'input_mode' - 'requested_amount_bs'
          - 'price_base_snapshot' - 'conversion_factor_snapshot'
          - 'estimated_requested_quantity' - 'estimated_base_quantity')
      );
      continue;
    end if;

    if v_mode <> 'amount_bs' then
      raise exception 'QB17_INVALID_INPUT_MODE';
    end if;

    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_amount := (v_item ->> 'requested_amount_bs')::numeric;
    exception when others then
      raise exception 'QB17_INVALID_AMOUNT';
    end;

    if v_amount is null or v_amount <= 0 or v_amount > 1000000 or pg_catalog.round(v_amount, 2) <> v_amount then
      raise exception 'QB17_INVALID_AMOUNT';
    end if;

    select
      settings.base_sale_price,
      settings.base_price_unit_id,
      pricing_unit.conversion_factor_to_base,
      base_unit.conversion_factor_to_base,
      allowed.id
    into
      v_price,
      v_pricing_unit_id,
      v_pricing_factor,
      v_base_factor,
      v_allowed_unit_id
    from public.products product
    join public.qb_product_unit_settings settings on settings.product_id = product.id
    join public.qb_units pricing_unit
      on pricing_unit.id = settings.base_price_unit_id
     and pricing_unit.is_active = true
    join public.qb_units base_unit
      on base_unit.id = settings.base_unit_id
     and base_unit.dimension_id = pricing_unit.dimension_id
     and base_unit.is_active = true
    join public.qb_product_allowed_units allowed
      on allowed.product_id = product.id
     and allowed.usage_context = 'pedido'
     and allowed.unit_id = pricing_unit.id
     and allowed.is_active = true
    where product.id = v_product_id
      and product.is_active = true
      and coalesce(product.is_sellable, true) = true
      and settings.is_qb_active = true
      and settings.is_visible_in_qb_catalog = true
      and settings.supports_amount_bs = true
      and settings.base_sale_price > 0
    order by allowed.is_default desc, allowed.sort_order, allowed.id
    limit 1;

    if not found then
      raise exception 'QB17_AMOUNT_UNAVAILABLE';
    end if;

    v_estimated_quantity := pg_catalog.round(v_amount / v_price, 3);
    v_estimated_base := pg_catalog.round(
      v_estimated_quantity * (v_pricing_factor / v_base_factor),
      6
    );

    if v_estimated_quantity <= 0 or v_estimated_base <= 0 or v_estimated_quantity > 10000 then
      raise exception 'QB17_AMOUNT_TOO_SMALL_OR_LARGE';
    end if;

    v_normalized := v_normalized || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id', v_product_id,
        'allowed_unit_id', v_allowed_unit_id,
        'quantity', v_estimated_quantity,
        'notes', nullif(pg_catalog.btrim(coalesce(v_item ->> 'notes', '')), '')
      )
    );

    v_amounts := v_amounts || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id', v_product_id,
        'requested_amount_bs', v_amount,
        'pricing_unit_id', v_pricing_unit_id,
        'price_base_snapshot', v_price,
        'conversion_factor_snapshot', v_pricing_factor / v_base_factor,
        'estimated_requested_quantity', v_estimated_quantity,
        'estimated_base_quantity', v_estimated_base
      )
    );
  end loop;

  return pg_catalog.jsonb_build_object('items', v_normalized, 'amounts', v_amounts);
end;
$$;

create or replace function private.apply_qb17_amount_snapshots(
  p_order_id uuid,
  p_amounts jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_expected integer := coalesce(pg_catalog.jsonb_array_length(p_amounts), 0);
  v_updated integer;
begin
  if v_expected = 0 then
    return;
  end if;

  with amount as (
    select *
    from pg_catalog.jsonb_to_recordset(p_amounts) as value(
      product_id uuid,
      requested_amount_bs numeric,
      pricing_unit_id uuid,
      price_base_snapshot numeric,
      conversion_factor_snapshot numeric,
      estimated_requested_quantity numeric,
      estimated_base_quantity numeric
    )
  )
  update public.qb_order_items item
  set order_input_mode = 'amount_bs',
      requested_amount_bs = amount.requested_amount_bs,
      estimated_requested_quantity = amount.estimated_requested_quantity,
      estimated_base_quantity = amount.estimated_base_quantity
  from amount
  where item.order_id = p_order_id
    and item.product_id = amount.product_id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'QB17_SNAPSHOT_ITEM_MISMATCH';
  end if;

  insert into private.qb_order_amount_snapshots (
    order_item_id,
    pricing_unit_id,
    price_base_snapshot,
    conversion_factor_snapshot,
    rounding_policy_snapshot,
    currency_snapshot,
    calculation_version
  )
  select
    item.id,
    amount.pricing_unit_id,
    amount.price_base_snapshot,
    amount.conversion_factor_snapshot,
    'round_half_away_from_zero_pricing_3_base_6',
    'BOB',
    'qb17-v1'
  from pg_catalog.jsonb_to_recordset(p_amounts) as amount(
    product_id uuid,
    requested_amount_bs numeric,
    pricing_unit_id uuid,
    price_base_snapshot numeric,
    conversion_factor_snapshot numeric,
    estimated_requested_quantity numeric,
    estimated_base_quantity numeric
  )
  join public.qb_order_items item
    on item.order_id = p_order_id
   and item.product_id = amount.product_id;
end;
$$;

revoke all on function private.prepare_qb17_order_items(jsonb) from public, anon, authenticated;
revoke all on function private.apply_qb17_amount_snapshots(uuid, jsonb) from public, anon, authenticated;

create or replace function public.create_qb17_catalog_order(
  p_location_id uuid,
  p_customer_notes text,
  p_items jsonb,
  p_idempotency_key text
)
returns table (created_order_id uuid, order_reference text, result_code text)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_prepared jsonb;
  v_result record;
begin
  v_prepared := private.prepare_qb17_order_items(p_items);

  select * into v_result
  from public.create_qb_catalog_order(
    p_location_id,
    p_customer_notes,
    v_prepared -> 'items',
    p_idempotency_key
  );

  if v_result.result_code = 'created' then
    perform private.apply_qb17_amount_snapshots(v_result.created_order_id, v_prepared -> 'amounts');
  end if;

  return query select v_result.created_order_id, v_result.order_reference, v_result.result_code;
end;
$$;

create or replace function public.create_qb17_guest_catalog_order(
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
  v_prepared jsonb;
  v_result record;
begin
  v_prepared := private.prepare_qb17_order_items(p_items);

  select * into v_result
  from public.create_qb_guest_catalog_order(
    p_business_name,
    p_full_name,
    p_phone,
    p_phone_normalized,
    p_email,
    p_address,
    p_latitude,
    p_longitude,
    p_label,
    p_reference,
    p_google_place_id,
    p_customer_notes,
    v_prepared -> 'items',
    p_idempotency_key,
    p_request_payload_hash,
    p_request_fingerprint_hash,
    p_phone_hash
  );

  if v_result.result_code = 'created' then
    perform private.apply_qb17_amount_snapshots(v_result.created_order_id, v_prepared -> 'amounts');
  end if;

  return query
  select
    v_result.created_order_id,
    v_result.order_reference,
    v_result.order_status,
    v_result.order_created_at,
    v_result.result_code;
end;
$$;

create or replace function public.create_qb17_internal_catalog_order(
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
returns table (created_order_id uuid, order_reference text, result_code text)
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_prepared jsonb;
  v_result record;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_active = true
      and profile.role in ('admin', 'administrador')
  ) then
    raise exception 'QB17_INTERNAL_ROLE_REQUIRED';
  end if;

  v_prepared := private.prepare_qb17_order_items(p_items);

  select * into v_result
  from public.create_qb_internal_catalog_order(
    p_order_mode,
    p_customer_account_id,
    p_customer_location_id,
    p_business_name,
    p_full_name,
    p_phone,
    p_email,
    p_address,
    p_location_label,
    p_location_reference,
    p_customer_notes,
    v_prepared -> 'items',
    p_idempotency_key
  );

  if v_result.result_code = 'created' then
    perform private.apply_qb17_amount_snapshots(v_result.created_order_id, v_prepared -> 'amounts');
  end if;

  return query select v_result.created_order_id, v_result.order_reference, v_result.result_code;
end;
$$;

create or replace function public.get_qb17_public_catalog()
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
  allowed_sort_order integer,
  amount_bs_available boolean
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    catalog.*,
    (
      settings.supports_amount_bs
      and coalesce(settings.base_sale_price > 0, false)
      and exists (
        select 1
        from public.qb_product_allowed_units pricing_allowed
        where pricing_allowed.product_id = catalog.product_id
          and pricing_allowed.usage_context = 'pedido'
          and pricing_allowed.unit_id = settings.base_price_unit_id
          and pricing_allowed.is_active = true
      )
    ) as amount_bs_available
  from public.get_qb_public_catalog() catalog
  join public.qb_product_unit_settings settings on settings.product_id = catalog.product_id;
$$;

revoke all on function public.create_qb17_catalog_order(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_qb17_catalog_order(uuid, text, jsonb, text) to authenticated;

revoke all on function public.create_qb17_guest_catalog_order(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_qb17_guest_catalog_order(
  text, text, text, text, text, text, text, text, text, text, text, text, jsonb, text, text, text, text
) to service_role;

revoke all on function public.create_qb17_internal_catalog_order(
  text, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.create_qb17_internal_catalog_order(
  text, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, text
) to authenticated;

revoke all on function public.get_qb17_public_catalog() from public, anon, authenticated;
grant execute on function public.get_qb17_public_catalog() to anon, authenticated;

commit;
