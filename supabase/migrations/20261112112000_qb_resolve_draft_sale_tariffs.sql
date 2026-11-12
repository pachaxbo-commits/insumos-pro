begin;

create or replace function public.resolve_qb_draft_sale_tariffs(p_receipt_id uuid)
returns integer
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  changed_count integer;
begin
  if not coalesce(public.current_user_role() in ('admin','administrador'),false) then
    raise exception 'QB_RECEIPT_ADMIN_WRITE_REQUIRED' using errcode='42501';
  end if;
  perform 1 from public.qb_receipts
  where id=p_receipt_id and status='borrador' and pricing_mode='line_cost_markup'
  for update;
  if not found then raise exception 'QB_RECEIPT_REQUIRES_DRAFT'; end if;

  perform set_config('qb.line_pricing_write','enabled',true);
  with candidates as (
    select l.id, s.base_sale_price, reference.id reference_id, reference.symbol reference_symbol,
      target.id target_id, target.symbol target_symbol,
      target.conversion_factor_to_base / reference.conversion_factor_to_base factor,
      round(s.base_sale_price * target.conversion_factor_to_base / reference.conversion_factor_to_base,4) price
    from public.qb_receipt_lines l
    join public.qb_product_unit_settings s on s.product_id=l.product_id
    join public.qb_units reference on reference.id=s.base_price_unit_id
    join public.qb_units target on target.id=l.base_unit_id and target.dimension_id=reference.dimension_id
    join public.qb_unit_dimensions d on d.id=target.dimension_id
    where l.receipt_id=p_receipt_id and l.order_input_mode='quantity'
      and l.sale_price_independent_snapshot and l.base_price_used is null
      and s.base_sale_price>0 and s.base_sale_price::text not in ('NaN','Infinity','-Infinity')
      and reference.is_active and target.is_active and d.is_active and d.code<>'legacy_dump'
      and reference.conversion_factor_to_base>0 and target.conversion_factor_to_base>0
  ), changed as (
    update public.qb_receipt_lines l set base_price_used=c.price
    from candidates c where l.id=c.id and c.price>0 and c.price<10000000000
      and l.base_price_used is null
    returning l.id,c.base_sale_price,c.reference_id,c.reference_symbol,c.target_id,c.target_symbol,c.factor,c.price
  )
  insert into public.audit_logs(user_id,action,entity_type,entity_id,metadata)
  select auth.uid(),'resolve_qb_draft_sale_tariff','qb_receipt_line',id,
    jsonb_build_object('receipt_id',p_receipt_id,'catalog_rate',base_sale_price,
      'reference_unit_id',reference_id,'reference_unit',reference_symbol,
      'target_unit_id',target_id,'target_unit',target_symbol,'factor',factor,'price',price)
  from changed;
  get diagnostics changed_count = row_count;
  if changed_count>0 then perform public.recalculate_qb_receipt_totals(p_receipt_id); end if;
  return changed_count;
end;
$$;

revoke all on function public.resolve_qb_draft_sale_tariffs(uuid) from public, anon, authenticated;
grant execute on function public.resolve_qb_draft_sale_tariffs(uuid) to authenticated;
commit;
