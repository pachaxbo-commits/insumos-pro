-- Fase 14C - Confirmacion segura de compras multiples
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- No ejecutar en produccion sin backup y validacion.

alter table public.purchases
add column if not exists purchase_batch_id uuid references public.purchase_batches (id) on delete set null;

alter table public.purchase_batches
add column if not exists confirmed_by uuid references public.profiles (id) on delete set null;

alter table public.purchase_batches
add column if not exists confirmed_at timestamptz;

alter table public.purchase_batches
add column if not exists child_purchase_ids uuid[] not null default '{}'::uuid[];

alter table public.purchase_batches
add column if not exists confirmation_summary jsonb not null default '{}'::jsonb;

create index if not exists purchases_purchase_batch_id_idx on public.purchases (purchase_batch_id);

drop function if exists public.confirm_purchase_batch(uuid);

create or replace function public.confirm_purchase_batch(p_batch_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_user_role text;
  v_batch record;
  v_group record;
  v_line record;
  v_purchase_id uuid;
  v_child_purchase_ids uuid[] := '{}';
  v_payment_status text;
  v_purchase_total numeric(14, 2);
  v_summary jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role
  into v_user_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_user_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para confirmar compras multiples.';
  end if;

  select *
  into v_batch
  from public.purchase_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'Compra multiple no encontrada.';
  end if;

  if v_batch.status = 'confirmada' then
    raise exception 'La compra multiple ya fue confirmada.';
  end if;

  if v_batch.status <> 'borrador' then
    raise exception 'Solo se pueden confirmar compras multiples en borrador.';
  end if;

  if not exists (select 1 from public.purchase_batch_lines where batch_id = p_batch_id) then
    raise exception 'La compra multiple debe tener al menos una linea.';
  end if;

  if exists (
    select 1
    from public.purchase_batch_lines
    where batch_id = p_batch_id
      and requires_classification = true
  ) then
    raise exception 'Este producto requiere clasificacion de ingreso antes de confirmar.';
  end if;

  if exists (
    select 1
    from public.purchase_batch_lines
    where batch_id = p_batch_id
      and (
        product_id is null
        or supplier_id is null
        or quantity <= 0
        or unit_cost < 0
        or payment_method not in ('efectivo', 'transferencia', 'qr', 'credito')
      )
  ) then
    raise exception 'La compra multiple tiene lineas incompletas o invalidas.';
  end if;

  for v_group in
    select
      supplier_id,
      payment_method,
      sum(subtotal) as total
    from public.purchase_batch_lines
    where batch_id = p_batch_id
    group by supplier_id, payment_method
    order by supplier_id, payment_method
  loop
    v_payment_status := case
      when v_group.payment_method = 'credito' then 'pendiente'
      else 'pagada'
    end;

    v_purchase_total := round(v_group.total, 2);

    insert into public.purchases (
      supplier_id,
      purchase_date,
      status,
      payment_status,
      payment_method,
      subtotal,
      total,
      notes,
      created_by,
      purchase_batch_id
    )
    values (
      v_group.supplier_id,
      v_batch.batch_date,
      'borrador',
      v_payment_status,
      v_group.payment_method,
      v_purchase_total,
      v_purchase_total,
      concat_ws(' | ', 'Compra hija generada desde compra multiple ' || p_batch_id::text, nullif(v_batch.notes, '')),
      v_user_id,
      p_batch_id
    )
    returning id into v_purchase_id;

    for v_line in
      select *
      from public.purchase_batch_lines
      where batch_id = p_batch_id
        and supplier_id = v_group.supplier_id
        and payment_method = v_group.payment_method
      order by sort_order, created_at
    loop
      insert into public.purchase_items (
        purchase_id,
        product_id,
        quantity,
        unit_cost,
        subtotal
      )
      values (
        v_purchase_id,
        v_line.product_id,
        v_line.quantity,
        v_line.unit_cost,
        v_line.subtotal
      );
    end loop;

    perform public.confirm_purchase(v_purchase_id);

    insert into public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      v_user_id,
      'confirm_purchase',
      'purchase',
      v_purchase_id,
      jsonb_build_object(
        'origin', 'purchase_batch',
        'purchase_batch_id', p_batch_id,
        'payment_method', v_group.payment_method,
        'total', v_purchase_total
      )
    );

    v_child_purchase_ids := array_append(v_child_purchase_ids, v_purchase_id);
  end loop;

  select jsonb_build_object(
    'total', coalesce(sum(subtotal), 0),
    'cash', coalesce(sum(subtotal) filter (where payment_method = 'efectivo'), 0),
    'qr_transfer', coalesce(sum(subtotal) filter (where payment_method in ('qr', 'transferencia')), 0),
    'credit', coalesce(sum(subtotal) filter (where payment_method = 'credito'), 0),
    'child_purchases_count', coalesce(array_length(v_child_purchase_ids, 1), 0),
    'child_purchase_ids', to_jsonb(v_child_purchase_ids)
  )
  into v_summary
  from public.purchase_batch_lines
  where batch_id = p_batch_id;

  update public.purchase_batches
  set status = 'confirmada',
      confirmed_by = v_user_id,
      confirmed_at = timezone('utc', now()),
      child_purchase_ids = v_child_purchase_ids,
      confirmation_summary = v_summary
  where id = p_batch_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'confirm_purchase_batch',
    'purchase_batch',
    p_batch_id,
    v_summary
  );

  return v_child_purchase_ids;
end;
$$;

revoke all on function public.confirm_purchase_batch(uuid) from public;
grant execute on function public.confirm_purchase_batch(uuid) to authenticated;
