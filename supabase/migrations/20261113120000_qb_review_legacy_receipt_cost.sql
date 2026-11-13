begin;

-- Historical reference prices were sometimes copied into the base unit cost.
-- Preserve issued receipts and require an explicit review for affected drafts.
create or replace function private.qb_legacy_receipt_cost_needs_review(
  l public.qb_receipt_lines
) returns boolean language sql stable set search_path = pg_catalog as $$
  select coalesce(not l.sale_price_independent_snapshot and l.cost_source = 'purchase_snapshot'
    and l.cost_rule_id is null and l.purchase_cost_total is null
    and l.purchase_cost_reference_value = l.cost_base_unit_snapshot
    and l.purchase_cost_reference_unit_id <> l.base_unit_id
    and upper(trim(u.symbol)) <> upper(trim(l.base_unit_symbol)), false)
  from public.qb_units u where u.id=l.purchase_cost_reference_unit_id;
$$;
revoke all on function private.qb_legacy_receipt_cost_needs_review(public.qb_receipt_lines) from public,anon,authenticated;

create or replace function private.guard_qb_legacy_receipt_cost_on_issue()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if old.status='borrador' and new.status='emitido' and exists (
    select 1 from public.qb_receipt_lines l where l.receipt_id=old.id
      and private.qb_legacy_receipt_cost_needs_review(l)
  ) then
    raise exception 'Revisa el costo histórico y su tarifa de venta antes de emitir.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_qb_legacy_receipt_cost_on_issue() from public,anon,authenticated;
drop trigger if exists guard_qb_legacy_receipt_cost_on_issue on public.qb_receipts;
create trigger guard_qb_legacy_receipt_cost_on_issue before update of status on public.qb_receipts
  for each row execute function private.guard_qb_legacy_receipt_cost_on_issue();

create or replace function private.guard_qb_legacy_receipt_cost_on_edit()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
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
revoke all on function private.guard_qb_legacy_receipt_cost_on_edit() from public,anon,authenticated;
drop trigger if exists guard_qb_legacy_receipt_cost_on_edit on public.qb_receipt_lines;
create trigger guard_qb_legacy_receipt_cost_on_edit
  before update of cost_base_unit_snapshot,cost_source,cost_total_input_precise,sale_price_independent_snapshot
  on public.qb_receipt_lines for each row execute function private.guard_qb_legacy_receipt_cost_on_edit();

create or replace function public.review_qb_legacy_receipt_cost(
  p_receipt_id uuid, p_line_id uuid, p_expected_cost numeric, p_expected_sale numeric,
  p_new_cost numeric, p_approved_tariff numeric, p_reason text
) returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_line public.qb_receipt_lines%rowtype;
  v_tariff numeric;
  v_after jsonb;
begin
  if auth.uid() is null or not coalesce(public.current_user_role() in ('admin','administrador'),false) then
    raise exception 'QB_RECEIPT_ADMIN_WRITE_REQUIRED' using errcode='42501';
  end if;
  if p_new_cost is null or p_new_cost::text in ('NaN','Infinity','-Infinity') or
     p_new_cost < 0 or p_new_cost > 99999999 or p_new_cost <> round(p_new_cost,8)
     or coalesce(length(trim(p_reason)),0) not between 3 and 500 then
    raise exception 'Indica el costo aprobado por KG y el motivo de la corrección.';
  end if;
  perform 1 from public.qb_receipts where id=p_receipt_id and status='borrador'
    and pricing_mode='line_cost_markup' for update;
  if not found then raise exception 'QB_RECEIPT_REQUIRES_DRAFT'; end if;
  select * into v_line from public.qb_receipt_lines where id=p_line_id and receipt_id=p_receipt_id for update;
  if not found or not coalesce(private.qb_legacy_receipt_cost_needs_review(v_line), false)
    or v_line.cost_base_unit_snapshot is distinct from p_expected_cost
    or v_line.sale_total_precise is distinct from p_expected_sale then
    raise exception 'El borrador cambió. Recarga y revisa la diferencia.';
  end if;
  -- For an imported KG line, verify the commercial delivery itself was in KG.
  -- Never infer an equivalent from the historical cost reference (e.g. ARROBA).
  select s.base_sale_price into v_tariff
  from public.qb_product_unit_settings s
  join public.qb_units u on u.id=s.base_price_unit_id
  join public.qb_unit_dimensions dimension on dimension.id=u.dimension_id
  join public.qb_order_preparation_items p on p.id=v_line.preparation_item_id
  join public.qb_order_items i on i.id=p.order_item_id and i.order_id=v_line.order_id
  join public.qb_order_delivery_items d on d.order_item_id=i.id and d.preparation_item_id=p.id
  where s.product_id=v_line.product_id and i.product_id=s.product_id
    and u.is_active and dimension.is_active and u.conversion_factor_to_base=1
    and ((dimension.code='peso' and lower(u.code)='kg')
      or (dimension.code='legacy_dump' and u.id=v_line.base_unit_id and u.id=i.source_unit_id))
    and upper(trim(u.symbol))='KG' and s.base_sale_price>0
    and s.base_sale_price::text not in ('NaN','Infinity','-Infinity')
    and upper(trim(v_line.base_unit_symbol))='KG' and upper(trim(i.source_label))='KG'
    and v_line.order_input_mode='quantity' and i.order_input_mode='quantity'
    and d.delivered_quantity=v_line.delivered_base_quantity and d.delivered_quantity>0
  for share of s,u,i,p,d,dimension;
  if v_tariff is null or v_tariff is distinct from p_approved_tariff then
    raise exception 'La unidad comercial o la tarifa aprobada ya no coinciden. Revisa la línea.';
  end if;
  perform set_config('qb.line_pricing_write','enabled',true);
  perform set_config('qb.legacy_cost_review_line',p_line_id::text,true);
  update public.qb_receipt_lines set cost_base_unit_snapshot=p_new_cost,
    cost_total_input_precise=null, cost_source='manual', cost_calculation_status='manual_override',
    base_price_used=v_tariff, sale_price_independent_snapshot=true,
    commercial_quantity_snapshot=delivered_base_quantity, commercial_unit_label_snapshot='KG',
    commercial_conversion_factor_snapshot=1
  where id=p_line_id;
  perform set_config('qb.legacy_cost_review_line','',true);
  perform public.recalculate_qb_receipt_totals(p_receipt_id);
  select jsonb_build_object('cost_rate',cost_base_unit_snapshot,'cost_total',cost_total_precise,
    'sale_rate',base_price_used,'sale_total',sale_total_precise) into v_after
    from public.qb_receipt_lines where id=p_line_id;
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'review_qb_legacy_receipt_cost','qb_receipt_line',p_line_id,
    jsonb_build_object('receipt_id',p_receipt_id,'reason',trim(p_reason),'unit','KG',
      'before',jsonb_build_object('cost_rate',v_line.cost_base_unit_snapshot,'cost_total',v_line.cost_total_precise,
        'sale_rate',v_line.base_price_used,'sale_total',v_line.sale_total_precise,
        'purchase_reference',v_line.purchase_cost_reference_value,
        'purchase_reference_unit_id',v_line.purchase_cost_reference_unit_id),'after',v_after));
end;
$$;
revoke all on function public.review_qb_legacy_receipt_cost(uuid,uuid,numeric,numeric,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.review_qb_legacy_receipt_cost(uuid,uuid,numeric,numeric,numeric,numeric,text) to authenticated;

commit;
