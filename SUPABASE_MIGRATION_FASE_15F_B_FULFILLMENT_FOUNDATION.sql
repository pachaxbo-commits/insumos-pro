-- Fase 15F-B - Fundacion de fulfillment, pagos y ventas desde pedidos
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- Aplicar despues de Fase 15E. No ejecutar en produccion sin validacion.
-- Esta migracion NO expone aun RPCs operativas a la aplicacion.

-- ---------------------------------------------------------------------------
-- Ventas originadas en pedidos
-- ---------------------------------------------------------------------------

alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'borrador',
      'pendiente_revision',
      'recibido',
      'en_preparacion',
      'listo_para_confirmar',
      'confirmado_cliente',
      'preparado_completo',
      'preparado_incompleto',
      'confirmado',
      'despachado',
      'entregado',
      'cancelado'
    )
  );

alter table public.sales
  add column if not exists origin text not null default 'manual',
  add column if not exists order_id uuid references public.orders (id) on delete restrict,
  add column if not exists paid_amount numeric(14, 2),
  add column if not exists balance_due numeric(14, 2),
  add column if not exists payment_status text;

alter table public.sales
  drop constraint if exists sales_origin_check;

alter table public.sales
  add constraint sales_origin_check
  check (origin in ('manual', 'order'));

alter table public.sales
  drop constraint if exists sales_order_financial_state_check;

alter table public.sales
  add constraint sales_order_financial_state_check
  check (
    origin = 'manual'
    or (
      order_id is not null
      and paid_amount is not null
      and paid_amount >= 0
      and balance_due is not null
      and balance_due >= 0
      and paid_amount <= total
      and balance_due = round(total - paid_amount, 2)
      and payment_status in ('pendiente', 'parcial', 'pagado')
    )
  );

create unique index if not exists sales_order_id_unique_idx
on public.sales (order_id)
where order_id is not null;

create index if not exists sales_origin_payment_status_idx
on public.sales (origin, payment_status, sale_date desc);

-- ---------------------------------------------------------------------------
-- Capa operativa de entrega/recojo
-- ---------------------------------------------------------------------------

create table if not exists public.order_fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  sale_id uuid references public.sales (id) on delete restrict,
  fulfillment_type text not null,
  status text not null default 'pendiente',
  responsible_user_id uuid references public.profiles (id) on delete set null,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  outstanding_authorized_by uuid references public.profiles (id) on delete set null,
  outstanding_authorized_at timestamptz,
  outstanding_authorization_reason text,
  outstanding_due_date date,
  return_reason text,
  returned_at timestamptz,
  idempotency_key uuid not null,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint order_fulfillments_order_unique unique (order_id),
  constraint order_fulfillments_sale_unique unique (sale_id),
  constraint order_fulfillments_idempotency_unique unique (idempotency_key),
  constraint order_fulfillments_type_check
    check (fulfillment_type in ('delivery', 'recojo')),
  constraint order_fulfillments_status_check
    check (
      status in (
        'pendiente',
        'despachado',
        'entregado',
        'retorno_pendiente',
        'devuelto',
        'cancelado'
      )
    ),
  constraint order_fulfillments_dispatch_state_check
    check (
      status not in ('despachado', 'entregado', 'retorno_pendiente', 'devuelto')
      or dispatched_at is not null
    ),
  constraint order_fulfillments_delivery_state_check
    check (status <> 'entregado' or delivered_at is not null),
  constraint order_fulfillments_return_state_check
    check (
      status not in ('retorno_pendiente', 'devuelto')
      or length(trim(coalesce(return_reason, ''))) >= 10
    ),
  constraint order_fulfillments_returned_at_check
    check (status <> 'devuelto' or returned_at is not null),
  constraint order_fulfillments_outstanding_authorization_check
    check (
      (
        outstanding_authorized_by is null
        and outstanding_authorized_at is null
        and outstanding_authorization_reason is null
      )
      or (
        outstanding_authorized_by is not null
        and outstanding_authorized_at is not null
        and length(trim(coalesce(outstanding_authorization_reason, ''))) >= 10
        and outstanding_due_date is not null
      )
    )
);

create index if not exists order_fulfillments_status_idx
on public.order_fulfillments (status, created_at desc);

create index if not exists order_fulfillments_responsible_idx
on public.order_fulfillments (responsible_user_id, created_at desc);

drop trigger if exists set_order_fulfillments_updated_at
on public.order_fulfillments;

create trigger set_order_fulfillments_updated_at
before update on public.order_fulfillments
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.order_fulfillments enable row level security;

drop policy if exists "Sales roles can view order fulfillments"
on public.order_fulfillments;

create policy "Sales roles can view order fulfillments"
on public.order_fulfillments
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_active = true
      and profile.role in ('administrador', 'ventas')
  )
);

revoke insert, update, delete on table public.order_fulfillments
from anon, authenticated;

grant select on table public.order_fulfillments to authenticated;

-- ---------------------------------------------------------------------------
-- Pagos, caja, CxC e inventario con referencias idempotentes
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists fulfillment_id uuid
    references public.order_fulfillments (id) on delete set null,
  add column if not exists idempotency_key uuid,
  add column if not exists external_reference text,
  add column if not exists status text not null default 'activo',
  add column if not exists reversal_of_payment_id uuid
    references public.payments (id) on delete restrict,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists reversal_reason text;

alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in ('activo', 'revertido'));

alter table public.payments
  drop constraint if exists payments_order_fulfillment_integrity_check;

alter table public.payments
  add constraint payments_order_fulfillment_integrity_check
  check (
    fulfillment_id is null
    or (
      idempotency_key is not null
      and (
        payment_method not in ('qr', 'transferencia')
        or length(trim(coalesce(external_reference, ''))) >= 3
      )
    )
  );

alter table public.payments
  drop constraint if exists payments_reversal_state_check;

alter table public.payments
  add constraint payments_reversal_state_check
  check (
    (
      status = 'activo'
      and reversed_at is null
      and reversed_by is null
      and reversal_reason is null
    )
    or (
      status = 'revertido'
      and reversed_at is not null
      and reversed_by is not null
      and length(trim(coalesce(reversal_reason, ''))) >= 10
    )
  ) not valid;

create unique index if not exists payments_idempotency_unique_idx
on public.payments (idempotency_key)
where idempotency_key is not null;

create unique index if not exists payments_reversal_unique_idx
on public.payments (reversal_of_payment_id)
where reversal_of_payment_id is not null;

create index if not exists payments_fulfillment_idx
on public.payments (fulfillment_id, created_at);

alter table public.cash_movements
  add column if not exists payment_id uuid
    references public.payments (id) on delete restrict;

create unique index if not exists cash_movements_payment_unique_idx
on public.cash_movements (payment_id)
where payment_id is not null;

alter table public.accounts_receivable
  add column if not exists fulfillment_id uuid
    references public.order_fulfillments (id) on delete set null,
  add column if not exists outstanding_authorized_by uuid
    references public.profiles (id) on delete set null,
  add column if not exists outstanding_authorization_reason text;

create unique index if not exists accounts_receivable_fulfillment_unique_idx
on public.accounts_receivable (fulfillment_id)
where fulfillment_id is not null;

alter table public.inventory_movements
  add column if not exists fulfillment_id uuid
    references public.order_fulfillments (id) on delete set null,
  add column if not exists fulfillment_sale_item_id uuid
    references public.sale_items (id) on delete restrict;

create unique index if not exists inventory_fulfillment_sale_item_unique_idx
on public.inventory_movements (fulfillment_sale_item_id)
where fulfillment_sale_item_id is not null;

create index if not exists inventory_movements_fulfillment_idx
on public.inventory_movements (fulfillment_id, created_at);

-- ---------------------------------------------------------------------------
-- Helpers internos. No tienen EXECUTE para anon/authenticated.
-- Las RPC publicas de Fase 15F-C seran los unicos puntos de entrada.
-- ---------------------------------------------------------------------------

create or replace function public.internal_assert_fulfillment_actor(
  p_actor_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role
  into v_role
  from public.profiles
  where id = p_actor_id
    and is_active = true;

  if v_role not in ('administrador', 'ventas') then
    raise exception 'No tienes permisos para operar entregas y cobros de pedidos.';
  end if;

  return v_role;
end;
$$;

create or replace function public.internal_get_or_create_fulfillment(
  p_order_id uuid,
  p_fulfillment_type text,
  p_idempotency_key uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_fulfillment record;
  v_fulfillment_id uuid;
begin
  perform public.internal_assert_fulfillment_actor(p_actor_id);

  if p_fulfillment_type not in ('delivery', 'recojo') then
    raise exception 'Tipo de entrega invalido.';
  end if;

  if p_idempotency_key is null then
    raise exception 'La clave de idempotencia es obligatoria.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  if v_order.origin <> 'catalogo_invitado'
    or v_order.status <> 'confirmado_cliente'
  then
    raise exception 'El pedido no esta confirmado por el cliente.';
  end if;

  if v_order.customer_id is null then
    raise exception 'El pedido debe tener un cliente interno vinculado.';
  end if;

  if v_order.delivery_type is distinct from p_fulfillment_type then
    raise exception 'El tipo de entrega no coincide con el pedido.';
  end if;

  select *
  into v_fulfillment
  from public.order_fulfillments
  where order_id = p_order_id
  for update;

  if found then
    if v_fulfillment.idempotency_key <> p_idempotency_key
      or v_fulfillment.fulfillment_type <> p_fulfillment_type
    then
      raise exception 'El pedido ya tiene un fulfillment diferente.';
    end if;

    return v_fulfillment.id;
  end if;

  insert into public.order_fulfillments (
    order_id,
    fulfillment_type,
    status,
    responsible_user_id,
    idempotency_key,
    created_by,
    updated_by
  )
  values (
    p_order_id,
    p_fulfillment_type,
    'pendiente',
    p_actor_id,
    p_idempotency_key,
    p_actor_id,
    p_actor_id
  )
  returning id into v_fulfillment_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_actor_id,
    'create_order_fulfillment',
    'order_fulfillment',
    v_fulfillment_id,
    jsonb_build_object(
      'order_id', p_order_id,
      'fulfillment_type', p_fulfillment_type,
      'status', 'pendiente'
    )
  );

  return v_fulfillment_id;
end;
$$;

create or replace function public.internal_create_order_sale(
  p_fulfillment_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fulfillment record;
  v_order record;
  v_sale_id uuid;
  v_total numeric(14, 2);
  v_legacy_payment_type text;
begin
  perform public.internal_assert_fulfillment_actor(p_actor_id);

  select *
  into v_fulfillment
  from public.order_fulfillments
  where id = p_fulfillment_id
  for update;

  if not found then
    raise exception 'Fulfillment no encontrado.';
  end if;

  if v_fulfillment.sale_id is not null then
    return v_fulfillment.sale_id;
  end if;

  if v_fulfillment.status <> 'pendiente' then
    raise exception 'El fulfillment ya no esta pendiente.';
  end if;

  select *
  into v_order
  from public.orders
  where id = v_fulfillment.order_id
  for update;

  if not found
    or v_order.status <> 'confirmado_cliente'
    or v_order.sale_id is not null
  then
    raise exception 'El pedido ya fue cerrado o no esta confirmado.';
  end if;

  if exists (
    select 1
    from public.order_items
    where order_id = v_order.id
      and status = 'pendiente'
  ) then
    raise exception 'El pedido todavia tiene items pendientes.';
  end if;

  if not exists (
    select 1
    from public.order_items
    where order_id = v_order.id
      and status in ('preparado', 'parcial')
      and actual_quantity > 0
  ) then
    raise exception 'El pedido no tiene items entregables.';
  end if;

  select round(coalesce(sum(final_subtotal), 0), 2)
  into v_total
  from public.order_items
  where order_id = v_order.id
    and status in ('preparado', 'parcial')
    and actual_quantity > 0;

  if v_total <= 0 or v_total <> round(v_order.final_total, 2) then
    raise exception 'El total final del pedido no coincide con sus items.';
  end if;

  -- Campo legado para compatibilidad. Los pagos reales se leen de payments.
  v_legacy_payment_type := case
    when v_order.expected_payment_method = 'qr' then 'qr'
    else 'contado'
  end;

  insert into public.sales (
    customer_id,
    sale_date,
    subtotal,
    discount,
    total,
    payment_type,
    status,
    notes,
    created_by,
    origin,
    order_id,
    paid_amount,
    balance_due,
    payment_status
  )
  values (
    v_order.customer_id,
    current_date,
    v_total,
    0,
    v_total,
    v_legacy_payment_type,
    'borrador',
    concat_ws(
      ' | ',
      'Venta generada desde pedido ' || v_order.id::text,
      nullif(v_order.notes, '')
    ),
    p_actor_id,
    'order',
    v_order.id,
    0,
    v_total,
    'pendiente'
  )
  returning id into v_sale_id;

  insert into public.sale_items (
    sale_id,
    product_id,
    quantity,
    unit_price,
    subtotal
  )
  select
    v_sale_id,
    item.product_id,
    item.actual_quantity,
    coalesce(item.final_unit_price, item.unit_price),
    item.final_subtotal
  from public.order_items item
  where item.order_id = v_order.id
    and item.status in ('preparado', 'parcial')
    and item.actual_quantity > 0
  order by item.created_at, item.id;

  update public.order_fulfillments
  set sale_id = v_sale_id,
      updated_by = p_actor_id
  where id = p_fulfillment_id;

  update public.orders
  set sale_id = v_sale_id
  where id = v_order.id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_actor_id,
    'create_order_sale',
    'sale',
    v_sale_id,
    jsonb_build_object(
      'order_id', v_order.id,
      'fulfillment_id', p_fulfillment_id,
      'total', v_total,
      'payment_status', 'pendiente'
    )
  );

  return v_sale_id;
end;
$$;

create or replace function public.internal_post_order_sale_inventory(
  p_fulfillment_id uuid,
  p_actor_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fulfillment record;
  v_sale record;
  v_item record;
  v_stock_before numeric(14, 3);
  v_stock_after numeric(14, 3);
  v_target_status text;
  v_now timestamptz := timezone('utc', now());
begin
  perform public.internal_assert_fulfillment_actor(p_actor_id);

  select *
  into v_fulfillment
  from public.order_fulfillments
  where id = p_fulfillment_id
  for update;

  if not found or v_fulfillment.sale_id is null then
    raise exception 'El fulfillment no tiene una venta preparada.';
  end if;

  v_target_status := case
    when v_fulfillment.fulfillment_type = 'delivery' then 'despachado'
    else 'entregado'
  end;

  if v_fulfillment.status = v_target_status then
    return v_fulfillment.sale_id;
  end if;

  if v_fulfillment.status <> 'pendiente' then
    raise exception 'El fulfillment ya fue procesado.';
  end if;

  select *
  into v_sale
  from public.sales
  where id = v_fulfillment.sale_id
    and origin = 'order'
    and order_id = v_fulfillment.order_id
  for update;

  if not found or v_sale.status <> 'borrador' then
    raise exception 'La venta del pedido no esta disponible para despacho.';
  end if;

  -- Bloqueo determinista de productos para reducir riesgo de deadlocks.
  perform product.id
  from public.products product
  join public.sale_items item on item.product_id = product.id
  where item.sale_id = v_sale.id
  order by product.id
  for update of product;

  for v_item in
    select *
    from public.sale_items
    where sale_id = v_sale.id
    order by product_id, id
  loop
    if exists (
      select 1
      from public.inventory_movements
      where fulfillment_sale_item_id = v_item.id
    ) then
      continue;
    end if;

    select stock_current
    into v_stock_before
    from public.products
    where id = v_item.product_id
      and is_active = true
    for update;

    if not found then
      raise exception 'Producto no encontrado o inactivo.';
    end if;

    v_stock_after := v_stock_before - v_item.quantity;

    if v_stock_after < 0 then
      raise exception 'Stock insuficiente para despachar el pedido.';
    end if;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reason,
      notes,
      created_by,
      fulfillment_id,
      fulfillment_sale_item_id
    )
    values (
      v_item.product_id,
      'salida',
      v_item.quantity,
      v_stock_before,
      v_stock_after,
      'Venta de pedido despachada',
      'Fulfillment ' || p_fulfillment_id::text || ', venta ' || v_sale.id::text,
      p_actor_id,
      p_fulfillment_id,
      v_item.id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  update public.sales
  set status = 'confirmada'
  where id = v_sale.id;

  update public.order_fulfillments
  set status = v_target_status,
      responsible_user_id = p_actor_id,
      dispatched_at = v_now,
      delivered_at = case
        when v_target_status = 'entregado' then v_now
        else delivered_at
      end,
      updated_by = p_actor_id
  where id = p_fulfillment_id;

  update public.orders
  set status = case
        when v_target_status = 'entregado' then 'entregado'
        else 'despachado'
      end,
      confirmed_by = p_actor_id,
      confirmed_at = v_now
  where id = v_fulfillment.order_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_actor_id,
    'post_order_sale_inventory',
    'order_fulfillment',
    p_fulfillment_id,
    jsonb_build_object(
      'order_id', v_fulfillment.order_id,
      'sale_id', v_sale.id,
      'fulfillment_type', v_fulfillment.fulfillment_type,
      'status', v_target_status,
      'total', v_sale.total
    )
  );

  return v_sale.id;
end;
$$;

create or replace function public.internal_sync_order_sale_financials(
  p_sale_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_sale record;
  v_customer record;
  v_fulfillment record;
  v_account record;
  v_paid numeric(14, 2);
  v_balance numeric(14, 2);
  v_old_balance numeric(14, 2) := 0;
  v_status text;
  v_due_date date;
  v_has_account boolean := false;
begin
  v_actor_role := public.internal_assert_fulfillment_actor(p_actor_id);

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
    and origin = 'order'
  for update;

  if not found then
    raise exception 'Venta de pedido no encontrada.';
  end if;

  select *
  into v_fulfillment
  from public.order_fulfillments
  where sale_id = p_sale_id
  for update;

  if not found then
    raise exception 'Fulfillment de venta no encontrado.';
  end if;

  select *
  into v_customer
  from public.customers
  where id = v_sale.customer_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  select round(coalesce(sum(amount), 0), 2)
  into v_paid
  from public.payments
  where sale_id = p_sale_id
    and payment_type = 'cobro_cliente'
    and status = 'activo';

  if v_paid > v_sale.total then
    raise exception 'Los pagos no pueden superar el total de la venta.';
  end if;

  v_balance := round(v_sale.total - v_paid, 2);
  v_status := case
    when v_paid = 0 then 'pendiente'
    when v_balance = 0 then 'pagado'
    else 'parcial'
  end;

  select *
  into v_account
  from public.accounts_receivable
  where sale_id = p_sale_id
  for update;

  if found then
    v_has_account := true;
    v_old_balance := v_account.balance;
    v_due_date := v_account.due_date;
  else
    v_due_date := coalesce(
      v_fulfillment.outstanding_due_date,
      v_sale.sale_date + 15
    );
  end if;

  if v_balance > 0 then
    if v_customer.customer_type = 'contado' then
      if not exists (
        select 1
        from public.profiles authorizer
        where authorizer.id = v_fulfillment.outstanding_authorized_by
          and authorizer.is_active = true
          and authorizer.role = 'administrador'
      )
        or length(trim(coalesce(
          v_fulfillment.outstanding_authorization_reason,
          ''
        ))) < 10
        or v_fulfillment.outstanding_due_date is null
      then
        raise exception 'El saldo pendiente de un cliente contado requiere autorizacion del administrador.';
      end if;
    elsif v_customer.current_balance + (v_balance - v_old_balance)
      > v_customer.credit_limit
    then
      raise exception 'El saldo pendiente supera el limite de credito del cliente.';
    end if;
  end if;

  if v_has_account then
    update public.accounts_receivable
    set amount = v_sale.total,
        paid_amount = v_paid,
        balance = v_balance,
        due_date = v_due_date,
        status = public.get_finance_status(
          v_balance,
          v_sale.total,
          v_due_date
        ),
        fulfillment_id = v_fulfillment.id,
        outstanding_authorized_by =
          v_fulfillment.outstanding_authorized_by,
        outstanding_authorization_reason =
          v_fulfillment.outstanding_authorization_reason
    where id = v_account.id;
  elsif v_balance > 0 then
    insert into public.accounts_receivable (
      sale_id,
      customer_id,
      amount,
      paid_amount,
      balance,
      due_date,
      status,
      notes,
      fulfillment_id,
      outstanding_authorized_by,
      outstanding_authorization_reason
    )
    values (
      p_sale_id,
      v_sale.customer_id,
      v_sale.total,
      v_paid,
      v_balance,
      v_due_date,
      public.get_finance_status(v_balance, v_sale.total, v_due_date),
      'Saldo de venta originada en pedido',
      v_fulfillment.id,
      v_fulfillment.outstanding_authorized_by,
      v_fulfillment.outstanding_authorization_reason
    );
  end if;

  update public.customers
  set current_balance = greatest(
    current_balance + (v_balance - v_old_balance),
    0
  )
  where id = v_sale.customer_id;

  update public.sales
  set paid_amount = v_paid,
      balance_due = v_balance,
      payment_status = v_status
  where id = p_sale_id;
end;
$$;

create or replace function public.internal_register_order_sale_payments(
  p_sale_id uuid,
  p_payments jsonb,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale record;
  v_fulfillment record;
  v_item jsonb;
  v_payment_id uuid;
  v_existing record;
  v_idempotency_key uuid;
  v_amount numeric(14, 2);
  v_method text;
  v_reference text;
  v_payment_date date;
  v_current_paid numeric(14, 2);
  v_inserted integer := 0;
begin
  perform public.internal_assert_fulfillment_actor(p_actor_id);

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'La lista de pagos es invalida.';
  end if;

  if jsonb_array_length(p_payments) > 10 then
    raise exception 'No se permiten mas de 10 pagos por operacion.';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
    and origin = 'order'
  for update;

  if not found or v_sale.status <> 'confirmada' then
    raise exception 'La venta no esta confirmada para recibir pagos.';
  end if;

  select *
  into v_fulfillment
  from public.order_fulfillments
  where sale_id = p_sale_id
  for update;

  if not found
    or v_fulfillment.status not in ('despachado', 'entregado')
  then
    raise exception 'El pedido no fue despachado o entregado.';
  end if;

  select round(coalesce(sum(amount), 0), 2)
  into v_current_paid
  from public.payments
  where sale_id = p_sale_id
    and payment_type = 'cobro_cliente'
    and status = 'activo';

  for v_item in
    select value from jsonb_array_elements(p_payments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Pago invalido.';
    end if;

    begin
      v_idempotency_key := (v_item ->> 'idempotency_key')::uuid;
      v_amount := round((v_item ->> 'amount')::numeric, 2);
      v_payment_date := coalesce(
        nullif(v_item ->> 'payment_date', '')::date,
        current_date
      );
    exception
      when others then
        raise exception 'Datos de pago invalidos.';
    end;

    v_method := trim(coalesce(v_item ->> 'payment_method', ''));
    v_reference := nullif(trim(coalesce(v_item ->> 'external_reference', '')), '');

    if v_idempotency_key is null or v_amount <= 0 then
      raise exception 'El monto y la idempotencia del pago son obligatorios.';
    end if;

    if v_method not in ('efectivo', 'qr', 'transferencia') then
      raise exception 'Metodo de pago invalido.';
    end if;

    if v_method in ('qr', 'transferencia')
      and length(coalesce(v_reference, '')) < 3
    then
      raise exception 'QR y transferencia requieren una referencia.';
    end if;

    select *
    into v_existing
    from public.payments
    where idempotency_key = v_idempotency_key;

    if found then
      if v_existing.sale_id <> p_sale_id
        or v_existing.amount <> v_amount
        or v_existing.payment_method <> v_method
        or v_existing.external_reference is distinct from v_reference
      then
        raise exception 'La clave de idempotencia ya fue usada con otro pago.';
      end if;

      continue;
    end if;

    if v_current_paid + v_amount > v_sale.total then
      raise exception 'El pago no puede ser mayor al saldo pendiente.';
    end if;

    insert into public.payments (
      payment_type,
      customer_id,
      sale_id,
      amount,
      payment_method,
      payment_date,
      notes,
      created_by,
      fulfillment_id,
      idempotency_key,
      external_reference,
      status
    )
    values (
      'cobro_cliente',
      v_sale.customer_id,
      p_sale_id,
      v_amount,
      v_method,
      v_payment_date,
      'Cobro de venta originada en pedido',
      p_actor_id,
      v_fulfillment.id,
      v_idempotency_key,
      v_reference,
      'activo'
    )
    returning id into v_payment_id;

    insert into public.cash_movements (
      movement_type,
      source_type,
      source_id,
      amount,
      payment_method,
      movement_date,
      notes,
      created_by,
      payment_id
    )
    values (
      'ingreso',
      'cobro_cliente',
      v_payment_id,
      v_amount,
      v_method,
      v_payment_date,
      'Cobro de venta originada en pedido',
      p_actor_id,
      v_payment_id
    );

    v_current_paid := v_current_paid + v_amount;
    v_inserted := v_inserted + 1;
  end loop;

  perform public.internal_sync_order_sale_financials(
    p_sale_id,
    p_actor_id
  );

  if v_inserted > 0 then
    insert into public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      p_actor_id,
      'register_order_sale_payments',
      'sale',
      p_sale_id,
      jsonb_build_object(
        'fulfillment_id', v_fulfillment.id,
        'payments_inserted', v_inserted,
        'paid_amount', v_current_paid,
        'balance_due', round(v_sale.total - v_current_paid, 2)
      )
    );
  end if;

  return v_inserted;
end;
$$;

-- Fase 12D queda operativa para ventas manuales, pero cualquier intento de
-- marcar anulada una venta de pedido revierte toda la transaccion.
create or replace function public.block_order_sale_cancellation_until_15f_f()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.origin = 'order'
    and old.status <> 'anulada'
    and new.status = 'anulada'
  then
    raise exception 'Las ventas originadas en pedidos requieren devolucion y reversa explicita antes de anularse (Fase 15F-F).';
  end if;

  return new;
end;
$$;

drop trigger if exists block_order_sale_cancellation_until_15f_f
on public.sales;

create trigger block_order_sale_cancellation_until_15f_f
before update of status on public.sales
for each row
execute function public.block_order_sale_cancellation_until_15f_f();

revoke all on function public.internal_assert_fulfillment_actor(uuid)
from public, anon, authenticated;
revoke all on function public.internal_get_or_create_fulfillment(uuid, text, uuid, uuid)
from public, anon, authenticated;
revoke all on function public.internal_create_order_sale(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.internal_post_order_sale_inventory(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.internal_sync_order_sale_financials(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.internal_register_order_sale_payments(uuid, jsonb, uuid)
from public, anon, authenticated;

comment on table public.order_fulfillments is
  'Capa operativa de despacho/entrega. Solo se muta mediante RPCs controladas.';
comment on column public.sales.payment_type is
  'Campo legado/declarativo. En ventas originadas en pedidos, payments es la fuente real.';
comment on column public.payments.external_reference is
  'Referencia obligatoria para QR/transferencia en pagos asociados a fulfillment.';
