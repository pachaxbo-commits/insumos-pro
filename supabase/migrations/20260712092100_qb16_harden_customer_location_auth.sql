-- QB-16: restaura la validación de identidad y el snapshot sin calificar
-- expresiones condicionales de PostgreSQL como si fueran funciones.

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
  v_label text := pg_catalog.btrim(coalesce(p_label, ''));
  v_address text := pg_catalog.btrim(coalesce(p_address, ''));
  v_reference text := nullif(pg_catalog.btrim(coalesce(p_reference, '')), '');
  v_phone text := nullif(pg_catalog.btrim(coalesce(p_phone, '')), '');
  v_place_id text := nullif(pg_catalog.btrim(coalesce(p_google_place_id, '')), '');
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

  v_make_primary := coalesce(p_is_primary, false)
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
    coalesce(new.location_snapshot, '{}'::jsonb)
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

revoke all on function public.save_own_qb_customer_location(
  uuid, text, text, text, text, numeric, numeric, text, boolean
) from public, anon;

grant execute on function public.save_own_qb_customer_location(
  uuid, text, text, text, text, numeric, numeric, text, boolean
) to authenticated;
