begin;

create table if not exists private.qb_internal_order_requests (
  request_key text primary key,
  actor_id uuid not null,
  request_hash bytea not null,
  order_ids uuid[] not null default '{}'
);
alter table private.qb_internal_order_requests enable row level security;
revoke all on private.qb_internal_order_requests from public, anon, authenticated;

create index if not exists qb_orders_idempotency_lower_idx
  on public.qb_orders (lower(idempotency_key));

-- Keep the installed physical-order writer and remove its direct API access.
do $$
begin
  if to_regprocedure('private.insert_qb_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)') is null then
    alter function public.create_qb_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)
      set schema private;
    alter function private.create_qb_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)
      rename to insert_qb_internal_catalog_order;
  end if;
end;
$$;

revoke all on function private.insert_qb_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)
  from public, anon, authenticated, service_role;

create or replace function private.create_qb_internal_order_once(
  p_order_mode text, p_customer_account_id uuid, p_customer_location_id uuid,
  p_business_name text, p_full_name text, p_phone text, p_email text, p_address text,
  p_location_label text, p_location_reference text, p_customer_notes text,
  p_operational_date date, p_items jsonb, p_idempotency_key text, p_entry text
)
returns table (created_order_id uuid, order_reference text, result_code text)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  actor uuid := auth.uid();
  actor_role text := public.current_user_role();
  request_id text := lower(p_idempotency_key);
  request_hash bytea;
  saved private.qb_internal_order_requests%rowtype;
  parts integer;
  items_count integer;
  batch_items jsonb;
  prepared jsonb;
  result record;
  created_ids uuid[] := '{}';
  child_key text;
  position_in_day integer;
begin
  if actor is null or actor_role is null or actor_role not in ('admin','administrador','supervisor') then
    return query select null::uuid, null::text, case when actor is null then 'unauthenticated' else 'forbidden' end;
    return;
  end if;

  if request_id is null or request_id !~ '^[0-9a-f-]{32,64}$' then
    return query select null::uuid, null::text, 'invalid_idempotency'::text;
    return;
  end if;

  -- JSONB canonicalizes object keys. Normalize decimal spelling and trim fields
  -- whose whitespace is discarded by the writer. Array order is significant.
  select sha256(convert_to(jsonb_build_array(
    p_entry, p_operational_date, p_order_mode, p_customer_account_id, p_customer_location_id,
    nullif(trim(p_business_name), ''), nullif(trim(p_full_name), ''), nullif(trim(p_phone), ''),
    nullif(lower(trim(p_email)), ''), nullif(trim(p_address), ''), nullif(trim(p_location_label), ''),
    nullif(trim(p_location_reference), ''), nullif(trim(p_customer_notes), ''),
    case when jsonb_typeof(p_items) = 'array' then (
      select jsonb_agg(
        case when jsonb_typeof(item) <> 'object' then item else
          (item - 'quantity' - 'requested_amount_bs' - 'notes' - 'input_mode') ||
          jsonb_build_object(
            'quantity', case when item->>'quantity' ~ '^[0-9]{1,20}(\.[0-9]{1,20})?$'
              then trim_scale((item->>'quantity')::numeric)::text else item->>'quantity' end,
            'requested_amount_bs', case when item->>'requested_amount_bs' ~ '^[0-9]{1,20}(\.[0-9]{1,20})?$'
              then trim_scale((item->>'requested_amount_bs')::numeric)::text else item->>'requested_amount_bs' end,
            'notes', nullif(trim(item->>'notes'), ''),
            'input_mode', coalesce(nullif(item->>'input_mode', ''), 'quantity')
          )
        end order by ordinal)
      from jsonb_array_elements(p_items) with ordinality as lines(item, ordinal)
    ) else p_items end
  )::text, 'UTF8')) into request_hash;

  insert into private.qb_internal_order_requests as requests (request_key, actor_id, request_hash)
  values (request_id, actor, request_hash) on conflict do nothing;

  select * into strict saved from private.qb_internal_order_requests as requests
  where requests.request_key = request_id for update;

  if saved.actor_id is distinct from actor or saved.request_hash is distinct from request_hash then
    raise exception 'QB_ORDER_CREATE_IDEMPOTENCY_CONFLICT' using errcode = '23505';
  end if;

  if cardinality(saved.order_ids) > 0 then
    if (select count(*) from public.qb_orders o where o.id = any(saved.order_ids)) <> cardinality(saved.order_ids) then
      raise exception 'QB_ORDER_CREATE_LEGACY_REPLAY_REQUIRES_REFRESH' using errcode = '23505';
    end if;
    return query
      select o.id, o.public_reference, 'already_created'::text
      from unnest(saved.order_ids) with ordinality as replay(id, ordinal)
      join public.qb_orders o on o.id = replay.id order by replay.ordinal;
    return;
  end if;

  -- Old requests have no immutable payload. Detect the old 30-line split keys too.
  if exists (
    select 1 from public.qb_orders o
    where lower(o.idempotency_key) in (
      request_id, request_id || '-01', request_id || '-02', request_id || '-03', request_id || '-04'
    )
  ) then
    raise exception 'QB_ORDER_CREATE_LEGACY_REPLAY_REQUIRES_REFRESH' using errcode = '23505';
  end if;

  if p_order_mode is null or p_order_mode not in ('registered', 'guest') then
    raise exception 'invalid_mode' using errcode = 'QB001';
  end if;
  if p_entry = 'dated' and (
    p_operational_date is null or p_operational_date < (now() at time zone 'America/La_Paz')::date
  ) then
    raise exception 'invalid_operational_date' using errcode = 'QB001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'empty_cart' using errcode = 'QB001';
  end if;
  items_count := jsonb_array_length(p_items);
  if items_count = 0 then
    raise exception 'empty_cart' using errcode = 'QB001';
  end if;
  if items_count > (case when p_entry = 'dated' then 100 else 30 end) then
    raise exception 'too_many_items' using errcode = 'QB001';
  end if;
  if items_count > 30 and exists (
    select 1 from jsonb_array_elements(p_items) as lines(item)
    group by lower(item->>'product_id') having count(*) > 1
  ) then
    raise exception 'duplicate_product' using errcode = 'QB001';
  end if;
  if p_entry <> 'physical' and actor_role = 'supervisor' and exists (
    select 1 from jsonb_array_elements(p_items) as lines(item)
    where coalesce(nullif(item->>'input_mode', ''), 'quantity') <> 'quantity'
  ) then
    raise exception 'QB17_SUPERVISOR_QUANTITY_ONLY' using errcode = '42501';
  end if;

  parts := (items_count + 29) / 30;
  -- Serialize assignment before inserting any order, in the same order for all
  -- dated writers. A failed part rolls back the entire request and reservation.
  if p_entry = 'dated' then
    perform pg_advisory_xact_lock(hashtextextended('qb-operational-date-assignment', 0));
  end if;
  for part in 0..parts - 1 loop
    select jsonb_agg(item order by ordinal) into batch_items
    from jsonb_array_elements(p_items) with ordinality as lines(item, ordinal)
    where ordinal > part * 30 and ordinal <= (part + 1) * 30;

    if p_entry <> 'physical' then
      prepared := private.prepare_qb17_order_items(batch_items);
      batch_items := prepared->'items';
    end if;

    child_key := case when parts = 1 then request_id
      else replace(gen_random_uuid()::text, '-', '') end;
    select * into strict result from private.insert_qb_internal_catalog_order(
      p_order_mode, p_customer_account_id, p_customer_location_id,
    p_business_name, p_full_name, p_phone, p_email, p_address,
    p_location_label, p_location_reference, p_customer_notes,
      batch_items, child_key
    );
    if result.result_code = 'already_created' then
      raise exception 'QB_ORDER_CREATE_LEGACY_REPLAY_REQUIRES_REFRESH' using errcode = '23505';
    end if;
    if result.result_code <> 'created' then
      raise exception '%', result.result_code using errcode = 'QB001';
    end if;
    created_ids := array_append(created_ids, result.created_order_id);

    if p_entry <> 'physical' then
      perform private.apply_qb17_amount_snapshots(result.created_order_id, prepared->'amounts');
    end if;

    if p_entry = 'dated' and exists (
      select 1 from public.qb_orders o
      where o.id = result.created_order_id and o.operational_date is distinct from p_operational_date
    ) then
      select coalesce(max(day_order.position), 0) + 1 into position_in_day
      from public.qb_operational_day_orders day_order where day_order.operational_date = p_operational_date;

      update public.qb_operational_day_orders
      set operational_date = p_operational_date, position = position_in_day, updated_at = now()
      where order_id = result.created_order_id;

      update public.qb_orders set operational_date = p_operational_date where id = result.created_order_id;
    end if;

  end loop;

  update private.qb_internal_order_requests set order_ids = created_ids where request_key = request_id;
  return query
    select o.id, o.public_reference, 'created'::text
    from unnest(created_ids) with ordinality as created(id, ordinal)
    join public.qb_orders o on o.id = created.id order by created.ordinal;
exception when sqlstate 'QB001' then
  return query select null::uuid, null::text, SQLERRM;
end;
$$;

revoke all on function private.create_qb_internal_order_once(text,uuid,uuid,text,text,text,text,text,text,text,text,date,jsonb,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.create_qb_internal_catalog_order(
  p_order_mode text, p_customer_account_id uuid, p_customer_location_id uuid,
  p_business_name text, p_full_name text, p_phone text, p_email text, p_address text,
  p_location_label text, p_location_reference text, p_customer_notes text, p_items jsonb, p_idempotency_key text
)
returns table (created_order_id uuid, order_reference text, result_code text)
language sql security definer set search_path = pg_catalog
as $$
  select * from private.create_qb_internal_order_once(
    p_order_mode, p_customer_account_id, p_customer_location_id,
    p_business_name, p_full_name, p_phone, p_email, p_address,
    p_location_label, p_location_reference, p_customer_notes,
    null, p_items, p_idempotency_key, 'physical'
  );
$$;

revoke all on function public.create_qb_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.create_qb_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)
  to authenticated;

create or replace function public.create_qb17_internal_catalog_order(
  p_order_mode text, p_customer_account_id uuid, p_customer_location_id uuid,
  p_business_name text, p_full_name text, p_phone text, p_email text, p_address text,
  p_location_label text, p_location_reference text, p_customer_notes text, p_items jsonb, p_idempotency_key text
)
returns table (created_order_id uuid, order_reference text, result_code text)
language sql security definer set search_path = pg_catalog
as $$
  select * from private.create_qb_internal_order_once(
    p_order_mode, p_customer_account_id, p_customer_location_id,
    p_business_name, p_full_name, p_phone, p_email, p_address,
    p_location_label, p_location_reference, p_customer_notes,
    null, p_items, p_idempotency_key, 'amounts'
  );
$$;

revoke all on function public.create_qb17_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.create_qb17_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)
  to authenticated;

create or replace function public.create_qb17_internal_catalog_order_with_date(
  p_order_mode text, p_customer_account_id uuid, p_customer_location_id uuid,
  p_business_name text, p_full_name text, p_phone text, p_email text, p_address text,
  p_location_label text, p_location_reference text, p_customer_notes text,
  p_operational_date date, p_items jsonb, p_idempotency_key text
)
returns table (created_order_id uuid, order_reference text, result_code text)
language sql security definer set search_path = pg_catalog
as $$
  select * from private.create_qb_internal_order_once(
    p_order_mode, p_customer_account_id, p_customer_location_id,
    p_business_name, p_full_name, p_phone, p_email, p_address,
    p_location_label, p_location_reference, p_customer_notes,
    p_operational_date, p_items, p_idempotency_key, 'dated'
  );
$$;

revoke all on function public.create_qb17_internal_catalog_order_with_date(text,uuid,uuid,text,text,text,text,text,text,text,text,date,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.create_qb17_internal_catalog_order_with_date(text,uuid,uuid,text,text,text,text,text,text,text,text,date,jsonb,text)
  to authenticated;

comment on function public.create_qb17_internal_catalog_order_with_date(text,uuid,uuid,text,text,text,text,text,text,text,text,date,jsonb,text)
  is 'Crea de forma atómica hasta 100 líneas, en partes de hasta 30, vinculadas a una sola solicitud y fecha.';

commit;

