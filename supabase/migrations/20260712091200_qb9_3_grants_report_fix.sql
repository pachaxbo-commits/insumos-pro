-- QB-9.3: privilegios SQL minimos para objetos QB protegidos por RLS.
-- No concede mutacion directa sobre pedidos, preparacion, entrega ni recibos.

begin;

-- Los objetos creados por postgres heredaron TRUNCATE/TRIGGER/REFERENCES, pero no
-- los privilegios operativos que necesitan PostgREST y las Server Actions.
revoke all on table
  public.qb_unit_dimensions,
  public.qb_units,
  public.qb_product_unit_settings,
  public.qb_product_presentations,
  public.qb_product_allowed_units,
  public.qb_product_classification_outputs,
  public.qb_conversion_snapshots,
  public.qb_merchandise_receipts,
  public.qb_merchandise_receipt_lines,
  public.qb_merchandise_receipt_classification_results,
  public.qb_merchandise_receipt_movements,
  public.qb_customer_locations,
  public.qb_orders,
  public.qb_order_items,
  public.qb_order_preparations,
  public.qb_order_preparation_items,
  public.qb_order_delivery_movements,
  public.qb_receipts,
  public.qb_receipt_orders,
  public.qb_receipt_lines,
  public.qb_receipt_events
from anon, authenticated;

-- Los modulos legacy permanecen suspendidos para todos los flujos QB.
revoke all on table
  public.purchases,
  public.purchase_items,
  public.sales,
  public.sale_items,
  public.accounts_receivable,
  public.accounts_payable,
  public.payments,
  public.cash_movements
from anon, authenticated;

-- Parametrizacion: las politicas RLS limitan estas operaciones a roles internos.
grant select, insert, update on table
  public.qb_unit_dimensions,
  public.qb_units,
  public.qb_product_unit_settings,
  public.qb_product_presentations,
  public.qb_product_allowed_units,
  public.qb_product_classification_outputs
to authenticated;

grant select, insert on table public.qb_conversion_snapshots to authenticated;

-- QB-4 usa Server Actions directas para borradores y una RPC para confirmar.
grant select, insert, update on table
  public.qb_merchandise_receipts,
  public.qb_merchandise_receipt_lines
to authenticated;

grant select, insert, update, delete on table
  public.qb_merchandise_receipt_classification_results
to authenticated;

grant select on table public.qb_merchandise_receipt_movements to authenticated;

-- QB-5 permite ubicaciones propias directas; pedidos e items se crean solo por RPC.
grant select, insert, update on table public.qb_customer_locations to authenticated;
grant select on table public.qb_orders, public.qb_order_items to authenticated;

-- QB-6 y QB-7 exponen lectura filtrada por RLS; toda mutacion critica sigue por RPC.
grant select on table
  public.qb_order_preparations,
  public.qb_order_preparation_items,
  public.qb_order_delivery_movements,
  public.qb_receipts,
  public.qb_receipt_orders,
  public.qb_receipt_lines,
  public.qb_receipt_events
to authenticated;

-- La parametrizacion contiene precio base y snapshots internos. El catalogo externo
-- usa get_qb_public_catalog(), no lectura directa de estas tablas.
drop policy if exists "Authenticated users can view QB unit dimensions" on public.qb_unit_dimensions;
create policy "Internal roles can view QB unit dimensions"
  on public.qb_unit_dimensions for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB units" on public.qb_units;
create policy "Internal roles can view QB units"
  on public.qb_units for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB product unit settings" on public.qb_product_unit_settings;
create policy "Internal roles can view QB product unit settings"
  on public.qb_product_unit_settings for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB product presentations" on public.qb_product_presentations;
create policy "Internal roles can view QB product presentations"
  on public.qb_product_presentations for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB product allowed units" on public.qb_product_allowed_units;
create policy "Internal roles can view QB product allowed units"
  on public.qb_product_allowed_units for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB classification outputs" on public.qb_product_classification_outputs;
create policy "Internal roles can view QB classification outputs"
  on public.qb_product_classification_outputs for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Authenticated users can view QB conversion snapshots" on public.qb_conversion_snapshots;
create policy "Internal roles can view QB conversion snapshots"
  on public.qb_conversion_snapshots for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

-- Reportes QB necesitan resolver clientes. Se conserva la politica de cuenta propia.
drop policy if exists "Internal QB roles can view customer accounts" on public.customer_accounts;
create policy "Internal QB roles can view customer accounts"
  on public.customer_accounts for select
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

-- Contratos de ejecucion: catalogo publico; el resto solo para autenticados.
revoke all on function public.get_qb_public_catalog() from public, anon, authenticated;
grant execute on function public.get_qb_public_catalog() to anon, authenticated;

revoke all on function public.update_qb_customer_profile(text, text) from public, anon, authenticated;
grant execute on function public.update_qb_customer_profile(text, text) to authenticated;

revoke all on function public.create_qb_catalog_order(uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_qb_catalog_order(uuid, text, jsonb, text) to authenticated;

revoke all on function public.confirm_qb_merchandise_receipt(uuid) from public, anon, authenticated;
grant execute on function public.confirm_qb_merchandise_receipt(uuid) to authenticated;

revoke all on function public.start_qb_order_preparation(uuid) from public, anon, authenticated;
grant execute on function public.start_qb_order_preparation(uuid) to authenticated;

revoke all on function public.save_qb_order_preparation(uuid, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.save_qb_order_preparation(uuid, jsonb, text, boolean) to authenticated;

revoke all on function public.confirm_qb_order_delivery(uuid) from public, anon, authenticated;
grant execute on function public.confirm_qb_order_delivery(uuid) to authenticated;

revoke all on function public.cancel_qb_order_before_delivery(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_qb_order_before_delivery(uuid, text) to authenticated;

revoke all on function public.create_qb_receipt_draft(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.create_qb_receipt_draft(uuid, uuid[]) to authenticated;

revoke all on function public.update_qb_receipt_draft(uuid, numeric, numeric, numeric, numeric, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_qb_receipt_draft(uuid, numeric, numeric, numeric, numeric, text, text, jsonb) to authenticated;

revoke all on function public.emit_qb_receipt(uuid) from public, anon, authenticated;
grant execute on function public.emit_qb_receipt(uuid) to authenticated;

revoke all on function public.void_qb_receipt(uuid, text) from public, anon, authenticated;
grant execute on function public.void_qb_receipt(uuid, text) to authenticated;

revoke all on function public.qb_compound_unit_price(numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.qb_compound_unit_price(numeric, numeric, numeric, numeric, numeric) to authenticated;

commit;
