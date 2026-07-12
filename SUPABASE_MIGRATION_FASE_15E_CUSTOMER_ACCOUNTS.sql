-- Fase 15E - Cuentas de cliente e historial seguro
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- Aplicar despues de Fase 15D. No ejecutar en produccion sin validacion.

create table if not exists public.customer_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  default_delivery_type text not null default 'delivery',
  default_address text,
  default_delivery_time_window text,
  default_payment_method text not null default 'efectivo',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_accounts_delivery_type_check
    check (default_delivery_type in ('delivery', 'recojo')),
  constraint customer_accounts_payment_method_check
    check (default_payment_method in ('efectivo', 'qr', 'mixto')),
  constraint customer_accounts_full_name_check
    check (length(trim(full_name)) between 2 and 120)
);

create unique index if not exists customer_accounts_email_lower_unique_idx
on public.customer_accounts (lower(email));

drop trigger if exists set_customer_accounts_updated_at on public.customer_accounts;
create trigger set_customer_accounts_updated_at
before update on public.customer_accounts
for each row execute function public.set_current_timestamp_updated_at();

alter table public.orders
  add column if not exists customer_account_id uuid
    references public.customer_accounts (id) on delete set null;

create index if not exists orders_customer_account_created_idx
on public.orders (customer_account_id, created_at desc)
where customer_account_id is not null;

-- El trigger de Auth queda neutro. No confia en metadata del navegador para
-- decidir si una identidad es personal o cliente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

alter table public.customer_accounts enable row level security;

drop policy if exists "Customers can view own account" on public.customer_accounts;
create policy "Customers can view own account"
on public.customer_accounts
for select
to authenticated
using (id = auth.uid() and is_active = true);

-- No se habilitan INSERT/UPDATE/DELETE directos. Las ediciones usan RPC controlada.
revoke insert, update, delete on table public.customer_accounts from anon, authenticated;
grant select on table public.customer_accounts to authenticated;

create or replace function public.update_own_customer_account(
  p_full_name text,
  p_phone text,
  p_default_delivery_type text,
  p_default_address text,
  p_default_delivery_time_window text,
  p_default_payment_method text
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
    raise exception 'Celular invalido.';
  end if;

  if p_default_delivery_type not in ('delivery', 'recojo') then
    raise exception 'Tipo de entrega invalido.';
  end if;

  if p_default_payment_method not in ('efectivo', 'qr', 'mixto') then
    raise exception 'Metodo de pago invalido.';
  end if;

  update public.customer_accounts
  set
    full_name = trim(p_full_name),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    default_delivery_type = p_default_delivery_type,
    default_address = nullif(trim(coalesce(p_default_address, '')), ''),
    default_delivery_time_window =
      nullif(trim(coalesce(p_default_delivery_time_window, '')), ''),
    default_payment_method = p_default_payment_method
  where id = v_user_id
    and is_active = true;

  if not found then
    raise exception 'Cuenta de cliente no disponible.';
  end if;
end;
$$;

revoke all on function public.update_own_customer_account(
  text, text, text, text, text, text
) from public, anon;
grant execute on function public.update_own_customer_account(
  text, text, text, text, text, text
) to authenticated;

-- Solo service_role puede enlazar el resultado de create_public_catalog_order.
-- Se valida tambien el hash de idempotencia para impedir asociaciones arbitrarias.
create or replace function public.link_public_order_customer_account(
  p_order_id uuid,
  p_idempotency_key_hash text,
  p_customer_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Operacion no autorizada.';
  end if;

  if not exists (
    select 1
    from public.customer_accounts
    where id = p_customer_account_id
      and is_active = true
  ) then
    raise exception 'Cuenta de cliente no disponible.';
  end if;

  update public.orders
  set customer_account_id = p_customer_account_id
  where id = p_order_id
    and origin = 'catalogo_invitado'
    and public_idempotency_key_hash = p_idempotency_key_hash
    and (
      customer_account_id is null
      or customer_account_id = p_customer_account_id
    );

  if not found then
    raise exception 'No se pudo vincular el pedido.';
  end if;
end;
$$;

revoke all on function public.link_public_order_customer_account(uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.link_public_order_customer_account(uuid, text, uuid)
to service_role;

-- Devuelve solo el subconjunto apto para el cliente autenticado.
create or replace function public.get_my_customer_orders()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesion.';
  end if;

  if not exists (
    select 1 from public.customer_accounts
    where id = v_user_id and is_active = true
  ) then
    raise exception 'Cuenta de cliente no disponible.';
  end if;

  select coalesce(jsonb_agg(order_data order by order_data.created_at desc), '[]'::jsonb)
  into v_result
  from (
    select
      o.id,
      o.public_reference,
      o.created_at,
      o.status,
      o.estimated_total,
      o.final_total,
      o.expected_payment_method,
      o.delivery_type,
      o.delivery_time_window,
      coalesce(
        (
          select jsonb_agg(jsonb_build_object(
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'unit_name', oi.unit_name,
            'unit_abbreviation', oi.unit_abbreviation,
            'requested_quantity', oi.requested_quantity,
            'actual_quantity', oi.actual_quantity,
            'estimated_subtotal', oi.estimated_subtotal,
            'final_subtotal', oi.final_subtotal,
            'status', oi.status
          ) order by oi.created_at)
          from public.order_items oi
          where oi.order_id = o.id
        ),
        '[]'::jsonb
      ) as items
    from public.orders o
    where o.customer_account_id = v_user_id
  ) order_data;

  return v_result;
end;
$$;

revoke all on function public.get_my_customer_orders() from public, anon;
grant execute on function public.get_my_customer_orders() to authenticated;

-- Las tablas operativas siguen sin lectura/escritura publica directa.
revoke select, insert, update, delete on table public.orders, public.order_items from anon;
revoke insert, update, delete on table public.orders, public.order_items from authenticated;
