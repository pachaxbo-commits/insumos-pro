begin;

-- Safe operational receipt projections. The underlying receipt tables remain
-- administrator-only under RLS; Supervisor receives only these whitelisted
-- customer-document fields and unit cost snapshots.
create or replace view public.qb_supervisor_receipts
with (security_barrier = true) as
select
  receipt.id,
  receipt.receipt_number,
  receipt.status,
  receipt.pricing_mode,
  receipt.customer_account_id,
  coalesce(nullif(trim(customer.full_name), ''), 'Cliente') as customer_name,
  customer.email as customer_email,
  customer.phone as customer_phone,
  receipt.period_start,
  receipt.period_end,
  receipt.subtotal_amount,
  receipt.total_amount,
  receipt.visible_note,
  receipt.issued_at,
  receipt.receipt_sent_at,
  receipt.receipt_sent_by,
  receipt.payment_status,
  receipt.paid_at,
  receipt.paid_by,
  receipt.voided_at,
  receipt.void_reason,
  receipt.created_at
from public.qb_receipts receipt
join public.customer_accounts customer on customer.id = receipt.customer_account_id
where public.current_user_role() in ('admin', 'administrador', 'supervisor');

create or replace view public.qb_supervisor_receipt_lines
with (security_barrier = true) as
select
  line.id,
  line.receipt_id,
  line.order_id,
  orders.public_reference as order_reference,
  line.product_id,
  line.product_name_snapshot,
  line.product_code_snapshot,
  line.category_name_snapshot,
  line.delivered_base_quantity,
  line.base_unit_symbol,
  line.visible_unit_label,
  line.order_input_mode,
  line.requested_amount_bs,
  line.currency_snapshot,
  pricing_unit.symbol as pricing_unit_symbol,
  line.estimated_base_quantity,
  line.fixed_line_amount,
  line.base_price_used,
  line.final_unit_price,
  line.line_total,
  line.cost_base_unit_snapshot,
  line.notes,
  line.created_at
from public.qb_receipt_lines line
join public.qb_orders orders on orders.id = line.order_id
left join public.qb_units pricing_unit on pricing_unit.id = line.pricing_unit_id
where public.current_user_role() in ('admin', 'administrador', 'supervisor');

create or replace view public.qb_supervisor_receipt_orders
with (security_barrier = true) as
select
  receipt_order.id,
  receipt_order.receipt_id,
  receipt_order.order_id,
  receipt_order.inclusion_status,
  orders.public_reference as order_reference
from public.qb_receipt_orders receipt_order
join public.qb_orders orders on orders.id = receipt_order.order_id
where public.current_user_role() in ('admin', 'administrador', 'supervisor');

create or replace view public.qb_supervisor_receipt_events
with (security_barrier = true) as
select event.id, event.receipt_id, event.event_type, event.created_at
from public.qb_receipt_events event
where public.current_user_role() in ('admin', 'administrador', 'supervisor');

revoke all on public.qb_supervisor_receipts, public.qb_supervisor_receipt_lines,
  public.qb_supervisor_receipt_orders, public.qb_supervisor_receipt_events
  from public, anon;
grant select on public.qb_supervisor_receipts, public.qb_supervisor_receipt_lines,
  public.qb_supervisor_receipt_orders, public.qb_supervisor_receipt_events
  to authenticated;

-- Ensure the approved warehouse-purchase RPCs include Supervisor. This is
-- fail-closed against unexpected source changes and never grants table writes.
do $$
declare
  r record;
  v_definition text;
  v_updated text;
begin
  for r in
    select p.oid::regprocedure as signature, p.proname,
      pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'create_qb_warehouse_purchase_draft',
        'update_qb_warehouse_purchase_draft',
        'confirm_qb_warehouse_purchase_draft',
        'annul_qb_warehouse_purchase_draft',
        'set_warehouse_purchase_actual_quantity',
        'confirm_qb_merchandise_receipt'
      ])
  loop
    v_definition := r.definition;
    v_updated := replace(v_definition,
      'v_role not in (''admin'',''administrador'',''inventario'')',
      'v_role not in (''admin'',''administrador'',''inventario'',''supervisor'')');
    v_updated := replace(v_updated,
      'v_role not in (''admin'', ''administrador'', ''inventario'')',
      'v_role not in (''admin'', ''administrador'', ''inventario'', ''supervisor'')');
    v_updated := replace(v_updated,
      'v_user_role not in (''admin'', ''administrador'', ''inventario'')',
      'v_user_role not in (''admin'', ''administrador'', ''inventario'', ''supervisor'')');
    v_updated := replace(v_updated,
      'v_user_role not in (''admin'',''administrador'',''inventario'')',
      'v_user_role not in (''admin'',''administrador'',''inventario'',''supervisor'')');
    if v_updated <> v_definition then execute v_updated; end if;
    if lower(v_updated) not like '%not in (%supervisor%)%' then
      raise exception 'Expected Supervisor permission guard was not found in %', r.signature;
    end if;
  end loop;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname = any(array[
        'create_qb_warehouse_purchase_draft', 'update_qb_warehouse_purchase_draft',
        'confirm_qb_warehouse_purchase_draft', 'annul_qb_warehouse_purchase_draft',
        'set_warehouse_purchase_actual_quantity', 'confirm_qb_merchandise_receipt'
      ])) <> 6 then
    raise exception 'A required warehouse-purchase RPC was not found';
  end if;
end $$;

-- Enable only receipt operations explicitly approved for Supervisor.
do $$
declare
  r record;
  v_definition text;
  v_updated text;
begin
  for r in
    select p.oid::regprocedure as signature, p.proname,
      pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'create_qb_receipt_draft',
        'update_qb_receipt_draft_legacy',
        'set_qb_receipt_line_pricing',
        'emit_qb_receipt',
        'void_qb_receipt',
        'set_qb_receipt_manual_tracking'
      ])
  loop
    v_definition := r.definition;
    v_updated := replace(v_definition,
      'v_user_role not in (''admin'', ''administrador'')',
      'v_user_role not in (''admin'', ''administrador'', ''supervisor'')');
    v_updated := replace(v_updated,
      'public.current_user_role() not in (''admin'', ''administrador'')',
      'public.current_user_role() not in (''admin'', ''administrador'', ''supervisor'')');
    v_updated := replace(v_updated,
      'public.current_user_role() not in (''admin'',''administrador'')',
      'public.current_user_role() not in (''admin'',''administrador'',''supervisor'')');
    if v_updated <> v_definition then execute v_updated; end if;
    if lower(v_updated) not like '%not in (%supervisor%)%' then
      raise exception 'Expected Supervisor receipt permission guard was not found in %', r.signature;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname = any(array[
        'create_qb_receipt_draft', 'update_qb_receipt_draft_legacy',
        'set_qb_receipt_line_pricing', 'emit_qb_receipt', 'void_qb_receipt',
        'set_qb_receipt_manual_tracking'
      ])) <> 6 then
    raise exception 'A required receipt RPC was not found';
  end if;
end $$;

-- This calculator has no direct EXECUTE grant. Permit its use by the narrowly
-- scoped Supervisor line-cost RPC below, which is SECURITY DEFINER and is the
-- only Supervisor entry point that invokes it.
do $$
declare
  v_signature regprocedure := 'public.recalculate_qb_receipt_totals(uuid)'::regprocedure;
  v_definition text;
  v_updated text;
begin
  v_definition := pg_get_functiondef(v_signature);
  v_updated := replace(v_definition,
    'public.current_user_role() not in (''admin'', ''administrador'')',
    'public.current_user_role() not in (''admin'', ''administrador'', ''supervisor'')');
  if v_updated = v_definition and position('''supervisor''' in lower(v_definition)) = 0 then
    raise exception 'Could not authorize internal Supervisor line-cost recalculation';
  end if;
  if v_updated <> v_definition then execute v_updated; end if;
  revoke all on function public.recalculate_qb_receipt_totals(uuid)
    from public, anon, authenticated;
  if has_function_privilege('authenticated', v_signature, 'EXECUTE') then
    raise exception 'Receipt calculator must remain unavailable to direct authenticated calls';
  end if;
end $$;

-- Supervisor may set unit base costs, but cannot change pricing factors or
-- submit an aggregate cost through the line-pricing RPC.
do $$
declare
  v_definition text;
  v_updated text;
  v_signature regprocedure := 'public.set_qb_receipt_line_pricing(uuid,jsonb)'::regprocedure;
  v_anchor text := $anchor$v_note := nullif(trim(coalesce(v_line ->> 'notes', '')), '');$anchor$;
  v_guard text := $guard$
    v_note := nullif(trim(coalesce(v_line ->> 'notes', '')), '');
    if public.current_user_role() = 'supervisor' and (
      v_total is not null or not exists (
        select 1 from public.qb_receipt_lines existing
        where existing.id = v_id and existing.receipt_id = p_receipt_id
          and existing.distance_factor_percent is not distinct from v_dist
          and existing.exigency_factor_percent is not distinct from v_exig
          and existing.weather_factor_percent is not distinct from v_weather
          and existing.extraordinary_factor_percent is not distinct from v_extra
      )
    ) then raise exception 'QB_RECEIPT_SUPERVISOR_PRICING_CONFIG_FORBIDDEN'; end if;
$guard$;
begin
  v_definition := pg_get_functiondef(v_signature);
  if position('QB_RECEIPT_SUPERVISOR_PRICING_CONFIG_FORBIDDEN' in v_definition) = 0 then
    v_updated := replace(v_definition, v_anchor, v_guard);
    if v_updated = v_definition then
      raise exception 'Could not add Supervisor line-pricing guard';
    end if;
    execute v_updated;
  end if;
end $$;

-- Keep the historical draft RPC administrative. A separate wrapper supplies
-- stored factors/internal notes server-side and rejects writes to master prices.
create or replace function public.update_qb_receipt_draft(
  p_receipt_id uuid, p_distance_factor_percent numeric,
  p_exigency_factor_percent numeric, p_weather_factor_percent numeric,
  p_extraordinary_factor_percent numeric, p_visible_note text,
  p_internal_notes text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_role text := public.current_user_role();
begin
  if auth.uid() is null or v_role not in ('admin', 'administrador') then
    raise exception 'No tienes permiso para actualizar este recibo.';
  end if;
  if exists (select 1 from public.qb_receipts where id=p_receipt_id
      and pricing_mode='line_cost_markup') then
    raise exception 'QB_LINE_PRICING_USE_LINE_RPC';
  end if;
  return public.update_qb_receipt_draft_legacy(p_receipt_id,
    p_distance_factor_percent, p_exigency_factor_percent, p_weather_factor_percent,
    p_extraordinary_factor_percent, p_visible_note, p_internal_notes, p_lines);
end;
$$;
revoke all on function public.update_qb_receipt_draft(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)
  from public, anon;
grant execute on function public.update_qb_receipt_draft(uuid,numeric,numeric,numeric,numeric,text,text,jsonb)
  to authenticated;

create or replace function public.update_qb_receipt_draft_supervisor(
  p_receipt_id uuid, p_visible_note text, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_receipt public.qb_receipts%rowtype;
begin
  if auth.uid() is null or public.current_user_role() <> 'supervisor' then
    raise exception 'QB_RECEIPT_SUPERVISOR_REQUIRED';
  end if;
  select * into v_receipt from public.qb_receipts
  where id=p_receipt_id and status='borrador' for update;
  if not found or v_receipt.pricing_mode='line_cost_markup' then
    raise exception 'QB_RECEIPT_DRAFT_REQUIRED';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or exists (
    select 1 from jsonb_array_elements(p_lines) item
    where coalesce((item ->> 'save_as_new_base_price')::boolean, false)
  ) then raise exception 'QB_RECEIPT_SUPERVISOR_ADMIN_FIELDS_FORBIDDEN'; end if;
  return public.update_qb_receipt_draft_legacy(
    p_receipt_id, v_receipt.distance_factor_percent,
    v_receipt.exigency_factor_percent, v_receipt.weather_factor_percent,
    v_receipt.extraordinary_factor_percent, p_visible_note,
    v_receipt.internal_notes, p_lines
  );
end;
$$;
revoke all on function public.update_qb_receipt_draft_supervisor(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.update_qb_receipt_draft_supervisor(uuid,text,jsonb)
  to authenticated;

create or replace function public.set_qb_receipt_supervisor_line_costs(
  p_receipt_id uuid, p_lines jsonb
) returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_role text := public.current_user_role();
  v_line jsonb;
  v_id uuid;
  v_cost numeric;
  v_note text;
  v_count integer := 0;
begin
  if auth.uid() is null or v_role <> 'supervisor' then
    raise exception 'QB_RECEIPT_SUPERVISOR_REQUIRED';
  end if;
  perform 1 from public.qb_receipts where id = p_receipt_id
    and status = 'borrador' and pricing_mode = 'line_cost_markup' for update;
  if not found then raise exception 'QB_LINE_PRICING_REQUIRES_DRAFT'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'QB_LINE_PRICING_INVALID_LINES';
  end if;
  perform set_config('qb.line_pricing_write', 'enabled', true);
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_id := (v_line ->> 'line_id')::uuid;
    v_cost := nullif(trim(v_line ->> 'cost_base_unit'), '')::numeric;
    v_note := nullif(trim(coalesce(v_line ->> 'notes', '')), '');
    if v_cost is null or v_cost::text in ('NaN', 'Infinity', '-Infinity')
      or v_cost < 0 or v_cost > 99999999 or length(coalesce(v_note, '')) > 500 then
      raise exception 'QB_LINE_PRICING_INVALID_VALUE';
    end if;
    update public.qb_receipt_lines set
      cost_base_unit_snapshot = v_cost,
      cost_total_input_precise = null,
      cost_source = 'manual',
      notes = v_note
    where id = v_id and receipt_id = p_receipt_id;
    if not found then raise exception 'QB_LINE_PRICING_LINE_NOT_FOUND'; end if;
    v_count := v_count + 1;
  end loop;
  perform public.recalculate_qb_receipt_totals(p_receipt_id);
  insert into public.qb_receipt_events(receipt_id, event_type, metadata, created_by)
  values (p_receipt_id, 'lineas_editadas', jsonb_build_object(
    'line_count', v_count, 'pricing_mode', 'line_cost_markup', 'actor_role', 'supervisor'
  ), auth.uid());
  return p_receipt_id;
end;
$$;
revoke all on function public.set_qb_receipt_supervisor_line_costs(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.set_qb_receipt_supervisor_line_costs(uuid,jsonb)
  to authenticated;

commit;
