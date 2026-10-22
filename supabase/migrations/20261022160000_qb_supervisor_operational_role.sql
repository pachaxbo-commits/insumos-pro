-- Fase 4B: habilita Supervisor en flujos operativos con proyecciones seguras.
-- No otorga SELECT directo sobre tablas financieras ni habilita edición de precios.
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'administrador', 'ventas', 'inventario', 'entregador', 'supervisor', 'finanzas'));

create or replace function public.admin_update_profile(
  p_profile_id uuid, p_full_name text, p_role text, p_is_active boolean
) returns void language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_role text;
  v_target_is_active boolean;
  v_other_active_admins integer;
begin
  if public.current_user_role() <> 'administrador' then
    raise exception 'Solo un administrador puede modificar perfiles.';
  end if;
  if p_profile_id is null or p_role not in ('administrador','ventas','inventario','entregador','supervisor','finanzas') then
    raise exception 'Perfil o rol inválido.';
  end if;
  select role, is_active into v_target_role, v_target_is_active
  from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'Perfil no encontrado.'; end if;
  if p_profile_id = v_actor_id and p_role <> v_target_role then raise exception 'No puedes cambiar tu propio rol.'; end if;
  if p_profile_id = v_actor_id and coalesce(p_is_active,false) = false then raise exception 'No puedes desactivar tu propio usuario.'; end if;
  if v_target_role = 'administrador' and v_target_is_active
     and (p_role <> 'administrador' or coalesce(p_is_active,false) = false) then
    select count(*) into v_other_active_admins from public.profiles
    where role = 'administrador' and is_active and id <> p_profile_id;
    if coalesce(v_other_active_admins,0) < 1 then raise exception 'No se puede dejar el sistema sin al menos un administrador activo.'; end if;
  end if;
  update public.profiles set full_name = nullif(trim(coalesce(p_full_name,'')),''),
    role = p_role, is_active = coalesce(p_is_active,false) where id = p_profile_id;
end $$;
revoke all on function public.admin_update_profile(uuid,text,text,boolean) from public, anon;
grant execute on function public.admin_update_profile(uuid,text,text,boolean) to authenticated;

-- Supplier/order screens receive only the customer fields needed for dispatch.
create or replace view public.qb_operational_customers with (security_barrier=true) as
select id, business_name, responsible_name, phone
from public.customer_accounts
where is_active and public.current_user_role() in ('admin','administrador','supervisor');
revoke all on public.qb_operational_customers from public, anon;
grant select on public.qb_operational_customers to authenticated;

create or replace view public.qb_operational_customer_locations with (security_barrier=true) as
select id, customer_account_id, label, address, is_primary, sort_order
from public.qb_customer_locations
where is_active and public.current_user_role() in ('admin','administrador','supervisor');
revoke all on public.qb_operational_customer_locations from public, anon;
grant select on public.qb_operational_customer_locations to authenticated;

-- Delivered line projection for Supervisor: quantities and authorized cost only.
-- Price, sale, receipt totals, factors and payment state are intentionally absent.
create or replace view public.qb_operational_delivered_lines with (security_barrier=true) as
select o.id as order_id, o.public_reference, o.operational_date, o.status as operational_status,
       o.customer_snapshot ->> 'business_name' as customer_name,
       d.product_id, p.name as product_name,
       d.delivered_quantity, d.delivered_base_quantity,
       d.base_unit_symbol as unit_symbol, d.delivered_at,
       prep.provision_cost_unit as cost_base_unit, d.id as delivery_item_id
from public.qb_order_delivery_items d
join public.qb_orders o on o.id = d.order_id
join public.qb_operational_products p on p.id = d.product_id
left join public.qb_order_preparation_items prep on prep.id = d.preparation_item_id
where d.delivered_at is not null and d.delivered_base_quantity > 0
  and public.current_user_role() in ('admin','administrador','supervisor');
revoke all on public.qb_operational_delivered_lines from public, anon;
grant select on public.qb_operational_delivered_lines to authenticated;

create or replace view public.qb_operational_warehouse_purchases with (security_barrier=true) as
select line.id,line.receipt_id,receipt.receipt_date,receipt.status, line.product_id,product.name product_name,
 line.source_label,line.source_quantity,line.unit_cost,line.total_cost,line.reference_unit_id,line.reference_price,
 line.reference_price_origin,line.notes,line.requires_classification,line.actual_base_quantity_recorded,
 line.base_quantity,line.base_unit_id,line.base_unit_symbol,line.source_kind,line.allowed_unit_id,
 line.created_at,line.updated_at,profile.full_name created_by_profile_name
from public.qb_merchandise_receipt_lines line
join public.qb_merchandise_receipts receipt on receipt.id=line.receipt_id
join public.products product on product.id=line.product_id
left join public.profiles profile on profile.id=receipt.created_by
where line.is_warehouse_purchase and receipt.status <> 'anulado'
  and public.current_user_role() in ('admin','administrador','inventario','supervisor');
revoke all on public.qb_operational_warehouse_purchases from public,anon;
grant select on public.qb_operational_warehouse_purchases to authenticated;

-- Fase 4A safe views now include Supervisor only where operationally required.
create or replace view public.qb_operational_products with (security_barrier=true) as
select p.id,p.name,p.description,p.category_id,p.unit_id,p.stock_current,p.stock_minimum,p.image_url,
 p.requires_classification,p.is_active,p.created_at,p.updated_at,p.is_sellable,p.catalog_description,
 p.catalog_sort_order,p.catalog_min_quantity,p.catalog_quantity_step,p.is_qb_loss_product,p.sku,p.stock_min,
 p.matrix_color,p.controls_actual_weight,
 (select c.name from public.product_categories c where c.id=p.category_id) category_name,
 (select c.description from public.product_categories c where c.id=p.category_id) category_description,
 (select c.catalog_slug from public.product_categories c where c.id=p.category_id) category_catalog_slug,
 (select c.catalog_sort_order from public.product_categories c where c.id=p.category_id) category_catalog_sort_order,
 (select c.is_active from public.product_categories c where c.id=p.category_id) category_is_active,
 (select u.name from public.units_of_measure u where u.id=p.unit_id) unit_name,
 (select u.abbreviation from public.units_of_measure u where u.id=p.unit_id) unit_abbreviation,
 (select u.is_active from public.units_of_measure u where u.id=p.unit_id) unit_is_active
from public.products p where public.current_user_role() in ('admin','administrador','inventario','entregador','supervisor');
revoke all on public.qb_operational_products from public,anon;
grant select on public.qb_operational_products to authenticated;

create or replace view public.qb_operational_product_unit_settings with (security_barrier=true) as
select s.product_id,s.base_unit_id,s.inventory_unit_id,s.notes,s.created_by,s.updated_by,s.created_at,s.updated_at,
 s.base_inventory_unit_id,s.is_visible_in_qb_catalog,s.is_classifiable,s.classification_mode,s.is_qb_active,s.supports_amount_bs
from public.qb_product_unit_settings s
where public.current_user_role() in ('admin','administrador','inventario','entregador','supervisor');
revoke all on public.qb_operational_product_unit_settings from public,anon;
grant select on public.qb_operational_product_unit_settings to authenticated;

create or replace view public.qb_operational_order_items with (security_barrier=true) as
select i.id,i.order_id,i.product_id,i.allowed_unit_id,i.source_kind,i.source_unit_id,i.product_presentation_id,
 i.source_label,i.requested_quantity,i.base_unit_id,i.base_unit_symbol,i.base_quantity,
 i.conversion_factor_to_base,i.conversion_snapshot_id,i.customer_notes,i.sort_order,i.created_at,i.updated_at,
 i.order_input_mode,i.estimated_requested_quantity,i.estimated_base_quantity,i.row_version
from public.qb_order_items i
where public.current_user_role() in ('admin','administrador','inventario','entregador','supervisor')
  or exists(select 1 from public.qb_orders o where o.id=i.order_id and o.customer_account_id=auth.uid());
revoke all on public.qb_operational_order_items from public,anon;
grant select on public.qb_operational_order_items to authenticated;

create or replace view public.qb_operational_preparation_items with (security_barrier=true) as
select p.id,p.preparation_id,p.order_item_id,p.product_id,p.requested_source_label,p.requested_quantity,
 p.requested_base_unit_id,p.requested_base_unit_symbol,p.requested_base_quantity,p.actual_allowed_unit_id,
 p.actual_source_kind,p.actual_source_unit_id,p.actual_product_presentation_id,p.actual_source_label,
 p.actual_quantity,p.actual_base_unit_id,p.actual_base_unit_symbol,p.actual_base_quantity,p.conversion_factor_to_base,
 p.conversion_snapshot_id,p.status,p.notes,p.created_at,p.updated_at,p.preparation_check,p.prepared_by_line,
 p.prepared_at_line,p.row_version,p.last_idempotency_key,p.actual_weight_kg,p.display_unit_id,
 (select f.full_name from public.profiles f where f.id=p.prepared_by_line) prepared_by_name
from public.qb_order_preparation_items p
where public.current_user_role() in ('admin','administrador','inventario','entregador','supervisor');
revoke all on public.qb_operational_preparation_items from public,anon;
grant select on public.qb_operational_preparation_items to authenticated;

create or replace view public.qb_operational_preparation_costs with (security_barrier=true) as
select p.order_item_id,p.provision_cost_unit from public.qb_order_preparation_items p
where public.current_user_role() in ('admin','administrador','inventario','supervisor');
revoke all on public.qb_operational_preparation_costs from public,anon;
grant select on public.qb_operational_preparation_costs to authenticated;

-- Grant only operational read policies. Financial tables and write policies stay as-is.
drop policy if exists "Internal QB roles can view customer accounts" on public.customer_accounts;
create policy "Internal QB roles can view customer accounts" on public.customer_accounts for select to authenticated
using (current_user_role() in ('admin','administrador','inventario'));
drop policy if exists "QB customers and internal roles can view locations" on public.qb_customer_locations;
create policy "QB customers and internal roles can view locations" on public.qb_customer_locations for select to authenticated
using (customer_account_id=auth.uid() or current_user_role() in ('admin','administrador','inventario'));

drop policy if exists qb_operational_day_orders_select on public.qb_operational_day_orders;
create policy qb_operational_day_orders_select on public.qb_operational_day_orders for select to authenticated
using (current_user_role() in ('admin','administrador','inventario','entregador','supervisor'));
drop policy if exists "QB customers and internal roles can view orders" on public.qb_orders;
create policy "QB customers and internal roles can view orders" on public.qb_orders for select to authenticated
using (customer_account_id=auth.uid() or current_user_role() in ('admin','administrador','inventario','entregador','supervisor'));
drop policy if exists "Internal roles can view QB order preparations" on public.qb_order_preparations;
create policy "Internal roles can view QB order preparations" on public.qb_order_preparations for select to authenticated
using (current_user_role() in ('admin','administrador','inventario','entregador','supervisor'));
drop policy if exists qb_order_delivery_items_select on public.qb_order_delivery_items;
create policy qb_order_delivery_items_select on public.qb_order_delivery_items for select to authenticated
using (current_user_role() in ('admin','administrador','inventario','entregador','supervisor'));
drop policy if exists "Internal roles can view QB order delivery movements" on public.qb_order_delivery_movements;
create policy "Internal roles can view QB order delivery movements" on public.qb_order_delivery_movements for select to authenticated
using (current_user_role() in ('admin','administrador','inventario','entregador','supervisor'));
drop policy if exists "Internal roles can view QB product allowed units" on public.qb_product_allowed_units;
create policy "Internal roles can view QB product allowed units" on public.qb_product_allowed_units for select to authenticated
using (current_user_role() in ('admin','administrador','inventario','supervisor'));
drop policy if exists "Internal roles can view QB product presentations" on public.qb_product_presentations;
create policy "Internal roles can view QB product presentations" on public.qb_product_presentations for select to authenticated
using (current_user_role() in ('admin','administrador','inventario','supervisor'));
drop policy if exists "Internal roles can view QB units" on public.qb_units;
create policy "Internal roles can view QB units" on public.qb_units for select to authenticated
using (current_user_role() in ('admin','administrador','inventario','supervisor'));

-- The Kardex page enriches a page of movements with reconciliation references.
-- These rows contain operational quantities and source IDs only (no financial totals).
drop policy if exists "Operational roles can view same-day reconciliation" on public.qb_same_day_reconciliation_requests;
create policy "Operational roles can view same-day reconciliation" on public.qb_same_day_reconciliation_requests for select to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','administrador','inventario','entregador','supervisor')));
drop policy if exists "Operational roles can view same-day reconciliation allocations" on public.qb_same_day_reconciliation_allocations;
create policy "Operational roles can view same-day reconciliation allocations" on public.qb_same_day_reconciliation_allocations for select to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role in ('admin','administrador','inventario','entregador','supervisor')));

-- Update a closed list of existing RPC guards while preserving their validated bodies.
-- Failure to find expected role text aborts this transaction instead of widening silently.
do $$
declare r record; v_definition text; v_updated text;
begin
 for r in select p.oid::regprocedure signature, p.proname, pg_get_functiondef(p.oid) definition
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname = any(array[
     'create_qb_internal_catalog_order','create_qb17_internal_catalog_order','create_qb17_internal_catalog_order_with_date',
     'admin_update_qb_internal_order','create_qb_warehouse_purchase_draft',
     'update_qb_warehouse_purchase_draft','confirm_qb_warehouse_purchase_draft',
     'annul_qb_warehouse_purchase_draft','set_warehouse_purchase_actual_quantity',
     'confirm_qb_merchandise_receipt','get_qb_inventory_kardex',
     'save_qb_matrix_preparation_item','finalize_qb_matrix_preparation',
     'start_qb_order_preparation','save_qb_order_preparation',
     'start_qb_order_preparation_versioned','save_qb_order_preparation_versioned',
     'ensure_qb_reception_unit_for_purchase'
   ])
 loop
   v_definition := r.definition;
   v_updated := replace(v_definition, 'v_user_role not in (''admin'', ''administrador'')', 'v_user_role not in (''admin'', ''administrador'', ''supervisor'')');
   v_updated := replace(v_updated, 'v_role not in (''admin'', ''administrador'')', 'v_role not in (''admin'', ''administrador'', ''supervisor'')');
   v_updated := replace(v_updated, 'v_role not in (''administrador'', ''inventario'')', 'v_role not in (''administrador'', ''inventario'', ''supervisor'')');
   v_updated := replace(v_updated, 'v_role not in (''admin'', ''administrador'', ''inventario'')', 'v_role not in (''admin'', ''administrador'', ''inventario'', ''supervisor'')');
   v_updated := replace(v_updated, 'v_role not in (''admin'',''administrador'',''inventario'')', 'v_role not in (''admin'',''administrador'',''inventario'',''supervisor'')');
   v_updated := replace(v_updated, 'v_user_role not in (''admin'', ''administrador'', ''inventario'')', 'v_user_role not in (''admin'', ''administrador'', ''inventario'', ''supervisor'')');
   v_updated := replace(v_updated, 'v_user_role not in (''admin'',''administrador'',''inventario'')', 'v_user_role not in (''admin'',''administrador'',''inventario'',''supervisor'')');
   if r.proname = 'create_qb17_internal_catalog_order'
      and position('QB17_SUPERVISOR_QUANTITY_ONLY' in v_definition) = 0 then
     v_updated := replace(v_updated,
       'profile.role in (''admin'', ''administrador'')',
       'profile.role in (''admin'', ''administrador'', ''supervisor'')');
     v_updated := replace(v_updated,
       'v_prepared := private.prepare_qb17_order_items(p_items);',
       $order_guard$if public.current_user_role() = 'supervisor' and exists (
         select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) item
         where coalesce(item ->> 'input_mode', 'quantity') <> 'quantity'
       ) then raise exception 'QB17_SUPERVISOR_QUANTITY_ONLY'; end if;
  v_prepared := private.prepare_qb17_order_items(p_items);$order_guard$);
   end if;
   if r.proname = 'admin_update_qb_internal_order'
      and position('Supervisor solo puede editar pedidos por cantidad.' in v_definition) = 0 then
     v_updated := replace(v_updated,
       'if v_order.updated_at is distinct from p_expected_updated_at then',
       $edit_guard$if v_role = 'supervisor' and exists (
    select 1 from public.qb_order_items i
    where i.order_id = v_order.id and i.order_input_mode = 'amount_bs'
  ) then
    raise exception 'Supervisor solo puede editar pedidos por cantidad.';
  end if;
  if v_order.updated_at is distinct from p_expected_updated_at then$edit_guard$);
   end if;
   if r.proname = 'get_qb_inventory_kardex' then
     -- The RPC reads ledger tables whose direct SELECT remains restricted.
     -- Its body validates auth.uid() and the business role before any read.
   end if;
   if r.proname = 'confirm_qb_merchandise_receipt'
      and position('Supervisor solo puede confirmar ingresos de compras para almacén.' in v_definition) = 0 then
     v_updated := replace(v_updated, 'if v_receipt.id is null then',
       $guard$if v_user_role = 'supervisor' and (
         not exists(select 1 from public.qb_merchandise_receipt_lines l where l.receipt_id=p_receipt_id and l.is_warehouse_purchase)
         or exists(select 1 from public.qb_merchandise_receipt_lines l where l.receipt_id=p_receipt_id and not l.is_warehouse_purchase)
       ) then raise exception 'Supervisor solo puede confirmar ingresos de compras para almacén.'; end if;
       if v_receipt.id is null then$guard$);
   end if;
   if v_updated = v_definition and position('supervisor' in v_definition) = 0
      and r.proname <> 'create_qb17_internal_catalog_order_with_date' then
     raise exception 'Expected role guard not found in %', r.signature;
   end if;
   execute v_updated;
   if r.proname = 'get_qb_inventory_kardex' then
     execute format('alter function %s security definer', r.signature);
   end if;
 end loop;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=any(array[
     'create_qb_internal_catalog_order','create_qb17_internal_catalog_order','create_qb17_internal_catalog_order_with_date',
       'admin_update_qb_internal_order','create_qb_warehouse_purchase_draft',
       'update_qb_warehouse_purchase_draft','confirm_qb_warehouse_purchase_draft',
       'annul_qb_warehouse_purchase_draft','set_warehouse_purchase_actual_quantity',
       'confirm_qb_merchandise_receipt','get_qb_inventory_kardex',
       'save_qb_matrix_preparation_item','finalize_qb_matrix_preparation',
       'start_qb_order_preparation','save_qb_order_preparation',
       'start_qb_order_preparation_versioned','save_qb_order_preparation_versioned',
       'ensure_qb_reception_unit_for_purchase'
     ])) <> 18 then raise exception 'A required Supervisor RPC was not found'; end if;
end $$;

commit;
