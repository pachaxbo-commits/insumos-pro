begin;

-- El recibo debe tomar como fuente de verdad toda cantidad real confirmada por
-- Entrega. El estado que dejó Inventario ya no decide si una línea es cobrable.
do $$
declare
  v_definition text;
  v_needle text := 'and item.status in (''completo'', ''parcial'')';
  v_occurrences integer;
begin
  select pg_get_functiondef(
    'public.create_qb_receipt_draft(uuid,uuid[])'::regprocedure
  )
  into v_definition;

  v_occurrences :=
    (length(v_definition) - length(replace(v_definition, v_needle, '')))
    / length(v_needle);

  if v_occurrences <> 2 then
    raise exception
      'No se pudo actualizar create_qb_receipt_draft: se esperaban 2 filtros de preparación y se encontraron %.',
      v_occurrences;
  end if;

  execute replace(v_definition, v_needle, 'and true');
end;
$$;

comment on function public.create_qb_receipt_draft(uuid, uuid[]) is
  'QB-7/QB-13: crea un recibo acumulativo usando toda cantidad real positiva confirmada por Entrega, sin depender del estado previo de Inventario.';

-- Deshacer una entrega también debe retirar el pedido de cualquier borrador.
-- Un recibo ya emitido conserva su integridad: primero debe anularse desde
-- Recibos y luego el entregador puede corregir la entrega.
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
  v_draft_receipt_ids uuid[];
  v_draft_receipt_id uuid;
  v_period_start date;
  v_period_end date;
begin
  select role into v_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_user_id is null
    or v_role not in ('admin', 'administrador', 'inventario', 'entregador') then
    raise exception 'Tu rol no puede deshacer entregas.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indica el motivo para deshacer la entrega.';
  end if;

  select *
  into v_order
  from public.qb_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Entrega confirmada no encontrada.';
  end if;

  -- La fila bloqueada es la versión vigente. Así el botón Deshacer no falla
  -- por una actualización en tiempo real ocurrida después de renderizar.
  if exists (
    select 1
    from public.qb_receipt_orders receipt_order
    join public.qb_receipts receipt on receipt.id = receipt_order.receipt_id
    where receipt_order.order_id = p_order_id
      and receipt.status = 'emitido'
  ) then
    raise exception
      'Este pedido ya tiene un recibo emitido. Anula primero el recibo desde Recibos y vuelve a deshacer la entrega.';
  end if;

  select array_agg(distinct receipt_order.receipt_id)
  into v_draft_receipt_ids
  from public.qb_receipt_orders receipt_order
  join public.qb_receipts receipt on receipt.id = receipt_order.receipt_id
  where receipt_order.order_id = p_order_id
    and receipt.status = 'borrador';

  delete from public.qb_receipt_orders receipt_order
  using public.qb_receipts receipt
  where receipt_order.receipt_id = receipt.id
    and receipt_order.order_id = p_order_id
    and receipt.status = 'borrador';

  foreach v_draft_receipt_id in array coalesce(
    v_draft_receipt_ids,
    array[]::uuid[]
  )
  loop
    if not exists (
      select 1
      from public.qb_receipt_orders
      where receipt_id = v_draft_receipt_id
    ) then
      delete from public.qb_receipts
      where id = v_draft_receipt_id
        and status = 'borrador';
    else
      select
        min(coalesce(orders.delivered_at, orders.submitted_at))::date,
        max(coalesce(orders.delivered_at, orders.submitted_at))::date
      into v_period_start, v_period_end
      from public.qb_receipt_orders receipt_order
      join public.qb_orders orders on orders.id = receipt_order.order_id
      where receipt_order.receipt_id = v_draft_receipt_id;

      update public.qb_receipts
      set period_start = v_period_start,
          period_end = v_period_end
      where id = v_draft_receipt_id
        and status = 'borrador';

      perform public.recalculate_qb_receipt_totals(v_draft_receipt_id);
    end if;
  end loop;

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
      'actor_role', v_role,
      'draft_receipts_detached',
        coalesce(array_length(v_draft_receipt_ids, 1), 0),
      'client_expected_updated_at', p_expected_updated_at,
      'server_updated_at', v_order.updated_at
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
