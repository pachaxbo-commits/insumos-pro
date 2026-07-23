-- Recibos: cuatro factores internos de 5%, suma aditiva e inmutabilidad emitida.

begin;

alter table public.qb_receipts
  add column if not exists factor_total_percent numeric(7,3) not null default 0,
  add column if not exists surcharge_amount numeric(14,2) not null default 0,
  add column if not exists calculated_by uuid references public.profiles(id) on delete set null,
  add column if not exists calculated_at timestamptz;

create or replace function public.qb_compound_unit_price(
  p_base_price numeric,
  p_distance_factor_percent numeric,
  p_exigency_factor_percent numeric,
  p_weather_factor_percent numeric,
  p_extraordinary_factor_percent numeric
)
returns numeric
language sql
immutable
as $$
  select round(
    coalesce(p_base_price, 0) * (
      1 + (
        coalesce(p_distance_factor_percent, 0)
        + coalesce(p_exigency_factor_percent, 0)
        + coalesce(p_weather_factor_percent, 0)
        + coalesce(p_extraordinary_factor_percent, 0)
      ) / 100
    ),
    4
  );
$$;

comment on function public.qb_compound_unit_price(numeric, numeric, numeric, numeric, numeric) is
  'Nombre conservado por compatibilidad. Desde Fase 1 calcula factores aditivos, nunca compuestos.';

create or replace function private.validate_qb_draft_factors()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = 'borrador' and (
    new.distance_factor_percent not in (0, 5)
    or new.exigency_factor_percent not in (0, 5)
    or new.weather_factor_percent not in (0, 5)
    or new.extraordinary_factor_percent not in (0, 5)
  ) then
    raise exception 'Cada factor interno debe estar desactivado (0%%) o activado (5%%).';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'borrador' and (
    new.distance_factor_percent is distinct from old.distance_factor_percent
    or new.exigency_factor_percent is distinct from old.exigency_factor_percent
    or new.weather_factor_percent is distinct from old.weather_factor_percent
    or new.extraordinary_factor_percent is distinct from old.extraordinary_factor_percent
    or new.subtotal_amount is distinct from old.subtotal_amount
    or new.total_amount is distinct from old.total_amount
    or new.factor_total_percent is distinct from old.factor_total_percent
    or new.surcharge_amount is distinct from old.surcharge_amount
    or new.summary_snapshot is distinct from old.summary_snapshot
  ) then
    raise exception 'Los importes y factores de un recibo emitido son inmutables.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_qb_draft_factors on public.qb_receipts;
create trigger validate_qb_draft_factors
  before insert or update on public.qb_receipts
  for each row execute function private.validate_qb_draft_factors();

create or replace function private.protect_qb_issued_receipt_lines()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_receipt_id uuid;
begin
  if tg_op = 'DELETE' then
    v_receipt_id := old.receipt_id;
  else
    v_receipt_id := new.receipt_id;
  end if;
  if exists (
    select 1 from public.qb_receipts receipt
    where receipt.id = v_receipt_id and receipt.status <> 'borrador'
  ) then
    raise exception 'Las lineas de un recibo emitido son inmutables.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists protect_qb_issued_receipt_lines on public.qb_receipt_lines;
create trigger protect_qb_issued_receipt_lines
  before update or delete on public.qb_receipt_lines
  for each row execute function private.protect_qb_issued_receipt_lines();

create or replace function public.recalculate_qb_receipt_totals(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_receipt public.qb_receipts%rowtype;
  v_has_pending_or_invalid boolean;
  v_factor_total numeric(7,3);
  v_subtotal numeric(14,2);
  v_total numeric(14,2);
begin
  select role into v_user_role from public.profiles
  where id = v_user_id and is_active = true;
  if v_user_id is null or v_user_role not in ('admin', 'administrador') then
    raise exception 'No tienes permisos para recalcular recibos QB.';
  end if;

  select * into v_receipt from public.qb_receipts
  where id = p_receipt_id for update;
  if v_receipt.id is null then raise exception 'Recibo QB no encontrado.'; end if;
  if v_receipt.status <> 'borrador' then
    raise exception 'Solo se pueden recalcular recibos en borrador.';
  end if;
  if v_receipt.distance_factor_percent not in (0,5)
    or v_receipt.exigency_factor_percent not in (0,5)
    or v_receipt.weather_factor_percent not in (0,5)
    or v_receipt.extraordinary_factor_percent not in (0,5) then
    raise exception 'Cada factor interno debe ser 0%% o 5%%.';
  end if;
  v_factor_total :=
    v_receipt.distance_factor_percent + v_receipt.exigency_factor_percent
    + v_receipt.weather_factor_percent + v_receipt.extraordinary_factor_percent;

  update public.qb_receipt_lines line
  set distance_factor_percent = v_receipt.distance_factor_percent,
      exigency_factor_percent = v_receipt.exigency_factor_percent,
      weather_factor_percent = v_receipt.weather_factor_percent,
      extraordinary_factor_percent = v_receipt.extraordinary_factor_percent,
      final_unit_price = case
        when line.order_input_mode = 'amount_bs'
          then public.qb_compound_unit_price(line.original_base_price,
            v_receipt.distance_factor_percent, v_receipt.exigency_factor_percent,
            v_receipt.weather_factor_percent, v_receipt.extraordinary_factor_percent)
        when line.base_price_used is not null and line.base_price_used > 0
          then public.qb_compound_unit_price(line.base_price_used,
            v_receipt.distance_factor_percent, v_receipt.exigency_factor_percent,
            v_receipt.weather_factor_percent, v_receipt.extraordinary_factor_percent)
        else null
      end,
      line_total = case
        when line.order_input_mode = 'amount_bs' and line.fixed_line_amount is not null
          then round(line.fixed_line_amount * (1 + v_factor_total / 100), 2)
        when line.delivered_base_quantity > 0 and line.base_price_used is not null and line.base_price_used > 0
          then round(line.delivered_base_quantity * public.qb_compound_unit_price(
            line.base_price_used, v_receipt.distance_factor_percent,
            v_receipt.exigency_factor_percent, v_receipt.weather_factor_percent,
            v_receipt.extraordinary_factor_percent), 2)
        else null
      end
  where line.receipt_id = p_receipt_id;

  select exists (
    select 1 from public.qb_receipt_lines line
    where line.receipt_id = p_receipt_id and (
      line.delivered_base_quantity <= 0
      or line.line_total is null or line.line_total <= 0
      or (line.order_input_mode = 'amount_bs'
        and (line.requested_amount_bs is null or line.fixed_line_amount <> line.requested_amount_bs))
      or (line.order_input_mode = 'quantity'
        and (line.base_price_used is null or line.base_price_used <= 0
          or line.final_unit_price is null or line.final_unit_price <= 0))
    )
  ) into v_has_pending_or_invalid;

  if v_has_pending_or_invalid then
    v_subtotal := 0;
    v_total := 0;
  else
    select
      coalesce(round(sum(case when order_input_mode = 'amount_bs'
        then fixed_line_amount else delivered_base_quantity * base_price_used end), 2), 0),
      coalesce(round(sum(line_total), 2), 0)
    into v_subtotal, v_total
    from public.qb_receipt_lines where receipt_id = p_receipt_id;
  end if;

  update public.qb_receipts
  set subtotal_amount = v_subtotal,
      factor_total_percent = v_factor_total,
      surcharge_amount = round(v_total - v_subtotal, 2),
      total_amount = v_total,
      calculated_by = v_user_id,
      calculated_at = now(),
      summary_snapshot = jsonb_build_object(
        'line_count', (select count(*) from public.qb_receipt_lines where receipt_id = p_receipt_id),
        'order_count', (select count(*) from public.qb_receipt_orders where receipt_id = p_receipt_id),
        'factor_mode', 'additive_percent',
        'factor_total_percent', v_factor_total,
        'subtotal_amount', v_subtotal,
        'surcharge_amount', round(v_total - v_subtotal, 2),
        'total_amount', v_total,
        'amount_mode', 'fixed_requested_amount_plus_additive_factors',
        'has_pending_prices', v_has_pending_or_invalid,
        'non_fiscal', true,
        'calculated_by', v_user_id,
        'calculated_at', now()
      )
  where id = p_receipt_id;
end;
$$;

revoke all on function public.qb_compound_unit_price(numeric, numeric, numeric, numeric, numeric)
  from public, anon;
grant execute on function public.qb_compound_unit_price(numeric, numeric, numeric, numeric, numeric)
  to authenticated;
revoke all on function public.recalculate_qb_receipt_totals(uuid)
  from public, anon, authenticated;

commit;
