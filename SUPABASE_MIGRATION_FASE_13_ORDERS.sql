-- Fase 13 - Pedidos moviles, preparacion con cantidad real y venta confirmada
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- No ejecutar en produccion sin backup y validacion.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  order_date date not null default current_date,
  requested_delivery_date date,
  status text not null default 'recibido',
  payment_type text not null default 'contado',
  estimated_total numeric(14, 2) not null default 0,
  final_total numeric(14, 2) not null default 0,
  notes text,
  sale_id uuid unique references public.sales (id) on delete set null,
  prepared_by uuid references public.profiles (id) on delete set null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  prepared_at timestamptz,
  confirmed_at timestamptz,
  constraint orders_status_check check (
    status in (
      'recibido',
      'en_preparacion',
      'preparado_completo',
      'preparado_incompleto',
      'confirmado',
      'entregado',
      'cancelado'
    )
  ),
  constraint orders_payment_type_check check (payment_type in ('contado', 'transferencia', 'qr', 'credito')),
  constraint orders_estimated_total_check check (estimated_total >= 0),
  constraint orders_final_total_check check (final_total >= 0)
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text,
  unit_name text,
  unit_abbreviation text,
  requested_quantity numeric(14, 3) not null,
  actual_quantity numeric(14, 3) not null default 0,
  unit_price numeric(14, 2) not null,
  estimated_subtotal numeric(14, 2) not null default 0,
  final_subtotal numeric(14, 2) not null default 0,
  status text not null default 'pendiente',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_items_status_check check (status in ('pendiente', 'preparado', 'parcial', 'sin_stock', 'cancelado')),
  constraint order_items_requested_quantity_check check (requested_quantity > 0),
  constraint order_items_actual_quantity_check check (actual_quantity >= 0),
  constraint order_items_unit_price_check check (unit_price >= 0),
  constraint order_items_estimated_subtotal_check check (estimated_subtotal >= 0),
  constraint order_items_final_subtotal_check check (final_subtotal >= 0)
);

create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_order_date_idx on public.orders (order_date desc);
create index if not exists orders_created_by_idx on public.orders (created_by);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists order_items_status_idx on public.order_items (status);

alter table public.order_items add column if not exists product_name text;
alter table public.order_items add column if not exists unit_name text;
alter table public.order_items add column if not exists unit_abbreviation text;

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
before update on public.orders
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists set_order_items_updated_at on public.order_items;
create trigger set_order_items_updated_at
before update on public.order_items
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Sales roles can view orders" on public.orders;
create policy "Sales roles can view orders"
on public.orders
for select
to authenticated
using (public.current_user_role() in ('administrador', 'ventas'));

drop policy if exists "Sales roles can view order items" on public.order_items;
create policy "Sales roles can view order items"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where o.id = order_id
      and public.current_user_role() in ('administrador', 'ventas')
  )
);

create or replace function public.recalculate_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set estimated_total = coalesce((
        select sum(estimated_subtotal)
        from public.order_items
        where order_id = p_order_id
      ), 0),
      final_total = coalesce((
        select sum(final_subtotal)
        from public.order_items
        where order_id = p_order_id
      ), 0)
  where id = p_order_id;
end;
$$;

create or replace function public.create_order(
  p_customer_id uuid,
  p_order_date date,
  p_payment_type text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
  v_order_id uuid;
  v_item jsonb;
  v_product record;
  v_requested_quantity numeric(14, 3);
  v_unit_price numeric(14, 2);
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
    raise exception 'No tienes permisos para crear pedidos.';
  end if;

  if p_payment_type not in ('contado', 'transferencia', 'qr', 'credito') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener al menos un item.';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id and is_active = true) then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  insert into public.orders (
    customer_id,
    order_date,
    payment_type,
    notes,
    created_by
  )
  values (
    p_customer_id,
    coalesce(p_order_date, current_date),
    p_payment_type,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_user_id
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_requested_quantity := (v_item ->> 'requested_quantity')::numeric;

    if v_requested_quantity is null or v_requested_quantity <= 0 then
      raise exception 'La cantidad solicitada debe ser mayor a cero.';
    end if;

    select p.id, p.name, p.sale_price, u.name as unit_name, u.abbreviation as unit_abbreviation
    into v_product
    from public.products p
    left join public.units_of_measure u on u.id = p.unit_id
    where p.id = (v_item ->> 'product_id')::uuid
      and p.is_active = true;

    if not found then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_unit_price := coalesce(nullif((v_item ->> 'unit_price')::numeric, 0), v_product.sale_price);

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      unit_name,
      unit_abbreviation,
      requested_quantity,
      unit_price,
      estimated_subtotal
    )
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_product.unit_name,
      v_product.unit_abbreviation,
      v_requested_quantity,
      v_unit_price,
      round(v_requested_quantity * v_unit_price, 2)
    );
  end loop;

  perform public.recalculate_order_totals(v_order_id);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'create_order',
    'order',
    v_order_id,
    jsonb_build_object('customer_id', p_customer_id, 'payment_type', p_payment_type)
  );

  return v_order_id;
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

  select oi.*, o.status as order_status
  into v_item
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id
  for update;

  if not found then
    raise exception 'Item de pedido no encontrado.';
  end if;

  if v_item.order_status in ('confirmado', 'entregado', 'cancelado') then
    raise exception 'No se puede preparar un pedido cerrado.';
  end if;

  if p_status in ('preparado', 'parcial') and (p_actual_quantity is null or p_actual_quantity <= 0) then
    raise exception 'La cantidad real debe ser mayor a cero.';
  end if;

  if p_status in ('parcial', 'sin_stock') and length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'Indica un motivo cuando el item queda parcial o sin stock.';
  end if;

  if p_status in ('sin_stock', 'cancelado', 'pendiente') then
    p_actual_quantity := 0;
  end if;

  update public.order_items
  set status = p_status,
      actual_quantity = coalesce(p_actual_quantity, 0),
      final_subtotal = round(coalesce(p_actual_quantity, 0) * unit_price, 2),
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_order_item_id;

  if exists (
    select 1 from public.order_items
    where order_id = v_item.order_id
      and status = 'pendiente'
  ) then
    v_next_order_status := 'en_preparacion';
  elsif exists (
    select 1 from public.order_items
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
      prepared_at = timezone('utc', now())
  where id = v_item.order_id;

  perform public.recalculate_order_totals(v_item.order_id);
end;
$$;

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
      v_item.unit_price,
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
  perform public.recalculate_order_totals(p_order_id);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'confirm_sale',
    'sale',
    v_sale_id,
    jsonb_build_object('origin', 'order', 'order_id', p_order_id, 'payment_type', p_payment_type, 'total', v_subtotal)
  );

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'confirm_order',
    'order',
    p_order_id,
    jsonb_build_object('sale_id', v_sale_id, 'payment_type', p_payment_type, 'final_total', v_subtotal)
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

  if v_order.status in ('confirmado', 'entregado') then
    raise exception 'No se puede cancelar un pedido ya confirmado o entregado.';
  end if;

  update public.orders
  set status = 'cancelado',
      notes = concat_ws(' | ', nullif(notes, ''), 'Cancelado: ' || trim(p_reason))
  where id = p_order_id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'cancel_order',
    'order',
    p_order_id,
    jsonb_build_object('reason', trim(p_reason))
  );
end;
$$;

revoke all on function public.recalculate_order_totals(uuid) from public;
revoke all on function public.create_order(uuid, date, text, text, jsonb) from public;
revoke all on function public.prepare_order_item(uuid, text, numeric, text) from public;
revoke all on function public.confirm_prepared_order(uuid, text) from public;
revoke all on function public.cancel_order(uuid, text) from public;

grant execute on function public.create_order(uuid, date, text, text, jsonb) to authenticated;
grant execute on function public.prepare_order_item(uuid, text, numeric, text) to authenticated;
grant execute on function public.confirm_prepared_order(uuid, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
