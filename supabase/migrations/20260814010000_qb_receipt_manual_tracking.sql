begin;

alter table public.qb_receipts
  add column if not exists receipt_sent_at timestamptz,
  add column if not exists receipt_sent_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_status text not null default 'pendiente',
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null;

alter table public.qb_receipts
  drop constraint if exists qb_receipts_payment_status_check;
alter table public.qb_receipts
  add constraint qb_receipts_payment_status_check
  check (payment_status in ('pendiente', 'pagado'));

alter table public.qb_receipt_events
  drop constraint if exists qb_receipt_events_type_check;
alter table public.qb_receipt_events
  add constraint qb_receipt_events_type_check
  check (event_type in (
    'creado', 'lineas_editadas', 'precio_base_actualizado', 'emitido',
    'anulado', 'reemplazado', 'control_actualizado'
  ));

create or replace function public.set_qb_receipt_manual_tracking(
  p_receipt_id uuid,
  p_receipt_sent boolean,
  p_payment_status text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_receipt public.qb_receipts%rowtype;
begin
  if v_user_id is null then
    raise exception 'QB_RECEIPT_TRACKING_AUTH_REQUIRED';
  end if;

  v_role := public.current_user_role();
  if v_role not in ('admin', 'administrador') then
    raise exception 'QB_RECEIPT_TRACKING_ADMIN_REQUIRED';
  end if;
  if p_payment_status not in ('pendiente', 'pagado') then
    raise exception 'QB_RECEIPT_TRACKING_INVALID_PAYMENT';
  end if;

  select * into v_receipt
  from public.qb_receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'QB_RECEIPT_TRACKING_NOT_FOUND';
  end if;
  if v_receipt.status <> 'emitido' then
    raise exception 'QB_RECEIPT_TRACKING_REQUIRES_ISSUED';
  end if;

  update public.qb_receipts
  set receipt_sent_at = case
        when p_receipt_sent then coalesce(receipt_sent_at, now())
        else null
      end,
      receipt_sent_by = case
        when p_receipt_sent then coalesce(receipt_sent_by, v_user_id)
        else null
      end,
      payment_status = p_payment_status,
      paid_at = case
        when p_payment_status = 'pagado' then coalesce(paid_at, now())
        else null
      end,
      paid_by = case
        when p_payment_status = 'pagado' then coalesce(paid_by, v_user_id)
        else null
      end
  where id = p_receipt_id;

  insert into public.qb_receipt_events (
    receipt_id, event_type, metadata, created_by
  ) values (
    p_receipt_id,
    'control_actualizado',
    jsonb_build_object(
      'previous_receipt_sent', v_receipt.receipt_sent_at is not null,
      'receipt_sent', p_receipt_sent,
      'previous_payment_status', v_receipt.payment_status,
      'payment_status', p_payment_status
    ),
    v_user_id
  );

  return p_receipt_id;
end;
$$;

revoke all on function public.set_qb_receipt_manual_tracking(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_qb_receipt_manual_tracking(uuid, boolean, text)
  to authenticated;

create or replace function private.clear_qb_receipt_tracking_on_void()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'anulado' and old.status is distinct from new.status then
    new.receipt_sent_at := null;
    new.receipt_sent_by := null;
    new.payment_status := 'pendiente';
    new.paid_at := null;
    new.paid_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_qb_receipt_tracking_on_void on public.qb_receipts;
create trigger clear_qb_receipt_tracking_on_void
  before update of status on public.qb_receipts
  for each row execute function private.clear_qb_receipt_tracking_on_void();

comment on function public.set_qb_receipt_manual_tracking(uuid, boolean, text) is
  'Control administrativo manual de recibo enviado y pago completo. No crea caja, cobros, pagos ni movimientos financieros.';

commit;

