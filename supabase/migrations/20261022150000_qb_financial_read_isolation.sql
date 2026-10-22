-- Separate financial projections from operational PostgREST reads.
-- Administrators retain full access through profile-aware RLS. Operational
-- roles use explicit safe views; no business role is inferred from JWT claims.

begin;

-- Product prices are administrator-only. Operational screens use the safe view
-- below, so SELECT * or an explicit price-column request returns no product rows
-- to inventory/delivery users.
drop policy if exists "Internal roles can view products" on public.products;
drop policy if exists "Administrators can view products" on public.products;
create policy "Administrators can view products"
  on public.products for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));

create or replace view public.qb_operational_products
with (security_barrier = true) as
select
  p.id, p.name, p.description, p.category_id, p.unit_id,
  p.stock_current, p.stock_minimum, p.image_url,
  p.requires_classification, p.is_active, p.created_at, p.updated_at,
  p.is_sellable, p.catalog_description, p.catalog_sort_order,
  p.catalog_min_quantity, p.catalog_quantity_step, p.is_qb_loss_product,
  p.sku, p.stock_min, p.matrix_color, p.controls_actual_weight,
  (select c.name from public.product_categories c where c.id = p.category_id) as category_name,
  (select c.description from public.product_categories c where c.id = p.category_id) as category_description,
  (select c.catalog_slug from public.product_categories c where c.id = p.category_id) as category_catalog_slug,
  (select c.catalog_sort_order from public.product_categories c where c.id = p.category_id) as category_catalog_sort_order,
  (select c.is_active from public.product_categories c where c.id = p.category_id) as category_is_active,
  (select u.name from public.units_of_measure u where u.id = p.unit_id) as unit_name,
  (select u.abbreviation from public.units_of_measure u where u.id = p.unit_id) as unit_abbreviation,
  (select u.is_active from public.units_of_measure u where u.id = p.unit_id) as unit_is_active
from public.products p
where public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador');
revoke all on public.qb_operational_products from public, anon;
grant select on public.qb_operational_products to authenticated;

-- Product pricing settings are also administrator-only. The operational view
-- intentionally excludes base_sale_price and pricing-unit metadata.
drop policy if exists "Internal roles can view QB product unit settings"
  on public.qb_product_unit_settings;
drop policy if exists "Administrators can view QB product unit settings"
  on public.qb_product_unit_settings;
create policy "Administrators can view QB product unit settings"
  on public.qb_product_unit_settings for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));

create or replace view public.qb_operational_product_unit_settings
with (security_barrier = true) as
select
  s.product_id, s.base_unit_id, s.inventory_unit_id, s.notes,
  s.created_by, s.updated_by, s.created_at, s.updated_at,
  s.base_inventory_unit_id, s.is_visible_in_qb_catalog,
  s.is_classifiable, s.classification_mode, s.is_qb_active,
  s.supports_amount_bs
from public.qb_product_unit_settings s
where public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador');
revoke all on public.qb_operational_product_unit_settings from public, anon;
grant select on public.qb_operational_product_unit_settings to authenticated;

-- Order lines expose a requested amount in Bs. Keep full rows for administrators
-- and customer-owned orders only; internal roles read a safe projection.
drop policy if exists "QB customers and internal roles can view order items"
  on public.qb_order_items;
drop policy if exists "Administrators and customers can view full QB order items"
  on public.qb_order_items;
create policy "Administrators and customers can view full QB order items"
  on public.qb_order_items for select to authenticated
  using (
    public.current_user_role() in ('admin', 'administrador')
    or exists (
      select 1 from public.qb_orders o
      where o.id = qb_order_items.order_id
        and o.customer_account_id = auth.uid()
    )
  );

create or replace view public.qb_operational_order_items
with (security_barrier = true) as
select
  i.id, i.order_id, i.product_id, i.allowed_unit_id, i.source_kind,
  i.source_unit_id, i.product_presentation_id, i.source_label,
  i.requested_quantity, i.base_unit_id, i.base_unit_symbol,
  i.base_quantity, i.conversion_factor_to_base,
  i.conversion_snapshot_id, i.customer_notes, i.sort_order,
  i.created_at, i.updated_at, i.order_input_mode,
  i.estimated_requested_quantity, i.estimated_base_quantity, i.row_version
from public.qb_order_items i
where public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador')
   or exists (
     select 1 from public.qb_orders o
     where o.id = i.order_id and o.customer_account_id = auth.uid()
   );
revoke all on public.qb_operational_order_items from public, anon;
grant select on public.qb_operational_order_items to authenticated;

-- Delivery staff need preparation quantities and checks, not the provision-cost
-- field. Inventory and administrators retain their existing cost access.
drop policy if exists "Internal roles can view QB order preparation items"
  on public.qb_order_preparation_items;
drop policy if exists "Inventory and administrators can view QB preparation items"
  on public.qb_order_preparation_items;
create policy "Inventory and administrators can view QB preparation items"
  on public.qb_order_preparation_items for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

create or replace view public.qb_operational_preparation_items
with (security_barrier = true) as
select
  p.id, p.preparation_id, p.order_item_id, p.product_id,
  p.requested_source_label, p.requested_quantity,
  p.requested_base_unit_id, p.requested_base_unit_symbol,
  p.requested_base_quantity, p.actual_allowed_unit_id,
  p.actual_source_kind, p.actual_source_unit_id,
  p.actual_product_presentation_id, p.actual_source_label,
  p.actual_quantity, p.actual_base_unit_id, p.actual_base_unit_symbol,
  p.actual_base_quantity, p.conversion_factor_to_base,
  p.conversion_snapshot_id, p.status, p.notes, p.created_at, p.updated_at,
  p.preparation_check, p.prepared_by_line, p.prepared_at_line,
  p.row_version, p.last_idempotency_key, p.actual_weight_kg,
  p.display_unit_id,
  (select profile.full_name from public.profiles profile where profile.id = p.prepared_by_line) as prepared_by_name
from public.qb_order_preparation_items p
where public.current_user_role() in ('admin', 'administrador', 'inventario', 'entregador');
revoke all on public.qb_operational_preparation_items from public, anon;
grant select on public.qb_operational_preparation_items to authenticated;

create or replace view public.qb_operational_preparation_costs
with (security_barrier = true) as
select p.order_item_id, p.provision_cost_unit
from public.qb_order_preparation_items p
where public.current_user_role() in ('admin', 'administrador', 'inventario');
revoke all on public.qb_operational_preparation_costs from public, anon;
grant select on public.qb_operational_preparation_costs to authenticated;

-- Receipts carry customer-facing prices, payment state, costs, profit and
-- business-wide totals. Their complete rows are restricted to administrators.
drop policy if exists "Internal roles can view QB receipts" on public.qb_receipts;
drop policy if exists "Administrators can view QB receipts" on public.qb_receipts;
create policy "Administrators can view QB receipts"
  on public.qb_receipts for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));
drop policy if exists "Internal roles can view QB receipt lines" on public.qb_receipt_lines;
drop policy if exists "Administrators can view QB receipt lines" on public.qb_receipt_lines;
create policy "Administrators can view QB receipt lines"
  on public.qb_receipt_lines for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));
drop policy if exists "Internal roles can view QB receipt orders" on public.qb_receipt_orders;
drop policy if exists "Administrators can view QB receipt orders" on public.qb_receipt_orders;
create policy "Administrators can view QB receipt orders"
  on public.qb_receipt_orders for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));
drop policy if exists "Internal roles can view QB receipt events" on public.qb_receipt_events;
drop policy if exists "Administrators can view QB receipt events" on public.qb_receipt_events;
create policy "Administrators can view QB receipt events"
  on public.qb_receipt_events for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));

-- FIFO tables contain internal unit and total costs. Kardex already exposes the
-- non-financial lot/date/quantity detail through its guarded RPC.
drop policy if exists "Inventory roles can view FIFO lots" on public.inventory_lots;
drop policy if exists "Administrators can view FIFO lots" on public.inventory_lots;
create policy "Administrators can view FIFO lots"
  on public.inventory_lots for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));
drop policy if exists "Inventory roles can view FIFO consumptions" on public.inventory_lot_consumptions;
drop policy if exists "Administrators can view FIFO consumptions" on public.inventory_lot_consumptions;
create policy "Administrators can view FIFO consumptions"
  on public.inventory_lot_consumptions for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));
drop policy if exists "Inventory roles can view FIFO writeoffs" on public.inventory_lot_writeoffs;
drop policy if exists "Administrators can view FIFO writeoffs" on public.inventory_lot_writeoffs;
create policy "Administrators can view FIFO writeoffs"
  on public.inventory_lot_writeoffs for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));

-- Operating-expense amounts are accounting data, not an inventory movement.
-- Keep them private to administrators; operational stock and Kardex reads do
-- not depend on this table.
drop policy if exists "Authorized roles can view warehouse operating expenses"
  on public.qb_warehouse_operating_expenses;
drop policy if exists "Administrators can view warehouse operating expenses"
  on public.qb_warehouse_operating_expenses;
create policy "Administrators can view warehouse operating expenses"
  on public.qb_warehouse_operating_expenses for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador'));

commit;
