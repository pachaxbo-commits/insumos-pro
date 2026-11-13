begin;
alter table public.qb_receipt_lines add column if not exists receipt_cost_saved_at timestamptz;
create index if not exists qb_receipt_saved_cost_idx on public.qb_receipt_lines
  (product_id,receipt_cost_saved_at desc,id) where receipt_cost_saved_at is not null;

create or replace function private.qb_latest_receipt_cost(p_product uuid,p_unit uuid)
returns numeric language sql stable security definer set search_path=pg_catalog as $$
  select round(l.cost_base_unit_snapshot *
    case when l.base_unit_id=p_unit then 1
      else target.conversion_factor_to_base/source.conversion_factor_to_base end,8)
  from public.qb_receipt_lines l
  join public.qb_receipts r on r.id=l.receipt_id and r.status in ('borrador','emitido')
    and r.pricing_mode='line_cost_markup'
  join public.qb_units source on source.id=l.base_unit_id
  join public.qb_units target on target.id=p_unit
  join public.qb_unit_dimensions d on d.id=target.dimension_id
  where l.product_id=p_product and l.cost_source='manual' and l.cost_base_unit_snapshot>=0
    and l.cost_base_unit_snapshot::text not in ('NaN','Infinity','-Infinity')
    and (l.receipt_cost_saved_at is not null or (l.cost_total_input_precise is null and l.cost_rule_id is null))
    and (source.id=target.id or (d.code='peso' and d.is_active and source.is_active and target.is_active
      and source.dimension_id=target.dimension_id and source.code<>'cuartilla' and target.code<>'cuartilla'
      and source.conversion_factor_to_base>0 and target.conversion_factor_to_base>0))
  order by l.receipt_cost_saved_at desc nulls last,l.updated_at desc,l.id desc limit 1;
$$;
revoke all on function private.qb_latest_receipt_cost(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_qb_draft_receipt_cost_suggestions(p_receipts uuid[])
returns table(line_id uuid, suggested_cost numeric)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('admin','administrador'),false) then
    raise exception 'Acceso denegado.' using errcode='42501';
  end if;
  return query select l.id,private.qb_latest_receipt_cost(l.product_id,l.base_unit_id)
    from public.qb_receipt_lines l join public.qb_receipts r on r.id=l.receipt_id
    where r.id=any(p_receipts) and r.status='borrador' and r.pricing_mode='line_cost_markup'
      and l.cost_source is distinct from 'manual';
end;
$$;
revoke all on function public.get_qb_draft_receipt_cost_suggestions(uuid[]) from public,anon,authenticated;
grant execute on function public.get_qb_draft_receipt_cost_suggestions(uuid[]) to authenticated;

create or replace function private.qb_set_receipt_cost_suggestion()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if exists(select 1 from public.qb_receipts r where r.id=new.receipt_id and r.pricing_mode='line_cost_markup') then
    new.cost_base_unit_snapshot:=null;
    new.cost_total_input_precise:=null;
    new.cost_source:=null;
    new.base_price_used:=null;
    new.sale_price_independent_snapshot:=false;
    new.cost_rule_id:=null;
    new.cost_basis_snapshot:=null;
    new.cost_rate_snapshot:=null;
    new.cost_reference_unit_id_snapshot:=null;
    new.cost_reference_unit_symbol_snapshot:=null;
    new.cost_reference_factor_to_kg_snapshot:=null;
    new.cost_quantity_snapshot:=null;
    new.cost_rule_snapshot:=null;
    new.cost_calculation_status:='unconfigured';
    if new.order_input_mode='quantity' then
      new.final_unit_price:=null;
      new.line_total:=null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.qb_set_receipt_cost_suggestion() from public,anon,authenticated;
drop trigger if exists zzzz_qb_set_receipt_cost_suggestion on public.qb_receipt_lines;
create trigger zzzz_qb_set_receipt_cost_suggestion before insert on public.qb_receipt_lines
for each row execute function private.qb_set_receipt_cost_suggestion();

create or replace function private.guard_qb_configured_receipt_cost()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.receipt_cost_saved_at is distinct from old.receipt_cost_saved_at and new.cost_source='manual'
    and current_setting('qb.line_pricing_write',true)='enabled' then return new; end if;
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
create or replace function private.guard_qb_legacy_receipt_cost_on_edit()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.receipt_cost_saved_at is distinct from old.receipt_cost_saved_at and new.cost_source='manual'
    and current_setting('qb.line_pricing_write',true)='enabled' then return new; end if;
  if private.qb_legacy_receipt_cost_needs_review(old)
    and (new.cost_base_unit_snapshot is distinct from old.cost_base_unit_snapshot
      or new.cost_source is distinct from old.cost_source
      or new.cost_total_input_precise is distinct from old.cost_total_input_precise
      or new.sale_price_independent_snapshot is distinct from old.sale_price_independent_snapshot)
    and current_setting('qb.legacy_cost_review_line',true) is distinct from old.id::text then
    raise exception 'Usa la revisión de costo histórico para modificar esta línea.';
  end if;
  return new;
end;
$$;
create or replace function public.set_qb_receipt_line_pricing(p_receipt_id uuid, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_line jsonb; v_id uuid; v_cost numeric; v_total numeric; v_dist numeric; v_exig numeric;
  v_weather numeric; v_extra numeric; v_note text; v_count integer := 0;
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('admin','administrador'),false) then
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
    if v_cost is null or v_total is not null then
      raise exception 'Indica una tarifa de costo en la unidad de la línea.';
    end if;
    update public.qb_receipt_lines set
      receipt_cost_saved_at=clock_timestamp(),
      sale_price_independent_snapshot=false,
      cost_rule_id=null, cost_basis_snapshot=null, cost_rate_snapshot=null,
      cost_reference_unit_id_snapshot=null, cost_reference_unit_symbol_snapshot=null,
      cost_reference_factor_to_kg_snapshot=null, cost_quantity_snapshot=null, cost_rule_snapshot=null,
      cost_calculation_status='manual_override',
      cost_base_unit_snapshot=v_cost,
      cost_total_input_precise=null,
      cost_source='manual',
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
create or replace function private.require_qb_saved_markup_cost()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if old.status='borrador' and new.status='emitido' and new.pricing_mode='line_cost_markup'
    and exists(select 1 from public.qb_receipt_lines l where l.receipt_id=old.id
      and (l.receipt_cost_saved_at is null or l.sale_price_independent_snapshot)) then
    raise exception 'Guarda las tarifas de costo del recibo antes de emitir.';
  end if;
  return new;
end;
$$;
revoke all on function private.require_qb_saved_markup_cost() from public,anon,authenticated;
drop trigger if exists require_qb_saved_markup_cost on public.qb_receipts;
create trigger require_qb_saved_markup_cost before update of status on public.qb_receipts
for each row execute function private.require_qb_saved_markup_cost();
commit;
