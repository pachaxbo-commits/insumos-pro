-- Explicit, immutable cost-basis snapshots for new receipt lines.
-- Sale remains based on the commercial sale-price snapshot, never on cost.
begin;

create table if not exists public.qb_product_cost_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  order_allowed_unit_id uuid not null references public.qb_product_allowed_units(id) on delete restrict,
  cost_basis text not null,
  rate_amount numeric(20, 8) not null,
  reference_weight_unit_id uuid references public.qb_units(id) on delete restrict,
  reference_factor_to_kg numeric(18, 9),
  is_active boolean not null default true,
  row_version integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qb_product_cost_rules_basis_check check (
    (cost_basis = 'commercial_unit' and reference_weight_unit_id is null and reference_factor_to_kg is null)
    or (cost_basis = 'actual_weight' and reference_weight_unit_id is not null
      and reference_factor_to_kg is not null and reference_factor_to_kg > 0)
  ),
  constraint qb_product_cost_rules_rate_check check (
    rate_amount > 0 and rate_amount <= 999999999999
    and rate_amount::text not in ('NaN', 'Infinity', '-Infinity')
  ),
  constraint qb_product_cost_rules_version_check check (row_version > 0)
);

create unique index if not exists qb_product_cost_rules_product_unit_unique
  on public.qb_product_cost_rules(product_id, order_allowed_unit_id);
create index if not exists qb_product_cost_rules_active_lookup
  on public.qb_product_cost_rules(product_id, order_allowed_unit_id)
  where is_active;

alter table public.qb_product_cost_rules enable row level security;
revoke all on public.qb_product_cost_rules from public, anon;
revoke insert, update, delete, truncate, references, trigger on public.qb_product_cost_rules from authenticated;
grant select on public.qb_product_cost_rules to authenticated;
drop policy if exists qb_product_cost_rules_admin_select on public.qb_product_cost_rules;
create policy qb_product_cost_rules_admin_select on public.qb_product_cost_rules
  for select to authenticated using (public.current_user_role() in ('admin', 'administrador'));

alter table public.qb_receipt_lines
  add column if not exists cost_rule_id uuid references public.qb_product_cost_rules(id) on delete set null,
  add column if not exists cost_basis_snapshot text,
  add column if not exists cost_rate_snapshot numeric(20, 8),
  add column if not exists cost_reference_unit_id_snapshot uuid references public.qb_units(id) on delete set null,
  add column if not exists cost_reference_unit_symbol_snapshot text,
  add column if not exists cost_reference_factor_to_kg_snapshot numeric(18, 9),
  add column if not exists cost_quantity_snapshot numeric(20, 8),
  add column if not exists cost_rule_snapshot jsonb,
  add column if not exists cost_calculation_status text not null default 'unconfigured',
  add column if not exists sale_price_independent_snapshot boolean not null default false;

alter table public.qb_receipt_lines
  drop constraint if exists qb_receipt_lines_cost_basis_snapshot_check;
alter table public.qb_receipt_lines
  add constraint qb_receipt_lines_cost_basis_snapshot_check check (
    (cost_basis_snapshot is null and cost_rate_snapshot is null
      and cost_reference_unit_id_snapshot is null and cost_reference_unit_symbol_snapshot is null
      and cost_reference_factor_to_kg_snapshot is null and cost_quantity_snapshot is null
      and cost_rule_snapshot is null)
    or (cost_basis_snapshot in ('commercial_unit', 'actual_weight')
      and cost_rate_snapshot > 0 and cost_rule_snapshot is not null
      and ((cost_quantity_snapshot is not null and cost_quantity_snapshot > 0)
        or (cost_calculation_status in ('pending_weight','pending_quantity','invalid_reference')
          and cost_quantity_snapshot is null))
      and ((cost_basis_snapshot = 'commercial_unit' and cost_reference_unit_id_snapshot is null
        and cost_reference_unit_symbol_snapshot is not null and cost_reference_factor_to_kg_snapshot is null)
        or (cost_basis_snapshot = 'actual_weight' and cost_reference_unit_id_snapshot is not null
          and cost_reference_unit_symbol_snapshot is not null
          and cost_reference_factor_to_kg_snapshot is not null and cost_reference_factor_to_kg_snapshot > 0)))
  );
alter table public.qb_receipt_lines
  drop constraint if exists qb_receipt_lines_cost_calculation_status_check;
alter table public.qb_receipt_lines
  add constraint qb_receipt_lines_cost_calculation_status_check check (
    cost_calculation_status in ('unconfigured', 'ready', 'pending_weight', 'pending_quantity', 'invalid_reference', 'manual_override')
  );

alter table public.qb_receipt_lines
  drop constraint if exists qb_receipt_lines_line_pricing_check;
alter table public.qb_receipt_lines
  add constraint qb_receipt_lines_line_pricing_check check (
    (cost_base_unit_snapshot is null or cost_base_unit_snapshot >= 0)
    and (cost_total_input_precise is null or cost_total_input_precise >= 0)
    and (cost_total_precise is null or cost_total_precise >= 0)
    and (sale_total_precise is null or sale_total_precise >= 0)
    and (cost_source is null or cost_source in ('manual', 'purchase_snapshot', 'fifo', 'configured_rule'))
  );

create or replace function public.upsert_qb_product_cost_rule(
  p_product_id uuid,
  p_order_allowed_unit_id uuid,
  p_cost_basis text,
  p_rate_amount numeric,
  p_reference_weight_unit_id uuid,
  p_is_active boolean,
  p_expected_row_version integer
) returns jsonb
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor uuid := auth.uid();
  v_unit public.qb_units%rowtype;
  v_existing public.qb_product_cost_rules%rowtype;
  v_role text;
  v_factor numeric(18, 9);
begin
  if v_actor is null then raise exception 'QB_COST_RULE_AUTH_REQUIRED'; end if;
  v_role := public.current_user_role();
  if v_role not in ('admin', 'administrador') then raise exception 'QB_COST_RULE_ADMIN_REQUIRED'; end if;
  if p_product_id is null or p_order_allowed_unit_id is null
    or p_cost_basis not in ('commercial_unit', 'actual_weight')
    or p_rate_amount is null or p_rate_amount <= 0 or p_rate_amount > 999999999999
    or p_rate_amount::text in ('NaN', 'Infinity', '-Infinity')
    or p_is_active is null then raise exception 'QB_COST_RULE_INVALID'; end if;
  if not exists (
    select 1 from public.qb_product_allowed_units allowed
    where allowed.id=p_order_allowed_unit_id and allowed.product_id=p_product_id
      and allowed.usage_context='pedido' and allowed.is_active
  ) then raise exception 'QB_COST_RULE_ORDER_UNIT_INVALID'; end if;

  if p_cost_basis = 'commercial_unit' then
    if p_reference_weight_unit_id is not null then raise exception 'QB_COST_RULE_REFERENCE_NOT_ALLOWED'; end if;
    v_factor := null;
  else
    select unit.* into v_unit
    from public.qb_units unit
    join public.qb_unit_dimensions dimension on dimension.id=unit.dimension_id
    where unit.id=p_reference_weight_unit_id and unit.is_active and dimension.is_active
      and dimension.code='peso' and upper(trim(dimension.base_unit_code))='KG'
      and unit.conversion_factor_to_base > 0;
    if v_unit.id is null then raise exception 'QB_COST_RULE_WEIGHT_UNIT_INVALID'; end if;
    v_factor := round(v_unit.conversion_factor_to_base,9);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_product_id::text || ':' || p_order_allowed_unit_id::text, 0));
  select * into v_existing from public.qb_product_cost_rules
  where product_id=p_product_id and order_allowed_unit_id=p_order_allowed_unit_id for update;
  if found then
    if p_expected_row_version is distinct from v_existing.row_version then
      raise exception 'QB_COST_RULE_CONFLICT';
    end if;
    update public.qb_product_cost_rules set cost_basis=p_cost_basis, rate_amount=round(p_rate_amount,8),
      reference_weight_unit_id=case when p_cost_basis='actual_weight' then p_reference_weight_unit_id else null end,
      reference_factor_to_kg=v_factor, is_active=p_is_active, row_version=row_version+1,
      updated_by=v_actor, updated_at=now()
    where id=v_existing.id returning * into v_existing;
  else
    if p_expected_row_version is not null then raise exception 'QB_COST_RULE_CONFLICT'; end if;
    insert into public.qb_product_cost_rules(product_id,order_allowed_unit_id,cost_basis,rate_amount,
      reference_weight_unit_id,reference_factor_to_kg,is_active,row_version,created_by,updated_by)
    values(p_product_id,p_order_allowed_unit_id,p_cost_basis,round(p_rate_amount,8),
      case when p_cost_basis='actual_weight' then p_reference_weight_unit_id else null end,
      v_factor,p_is_active,1,v_actor,v_actor) returning * into v_existing;
  end if;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values(v_actor,'upsert_qb_product_cost_rule','qb_product_cost_rule',v_existing.id,
    jsonb_build_object('product_id',p_product_id,'order_allowed_unit_id',p_order_allowed_unit_id,
      'cost_basis',p_cost_basis,'rate_amount',round(p_rate_amount,8),
      'reference_weight_unit_id',case when p_cost_basis='actual_weight' then p_reference_weight_unit_id else null end,
      'is_active',p_is_active,'row_version',v_existing.row_version));
  return jsonb_build_object('id',v_existing.id,'row_version',v_existing.row_version,'cost_basis',v_existing.cost_basis);
end;
$$;
revoke all on function public.upsert_qb_product_cost_rule(uuid,uuid,text,numeric,uuid,boolean,integer)
  from public, anon, authenticated;
grant execute on function public.upsert_qb_product_cost_rule(uuid,uuid,text,numeric,uuid,boolean,integer)
  to authenticated;

create or replace function private.snapshot_qb_receipt_cost_rule()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_allowed_id uuid;
  v_rule public.qb_product_cost_rules%rowtype;
  v_unit public.qb_units%rowtype;
  v_commercial record;
  v_quantity numeric(20,8);
  v_total numeric(20,8);
begin
  if not exists (select 1 from public.qb_receipts receipt
    where receipt.id=new.receipt_id and receipt.pricing_mode='line_cost_markup') then
    return new;
  end if;
  -- New receipt lines use the catalog's sale snapshot independently of cost.
  new.sale_price_independent_snapshot := true;
  -- Earlier receipt writers may populate base_price_used from Provisión cost.
  -- Resolve sale solely from the configured tariff and its explicit unit.
  new.base_price_used := null;
  select round(settings.base_sale_price * target.conversion_factor_to_base
    / reference.conversion_factor_to_base, 4)
  into new.base_price_used
  from public.qb_product_unit_settings settings
  join public.qb_units reference on reference.id=settings.base_price_unit_id
  join public.qb_units target on target.id=new.base_unit_id
    and target.dimension_id=reference.dimension_id
  join public.qb_unit_dimensions dimension on dimension.id=target.dimension_id
  where settings.product_id=new.product_id and settings.base_sale_price>0
    and settings.base_sale_price::text not in ('NaN','Infinity','-Infinity')
    and reference.is_active and target.is_active and dimension.is_active
    and reference.conversion_factor_to_base>0 and target.conversion_factor_to_base>0
    and dimension.code<>'legacy_dump';
  select delivery.delivered_quantity, item.source_label, item.conversion_factor_to_base
    into v_commercial
  from public.qb_order_preparation_items preparation
  join public.qb_order_items item on item.id=preparation.order_item_id
  join public.qb_order_delivery_items delivery on delivery.order_item_id=item.id
    and delivery.preparation_item_id=preparation.id
  where preparation.id=new.preparation_item_id and item.product_id=new.product_id
    and item.order_input_mode='quantity' and delivery.delivered_quantity>=0
    and item.conversion_factor_to_base>0 and nullif(trim(item.source_label),'') is not null;
  if found then
    new.commercial_quantity_snapshot := v_commercial.delivered_quantity;
    new.commercial_unit_label_snapshot := v_commercial.source_label;
    new.commercial_conversion_factor_snapshot := v_commercial.conversion_factor_to_base;
  end if;
  select order_item.allowed_unit_id into v_allowed_id
  from public.qb_order_preparation_items preparation
  join public.qb_order_items order_item on order_item.id=preparation.order_item_id
  where preparation.id=new.preparation_item_id and order_item.product_id=new.product_id;
  if v_allowed_id is null then
    new.cost_calculation_status := 'unconfigured';
    return new;
  end if;
  select * into v_rule from public.qb_product_cost_rules
  where product_id=new.product_id and order_allowed_unit_id=v_allowed_id and is_active;
  if not found then
    new.cost_calculation_status := 'unconfigured';
    return new;
  end if;

  new.cost_rule_id := v_rule.id;
  new.cost_basis_snapshot := v_rule.cost_basis;
  new.cost_rate_snapshot := v_rule.rate_amount;
  new.cost_reference_unit_id_snapshot := v_rule.reference_weight_unit_id;
  new.cost_reference_factor_to_kg_snapshot := v_rule.reference_factor_to_kg;
  new.cost_rule_snapshot := jsonb_build_object(
    'rule_id',v_rule.id,'product_id',v_rule.product_id,
    'order_allowed_unit_id',v_rule.order_allowed_unit_id,'basis',v_rule.cost_basis,
    'rate_amount',v_rule.rate_amount,'rate_currency','BOB',
    'reference_weight_unit_id',v_rule.reference_weight_unit_id,
    'reference_factor_to_kg',v_rule.reference_factor_to_kg,
    'rule_row_version',v_rule.row_version,'captured_at',now()
  );
  if v_rule.cost_basis='commercial_unit' then
    new.cost_reference_unit_id_snapshot := null;
    new.cost_reference_unit_symbol_snapshot := coalesce(new.commercial_unit_label_snapshot,new.visible_unit_label);
    new.cost_quantity_snapshot := new.commercial_quantity_snapshot;
    if new.commercial_quantity_snapshot is null or new.commercial_quantity_snapshot<=0
      or new.commercial_unit_label_snapshot is null then
      new.cost_calculation_status := 'pending_quantity';
      new.cost_base_unit_snapshot := null;
      new.cost_total_input_precise := null;
      new.cost_source := null;
      return new;
    end if;
    v_quantity := new.commercial_quantity_snapshot;
  else
    select unit.* into v_unit
    from public.qb_units unit join public.qb_unit_dimensions dimension on dimension.id=unit.dimension_id
    where unit.id=v_rule.reference_weight_unit_id and unit.is_active and dimension.is_active
      and dimension.code='peso' and upper(trim(dimension.base_unit_code))='KG'
      and abs(unit.conversion_factor_to_base-v_rule.reference_factor_to_kg)<=0.000000001;
    if v_unit.id is null or v_rule.reference_factor_to_kg is null or v_rule.reference_factor_to_kg<=0 then
      new.cost_calculation_status := 'invalid_reference';
      new.cost_base_unit_snapshot := null;
      new.cost_total_input_precise := null;
      new.cost_source := null;
      return new;
    end if;
    new.cost_reference_unit_symbol_snapshot := v_unit.symbol;
    if new.actual_weight_kg is null or new.actual_weight_kg<=0 then
      new.cost_calculation_status := 'pending_weight';
      new.cost_quantity_snapshot := null;
      new.cost_base_unit_snapshot := null;
      new.cost_total_input_precise := null;
      new.cost_source := null;
      return new;
    end if;
    v_quantity := round(new.actual_weight_kg/v_rule.reference_factor_to_kg,8);
    new.cost_quantity_snapshot := v_quantity;
  end if;
  v_total := round(v_quantity*v_rule.rate_amount,8);
  new.cost_base_unit_snapshot := case when new.delivered_base_quantity>0
    then round(v_total/new.delivered_base_quantity,8) else null end;
  new.cost_total_input_precise := v_total;
  new.cost_source := 'configured_rule';
  new.cost_calculation_status := 'ready';
  return new;
end;
$$;
revoke all on function private.snapshot_qb_receipt_cost_rule() from public, anon, authenticated;
drop trigger if exists zzz_snapshot_qb_receipt_cost_rule on public.qb_receipt_lines;
create trigger zzz_snapshot_qb_receipt_cost_rule
  before insert on public.qb_receipt_lines
  for each row execute function private.snapshot_qb_receipt_cost_rule();

create or replace function private.guard_qb_configured_receipt_cost()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if old.cost_rule_id is not null and old.cost_basis_snapshot is not null then
    if new.cost_base_unit_snapshot is distinct from old.cost_base_unit_snapshot then
      raise exception 'QB_CONFIGURED_COST_OVERRIDE_FORBIDDEN';
    end if;
    -- The legacy cost RPC accepts an unchanged unit cost as part of a batch.
    -- Keep the immutable rule result even if that RPC attempts to rewrite the
    -- source fields while saving notes or commercial factors.
    new.cost_total_input_precise := old.cost_total_input_precise;
    new.cost_source := old.cost_source;
    new.cost_calculation_status := old.cost_calculation_status;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_qb_configured_receipt_cost() from public, anon, authenticated;
drop trigger if exists guard_qb_configured_receipt_cost on public.qb_receipt_lines;
create trigger guard_qb_configured_receipt_cost
  before update of cost_base_unit_snapshot,cost_total_input_precise,cost_source,cost_calculation_status
  on public.qb_receipt_lines for each row execute function private.guard_qb_configured_receipt_cost();

-- The new sale snapshot is independent of cost. Legacy drafts without the
-- marker keep the exact pre-existing formula.
create or replace function public.recalculate_qb_receipt_totals(p_receipt_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_receipt public.qb_receipts%rowtype;
  v_cost numeric(20,8);
  v_sale numeric(20,8);
  v_profit numeric(20,8);
begin
  select * into v_receipt from public.qb_receipts where id=p_receipt_id for update;
  if not found then raise exception 'QB_RECEIPT_NOT_FOUND'; end if;
  if v_receipt.pricing_mode='legacy' then
    perform public.recalculate_qb_receipt_totals_legacy(p_receipt_id);
    return;
  end if;
  if auth.uid() is null or public.current_user_role() not in ('admin','administrador','supervisor') then
    raise exception 'QB_RECEIPT_ADMIN_REQUIRED';
  end if;
  if v_receipt.status<>'borrador' then raise exception 'QB_RECEIPT_REQUIRES_DRAFT'; end if;
  perform set_config('qb.line_pricing_write','enabled',true);

  update public.qb_receipt_lines line set
    cost_total_precise=case when line.cost_total_input_precise is not null then line.cost_total_input_precise
      when line.cost_base_unit_snapshot is null then null
      else round(line.delivered_base_quantity*line.cost_base_unit_snapshot,8) end,
    profit_unit_precise=case when line.cost_base_unit_snapshot is null then null
      when line.order_input_mode='amount_bs' then round(line.fixed_line_amount/line.delivered_base_quantity-line.cost_base_unit_snapshot,8)
      else round(line.cost_base_unit_snapshot*(line.distance_factor_percent+line.exigency_factor_percent
        +line.weather_factor_percent+line.extraordinary_factor_percent)/100,8) end,
    sale_total_precise=case
      when line.order_input_mode='amount_bs' then line.fixed_line_amount
      when line.sale_price_independent_snapshot and line.base_price_used is null then null
      when line.sale_price_independent_snapshot then round(
        line.delivered_base_quantity*public.qb_compound_unit_price(line.base_price_used,
          line.distance_factor_percent,line.exigency_factor_percent,line.weather_factor_percent,
          line.extraordinary_factor_percent),8)
      when line.cost_base_unit_snapshot is null then null
      else round(line.delivered_base_quantity*line.cost_base_unit_snapshot*(1+(
        line.distance_factor_percent+line.exigency_factor_percent+line.weather_factor_percent
        +line.extraordinary_factor_percent)/100),8) end,
    final_unit_price=case
      when line.order_input_mode='amount_bs' then line.final_unit_price
      when line.sale_price_independent_snapshot and line.base_price_used is null then null
      when line.sale_price_independent_snapshot then
        public.qb_compound_unit_price(line.base_price_used,line.distance_factor_percent,
          line.exigency_factor_percent,line.weather_factor_percent,line.extraordinary_factor_percent)
      when line.cost_base_unit_snapshot is null then null
      else round(line.cost_base_unit_snapshot*(1+(
        line.distance_factor_percent+line.exigency_factor_percent+line.weather_factor_percent
        +line.extraordinary_factor_percent)/100),4) end,
    line_total=case
      when line.order_input_mode='amount_bs' then line.fixed_line_amount
      when line.sale_price_independent_snapshot and line.base_price_used is null then null
      when line.sale_price_independent_snapshot then round(
        line.delivered_base_quantity*public.qb_compound_unit_price(line.base_price_used,
          line.distance_factor_percent,line.exigency_factor_percent,line.weather_factor_percent,
          line.extraordinary_factor_percent),2)
      when line.cost_base_unit_snapshot is null then null
      else round(line.delivered_base_quantity*line.cost_base_unit_snapshot*(1+(
        line.distance_factor_percent+line.exigency_factor_percent+line.weather_factor_percent
        +line.extraordinary_factor_percent)/100),2) end,
    base_price_used=case when line.sale_price_independent_snapshot then line.base_price_used
      when line.order_input_mode='amount_bs' then line.base_price_used
      else round(line.cost_base_unit_snapshot,4) end
  where line.receipt_id=p_receipt_id;

  update public.qb_receipt_lines line set
    profit_unit_precise=case when line.sale_price_independent_snapshot and line.order_input_mode<>'amount_bs' then
      round((line.sale_total_precise-line.cost_total_precise)/nullif(line.delivered_base_quantity,0),8)
      else line.profit_unit_precise end,
    profit_total_precise=case when line.sale_total_precise is null or line.cost_total_precise is null then null
      else round(line.sale_total_precise-line.cost_total_precise,8) end
  where line.receipt_id=p_receipt_id;
  select sum(cost_total_precise),sum(sale_total_precise),sum(profit_total_precise)
    into v_cost,v_sale,v_profit from public.qb_receipt_lines where receipt_id=p_receipt_id;
  if exists(select 1 from public.qb_receipt_lines where receipt_id=p_receipt_id
      and (cost_total_precise is null or sale_total_precise is null)) then
    v_cost:=null; v_sale:=null; v_profit:=null;
  end if;
  update public.qb_receipts set cost_total_precise=v_cost,sale_total_precise=v_sale,profit_total_precise=v_profit,
    subtotal_amount=coalesce(round(v_cost,2),0),total_amount=coalesce(round(v_sale,2),0),
    surcharge_amount=coalesce(round(v_profit,2),0),factor_total_percent=0,
    calculated_by=auth.uid(),calculated_at=now(),
    summary_snapshot=jsonb_build_object('pricing_mode','line_cost_markup','cost_total',v_cost,
      'sale_total',v_sale,'profit_total',v_profit,
      'sale_policy','catalog_price_snapshot_independent_of_cost',
      'has_pending_costs',exists(select 1 from public.qb_receipt_lines
        where receipt_id=p_receipt_id and cost_total_precise is null),'non_fiscal',true)
  where id=p_receipt_id;
end;
$$;
revoke all on function public.recalculate_qb_receipt_totals(uuid) from public, anon, authenticated;

-- Emission must reject unresolved cost/rule and unresolved commercial sale.
create or replace function private.guard_qb_line_pricing_receipt()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if old.pricing_mode='line_cost_markup' and old.status='borrador'
    and new.status='emitido' and exists(select 1 from public.qb_receipt_lines
      where receipt_id=old.id and (cost_total_precise is null or sale_total_precise is null
        or (cost_rule_id is not null and cost_calculation_status in ('pending_weight','pending_quantity','invalid_reference')))) then
    raise exception 'QB_LINE_PRICING_COST_PENDING';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_qb_line_pricing_receipt on public.qb_receipts;
create trigger guard_qb_line_pricing_receipt before update on public.qb_receipts
  for each row execute function private.guard_qb_line_pricing_receipt();

-- Keep Supervisor's approved line projection limited to individual operational
-- fields; never add receipt aggregates, margins, or profit.
create or replace view public.qb_supervisor_receipt_lines
with (security_barrier=true) as
select
  line.id,line.receipt_id,line.order_id,orders.public_reference as order_reference,
  line.product_id,line.product_name_snapshot,line.product_code_snapshot,line.category_name_snapshot,
  line.delivered_base_quantity,line.base_unit_symbol,line.visible_unit_label,line.order_input_mode,
  line.requested_amount_bs,line.currency_snapshot,pricing_unit.symbol as pricing_unit_symbol,
  line.estimated_base_quantity,line.fixed_line_amount,line.base_price_used,line.final_unit_price,
  line.line_total,line.cost_base_unit_snapshot,line.notes,line.created_at,
  line.actual_weight_value,line.actual_weight_unit_id,line.actual_weight_factor_to_kg,line.actual_weight_kg,
  weight_unit.symbol as actual_weight_unit_symbol,line.commercial_quantity_snapshot,
  line.commercial_unit_label_snapshot,line.commercial_conversion_factor_snapshot,
  line.cost_basis_snapshot,line.cost_rate_snapshot,line.cost_reference_unit_symbol_snapshot,
  line.cost_quantity_snapshot,line.sale_price_independent_snapshot,line.cost_rule_id,
  line.cost_calculation_status
from public.qb_receipt_lines line
join public.qb_orders orders on orders.id=line.order_id
left join public.qb_units pricing_unit on pricing_unit.id=line.pricing_unit_id
left join public.qb_units weight_unit on weight_unit.id=line.actual_weight_unit_id
where public.current_user_role() in ('admin','administrador','supervisor');
revoke all on public.qb_supervisor_receipt_lines from public,anon;
grant select on public.qb_supervisor_receipt_lines to authenticated;

commit;
