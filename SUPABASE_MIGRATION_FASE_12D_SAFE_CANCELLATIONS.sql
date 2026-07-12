-- Fase 12D - Anulacion contable segura de ventas y compras confirmadas
-- PENDIENTE DE APLICAR EN SUPABASE STAGING.
-- No ejecutar en produccion sin backup, pruebas de staging y aprobacion explicita.

alter table public.sales
add column if not exists canceled_reason text,
add column if not exists canceled_by uuid references public.profiles (id) on delete set null,
add column if not exists canceled_at timestamptz,
add column if not exists reversal_status text not null default 'none';

alter table public.purchases
add column if not exists canceled_reason text,
add column if not exists canceled_by uuid references public.profiles (id) on delete set null,
add column if not exists canceled_at timestamptz,
add column if not exists reversal_status text not null default 'none';

alter table public.sales
drop constraint if exists sales_reversal_status_check;

alter table public.sales
add constraint sales_reversal_status_check
check (reversal_status in ('none', 'reversed', 'blocked'));

alter table public.purchases
drop constraint if exists purchases_reversal_status_check;

alter table public.purchases
add constraint purchases_reversal_status_check
check (reversal_status in ('none', 'reversed', 'blocked'));

alter table public.accounts_receivable
drop constraint if exists accounts_receivable_status_check;

alter table public.accounts_receivable
add constraint accounts_receivable_status_check
check (status in ('pendiente', 'parcial', 'pagada', 'vencida', 'anulada'));

alter table public.accounts_payable
drop constraint if exists accounts_payable_status_check;

alter table public.accounts_payable
add constraint accounts_payable_status_check
check (status in ('pendiente', 'parcial', 'pagada', 'vencida', 'anulada'));

create index if not exists sales_reversal_status_idx on public.sales (reversal_status);
create index if not exists purchases_reversal_status_idx on public.purchases (reversal_status);
create index if not exists inventory_movements_product_created_at_idx on public.inventory_movements (product_id, created_at desc);
create index if not exists payments_sale_id_idx on public.payments (sale_id);
create index if not exists payments_purchase_id_idx on public.payments (purchase_id);
create index if not exists cash_movements_source_id_idx on public.cash_movements (source_id);

create or replace function public.assert_admin_role()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Usuario no autenticado.';
  end if;

  select role
  into v_role
  from public.profiles
  where id = v_user_id
    and is_active = true;

  if v_role <> 'administrador' then
    raise exception 'Solo un administrador puede anular operaciones confirmadas.';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.cancel_confirmed_sale(
  p_sale_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_sale record;
  v_item record;
  v_account record;
  v_stock_before numeric(14, 2);
  v_stock_after numeric(14, 2);
  v_payment_count integer;
  v_payment_method text;
  v_now timestamptz;
begin
  v_user_id := public.assert_admin_role();
  v_now := timezone('utc', now());

  if p_sale_id is null then
    raise exception 'Venta invalida.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'El motivo de anulacion debe tener al menos 10 caracteres.';
  end if;

  select *
  into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_sale.reversal_status = 'reversed' or v_sale.status = 'anulada' then
    raise exception 'La venta ya fue anulada y no puede revertirse nuevamente.';
  end if;

  if v_sale.status <> 'confirmada' then
    raise exception 'Solo se pueden anular ventas confirmadas.';
  end if;

  if not exists (select 1 from public.sale_items where sale_id = p_sale_id) then
    raise exception 'La venta no tiene items para revertir.';
  end if;

  if v_sale.payment_type = 'credito' then
    select *
    into v_account
    from public.accounts_receivable
    where sale_id = p_sale_id
    for update;

    if not found then
      raise exception 'No se encontro la cuenta por cobrar de la venta a credito.';
    end if;

    select count(*)
    into v_payment_count
    from public.payments
    where accounts_receivable_id = v_account.id
       or sale_id = p_sale_id;

    if coalesce(v_account.paid_amount, 0) > 0 or v_payment_count > 0 then
      raise exception 'La venta tiene pagos aplicados. Reversa o regulariza esos pagos antes de anular automaticamente.';
    end if;
  end if;

  for v_item in
    select product_id, quantity
    from public.sale_items
    where sale_id = p_sale_id
  loop
    select stock_current
    into v_stock_before
    from public.products
    where id = v_item.product_id
    for update;

    if not found then
      raise exception 'Producto no encontrado al revertir stock de venta.';
    end if;

    v_stock_after := v_stock_before + v_item.quantity;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reason,
      notes,
      created_by
    )
    values (
      v_item.product_id,
      'devolucion',
      v_item.quantity,
      v_stock_before,
      v_stock_after,
      'Anulacion de venta confirmada',
      'Anulacion venta ' || p_sale_id::text || '. Motivo: ' || trim(p_reason),
      v_user_id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  if v_sale.payment_type = 'credito' then
    update public.customers
    set current_balance = greatest(current_balance - v_account.balance, 0)
    where id = v_sale.customer_id;

    update public.accounts_receivable
    set balance = 0,
        paid_amount = 0,
        status = 'anulada',
        notes = concat_ws(' | ', nullif(notes, ''), 'Anulada por venta ' || p_sale_id::text || ': ' || trim(p_reason))
    where id = v_account.id;
  else
    v_payment_method := case
      when v_sale.payment_type = 'contado' then 'efectivo'
      when v_sale.payment_type in ('transferencia', 'qr') then v_sale.payment_type
      else 'otro'
    end;

    insert into public.cash_movements (
      movement_type,
      source_type,
      source_id,
      amount,
      payment_method,
      movement_date,
      notes,
      created_by
    )
    values (
      'egreso',
      'venta',
      p_sale_id,
      v_sale.total,
      v_payment_method,
      current_date,
      'Reversion de caja por anulacion de venta. Motivo: ' || trim(p_reason),
      v_user_id
    );
  end if;

  update public.sales
  set status = 'anulada',
      reversal_status = 'reversed',
      canceled_reason = trim(p_reason),
      canceled_by = v_user_id,
      canceled_at = v_now
  where id = p_sale_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'cancel_confirmed_sale',
    'sale',
    p_sale_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'total', v_sale.total,
      'payment_type', v_sale.payment_type,
      'reversal_status', 'reversed'
    )
  );
end;
$$;

create or replace function public.cancel_confirmed_purchase(
  p_purchase_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_purchase record;
  v_item record;
  v_account record;
  v_stock_before numeric(14, 2);
  v_stock_after numeric(14, 2);
  v_entry_created_at timestamptz;
  v_payment_count integer;
  v_now timestamptz;
  v_has_account boolean := false;
begin
  v_user_id := public.assert_admin_role();
  v_now := timezone('utc', now());

  if p_purchase_id is null then
    raise exception 'Compra invalida.';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'El motivo de anulacion debe tener al menos 10 caracteres.';
  end if;

  select *
  into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;

  if not found then
    raise exception 'Compra no encontrada.';
  end if;

  if v_purchase.reversal_status = 'reversed' or v_purchase.status = 'cancelada' then
    raise exception 'La compra ya fue anulada y no puede revertirse nuevamente.';
  end if;

  if v_purchase.status <> 'confirmada' then
    raise exception 'Solo se pueden anular compras confirmadas.';
  end if;

  if v_purchase.payment_status in ('pagada', 'parcial') then
    raise exception 'La compra tiene estado de pago aplicado. Regulariza o reversa pagos antes de anular automaticamente.';
  end if;

  select count(*)
  into v_payment_count
  from public.payments
  where purchase_id = p_purchase_id;

  if v_payment_count > 0 then
    raise exception 'La compra tiene pagos registrados. Reversa o regulariza esos pagos antes de anular automaticamente.';
  end if;

  select *
  into v_account
  from public.accounts_payable
  where purchase_id = p_purchase_id
  for update;

  if found then
    v_has_account := true;

    if coalesce(v_account.paid_amount, 0) > 0 then
      raise exception 'La cuenta por pagar tiene pagos aplicados. Regulariza esos pagos antes de anular automaticamente.';
    end if;
  end if;

  for v_item in
    select product_id, quantity
    from public.purchase_items
    where purchase_id = p_purchase_id
  loop
    select max(created_at)
    into v_entry_created_at
    from public.inventory_movements
    where product_id = v_item.product_id
      and movement_type = 'entrada'
      and reason = 'Compra confirmada'
      and notes = 'Compra ' || p_purchase_id::text;

    if v_entry_created_at is null then
      raise exception 'No se encontro el movimiento original de inventario para esta compra.';
    end if;

    if exists (
      select 1
      from public.inventory_movements
      where product_id = v_item.product_id
        and created_at > v_entry_created_at
        and not (
          reason = 'Compra confirmada'
          and notes = 'Compra ' || p_purchase_id::text
        )
    ) then
      raise exception 'Existen movimientos posteriores sobre productos de esta compra. Requiere devolucion o ajuste controlado antes de anular.';
    end if;

    select stock_current
    into v_stock_before
    from public.products
    where id = v_item.product_id
    for update;

    if not found then
      raise exception 'Producto no encontrado al revertir stock de compra.';
    end if;

    if v_stock_before < v_item.quantity then
      raise exception 'Stock insuficiente para revertir la compra sin dejar inventario negativo.';
    end if;

    v_stock_after := v_stock_before - v_item.quantity;

    insert into public.inventory_movements (
      product_id,
      movement_type,
      quantity,
      stock_before,
      stock_after,
      reason,
      notes,
      created_by
    )
    values (
      v_item.product_id,
      'salida',
      v_item.quantity,
      v_stock_before,
      v_stock_after,
      'Anulacion de compra confirmada',
      'Anulacion compra ' || p_purchase_id::text || '. Motivo: ' || trim(p_reason),
      v_user_id
    );

    update public.products
    set stock_current = v_stock_after
    where id = v_item.product_id;
  end loop;

  if v_has_account then
    update public.accounts_payable
    set balance = 0,
        paid_amount = 0,
        status = 'anulada',
        notes = concat_ws(' | ', nullif(notes, ''), 'Anulada por compra ' || p_purchase_id::text || ': ' || trim(p_reason))
    where id = v_account.id;
  end if;

  update public.purchases
  set status = 'cancelada',
      reversal_status = 'reversed',
      canceled_reason = trim(p_reason),
      canceled_by = v_user_id,
      canceled_at = v_now
  where id = p_purchase_id;

  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_user_id,
    'cancel_confirmed_purchase',
    'purchase',
    p_purchase_id,
    jsonb_build_object(
      'reason', trim(p_reason),
      'total', v_purchase.total,
      'payment_status', v_purchase.payment_status,
      'reversal_status', 'reversed'
    )
  );
end;
$$;

revoke all on function public.assert_admin_role() from public;
grant execute on function public.assert_admin_role() to authenticated;

revoke all on function public.cancel_confirmed_sale(uuid, text) from public;
grant execute on function public.cancel_confirmed_sale(uuid, text) to authenticated;

revoke all on function public.cancel_confirmed_purchase(uuid, text) from public;
grant execute on function public.cancel_confirmed_purchase(uuid, text) to authenticated;
