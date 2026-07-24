begin;

-- Decisión temporal del cliente: todos los pedidos por cantidad avanzan de 0,5.
-- Los pedidos por importe en Bs conservan su precisión monetaria independiente.
update public.products
set catalog_quantity_step = 0.5
where is_sellable = true
  and catalog_quantity_step is distinct from 0.5;

update public.qb_product_allowed_units
set quantity_step = 0.5,
    updated_at = now()
where usage_context = 'pedido'
  and is_active = true
  and quantity_step is distinct from 0.5;

-- Los tres roles operativos pueden reabrir sin límite temporal. Se conserva el
-- motivo, la auditoría, el control de concurrencia y el bloqueo por recibo emitido.
create or replace function public.reopen_qb_matrix_delivery(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_order public.qb_orders%rowtype;
begin
  select role into v_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_id is null
    or v_role not in ('admin', 'administrador', 'inventario', 'entregador') then
    raise exception 'Tu rol no puede reabrir entregas.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indica el motivo de reapertura.';
  end if;

  select *
  into v_order
  from public.qb_orders
  where id = p_order_id
  for update;

  if v_order.id is null
    or v_order.updated_at is distinct from p_expected_updated_at then
    raise exception 'QB_MATRIX_CONFLICT: el pedido cambio en otro dispositivo.'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.qb_receipt_orders receipt_order
    join public.qb_receipts receipt on receipt.id = receipt_order.receipt_id
    where receipt_order.order_id = p_order_id
      and receipt.status <> 'borrador'
  ) then
    raise exception 'No se puede reabrir una entrega incluida en un recibo emitido.';
  end if;

  update public.qb_order_delivery_confirmations
  set status = 'reabierto',
      reopened_by = v_user_id,
      reopened_at = now(),
      reopen_reason = trim(p_reason),
      idempotency_key = p_idempotency_key
  where order_id = p_order_id
    and status = 'confirmado';

  if not found then
    raise exception 'Entrega confirmada no encontrada.';
  end if;

  update public.qb_orders
  set status = 'preparado',
      delivered_by = null,
      delivered_at = null
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
    'reopen_qb_matrix_delivery',
    'qb_order',
    p_order_id,
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'stock_restored', false,
      'reason', trim(p_reason),
      'actor_role', v_role
    )
  );

  return p_order_id;
end;
$$;

revoke all on function public.reopen_qb_matrix_delivery(
  uuid,
  timestamptz,
  text,
  text
) from public, anon;
grant execute on function public.reopen_qb_matrix_delivery(
  uuid,
  timestamptz,
  text,
  text
) to authenticated;

commit;
