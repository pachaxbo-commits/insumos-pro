-- Fase 15D - Revision, resumen final y confirmacion segura del cliente
-- PENDIENTE DE APLICAR EN SUPABASE STAGING DESPUES DE FASE 15C.
-- No ejecutar en produccion sin backup y validacion completa en staging.

begin;

alter table public.orders
  add column if not exists quote_version integer not null default 1,
  add column if not exists quote_issued_at timestamptz,
  add column if not exists customer_confirmed_at timestamptz;

alter table public.orders
  drop constraint if exists orders_quote_version_check;

alter table public.orders
  add constraint orders_quote_version_check
  check (quote_version >= 1);

alter table public.order_items
  add column if not exists final_unit_price numeric(14, 2),
  add column if not exists price_adjustment_reason text,
  add column if not exists price_adjusted_by uuid references public.profiles (id) on delete set null,
  add column if not exists price_adjusted_at timestamptz;

update public.order_items
set final_unit_price = unit_price
where final_unit_price is null;

alter table public.order_items
  drop constraint if exists order_items_final_unit_price_check;

alter table public.order_items
  add constraint order_items_final_unit_price_check
  check (final_unit_price is null or final_unit_price >= 0);

create table if not exists public.order_confirmation_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  token_hash text not null unique,
  quote_version integer not null,
  quote_snapshot jsonb not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_reason text,
  used_at timestamptz,
  contact_requested_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint order_confirmation_tokens_hash_check
    check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint order_confirmation_tokens_version_check
    check (quote_version >= 1),
  constraint order_confirmation_tokens_expiry_check
    check (expires_at > created_at),
  constraint order_confirmation_tokens_snapshot_check
    check (jsonb_typeof(quote_snapshot) = 'object')
);

create index if not exists order_confirmation_tokens_order_created_idx
on public.order_confirmation_tokens (order_id, created_at desc);

create index if not exists order_confirmation_tokens_expiry_idx
on public.order_confirmation_tokens (expires_at)
where revoked_at is null and used_at is null;

create table if not exists public.order_public_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  token_id uuid references public.order_confirmation_tokens (id) on delete set null,
  event_type text not null,
  quote_version integer not null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint order_public_events_type_check
    check (
      event_type in (
        'quote_issued',
        'quote_revoked',
        'quote_invalidated',
        'contact_requested',
        'customer_confirmed',
        'customer_confirmed_manually'
      )
    ),
  constraint order_public_events_version_check
    check (quote_version >= 1)
);

create index if not exists order_public_events_order_created_idx
on public.order_public_events (order_id, created_at desc);

create unique index if not exists order_public_contact_request_unique_idx
on public.order_public_events (order_id, quote_version, event_type)
where event_type = 'contact_requested';

alter table public.order_confirmation_tokens enable row level security;
alter table public.order_public_events enable row level security;

revoke all on table public.order_confirmation_tokens from anon, authenticated;
revoke insert, update, delete on table public.order_public_events from anon, authenticated;
revoke select on table public.order_public_events from anon;

drop policy if exists "Sales roles can view public order events"
on public.order_public_events;

create policy "Sales roles can view public order events"
on public.order_public_events
for select
to authenticated
using (public.current_user_role() in ('administrador', 'ventas'));

create or replace function public.invalidate_public_order_quotes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_revoked_count integer;
  v_next_version integer;
begin
  select id, origin, quote_version
  into v_order
  from public.orders
  where id = new.order_id
  for update;

  if not found or v_order.origin <> 'catalogo_invitado' then
    return new;
  end if;

  if old.status is not distinct from new.status
    and old.actual_quantity is not distinct from new.actual_quantity
    and old.final_unit_price is not distinct from new.final_unit_price
    and old.final_subtotal is not distinct from new.final_subtotal
    and old.notes is not distinct from new.notes
  then
    return new;
  end if;

  v_next_version := v_order.quote_version + 1;

  update public.order_confirmation_tokens
  set revoked_at = timezone('utc', now()),
      revoked_by = auth.uid(),
      revoked_reason = 'El pedido cambio despues de emitir el resumen.'
  where order_id = new.order_id
    and revoked_at is null
    and used_at is null;

  get diagnostics v_revoked_count = row_count;

  update public.orders
  set quote_version = v_next_version,
      quote_issued_at = null
  where id = new.order_id;

  if v_revoked_count > 0 then
    insert into public.order_public_events (
      order_id,
      event_type,
      quote_version,
      actor_user_id,
      metadata
    )
    values (
      new.order_id,
      'quote_invalidated',
      v_next_version,
      auth.uid(),
      jsonb_build_object('revoked_tokens', v_revoked_count)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists invalidate_public_order_quotes_on_item_change
on public.order_items;

create trigger invalidate_public_order_quotes_on_item_change
after update on public.order_items
for each row
execute function public.invalidate_public_order_quotes();

create or replace function public.revoke_public_quotes_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revoked_count integer;
begin
  if new.origin <> 'catalogo_invitado'
    or new.status <> 'cancelado'
    or old.status is not distinct from new.status
  then
    return new;
  end if;

  update public.order_confirmation_tokens
  set revoked_at = timezone('utc', now()),
      revoked_by = auth.uid(),
      revoked_reason = 'Pedido cancelado.'
  where order_id = new.id
    and revoked_at is null
    and used_at is null;

  get diagnostics v_revoked_count = row_count;

  if v_revoked_count > 0 then
    insert into public.order_public_events (
      order_id,
      event_type,
      quote_version,
      actor_user_id,
      metadata
    )
    values (
      new.id,
      'quote_invalidated',
      new.quote_version,
      auth.uid(),
      jsonb_build_object(
        'reason', 'order_canceled',
        'revoked_tokens', v_revoked_count
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists revoke_public_quotes_on_order_cancel
on public.orders;

create trigger revoke_public_quotes_on_order_cancel
after update of status on public.orders
for each row
execute function public.revoke_public_quotes_on_order_cancel();

create or replace function public.update_public_order_review(
  p_order_id uuid,
  p_contact_name text,
  p_phone text,
  p_delivery_type text,
  p_delivery_address text,
  p_delivery_time_window text,
  p_expected_payment_method text,
  p_notes text
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
  v_next_version integer;
  v_revoked_count integer;
begin
  v_user_id := auth.uid();

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_id is null or v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para revisar pedidos publicos.';
  end if;

  if length(trim(coalesce(p_contact_name, ''))) < 2
    or length(trim(coalesce(p_contact_name, ''))) > 120
    or p_phone is null
    or p_phone !~ '^\+?[0-9]{7,15}$'
  then
    raise exception 'Datos de contacto invalidos.';
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
    raise exception 'Datos de entrega invalidos.';
  end if;

  if p_expected_payment_method not in ('efectivo', 'qr', 'mixto') then
    raise exception 'Metodo de pago esperado invalido.';
  end if;

  if length(coalesce(p_notes, '')) > 1000 then
    raise exception 'Las observaciones son demasiado largas.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or v_order.origin <> 'catalogo_invitado'
    or v_order.status not in (
      'pendiente_revision',
      'en_preparacion',
      'listo_para_confirmar'
    )
  then
    raise exception 'El pedido no esta disponible para revision.';
  end if;

  v_next_version := v_order.quote_version + 1;

  update public.order_confirmation_tokens
  set revoked_at = timezone('utc', now()),
      revoked_by = v_user_id,
      revoked_reason = 'Datos del pedido actualizados durante revision.'
  where order_id = p_order_id
    and revoked_at is null
    and used_at is null;

  get diagnostics v_revoked_count = row_count;

  update public.orders
  set contact_snapshot = jsonb_build_object(
        'name', trim(p_contact_name),
        'phone', p_phone
      ),
      delivery_type = p_delivery_type,
      delivery_address = case
        when p_delivery_type = 'delivery' then trim(p_delivery_address)
        else null
      end,
      delivery_time_window = trim(p_delivery_time_window),
      expected_payment_method = p_expected_payment_method,
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      quote_version = v_next_version,
      quote_issued_at = null
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
    'update_public_order_review',
    'order',
    p_order_id,
    jsonb_build_object(
      'delivery_type', p_delivery_type,
      'expected_payment_method', p_expected_payment_method,
      'quote_version', v_next_version,
      'revoked_tokens', v_revoked_count
    )
  );
end;
$$;

-- Reemplaza la funcion 15C para que vincular no libere automaticamente.
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

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_id is null or v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para revisar pedidos publicos.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or v_order.origin <> 'catalogo_invitado'
    or v_order.status <> 'pendiente_revision'
  then
    raise exception 'El pedido ya fue liberado o no corresponde al catalogo publico.';
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
  set customer_id = p_customer_id
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

create or replace function public.release_public_order_to_preparation(
  p_order_id uuid
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

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_id is null or v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para liberar pedidos.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or v_order.origin <> 'catalogo_invitado'
    or v_order.status <> 'pendiente_revision'
  then
    raise exception 'El pedido ya fue liberado o no esta pendiente de revision.';
  end if;

  if v_order.customer_id is null then
    raise exception 'Vincula un cliente antes de enviar a preparacion.';
  end if;

  if not exists (
    select 1
    from public.order_items
    where order_id = p_order_id
  ) then
    raise exception 'El pedido no tiene items.';
  end if;

  update public.orders
  set status = 'en_preparacion'
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
    'release_public_order_to_preparation',
    'order',
    p_order_id,
    jsonb_build_object('customer_id', v_order.customer_id)
  );
end;
$$;

create or replace function public.prepare_order_item(
  p_order_item_id uuid,
  p_status text,
  p_actual_quantity numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_item record;
  v_next_order_status text;
  v_final_unit_price numeric(14, 2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para preparar pedidos.';
  end if;

  if p_status not in ('pendiente', 'preparado', 'parcial', 'sin_stock', 'cancelado') then
    raise exception 'Estado de item invalido.';
  end if;

  select
    oi.*,
    o.status as order_status,
    o.origin as order_origin,
    o.customer_id as order_customer_id
  into v_item
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
  for update of oi, o;

  if not found then
    raise exception 'Item de pedido no encontrado.';
  end if;

  if v_item.order_status in (
    'confirmado_cliente',
    'confirmado',
    'entregado',
    'cancelado'
  ) then
    raise exception 'No se puede preparar un pedido cerrado.';
  end if;

  if v_item.order_origin = 'catalogo_invitado' then
    if v_item.order_customer_id is null then
      raise exception 'Vincula un cliente antes de preparar el pedido publico.';
    end if;

    if v_item.order_status not in ('en_preparacion', 'listo_para_confirmar') then
      raise exception 'El pedido publico debe ser liberado a preparacion.';
    end if;
  end if;

  if p_status in ('preparado', 'parcial')
    and (p_actual_quantity is null or p_actual_quantity <= 0)
  then
    raise exception 'La cantidad real debe ser mayor a cero.';
  end if;

  if p_status in ('parcial', 'sin_stock')
    and length(trim(coalesce(p_notes, ''))) < 3
  then
    raise exception 'Indica un motivo cuando el item queda parcial o sin stock.';
  end if;

  if p_status in ('sin_stock', 'cancelado', 'pendiente') then
    p_actual_quantity := 0;
  end if;

  v_final_unit_price := coalesce(v_item.final_unit_price, v_item.unit_price);

  update public.order_items
  set status = p_status,
      actual_quantity = coalesce(p_actual_quantity, 0),
      final_unit_price = v_final_unit_price,
      final_subtotal = round(coalesce(p_actual_quantity, 0) * v_final_unit_price, 2),
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_order_item_id;

  if v_item.order_origin = 'catalogo_invitado' then
    if exists (
      select 1
      from public.order_items
      where order_id = v_item.order_id
        and status = 'pendiente'
    ) then
      v_next_order_status := 'en_preparacion';
    else
      v_next_order_status := 'listo_para_confirmar';
    end if;
  elsif exists (
    select 1
    from public.order_items
    where order_id = v_item.order_id
      and status = 'pendiente'
  ) then
    v_next_order_status := 'en_preparacion';
  elsif exists (
    select 1
    from public.order_items
    where order_id = v_item.order_id
      and status in ('parcial', 'sin_stock', 'cancelado')
  ) then
    v_next_order_status := 'preparado_incompleto';
  else
    v_next_order_status := 'preparado_completo';
  end if;

  update public.orders
  set status = v_next_order_status,
      prepared_by = v_user_id,
      prepared_at = timezone('utc', now()),
      estimated_total = coalesce((
        select sum(estimated_subtotal)
        from public.order_items
        where order_id = v_item.order_id
      ), 0),
      final_total = coalesce((
        select sum(final_subtotal)
        from public.order_items
        where order_id = v_item.order_id
      ), 0)
  where id = v_item.order_id;
end;
$$;

create or replace function public.adjust_public_order_item_price(
  p_order_item_id uuid,
  p_final_unit_price numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_item record;
begin
  v_user_id := auth.uid();

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_id is null or v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para ajustar precios finales.';
  end if;

  if p_final_unit_price is null or p_final_unit_price <= 0 then
    raise exception 'El precio final debe ser mayor a cero.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'El motivo del ajuste debe tener al menos 10 caracteres.';
  end if;

  select
    oi.*,
    o.origin as order_origin,
    o.status as order_status
  into v_item
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
  for update of oi, o;

  if not found
    or v_item.order_origin <> 'catalogo_invitado'
    or v_item.order_status not in ('en_preparacion', 'listo_para_confirmar')
  then
    raise exception 'El item no esta disponible para ajuste.';
  end if;

  if v_item.status not in ('preparado', 'parcial')
    or v_item.actual_quantity <= 0
  then
    raise exception 'Primero registra una cantidad real entregable.';
  end if;

  update public.order_items
  set final_unit_price = round(p_final_unit_price, 2),
      final_subtotal = round(actual_quantity * p_final_unit_price, 2),
      price_adjustment_reason = trim(p_reason),
      price_adjusted_by = v_user_id,
      price_adjusted_at = timezone('utc', now())
  where id = p_order_item_id;

  update public.orders
  set final_total = coalesce((
    select sum(final_subtotal)
    from public.order_items
    where order_id = v_item.order_id
  ), 0)
  where id = v_item.order_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'adjust_public_order_item_price',
    'order_item',
    p_order_item_id,
    jsonb_build_object(
      'order_id', v_item.order_id,
      'previous_price', coalesce(v_item.final_unit_price, v_item.unit_price),
      'new_price', round(p_final_unit_price, 2),
      'reason', trim(p_reason)
    )
  );
end;
$$;

create or replace function public.issue_public_order_quote(
  p_order_id uuid,
  p_token_hash text
)
returns table (
  token_id uuid,
  quote_version integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_order record;
  v_snapshot jsonb;
  v_token_id uuid;
  v_expires_at timestamptz;
  v_total numeric(14, 2);
  v_revoked_count integer;
begin
  v_user_id := auth.uid();

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_id is null or v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para emitir resumenes.';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Token invalido.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or v_order.origin <> 'catalogo_invitado'
    or v_order.status <> 'listo_para_confirmar'
  then
    raise exception 'El pedido debe estar listo para confirmar.';
  end if;

  if v_order.customer_id is null then
    raise exception 'Vincula un cliente antes de emitir el resumen.';
  end if;

  if exists (
    select 1
    from public.order_items
    where order_id = p_order_id
      and status = 'pendiente'
  ) then
    raise exception 'El pedido todavia tiene items pendientes.';
  end if;

  if not exists (
    select 1
    from public.order_items
    where order_id = p_order_id
      and status in ('preparado', 'parcial')
      and actual_quantity > 0
  ) then
    raise exception 'El pedido no tiene items entregables.';
  end if;

  select coalesce(sum(final_subtotal), 0)
  into v_total
  from public.order_items
  where order_id = p_order_id
    and status in ('preparado', 'parcial')
    and actual_quantity > 0;

  select jsonb_build_object(
    'reference', v_order.public_reference,
    'customer_name', left(coalesce(v_order.contact_snapshot ->> 'name', 'Cliente'), 4) || '***',
    'delivery_type', v_order.delivery_type,
    'delivery_address', case
      when v_order.delivery_type = 'delivery'
        then left(coalesce(v_order.delivery_address, ''), 10) || '...'
      else null
    end,
    'delivery_time_window', v_order.delivery_time_window,
    'expected_payment_method', v_order.expected_payment_method,
    'notes', v_order.notes,
    'quote_version', v_order.quote_version,
    'final_total', round(v_total, 2),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'product_name', oi.product_name,
          'requested_quantity', oi.requested_quantity,
          'actual_quantity', oi.actual_quantity,
          'unit_abbreviation', oi.unit_abbreviation,
          'status', oi.status,
          'final_unit_price', coalesce(oi.final_unit_price, oi.unit_price),
          'final_subtotal', oi.final_subtotal,
          'notes', oi.notes
        )
        order by oi.created_at, oi.id
      )
      from public.order_items oi
      where oi.order_id = p_order_id
    ), '[]'::jsonb)
  )
  into v_snapshot;

  update public.order_confirmation_tokens
  set revoked_at = timezone('utc', now()),
      revoked_by = v_user_id,
      revoked_reason = 'Se emitio una nueva version del enlace.'
  where order_id = p_order_id
    and revoked_at is null
    and used_at is null;

  get diagnostics v_revoked_count = row_count;

  v_expires_at := timezone('utc', now()) + interval '72 hours';

  insert into public.order_confirmation_tokens (
    order_id,
    token_hash,
    quote_version,
    quote_snapshot,
    expires_at,
    created_by
  )
  values (
    p_order_id,
    p_token_hash,
    v_order.quote_version,
    v_snapshot,
    v_expires_at,
    v_user_id
  )
  returning id into v_token_id;

  update public.orders
  set final_total = round(v_total, 2),
      quote_issued_at = timezone('utc', now())
  where id = p_order_id;

  insert into public.order_public_events (
    order_id,
    token_id,
    event_type,
    quote_version,
    actor_user_id,
    metadata
  )
  values (
    p_order_id,
    v_token_id,
    'quote_issued',
    v_order.quote_version,
    v_user_id,
    jsonb_build_object(
      'expires_at', v_expires_at,
      'final_total', round(v_total, 2),
      'replaced_tokens', v_revoked_count
    )
  );

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'issue_public_order_quote',
    'order',
    p_order_id,
    jsonb_build_object(
      'quote_version', v_order.quote_version,
      'expires_at', v_expires_at,
      'final_total', round(v_total, 2)
    )
  );

  token_id := v_token_id;
  quote_version := v_order.quote_version;
  expires_at := v_expires_at;
  return next;
end;
$$;

create or replace function public.revoke_public_order_quote(
  p_order_id uuid,
  p_reason text
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
  v_revoked_count integer;
begin
  v_user_id := auth.uid();

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_id is null or v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para revocar enlaces.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Indica un motivo para revocar el enlace.';
  end if;

  select id, quote_version
  into v_order
  from public.orders
  where id = p_order_id
    and origin = 'catalogo_invitado'
  for update;

  if not found then
    raise exception 'Pedido publico no encontrado.';
  end if;

  update public.order_confirmation_tokens
  set revoked_at = timezone('utc', now()),
      revoked_by = v_user_id,
      revoked_reason = trim(p_reason)
  where order_id = p_order_id
    and revoked_at is null
    and used_at is null;

  get diagnostics v_revoked_count = row_count;

  if v_revoked_count = 0 then
    raise exception 'No existe un enlace activo para revocar.';
  end if;

  update public.orders
  set quote_issued_at = null
  where id = p_order_id;

  insert into public.order_public_events (
    order_id,
    event_type,
    quote_version,
    actor_user_id,
    metadata
  )
  values (
    p_order_id,
    'quote_revoked',
    v_order.quote_version,
    v_user_id,
    jsonb_build_object('reason', trim(p_reason))
  );

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'revoke_public_order_quote',
    'order',
    p_order_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'quote_version', v_order.quote_version
    )
  );
end;
$$;

create or replace function public.confirm_public_order_manually(
  p_order_id uuid,
  p_reason text
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

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_id is null or v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para confirmar manualmente.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Describe la confirmacion por llamada o WhatsApp.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found
    or v_order.origin <> 'catalogo_invitado'
    or v_order.status <> 'listo_para_confirmar'
  then
    raise exception 'El pedido no esta listo para confirmacion manual.';
  end if;

  update public.order_confirmation_tokens
  set revoked_at = timezone('utc', now()),
      revoked_by = v_user_id,
      revoked_reason = 'Pedido confirmado manualmente.'
  where order_id = p_order_id
    and revoked_at is null
    and used_at is null;

  update public.orders
  set status = 'confirmado_cliente',
      customer_confirmed_at = timezone('utc', now())
  where id = p_order_id;

  insert into public.order_public_events (
    order_id,
    event_type,
    quote_version,
    actor_user_id,
    metadata
  )
  values (
    p_order_id,
    'customer_confirmed_manually',
    v_order.quote_version,
    v_user_id,
    jsonb_build_object('reason', trim(p_reason))
  );

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'confirm_public_order_manually',
    'order',
    p_order_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'quote_version', v_order.quote_version
    )
  );
end;
$$;

create or replace function public.get_public_order_quote(
  p_token_hash text
)
returns table (
  result_code text,
  quote_snapshot jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token record;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    result_code := 'invalid';
    quote_snapshot := null;
    return next;
    return;
  end if;

  select
    token.*,
    orders.status as order_status,
    orders.quote_version as current_quote_version
  into v_token
  from public.order_confirmation_tokens token
  join public.orders orders on orders.id = token.order_id
  where token.token_hash = p_token_hash;

  if not found then
    result_code := 'invalid';
    quote_snapshot := null;
  elsif v_token.revoked_at is not null then
    result_code := 'revoked';
    quote_snapshot := null;
  elsif v_token.expires_at <= timezone('utc', now()) then
    result_code := 'expired';
    quote_snapshot := null;
  elsif v_token.quote_version <> v_token.current_quote_version then
    result_code := 'outdated';
    quote_snapshot := null;
  elsif v_token.used_at is not null
    and v_token.order_status = 'confirmado_cliente'
  then
    result_code := 'confirmed';
    quote_snapshot := v_token.quote_snapshot;
  elsif v_token.order_status <> 'listo_para_confirmar' then
    result_code := 'unavailable';
    quote_snapshot := null;
  else
    result_code := 'valid';
    quote_snapshot := v_token.quote_snapshot;
  end if;

  return next;
end;
$$;

create or replace function public.handle_public_order_quote(
  p_token_hash text,
  p_action text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token record;
  v_event_count integer;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_action not in ('confirm', 'request_contact')
  then
    return 'invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_token_hash, 0));

  select
    token.*,
    orders.status as order_status,
    orders.quote_version as current_quote_version
  into v_token
  from public.order_confirmation_tokens token
  join public.orders orders on orders.id = token.order_id
  where token.token_hash = p_token_hash
  for update of token, orders;

  if not found then
    return 'invalid';
  end if;

  if p_action = 'confirm'
    and v_token.used_at is not null
    and v_token.order_status = 'confirmado_cliente'
  then
    return 'already_confirmed';
  end if;

  if v_token.revoked_at is not null then
    return 'revoked';
  end if;

  if v_token.expires_at <= timezone('utc', now()) then
    return 'expired';
  end if;

  if v_token.quote_version <> v_token.current_quote_version then
    return 'outdated';
  end if;

  if v_token.order_status <> 'listo_para_confirmar' then
    return 'unavailable';
  end if;

  if p_action = 'request_contact' then
    update public.order_confirmation_tokens
    set contact_requested_at = coalesce(contact_requested_at, timezone('utc', now()))
    where id = v_token.id;

    insert into public.order_public_events (
      order_id,
      token_id,
      event_type,
      quote_version,
      actor_user_id,
      metadata
    )
    values (
      v_token.order_id,
      v_token.id,
      'contact_requested',
      v_token.quote_version,
      null,
      '{}'::jsonb
    )
    on conflict (order_id, quote_version, event_type)
      where event_type = 'contact_requested'
    do nothing;

    get diagnostics v_event_count = row_count;

    if v_event_count > 0 then
      insert into public.audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        metadata
      )
      values (
        null,
        'request_public_order_contact',
        'order',
        v_token.order_id,
        jsonb_build_object('quote_version', v_token.quote_version)
      );
    end if;

    return 'contact_requested';
  end if;

  update public.order_confirmation_tokens
  set used_at = timezone('utc', now())
  where id = v_token.id;

  update public.order_confirmation_tokens
  set revoked_at = timezone('utc', now()),
      revoked_reason = 'Pedido confirmado con otro enlace.'
  where order_id = v_token.order_id
    and id <> v_token.id
    and revoked_at is null
    and used_at is null;

  update public.orders
  set status = 'confirmado_cliente',
      customer_confirmed_at = timezone('utc', now())
  where id = v_token.order_id;

  insert into public.order_public_events (
    order_id,
    token_id,
    event_type,
    quote_version,
    actor_user_id,
    metadata
  )
  values (
    v_token.order_id,
    v_token.id,
    'customer_confirmed',
    v_token.quote_version,
    null,
    '{}'::jsonb
  );

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    null,
    'confirm_public_order_quote',
    'order',
    v_token.order_id,
    jsonb_build_object('quote_version', v_token.quote_version)
  );

  return 'confirmed';
end;
$$;

-- Mantiene el flujo interno de Fase 13 y bloquea ventas prematuras de pedidos publicos.
create or replace function public.confirm_prepared_order(
  p_order_id uuid,
  p_payment_type text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_order record;
  v_item record;
  v_sale_id uuid;
  v_subtotal numeric(14, 2);
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para confirmar pedidos.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if v_order.origin = 'catalogo_invitado' then
    raise exception 'La venta definitiva de pedidos publicos se habilitara en Fase 15F.';
  end if;

  if v_order.sale_id is not null or v_order.status = 'confirmado' then
    raise exception 'El pedido ya fue confirmado.';
  end if;

  if v_order.status not in ('preparado_completo', 'preparado_incompleto') then
    raise exception 'El pedido debe estar preparado antes de confirmar la venta.';
  end if;

  if exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and status = 'pendiente'
  ) then
    raise exception 'El pedido todavia tiene items pendientes.';
  end if;

  if not exists (
    select 1 from public.order_items
    where order_id = p_order_id
      and actual_quantity > 0
      and status in ('preparado', 'parcial')
  ) then
    raise exception 'El pedido no tiene items preparados para vender.';
  end if;

  if p_payment_type not in ('contado', 'transferencia', 'qr', 'credito') then
    raise exception 'Metodo de pago invalido.';
  end if;

  select coalesce(sum(final_subtotal), 0)
  into v_subtotal
  from public.order_items
  where order_id = p_order_id
    and actual_quantity > 0
    and status in ('preparado', 'parcial');

  insert into public.sales (
    customer_id,
    sale_date,
    subtotal,
    discount,
    total,
    payment_type,
    status,
    notes,
    created_by
  )
  values (
    v_order.customer_id,
    current_date,
    v_subtotal,
    0,
    v_subtotal,
    p_payment_type,
    'borrador',
    concat_ws(' | ', 'Venta generada desde pedido ' || p_order_id::text, nullif(v_order.notes, '')),
    v_user_id
  )
  returning id into v_sale_id;

  for v_item in
    select *
    from public.order_items
    where order_id = p_order_id
      and actual_quantity > 0
      and status in ('preparado', 'parcial')
  loop
    insert into public.sale_items (
      sale_id,
      product_id,
      quantity,
      unit_price,
      subtotal
    )
    values (
      v_sale_id,
      v_item.product_id,
      v_item.actual_quantity,
      coalesce(v_item.final_unit_price, v_item.unit_price),
      v_item.final_subtotal
    );
  end loop;

  update public.orders
  set status = 'confirmado',
      payment_type = p_payment_type,
      sale_id = v_sale_id,
      confirmed_by = v_user_id,
      confirmed_at = timezone('utc', now())
  where id = p_order_id;

  perform public.confirm_sale(v_sale_id);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'confirm_sale',
    'sale',
    v_sale_id,
    jsonb_build_object(
      'origin', 'order',
      'order_id', p_order_id,
      'payment_type', p_payment_type,
      'total', v_subtotal
    )
  );

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'confirm_order',
    'order',
    p_order_id,
    jsonb_build_object(
      'sale_id', v_sale_id,
      'payment_type', p_payment_type,
      'final_total', v_subtotal
    )
  );

  return v_sale_id;
end;
$$;

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text
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

  select role into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para cancelar pedidos.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Indica un motivo de cancelacion.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if v_order.status in ('confirmado_cliente', 'confirmado', 'entregado') then
    raise exception 'No se puede cancelar un pedido confirmado o entregado.';
  end if;

  if v_order.status = 'cancelado' then
    raise exception 'El pedido ya esta cancelado.';
  end if;

  update public.orders
  set status = 'cancelado',
      notes = concat_ws(' | ', nullif(notes, ''), 'Cancelado: ' || trim(p_reason))
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
    'cancel_order',
    'order',
    p_order_id,
    jsonb_build_object('reason', trim(p_reason))
  );
end;
$$;

revoke all on function public.invalidate_public_order_quotes() from public;
revoke all on function public.revoke_public_quotes_on_order_cancel() from public;
revoke all on function public.update_public_order_review(
  uuid, text, text, text, text, text, text, text
) from public;
revoke all on function public.release_public_order_to_preparation(uuid) from public;
revoke all on function public.adjust_public_order_item_price(uuid, numeric, text) from public;
revoke all on function public.issue_public_order_quote(uuid, text) from public;
revoke all on function public.revoke_public_order_quote(uuid, text) from public;
revoke all on function public.confirm_public_order_manually(uuid, text) from public;
revoke all on function public.get_public_order_quote(text) from public, anon, authenticated;
revoke all on function public.handle_public_order_quote(text, text) from public, anon, authenticated;

grant execute on function public.update_public_order_review(
  uuid, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.release_public_order_to_preparation(uuid) to authenticated;
grant execute on function public.adjust_public_order_item_price(uuid, numeric, text) to authenticated;
grant execute on function public.issue_public_order_quote(uuid, text) to authenticated;
grant execute on function public.revoke_public_order_quote(uuid, text) to authenticated;
grant execute on function public.confirm_public_order_manually(uuid, text) to authenticated;
grant execute on function public.get_public_order_quote(text) to service_role;
grant execute on function public.handle_public_order_quote(text, text) to service_role;

commit;
