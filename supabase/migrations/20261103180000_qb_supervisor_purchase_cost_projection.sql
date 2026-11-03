begin;

-- Warehouse purchase rows are operational to Inventory and Supervisor, but
-- aggregate purchase totals remain administrator-only. The unit cost is an
-- explicit operational allowance for Supervisor; Inventory receives neither
-- cost field. Keep the view's existing column shape for deployed clients.
create or replace view public.qb_operational_warehouse_purchases
with (security_barrier = true) as
select
  line.id,
  line.receipt_id,
  receipt.receipt_date,
  receipt.status,
  line.product_id,
  product.name as product_name,
  line.source_label,
  line.source_quantity,
  (case
    when public.current_user_role() in ('admin', 'administrador', 'supervisor')
      then line.unit_cost
    else null::numeric(18, 4)
  end)::numeric(18, 4) as unit_cost,
  (case
    when public.current_user_role() in ('admin', 'administrador')
      then line.total_cost
    else null::numeric(18, 4)
  end)::numeric(18, 4) as total_cost,
  line.reference_unit_id,
  (case
    when public.current_user_role() in ('admin', 'administrador', 'supervisor')
      then line.reference_price
    else null::numeric(20, 8)
  end)::numeric(20, 8) as reference_price,
  line.reference_price_origin,
  line.notes,
  line.requires_classification,
  line.actual_base_quantity_recorded,
  line.base_quantity,
  line.base_unit_id,
  line.base_unit_symbol,
  line.source_kind,
  line.allowed_unit_id,
  line.created_at,
  line.updated_at,
  profile.full_name as created_by_profile_name
from public.qb_merchandise_receipt_lines line
join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
join public.products product on product.id = line.product_id
left join public.profiles profile on profile.id = receipt.created_by
where line.is_warehouse_purchase
  and receipt.status <> 'anulado'
  and public.current_user_role() in ('admin', 'administrador', 'inventario', 'supervisor');

revoke all on public.qb_operational_warehouse_purchases from public, anon;
grant select on public.qb_operational_warehouse_purchases to authenticated;

commit;
