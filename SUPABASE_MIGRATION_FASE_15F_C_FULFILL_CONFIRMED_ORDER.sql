-- Fase 15F-C - Cierre atomico de pedido confirmado
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- Aplicar despues de Fase 15F-B. No ejecutar en produccion sin validacion.

alter table public.order_fulfillments
  add column if not exists request_fingerprint text;

alter table public.order_fulfillments
  drop constraint if exists order_fulfillments_request_fingerprint_check;

alter table public.order_fulfillments
  add constraint order_fulfillments_request_fingerprint_check
  check (
    request_fingerprint is null
    or request_fingerprint ~ '^[a-f0-9]{64}$'
  );

-- Ventas puede ver solo pagos asociados al cierre de pedidos.
drop policy if exists "Sales roles can view order sale payments"
on public.payments;

create policy "Sales roles can view order sale payments"
on public.payments
for select
to authenticated
using (
  fulfillment_id is not null
  and exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_active = true
      and profile.role in ('administrador', 'ventas')
  )
);

create or replace function public.fulfill_confirmed_order(
  p_order_id uuid,
  p_fulfillment_type text,
  p_idempotency_key uuid,
  p_payments jsonb default '[]'::jsonb,
  p_authorize_outstanding boolean default false,
  p_outstanding_authorization_reason text default null,
  p_outstanding_due_date date default null
)
returns table (
  fulfillment_id uuid,
  sale_id uuid,
  order_status text,
  sale_payment_status text,
  total numeric,
  paid numeric,
  balance numeric,
  result_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_order record;
  v_customer record;
  v_fulfillment record;
  v_sale record;
  v_item jsonb;
  v_payment_amount numeric(14, 2);
  v_payment_total numeric(14, 2) := 0;
  v_payment_method text;
  v_payment_reference text;
  v_payment_key uuid;
  v_due_date date;
  v_balance numeric(14, 2);
  v_target_status text;
  v_fingerprint text;
  v_new_fulfillment_id uuid;
  v_new_sale_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  v_actor_role := public.internal_assert_fulfillment_actor(v_actor_id);

  if p_order_id is null or p_idempotency_key is null then
    raise exception 'Pedido e idempotencia son obligatorios.';
  end if;

  if p_fulfillment_type not in ('delivery', 'recojo') then
    raise exception 'Tipo de entrega invalido.';
  end if;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'La lista de pagos es invalida.';
  end if;

  if jsonb_array_length(p_payments) > 10 then
    raise exception 'No se permiten mas de 10 pagos iniciales.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payments) payment
    group by payment ->> 'idempotency_key'
    having count(*) > 1
  ) then
    raise exception 'La lista contiene pagos duplicados.';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_payments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Pago inicial invalido.';
    end if;

    begin
      v_payment_key := (v_item ->> 'idempotency_key')::uuid;
      v_payment_amount := round((v_item ->> 'amount')::numeric, 2);
    exception
      when others then
        raise exception 'Monto o idempotencia de pago invalido.';
    end;

    v_payment_method := trim(coalesce(v_item ->> 'payment_method', ''));
    v_payment_reference :=
      nullif(trim(coalesce(v_item ->> 'external_reference', '')), '');

    if v_payment_key is null
      or v_payment_amount is null
      or v_payment_amount <= 0
    then
      raise exception 'Cada pago debe tener un monto mayor a cero.';
    end if;

    if v_payment_method not in ('efectivo', 'qr', 'transferencia') then
      raise exception 'Metodo de pago invalido.';
    end if;

    if v_payment_method in ('qr', 'transferencia')
      and length(coalesce(v_payment_reference, '')) < 3
    then
      raise exception 'QR y transferencia requieren una referencia.';
    end if;

    v_payment_total := round(v_payment_total + v_payment_amount, 2);
  end loop;

  v_fingerprint := encode(
    digest(
      concat_ws(
        '|',
        p_order_id::text,
        p_fulfillment_type,
        p_idempotency_key::text,
        p_payments::text,
        p_authorize_outstanding::text,
        trim(coalesce(p_outstanding_authorization_reason, '')),
        coalesce(p_outstanding_due_date::text, '')
      ),
      'sha256'
    ),
    'hex'
  );

  -- El pedido se bloquea antes de leer fulfillment o precios congelados.
  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.';
  end if;

  select *
  into v_fulfillment
  from public.order_fulfillments
  where order_id = p_order_id
  for update;

  if found then
    if v_fulfillment.idempotency_key <> p_idempotency_key
      or v_fulfillment.request_fingerprint is distinct from v_fingerprint
    then
      raise exception 'El pedido ya fue procesado con otra solicitud.';
    end if;

    if v_fulfillment.status in ('despachado', 'entregado') then
      select *
      into v_sale
      from public.sales
      where id = v_fulfillment.sale_id;

      if not found then
        raise exception 'El cierre existe pero no se encontro su venta.';
      end if;

      fulfillment_id := v_fulfillment.id;
      sale_id := v_sale.id;
      order_status := v_order.status;
      sale_payment_status := v_sale.payment_status;
      total := v_sale.total;
      paid := v_sale.paid_amount;
      balance := v_sale.balance_due;
      result_code := 'already_fulfilled';
      return next;
      return;
    end if;

    if v_fulfillment.status <> 'pendiente' then
      raise exception 'El fulfillment ya no puede procesarse.';
    end if;

    if v_order.origin <> 'catalogo_invitado'
      or v_order.status <> 'confirmado_cliente'
      or v_order.customer_confirmed_at is null
    then
      raise exception 'El pedido pendiente ya no conserva una confirmacion valida.';
    end if;

    if not exists (
      select 1
      from public.order_public_events event
      where event.order_id = p_order_id
        and event.quote_version = v_order.quote_version
        and event.event_type in (
          'customer_confirmed',
          'customer_confirmed_manually'
        )
    ) then
      raise exception 'La version final del pedido no tiene confirmacion vigente.';
    end if;
  else
    if v_order.origin <> 'catalogo_invitado'
      or v_order.status <> 'confirmado_cliente'
      or v_order.customer_confirmed_at is null
    then
      raise exception 'Solo se puede cerrar un pedido publico confirmado por el cliente.';
    end if;

    if v_order.customer_id is null then
      raise exception 'Vincula un cliente interno antes de cerrar el pedido.';
    end if;

    if v_order.delivery_type is distinct from p_fulfillment_type then
      raise exception 'El tipo de entrega no coincide con el pedido.';
    end if;

    if not exists (
      select 1
      from public.order_public_events event
      where event.order_id = p_order_id
        and event.quote_version = v_order.quote_version
        and event.event_type in (
          'customer_confirmed',
          'customer_confirmed_manually'
        )
    ) then
      raise exception 'La version final del pedido no tiene confirmacion vigente.';
    end if;

    v_new_fulfillment_id := public.internal_get_or_create_fulfillment(
      p_order_id,
      p_fulfillment_type,
      p_idempotency_key,
      v_actor_id
    );

    update public.order_fulfillments
    set request_fingerprint = v_fingerprint,
        updated_by = v_actor_id
    where id = v_new_fulfillment_id;

    select *
    into v_fulfillment
    from public.order_fulfillments
    where id = v_new_fulfillment_id
    for update;
  end if;

  if v_fulfillment.request_fingerprint is null then
    update public.order_fulfillments
    set request_fingerprint = v_fingerprint,
        updated_by = v_actor_id
    where id = v_fulfillment.id;
  end if;

  v_new_sale_id := public.internal_create_order_sale(
    v_fulfillment.id,
    v_actor_id
  );

  select *
  into v_sale
  from public.sales
  where id = v_new_sale_id
  for update;

  if v_payment_total > v_sale.total then
    raise exception 'Los pagos no pueden superar el total de la venta.';
  end if;

  v_balance := round(v_sale.total - v_payment_total, 2);

  select *
  into v_customer
  from public.customers
  where id = v_sale.customer_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Cliente no encontrado o inactivo.';
  end if;

  if v_balance > 0 then
    if v_customer.customer_type = 'contado' then
      if v_actor_role <> 'administrador'
        or not p_authorize_outstanding
        or length(trim(coalesce(
          p_outstanding_authorization_reason,
          ''
        ))) < 10
        or p_outstanding_due_date is null
      then
        raise exception 'El saldo de un cliente contado requiere autorizacion de administrador, motivo y vencimiento.';
      end if;

      v_due_date := p_outstanding_due_date;

      if v_due_date < current_date then
        raise exception 'La fecha de vencimiento no puede estar en el pasado.';
      end if;

      update public.order_fulfillments
      set outstanding_authorized_by = v_actor_id,
          outstanding_authorized_at = timezone('utc', now()),
          outstanding_authorization_reason =
            trim(p_outstanding_authorization_reason),
          outstanding_due_date = v_due_date,
          updated_by = v_actor_id
      where id = v_fulfillment.id;
    else
      v_due_date := coalesce(
        p_outstanding_due_date,
        current_date + 15
      );

      if v_due_date < current_date then
        raise exception 'La fecha de vencimiento no puede estar en el pasado.';
      end if;

      update public.order_fulfillments
      set outstanding_due_date = v_due_date,
          updated_by = v_actor_id
      where id = v_fulfillment.id;
    end if;
  else
    update public.order_fulfillments
    set outstanding_authorized_by = null,
        outstanding_authorized_at = null,
        outstanding_authorization_reason = null,
        outstanding_due_date = null,
        updated_by = v_actor_id
    where id = v_fulfillment.id;
  end if;

  -- A partir de aqui cualquier error revierte venta, stock, pagos, caja y CxC.
  perform public.internal_post_order_sale_inventory(
    v_fulfillment.id,
    v_actor_id
  );

  perform public.internal_register_order_sale_payments(
    v_sale.id,
    p_payments,
    v_actor_id
  );

  v_new_fulfillment_id := v_fulfillment.id;
  v_new_sale_id := v_sale.id;

  select *
  into v_fulfillment
  from public.order_fulfillments
  where id = v_new_fulfillment_id;

  select *
  into v_sale
  from public.sales
  where id = v_new_sale_id;

  v_target_status := case
    when p_fulfillment_type = 'delivery' then 'despachado'
    else 'entregado'
  end;

  if v_fulfillment.status <> v_target_status
    or v_sale.status <> 'confirmada'
  then
    raise exception 'No se pudo completar el cierre comercial.';
  end if;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_actor_id,
    'fulfill_confirmed_order',
    'order_fulfillment',
    v_fulfillment.id,
    jsonb_build_object(
      'order_id', p_order_id,
      'sale_id', v_sale.id,
      'fulfillment_type', p_fulfillment_type,
      'fulfillment_status', v_fulfillment.status,
      'total', v_sale.total,
      'paid_amount', v_sale.paid_amount,
      'balance_due', v_sale.balance_due,
      'payment_status', v_sale.payment_status,
      'payments_count', jsonb_array_length(p_payments),
      'outstanding_authorized',
        v_fulfillment.outstanding_authorized_by is not null
    )
  );

  fulfillment_id := v_fulfillment.id;
  sale_id := v_sale.id;
  order_status := v_target_status;
  sale_payment_status := v_sale.payment_status;
  total := v_sale.total;
  paid := v_sale.paid_amount;
  balance := v_sale.balance_due;
  result_code := 'fulfilled';
  return next;
end;
$$;

revoke all on function public.fulfill_confirmed_order(
  uuid,
  text,
  uuid,
  jsonb,
  boolean,
  text,
  date
) from public, anon;

grant execute on function public.fulfill_confirmed_order(
  uuid,
  text,
  uuid,
  jsonb,
  boolean,
  text,
  date
) to authenticated;

comment on function public.fulfill_confirmed_order(
  uuid,
  text,
  uuid,
  jsonb,
  boolean,
  text,
  date
) is
  'Cierra atomicamente un pedido publico confirmado: venta, stock, pagos, caja y CxC.';
