-- QB-15: registro público seguro de clientes externos.
-- La identidad se crea en Supabase Auth y esta RPC autenticada completa
-- exclusivamente la cuenta cliente vinculada a auth.uid().

begin;

alter table public.customer_accounts
  add column if not exists business_name text,
  add column if not exists responsible_name text;

update public.customer_accounts
set
  business_name = coalesce(nullif(trim(business_name), ''), trim(full_name)),
  responsible_name = coalesce(nullif(trim(responsible_name), ''), trim(full_name))
where business_name is null
   or responsible_name is null
   or trim(business_name) = ''
   or trim(responsible_name) = '';

alter table public.customer_accounts
  alter column business_name set not null,
  alter column responsible_name set not null;

alter table public.customer_accounts
  drop constraint if exists customer_accounts_business_name_check,
  drop constraint if exists customer_accounts_responsible_name_check;

alter table public.customer_accounts
  add constraint customer_accounts_business_name_check
    check (length(trim(business_name)) between 2 and 120),
  add constraint customer_accounts_responsible_name_check
    check (length(trim(responsible_name)) between 2 and 120);

-- La creación y actualización quedan limitadas a las RPC autenticadas.
-- SELECT permanece disponible según las políticas RLS vigentes.
revoke insert on table public.customer_accounts from anon, authenticated;
revoke update on table public.customer_accounts from anon, authenticated;
revoke all on function public.update_own_customer_account(
  text, text, text, text, text, text
) from public, anon, authenticated;

create or replace function public.register_own_customer_account(
  p_business_name text,
  p_responsible_name text,
  p_phone text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_existing public.customer_accounts%rowtype;
  v_business_name text := regexp_replace(trim(coalesce(p_business_name, '')), '\s+', ' ', 'g');
  v_responsible_name text := regexp_replace(trim(coalesce(p_responsible_name, '')), '\s+', ' ', 'g');
  v_phone text := regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g');
  v_phone_digits text := regexp_replace(v_phone, '[^0-9]', '', 'g');
begin
  if v_user_id is null or v_email = '' then
    return 'unauthenticated';
  end if;

  if length(v_business_name) not between 2 and 120
    or length(v_responsible_name) not between 2 and 120
    or length(v_phone) > 25
    or v_phone !~ '^[+0-9() -]+$'
    or length(v_phone_digits) not between 7 and 15
  then
    return 'invalid_data';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('qb15-registration:' || v_user_id::text, 0));

  if exists (
    select 1
    from public.profiles
    where id = v_user_id
  ) then
    return 'internal_user';
  end if;

  select *
  into v_existing
  from public.customer_accounts
  where id = v_user_id;

  if found then
    if v_existing.is_active then
      return 'already_registered';
    end if;
    return 'inactive_account';
  end if;

  if exists (
    select 1
    from public.customer_accounts
    where lower(email) = v_email
  ) then
    return 'account_exists';
  end if;

  insert into public.customer_accounts (
    id,
    email,
    full_name,
    business_name,
    responsible_name,
    phone,
    is_active
  )
  values (
    v_user_id,
    v_email,
    v_business_name,
    v_business_name,
    v_responsible_name,
    v_phone,
    true
  );

  return 'created';
exception
  when unique_violation then
    return 'account_exists';
end;
$$;

revoke all on function public.register_own_customer_account(text, text, text)
from public, anon;
grant execute on function public.register_own_customer_account(text, text, text)
to authenticated;

drop function if exists public.update_qb_customer_profile(text, text);

create function public.update_qb_customer_profile(
  p_business_name text,
  p_responsible_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_name text := regexp_replace(trim(coalesce(p_business_name, '')), '\s+', ' ', 'g');
  v_responsible_name text := regexp_replace(trim(coalesce(p_responsible_name, '')), '\s+', ' ', 'g');
  v_phone text := regexp_replace(trim(coalesce(p_phone, '')), '\s+', ' ', 'g');
  v_phone_digits text := regexp_replace(v_phone, '[^0-9]', '', 'g');
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if length(v_business_name) not between 2 and 120 then
    raise exception 'Nombre de negocio inválido.';
  end if;

  if length(v_responsible_name) not between 2 and 120 then
    raise exception 'Nombre de responsable inválido.';
  end if;

  if length(v_phone) > 25
    or v_phone !~ '^[+0-9() -]+$'
    or length(v_phone_digits) not between 7 and 15
  then
    raise exception 'WhatsApp inválido.';
  end if;

  if exists (
    select 1
    from public.profiles
    where id = v_user_id
  ) then
    raise exception 'Cuenta de cliente no disponible.';
  end if;

  update public.customer_accounts
  set
    full_name = v_business_name,
    business_name = v_business_name,
    responsible_name = v_responsible_name,
    phone = v_phone
  where id = v_user_id
    and is_active = true;

  if not found then
    raise exception 'Cuenta de cliente no disponible.';
  end if;
end;
$$;

revoke all on function public.update_qb_customer_profile(text, text, text)
from public, anon;
grant execute on function public.update_qb_customer_profile(text, text, text)
to authenticated;

commit;
