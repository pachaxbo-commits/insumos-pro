-- Restore the exact pre-20261103180000 projection after the contract assertions.
begin;
create or replace view public.qb_operational_warehouse_purchases
with (security_barrier = true) as
select
  line.id, line.receipt_id, receipt.receipt_date, receipt.status,
  line.product_id, product.name as product_name, line.source_label,
  line.source_quantity, line.unit_cost, line.total_cost,
  line.reference_unit_id, line.reference_price, line.reference_price_origin,
  line.notes, line.requires_classification, line.actual_base_quantity_recorded,
  line.base_quantity, line.base_unit_id, line.base_unit_symbol, line.source_kind,
  line.allowed_unit_id, line.created_at, line.updated_at,
  profile.full_name as created_by_profile_name
from public.qb_merchandise_receipt_lines line
join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
join public.products product on product.id = line.product_id
left join public.profiles profile on profile.id = receipt.created_by
where line.is_warehouse_purchase and receipt.status <> 'anulado'
  and public.current_user_role() in ('admin','administrador','inventario','supervisor');
revoke all on public.qb_operational_warehouse_purchases from public, anon;
grant select on public.qb_operational_warehouse_purchases to authenticated;
commit;
do $$
declare result numeric;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
  select total_cost into result from public.qb_operational_warehouse_purchases;
  if result <> 1800 then raise exception 'Rollback projection was not restored'; end if;
end $$;
