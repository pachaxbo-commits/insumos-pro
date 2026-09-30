-- Pricing by delivered product. Existing issued receipts retain their legacy snapshots.
begin;

alter table public.qb_receipts
  add column if not exists pricing_mode text not null default 'legacy',
  add column if not exists cost_total_precise numeric(20,8),
  add column if not exists sale_total_precise numeric(20,8),
  add column if not exists profit_total_precise numeric(20,8);

alter table public.qb_receipts drop constraint if exists qb_receipts_pricing_mode_check;
alter table public.qb_receipts add constraint qb_receipts_pricing_mode_check
  check (pricing_mode in ('legacy', 'line_cost_markup'));

alter table public.qb_receipt_lines
  add column if not exists cost_base_unit_snapshot numeric(20,8),
  add column if not exists cost_total_input_precise numeric(20,8),
  add column if not exists cost_total_precise numeric(20,8),
  add column if not exists sale_total_precise numeric(20,8),
  add column if not exists profit_unit_precise numeric(20,8),
  add column if not exists profit_total_precise numeric(20,8),
  add column if not exists cost_source text;

alter table public.qb_receipt_lines
  add column if not exists product_code_snapshot text,
  add column if not exists category_name_snapshot text;

alter table public.qb_receipt_lines drop constraint if exists qb_receipt_lines_line_pricing_check;
alter table public.qb_receipt_lines add constraint qb_receipt_lines_line_pricing_check check (
  (cost_base_unit_snapshot is null or cost_base_unit_snapshot >= 0)
  and (cost_total_input_precise is null or cost_total_input_precise >= 0)
  and (cost_total_precise is null or cost_total_precise >= 0)
  and (sale_total_precise is null or sale_total_precise >= 0)
  and (cost_source is null or cost_source in ('manual', 'purchase_snapshot', 'fifo'))
);

-- Preserve the complete old calculator for receipts created before this migration.
do $$ begin
  if to_regprocedure('public.recalculate_qb_receipt_totals_legacy(uuid)') is null then
    alter function public.recalculate_qb_receipt_totals(uuid)
      rename to recalculate_qb_receipt_totals_legacy;
  end if;
end $$;

create or replace function public.recalculate_qb_receipt_totals(p_receipt_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_receipt public.qb_receipts%rowtype;
  v_cost numeric(20,8);
  v_sale numeric(20,8);
  v_profit numeric(20,8);
begin
  select * into v_receipt from public.qb_receipts where id = p_receipt_id for update;
  if not found then raise exception 'QB_RECEIPT_NOT_FOUND'; end if;
  if v_receipt.pricing_mode = 'legacy' then
    perform public.recalculate_qb_receipt_totals_legacy(p_receipt_id);
    return;
  end if;
  if auth.uid() is null or public.current_user_role() not in ('admin', 'administrador') then
    raise exception 'QB_RECEIPT_ADMIN_REQUIRED';
  end if;
  if v_receipt.status <> 'borrador' then raise exception 'QB_RECEIPT_REQUIRES_DRAFT'; end if;
  perform set_config('qb.line_pricing_write', 'enabled', true);

  update public.qb_receipt_lines line set
    cost_total_precise = case when line.cost_base_unit_snapshot is null then null
      else coalesce(line.cost_total_input_precise,
        round(line.delivered_base_quantity * line.cost_base_unit_snapshot, 8)) end,
    profit_unit_precise = case when line.cost_base_unit_snapshot is null then null
      when line.order_input_mode = 'amount_bs' then
        round(line.fixed_line_amount / line.delivered_base_quantity - line.cost_base_unit_snapshot, 8)
      else round(line.cost_base_unit_snapshot * (
        line.distance_factor_percent + line.exigency_factor_percent
        + line.weather_factor_percent + line.extraordinary_factor_percent
      ) / 100, 8) end,
    sale_total_precise = case when line.cost_base_unit_snapshot is null then null
      when line.order_input_mode = 'amount_bs' then line.fixed_line_amount
      else round(line.delivered_base_quantity * line.cost_base_unit_snapshot * (1 + (
        line.distance_factor_percent + line.exigency_factor_percent
        + line.weather_factor_percent + line.extraordinary_factor_percent
      ) / 100), 8) end,
    final_unit_price = case when line.cost_base_unit_snapshot is null then null
      when line.order_input_mode = 'amount_bs' then line.final_unit_price
      else round(line.cost_base_unit_snapshot * (1 + (
        line.distance_factor_percent + line.exigency_factor_percent
        + line.weather_factor_percent + line.extraordinary_factor_percent
      ) / 100), 4) end,
    line_total = case when line.cost_base_unit_snapshot is null then null
      when line.order_input_mode = 'amount_bs' then line.fixed_line_amount
      else round(line.delivered_base_quantity * line.cost_base_unit_snapshot * (1 + (
        line.distance_factor_percent + line.exigency_factor_percent
        + line.weather_factor_percent + line.extraordinary_factor_percent
      ) / 100), 2) end,
    base_price_used = case when line.order_input_mode = 'amount_bs' then line.base_price_used
      else round(line.cost_base_unit_snapshot, 4) end
  where line.receipt_id = p_receipt_id;

  update public.qb_receipt_lines line
  set profit_total_precise = case when line.sale_total_precise is null then null
    else round(line.sale_total_precise - line.cost_total_precise, 8) end
  where line.receipt_id = p_receipt_id;

  select sum(cost_total_precise), sum(sale_total_precise), sum(profit_total_precise)
    into v_cost, v_sale, v_profit
  from public.qb_receipt_lines where receipt_id = p_receipt_id;
  if exists (select 1 from public.qb_receipt_lines
    where receipt_id = p_receipt_id and cost_base_unit_snapshot is null) then
    v_cost := null; v_sale := null; v_profit := null;
  end if;

  update public.qb_receipts set
    cost_total_precise = v_cost,
    sale_total_precise = v_sale,
    profit_total_precise = v_profit,
    subtotal_amount = coalesce(round(v_cost, 2), 0),
    total_amount = coalesce(round(v_sale, 2), 0),
    surcharge_amount = coalesce(round(v_profit, 2), 0),
    factor_total_percent = 0,
    calculated_by = auth.uid(), calculated_at = now(),
    summary_snapshot = jsonb_build_object(
      'pricing_mode', 'line_cost_markup', 'cost_total', v_cost,
      'sale_total', v_sale, 'profit_total', v_profit,
      'has_pending_costs', exists (
        select 1 from public.qb_receipt_lines
        where receipt_id = p_receipt_id and cost_base_unit_snapshot is null
      ), 'non_fiscal', true
    )
  where id = p_receipt_id;
end;
$$;

revoke all on function public.recalculate_qb_receipt_totals(uuid) from public, anon, authenticated;

-- Keep the old editor callable only for historical drafts. Its optional catalog
-- price write must never be reachable through a line-priced receipt.
do $$ begin
  if to_regprocedure('public.update_qb_receipt_draft_legacy(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)') is null then
    alter function public.update_qb_receipt_draft(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)
      rename to update_qb_receipt_draft_legacy;
  end if;
end $$;
revoke all on function public.update_qb_receipt_draft_legacy(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)
  from public, anon, authenticated;

create or replace function public.update_qb_receipt_draft(
  p_receipt_id uuid, p_distance_factor_percent numeric,
  p_exigency_factor_percent numeric, p_weather_factor_percent numeric,
  p_extraordinary_factor_percent numeric, p_visible_note text,
  p_internal_notes text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = pg_catalog as $$
begin
  if exists (select 1 from public.qb_receipts
    where id = p_receipt_id and pricing_mode = 'line_cost_markup') then
    raise exception 'QB_LINE_PRICING_USE_LINE_RPC';
  end if;
  return public.update_qb_receipt_draft_legacy(p_receipt_id,
    p_distance_factor_percent, p_exigency_factor_percent, p_weather_factor_percent,
    p_extraordinary_factor_percent, p_visible_note, p_internal_notes, p_lines);
end;
$$;
revoke all on function public.update_qb_receipt_draft(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.update_qb_receipt_draft(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)
  to authenticated;

-- Issuance cannot proceed with missing line costs.
create or replace function private.guard_qb_line_pricing_receipt()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if old.pricing_mode = 'line_cost_markup' and old.status = 'borrador'
    and new.status = 'emitido' and exists (
      select 1 from public.qb_receipt_lines where receipt_id = old.id
      and (cost_base_unit_snapshot is null or cost_total_precise is null
        or sale_total_precise is null or profit_total_precise is null)
    ) then raise exception 'QB_LINE_PRICING_COST_PENDING'; end if;
  return new;
end;
$$;
drop trigger if exists guard_qb_line_pricing_receipt on public.qb_receipts;
create trigger guard_qb_line_pricing_receipt before update on public.qb_receipts
  for each row execute function private.guard_qb_line_pricing_receipt();

create or replace function public.create_qb_receipt_line_draft(
  p_customer_account_id uuid, p_order_ids uuid[]
) returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid;
begin
  v_id := public.create_qb_receipt_draft(p_customer_account_id, p_order_ids);
  perform set_config('qb.line_pricing_write', 'enabled', true);
  update public.qb_receipts set pricing_mode = 'line_cost_markup',
    distance_factor_percent = 0, exigency_factor_percent = 0,
    weather_factor_percent = 0, extraordinary_factor_percent = 0
  where id = v_id;
  update public.qb_receipt_lines set
    cost_base_unit_snapshot = case when purchase_cost_total is not null
      then round(purchase_cost_total / delivered_base_quantity, 8) else null end,
    cost_total_input_precise = purchase_cost_total,
    cost_source = case when purchase_cost_total is not null then 'purchase_snapshot' else null end,
    distance_factor_percent = 0, exigency_factor_percent = 0,
    weather_factor_percent = 0, extraordinary_factor_percent = 0
  where receipt_id = v_id;
  update public.qb_receipt_lines line set
    product_code_snapshot = product.sku,
    category_name_snapshot = category.name
  from public.products product
  left join public.product_categories category on category.id = product.category_id
  where line.receipt_id = v_id and line.product_id = product.id;
  perform public.recalculate_qb_receipt_totals(v_id);
  return v_id;
end;
$$;
revoke all on function public.create_qb_receipt_line_draft(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.create_qb_receipt_line_draft(uuid, uuid[]) to authenticated;

create or replace function public.set_qb_receipt_line_pricing(p_receipt_id uuid, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_line jsonb; v_id uuid; v_cost numeric; v_total numeric; v_dist numeric; v_exig numeric;
  v_weather numeric; v_extra numeric; v_note text; v_count integer := 0;
begin
  if auth.uid() is null or public.current_user_role() not in ('admin', 'administrador') then
    raise exception 'QB_RECEIPT_ADMIN_REQUIRED';
  end if;
  if not exists (select 1 from public.qb_receipts where id = p_receipt_id
    and status = 'borrador' and pricing_mode = 'line_cost_markup' for update) then
    raise exception 'QB_LINE_PRICING_REQUIRES_DRAFT';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'QB_LINE_PRICING_INVALID_LINES';
  end if;
  perform set_config('qb.line_pricing_write', 'enabled', true);
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_id := (v_line ->> 'line_id')::uuid;
    v_cost := nullif(trim(v_line ->> 'cost_base_unit'), '')::numeric;
    v_total := nullif(trim(v_line ->> 'cost_total'), '')::numeric;
    v_dist := (v_line ->> 'distance_factor_percent')::numeric;
    v_exig := (v_line ->> 'exigency_factor_percent')::numeric;
    v_weather := (v_line ->> 'weather_factor_percent')::numeric;
    v_extra := (v_line ->> 'extraordinary_factor_percent')::numeric;
    v_note := nullif(trim(coalesce(v_line ->> 'notes', '')), '');
    if (v_cost is not null and (v_cost::text in ('NaN','Infinity','-Infinity') or v_cost < 0 or v_cost > 99999999))
      or (v_total is not null and (v_total::text in ('NaN','Infinity','-Infinity') or v_total < 0 or v_total > 999999999999))
      or v_dist is null or v_exig is null or v_weather is null or v_extra is null
      or v_dist::text in ('NaN','Infinity','-Infinity')
      or v_exig::text in ('NaN','Infinity','-Infinity')
      or v_weather::text in ('NaN','Infinity','-Infinity')
      or v_extra::text in ('NaN','Infinity','-Infinity')
      or least(v_dist,v_exig,v_weather,v_extra) < 0
      or greatest(v_dist,v_exig,v_weather,v_extra) > 1000
      or v_dist <> round(v_dist,3) or v_exig <> round(v_exig,3)
      or v_weather <> round(v_weather,3) or v_extra <> round(v_extra,3)
      or length(coalesce(v_note,'')) > 500 then
      raise exception 'QB_LINE_PRICING_INVALID_VALUE';
    end if;
    if exists (select 1 from public.qb_receipt_lines
      where id = v_id and receipt_id = p_receipt_id and order_input_mode = 'amount_bs')
      and (v_dist + v_exig + v_weather + v_extra) <> 0 then
      raise exception 'QB_AMOUNT_RECEIPT_FIXED_SALE';
    end if;
    update public.qb_receipt_lines set
      cost_base_unit_snapshot = case when v_total is null then v_cost
        else round(v_total / delivered_base_quantity, 8) end,
      cost_total_input_precise = case when v_total is not null then v_total
        when v_cost is not distinct from cost_base_unit_snapshot then cost_total_input_precise
        else null end,
      cost_source = case when v_total is not null then 'manual'
        when v_cost is null then null
        when v_cost is not distinct from cost_base_unit_snapshot then cost_source
        else 'manual' end,
      distance_factor_percent = v_dist,
      exigency_factor_percent = v_exig,
      weather_factor_percent = v_weather,
      extraordinary_factor_percent = v_extra,
      notes = v_note
    where id = v_id and receipt_id = p_receipt_id;
    if not found then raise exception 'QB_LINE_PRICING_LINE_NOT_FOUND'; end if;
    v_count := v_count + 1;
  end loop;
  perform public.recalculate_qb_receipt_totals(p_receipt_id);
  insert into public.qb_receipt_events(receipt_id,event_type,metadata,created_by)
  values (p_receipt_id,'lineas_editadas',jsonb_build_object('line_count',v_count,
    'pricing_mode','line_cost_markup'),auth.uid());
  return p_receipt_id;
end;
$$;
revoke all on function public.set_qb_receipt_line_pricing(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_qb_receipt_line_pricing(uuid, jsonb) to authenticated;

-- Existing emission RPC still performs order locking and state transitions.
-- Its calculator call now dispatches by pricing_mode. Zero-cost drafts remain drafts.

alter table public.qb_receipts drop constraint if exists qb_receipts_payment_status_check;
alter table public.qb_receipts add constraint qb_receipts_payment_status_check
  check (payment_status in ('pendiente','pagado','cobrado'));

create or replace function public.set_qb_receipt_manual_tracking(
  p_receipt_id uuid, p_receipt_sent boolean, p_payment_status text
) returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_receipt public.qb_receipts%rowtype;
begin
  if auth.uid() is null or public.current_user_role() not in ('admin','administrador') then
    raise exception 'QB_RECEIPT_TRACKING_ADMIN_REQUIRED';
  end if;
  if p_payment_status not in ('pendiente','pagado','cobrado') then
    raise exception 'QB_RECEIPT_TRACKING_INVALID_PAYMENT';
  end if;
  select * into v_receipt from public.qb_receipts where id=p_receipt_id for update;
  if not found then raise exception 'QB_RECEIPT_TRACKING_NOT_FOUND'; end if;
  if v_receipt.status <> 'emitido' then raise exception 'QB_RECEIPT_TRACKING_REQUIRES_ISSUED'; end if;
  update public.qb_receipts set
    receipt_sent_at = case when p_receipt_sent then coalesce(receipt_sent_at,now()) else null end,
    receipt_sent_by = case when p_receipt_sent then coalesce(receipt_sent_by,auth.uid()) else null end,
    payment_status = p_payment_status,
    paid_at = case when p_payment_status in ('pagado','cobrado') then coalesce(paid_at,now()) else null end,
    paid_by = case when p_payment_status in ('pagado','cobrado') then coalesce(paid_by,auth.uid()) else null end
  where id=p_receipt_id;
  insert into public.qb_receipt_events(receipt_id,event_type,metadata,created_by)
  values(p_receipt_id,'control_actualizado',jsonb_build_object(
    'previous_payment_status',v_receipt.payment_status,'payment_status',p_payment_status,
    'receipt_sent',p_receipt_sent),auth.uid());
  return p_receipt_id;
end;
$$;
revoke all on function public.set_qb_receipt_manual_tracking(uuid,boolean,text)
  from public,anon,authenticated;
grant execute on function public.set_qb_receipt_manual_tracking(uuid,boolean,text)
  to authenticated;

-- Preserve the existing read roles; route and Server Action access to the
-- administrative receipt workspace remain limited to administrators.
drop policy if exists "Internal roles can view QB receipts" on public.qb_receipts;
create policy "Internal roles can view QB receipts" on public.qb_receipts for select
  using (public.current_user_role() in ('admin','administrador','inventario'));
drop policy if exists "Internal roles can view QB receipt orders" on public.qb_receipt_orders;
create policy "Internal roles can view QB receipt orders" on public.qb_receipt_orders for select
  using (public.current_user_role() in ('admin','administrador','inventario'));
drop policy if exists "Internal roles can view QB receipt lines" on public.qb_receipt_lines;
create policy "Internal roles can view QB receipt lines" on public.qb_receipt_lines for select
  using (public.current_user_role() in ('admin','administrador','inventario'));
drop policy if exists "Internal roles can view QB receipt events" on public.qb_receipt_events;
create policy "Internal roles can view QB receipt events" on public.qb_receipt_events for select
  using (public.current_user_role() in ('admin','administrador','inventario'));

commit;
