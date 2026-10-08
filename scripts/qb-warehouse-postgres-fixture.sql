-- Run only against an isolated local Supabase database. Always rolls back.
begin;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'warehouse-admin@example.invalid'),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'warehouse-viewer@example.invalid'),
  ('00000000-0000-4000-8000-00000000c101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'restaurant@example.invalid');
insert into public.profiles (id, role, is_active)
values
  ('00000000-0000-4000-8000-00000000a001', 'administrador', true),
  ('00000000-0000-4000-8000-00000000a002', 'ventas', true);

insert into public.qb_unit_dimensions (id, code, name, base_unit_code)
values ('00000000-0000-4000-8000-00000000d001', 'qa_weight', 'QA peso', 'qa_kg');
insert into public.qb_units (id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base)
values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000d001', 'qa_kg', 'KG', 'KG', 1, true),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000d001', 'qa_arroba', 'ARROBA', '@', 10, false);
insert into public.products (id, name, stock_current, stock_minimum, purchase_price, sale_price)
values ('00000000-0000-4000-8000-00000000c001', 'QA papa', 0, 0, 0, 0);
insert into public.qb_product_unit_settings
  (product_id, base_unit_id, base_inventory_unit_id, base_price_unit_id, is_qb_active)
values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000b001',
   '00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b002', true);
insert into public.qb_product_allowed_units (id, product_id, usage_context, unit_id, is_default)
values ('00000000-0000-4000-8000-00000000b101', '00000000-0000-4000-8000-00000000c001',
  'recepcion', '00000000-0000-4000-8000-00000000b001', true);

insert into public.qb_merchandise_receipts (id, receipt_date, status, created_by)
values ('00000000-0000-4000-8000-00000000e001', current_date, 'borrador',
  '00000000-0000-4000-8000-00000000a001');
insert into public.qb_merchandise_receipt_lines
  (id, receipt_id, product_id, allowed_unit_id, source_kind, source_unit_id, source_label,
   source_quantity, base_unit_id, base_unit_symbol, base_quantity, conversion_factor_to_base,
   unit_cost, total_cost, requires_classification, reference_unit_id, reference_price,
   reference_price_origin, is_warehouse_purchase, created_by)
values
  ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000e001',
   '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000b101',
   'universal_unit', '00000000-0000-4000-8000-00000000b001', 'KG', 10,
   '00000000-0000-4000-8000-00000000b001', 'KG', 10, 1, 5.5, 55, false,
   '00000000-0000-4000-8000-00000000b002', 55, 'manual', true,
   '00000000-0000-4000-8000-00000000a001');
insert into public.qb_conversion_snapshots
  (id, source_table, source_id, product_id, dimension_code, source_kind, source_unit_id,
   source_label, source_quantity, base_unit_id, base_unit_symbol, base_quantity,
   conversion_factor_to_base, snapshot)
values
  ('00000000-0000-4000-8000-00000000a101', 'qb_merchandise_receipt_lines',
   '00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000c001',
   'qa_weight', 'universal_unit', '00000000-0000-4000-8000-00000000b001',
   'KG', 10, '00000000-0000-4000-8000-00000000b001', 'KG', 10, 1, '{}');
update public.qb_merchandise_receipt_lines
set conversion_snapshot_id = '00000000-0000-4000-8000-00000000a101'
where id = '00000000-0000-4000-8000-00000000f001';

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a002', true);
do $$ begin
  perform public.set_warehouse_purchase_actual_quantity(
    '00000000-0000-4000-8000-00000000f001', 10);
  raise exception 'Viewer was allowed to measure purchase';
exception when others then
  if sqlerrm = 'Viewer was allowed to measure purchase' then raise; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a001', true);
select public.set_warehouse_purchase_actual_quantity('00000000-0000-4000-8000-00000000f001', 10);
select public.confirm_qb_merchandise_receipt('00000000-0000-4000-8000-00000000e001');
do $$ begin
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c001') <> 10 then
    raise exception 'Stock after purchase is not 10';
  end if;
  if (select count(*) from public.qb_merchandise_receipt_movements where receipt_id = '00000000-0000-4000-8000-00000000e001') <> 1 then
    raise exception 'Purchase did not create exactly one movement';
  end if;
end $$;
do $$ begin
  perform public.confirm_qb_merchandise_receipt('00000000-0000-4000-8000-00000000e001');
  raise exception 'Repeated purchase confirmation succeeded';
exception when others then
  if sqlerrm = 'Repeated purchase confirmation succeeded' then raise; end if;
end $$;
do $$ begin
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c001') <> 10 then
    raise exception 'Repeat confirmation changed stock';
  end if;
end $$;
update public.products set controls_actual_weight = true
where id = '00000000-0000-4000-8000-00000000c001';

insert into public.customer_accounts (id, email, full_name, business_name, responsible_name)
values ('00000000-0000-4000-8000-00000000c101', 'restaurant@example.invalid',
  'Restaurante QA', 'Restaurante QA', 'Responsable QA');
insert into public.qb_customer_locations (id, customer_account_id, address)
values ('00000000-0000-4000-8000-00000000c102',
  '00000000-0000-4000-8000-00000000c101', 'Dirección ficticia');
insert into public.qb_orders (id, public_reference, customer_account_id, customer_location_id,
  status, idempotency_key)
values ('00000000-0000-4000-8000-00000000e101', 'QB-QA-001',
  '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102',
  'preparado', '00000000-0000-4000-8000-00000000e101');
insert into public.qb_order_items
  (id, order_id, product_id, allowed_unit_id, source_kind, source_unit_id, source_label,
   requested_quantity, base_unit_id, base_unit_symbol, base_quantity, conversion_factor_to_base)
select '00000000-0000-4000-8000-00000000f101'::uuid,
  '00000000-0000-4000-8000-00000000e101'::uuid,
  '00000000-0000-4000-8000-00000000c001'::uuid, allowed.id,
  'universal_unit', '00000000-0000-4000-8000-00000000b001'::uuid, 'KG', 10,
  '00000000-0000-4000-8000-00000000b001'::uuid, 'KG', 10, 1
from public.qb_product_allowed_units allowed
where allowed.product_id = '00000000-0000-4000-8000-00000000c001'
  and allowed.usage_context = 'pedido' and allowed.is_default = true;
insert into public.qb_order_preparations (id, order_id, status)
values ('00000000-0000-4000-8000-00000000e102',
  '00000000-0000-4000-8000-00000000e101', 'preparado');
insert into public.qb_order_preparation_items
  (id, preparation_id, order_item_id, product_id, requested_source_label,
   requested_quantity, requested_base_unit_id, requested_base_unit_symbol,
   requested_base_quantity, actual_quantity, actual_base_quantity, status,
   actual_allowed_unit_id, actual_source_kind, actual_source_unit_id,
   actual_source_label, actual_base_unit_id, actual_base_unit_symbol,
   conversion_factor_to_base, preparation_check, prepared_at_line)
select '00000000-0000-4000-8000-00000000f102'::uuid,
  '00000000-0000-4000-8000-00000000e102', '00000000-0000-4000-8000-00000000f101',
  '00000000-0000-4000-8000-00000000c001', 'KG', 10,
  '00000000-0000-4000-8000-00000000b001', 'KG', 10, 10, 10, 'completo',
  allowed.id, 'universal_unit', '00000000-0000-4000-8000-00000000b001',
  'KG', '00000000-0000-4000-8000-00000000b001', 'KG', 1, true, now()
from public.qb_product_allowed_units allowed
where allowed.product_id = '00000000-0000-4000-8000-00000000c001'
  and allowed.usage_context = 'pedido' and allowed.is_default = true;
select public.save_qb_matrix_delivery_item_with_weight_v2(
  '00000000-0000-4000-8000-00000000f101', 0, 0, 10, true, null, null,
  'qa-delivery-line-001');
select public.confirm_qb_matrix_delivery(
  '00000000-0000-4000-8000-00000000e101',
  (select updated_at from public.qb_orders where id = '00000000-0000-4000-8000-00000000e101'),
  'qa-delivery-confirm-001');
do $$ begin
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c001') <> 0 then
    raise exception 'Delivery did not deduct exactly prepared warehouse quantity';
  end if;
  if (select status from public.qb_orders where id = '00000000-0000-4000-8000-00000000e101') <>
    'entregado_pendiente_recibo' then
    raise exception 'Delivered order did not become receipt-eligible';
  end if;
  if (select actual_weight_kg from public.qb_order_delivery_items
      where order_item_id = '00000000-0000-4000-8000-00000000f101') is not null then
    raise exception 'Optional weight was invented';
  end if;
end $$;
-- Zero-stock order: ten delivered externally, no warehouse movement.
insert into public.qb_orders (id, public_reference, customer_account_id, customer_location_id,
  status, idempotency_key)
values ('00000000-0000-4000-8000-00000000e201', 'QB-QA-002',
  '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102',
  'preparado', '00000000-0000-4000-8000-00000000e201');
insert into public.qb_order_items
  (id, order_id, product_id, allowed_unit_id, source_kind, source_unit_id, source_label,
   requested_quantity, base_unit_id, base_unit_symbol, base_quantity, conversion_factor_to_base)
select '00000000-0000-4000-8000-00000000f201'::uuid,
  '00000000-0000-4000-8000-00000000e201'::uuid,
  '00000000-0000-4000-8000-00000000c001'::uuid, allowed.id,
  'universal_unit', '00000000-0000-4000-8000-00000000b001'::uuid, 'KG', 10,
  '00000000-0000-4000-8000-00000000b001'::uuid, 'KG', 10, 1
from public.qb_product_allowed_units allowed
where allowed.product_id = '00000000-0000-4000-8000-00000000c001'
  and allowed.usage_context = 'pedido' and allowed.is_default = true;
insert into public.qb_order_preparations (id, order_id, status)
values ('00000000-0000-4000-8000-00000000e202',
  '00000000-0000-4000-8000-00000000e201', 'preparado');
insert into public.qb_order_preparation_items
  (id, preparation_id, order_item_id, product_id, requested_source_label,
   requested_quantity, requested_base_unit_id, requested_base_unit_symbol,
   requested_base_quantity, actual_quantity, actual_base_quantity, status,
   preparation_check, prepared_at_line)
values ('00000000-0000-4000-8000-00000000f202',
  '00000000-0000-4000-8000-00000000e202', '00000000-0000-4000-8000-00000000f201',
  '00000000-0000-4000-8000-00000000c001', 'KG', 10,
  '00000000-0000-4000-8000-00000000b001', 'KG', 10, 0, 0,
  'no_disponible', false, now());
select public.save_qb_matrix_delivery_item_with_weight_v2(
  '00000000-0000-4000-8000-00000000f201', 0, 10, 10, true, null,
  'Compra externa directa', 'qa-delivery-zero-001');
select public.confirm_qb_matrix_delivery(
  '00000000-0000-4000-8000-00000000e201',
  (select updated_at from public.qb_orders where id = '00000000-0000-4000-8000-00000000e201'),
  'qa-delivery-zero-confirm-001');
do $$ begin
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c001') <> 0 then
    raise exception 'External delivery changed zero stock';
  end if;
  if (select count(*) from public.qb_order_delivery_movements
      where order_id = '00000000-0000-4000-8000-00000000e201'
        and inventory_movement_id is not null) <> 0 then
    raise exception 'External delivery created fictitious stock movement';
  end if;
  if (select status from public.qb_orders where id = '00000000-0000-4000-8000-00000000e201') <>
    'entregado_pendiente_recibo' then
    raise exception 'Zero-stock order did not become receipt-eligible';
  end if;
end $$;
-- Partial stock: four prepared from warehouse, six sourced externally.
insert into public.inventory_movements
  (product_id, movement_type, quantity, stock_before, stock_after, reason)
values ('00000000-0000-4000-8000-00000000c001', 'entrada', 3, 0, 3, 'QA opening balance');
update public.products set stock_current = 3
where id = '00000000-0000-4000-8000-00000000c001';
insert into public.qb_orders (id, public_reference, customer_account_id, customer_location_id,
  status, idempotency_key)
values ('00000000-0000-4000-8000-00000000e301', 'QB-QA-003',
  '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102',
  'preparado', '00000000-0000-4000-8000-00000000e301');
insert into public.qb_order_items
  (id, order_id, product_id, allowed_unit_id, source_kind, source_unit_id, source_label,
   requested_quantity, base_unit_id, base_unit_symbol, base_quantity, conversion_factor_to_base)
select '00000000-0000-4000-8000-00000000f301'::uuid,
  '00000000-0000-4000-8000-00000000e301'::uuid,
  '00000000-0000-4000-8000-00000000c001'::uuid, allowed.id,
  'universal_unit', '00000000-0000-4000-8000-00000000b001'::uuid, 'KG', 10,
  '00000000-0000-4000-8000-00000000b001'::uuid, 'KG', 10, 1
from public.qb_product_allowed_units allowed
where allowed.product_id = '00000000-0000-4000-8000-00000000c001'
  and allowed.usage_context = 'pedido' and allowed.is_default = true;
insert into public.qb_order_preparations (id, order_id, status)
values ('00000000-0000-4000-8000-00000000e302',
  '00000000-0000-4000-8000-00000000e301', 'preparado');
insert into public.qb_order_preparation_items
  (id, preparation_id, order_item_id, product_id, requested_source_label,
   requested_quantity, requested_base_unit_id, requested_base_unit_symbol,
   requested_base_quantity, actual_quantity, actual_base_quantity, status,
   actual_allowed_unit_id, actual_source_kind, actual_source_unit_id,
   actual_source_label, actual_base_unit_id, actual_base_unit_symbol,
   conversion_factor_to_base, preparation_check, prepared_at_line)
select '00000000-0000-4000-8000-00000000f302'::uuid,
  '00000000-0000-4000-8000-00000000e302', '00000000-0000-4000-8000-00000000f301',
  '00000000-0000-4000-8000-00000000c001', 'KG', 10,
  '00000000-0000-4000-8000-00000000b001', 'KG', 10, 4, 4, 'parcial',
  allowed.id, 'universal_unit', '00000000-0000-4000-8000-00000000b001',
  'KG', '00000000-0000-4000-8000-00000000b001', 'KG', 1, true, now()
from public.qb_product_allowed_units allowed
where allowed.product_id = '00000000-0000-4000-8000-00000000c001'
  and allowed.usage_context = 'pedido' and allowed.is_default = true;
select public.save_qb_matrix_delivery_item_with_weight_v2(
  '00000000-0000-4000-8000-00000000f301', 0, 6, 10, true, null,
  '6 kg externos', 'qa-delivery-partial-001');
do $$ begin
  perform public.confirm_qb_matrix_delivery(
    '00000000-0000-4000-8000-00000000e301',
    (select updated_at from public.qb_orders where id = '00000000-0000-4000-8000-00000000e301'),
    'qa-delivery-partial-confirm-001');
  raise exception 'Overstated warehouse component was accepted';
exception when others then
  if sqlerrm = 'Overstated warehouse component was accepted' then raise; end if;
end $$;
do $$ begin
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c001') <> 3
    or exists (select 1 from public.qb_order_delivery_movements
      where order_id = '00000000-0000-4000-8000-00000000e301') then
    raise exception 'Rejected delivery changed ledger';
  end if;
end $$;
insert into public.inventory_movements
  (product_id, movement_type, quantity, stock_before, stock_after, reason)
values ('00000000-0000-4000-8000-00000000c001', 'entrada', 1, 3, 4, 'QA restock');
update public.products set stock_current = 4
where id = '00000000-0000-4000-8000-00000000c001';
select public.confirm_qb_matrix_delivery(
  '00000000-0000-4000-8000-00000000e301',
  (select updated_at from public.qb_orders where id = '00000000-0000-4000-8000-00000000e301'),
  'qa-delivery-partial-confirm-001');
select public.confirm_qb_matrix_delivery(
  '00000000-0000-4000-8000-00000000e301',
  (select updated_at from public.qb_orders where id = '00000000-0000-4000-8000-00000000e301'),
  'qa-delivery-partial-confirm-001');
do $$ begin
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c001') <> 0 then
    raise exception 'Partial delivery did not leave stock at zero';
  end if;
  if (select count(*) from public.qb_order_delivery_movements
      where order_id = '00000000-0000-4000-8000-00000000e301'
        and inventory_movement_id is not null) <> 1 then
    raise exception 'Partial delivery did not create exactly one warehouse movement';
  end if;
  if (select warehouse_base_quantity from public.qb_order_delivery_movements
      where order_id = '00000000-0000-4000-8000-00000000e301') <> 4 then
    raise exception 'Partial delivery deducted a quantity other than four';
  end if;
  if (select delivered_base_quantity from public.qb_order_delivery_items
      where order_id = '00000000-0000-4000-8000-00000000e301') <> 10 then
    raise exception 'Partial delivery lost the six external kilograms';
  end if;
end $$;
-- Three envelopes: no weight conversion and no confirmed purchase cost.
insert into public.qb_unit_dimensions (id, code, name, base_unit_code)
values ('00000000-0000-4000-8000-00000000d002', 'qa_count', 'QA conteo', 'qa_sobre');
insert into public.qb_units (id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base)
values ('00000000-0000-4000-8000-00000000b003',
  '00000000-0000-4000-8000-00000000d002', 'qa_sobre', 'SOBRE', 'SOBRE', 1, true);
insert into public.products (id, name, stock_current, stock_minimum, purchase_price, sale_price)
values ('00000000-0000-4000-8000-00000000c002', 'QA sobres', 3, 0, 0, 0);
insert into public.qb_product_unit_settings
  (product_id, base_unit_id, base_inventory_unit_id, base_price_unit_id, is_qb_active)
values ('00000000-0000-4000-8000-00000000c002',
  '00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000b003',
  '00000000-0000-4000-8000-00000000b003', true);
insert into public.qb_orders (id, public_reference, customer_account_id, customer_location_id,
  status, idempotency_key)
values ('00000000-0000-4000-8000-00000000e401', 'QB-QA-004',
  '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000c102',
  'preparado', '00000000-0000-4000-8000-00000000e401');
insert into public.qb_order_items
  (id, order_id, product_id, allowed_unit_id, source_kind, source_unit_id, source_label,
   requested_quantity, base_unit_id, base_unit_symbol, base_quantity, conversion_factor_to_base)
select '00000000-0000-4000-8000-00000000f401'::uuid,
  '00000000-0000-4000-8000-00000000e401'::uuid,
  '00000000-0000-4000-8000-00000000c002'::uuid, allowed.id,
  'universal_unit', '00000000-0000-4000-8000-00000000b003'::uuid, 'SOBRE', 3,
  '00000000-0000-4000-8000-00000000b003'::uuid, 'SOBRE', 3, 1
from public.qb_product_allowed_units allowed
where allowed.product_id = '00000000-0000-4000-8000-00000000c002'
  and allowed.usage_context = 'pedido' and allowed.is_default = true;
insert into public.qb_order_preparations (id, order_id, status)
values ('00000000-0000-4000-8000-00000000e402',
  '00000000-0000-4000-8000-00000000e401', 'preparado');
insert into public.qb_order_preparation_items
  (id, preparation_id, order_item_id, product_id, requested_source_label,
   requested_quantity, requested_base_unit_id, requested_base_unit_symbol,
   requested_base_quantity, actual_quantity, actual_base_quantity, status,
   actual_allowed_unit_id, actual_source_kind, actual_source_unit_id,
   actual_source_label, actual_base_unit_id, actual_base_unit_symbol,
   conversion_factor_to_base, preparation_check, prepared_at_line, provision_cost_unit)
select '00000000-0000-4000-8000-00000000f402'::uuid,
  '00000000-0000-4000-8000-00000000e402', '00000000-0000-4000-8000-00000000f401',
  '00000000-0000-4000-8000-00000000c002', 'SOBRE', 3,
  '00000000-0000-4000-8000-00000000b003', 'SOBRE', 3, 3, 3, 'completo',
  allowed.id, 'universal_unit', '00000000-0000-4000-8000-00000000b003',
  'SOBRE', '00000000-0000-4000-8000-00000000b003', 'SOBRE', 1, true, now(), 2
from public.qb_product_allowed_units allowed
where allowed.product_id = '00000000-0000-4000-8000-00000000c002'
  and allowed.usage_context = 'pedido' and allowed.is_default = true;
select public.save_qb_matrix_delivery_item_with_weight_v2(
  '00000000-0000-4000-8000-00000000f401', 0, 0, 3, true, null, null,
  'qa-delivery-envelopes-001');
select public.confirm_qb_matrix_delivery(
  '00000000-0000-4000-8000-00000000e401',
  (select updated_at from public.qb_orders where id = '00000000-0000-4000-8000-00000000e401'),
  'qa-delivery-envelopes-confirm-001');
do $$
declare v_receipt_id uuid;
begin
  v_receipt_id := public.create_qb_receipt_line_draft(
    '00000000-0000-4000-8000-00000000c101',
    array['00000000-0000-4000-8000-00000000e401'::uuid]);
  if (select count(*) from public.qb_receipt_lines where receipt_id = v_receipt_id) <> 1
    or (select delivered_base_quantity from public.qb_receipt_lines where receipt_id = v_receipt_id) <> 3
    or (select base_unit_symbol from public.qb_receipt_lines where receipt_id = v_receipt_id) <> 'SOBRE'
    or (select cost_base_unit_snapshot from public.qb_receipt_lines where receipt_id = v_receipt_id) is not null then
    raise exception 'Three envelopes receipt has wrong unit, quantity, or invented cost';
  end if;
end $$;
do $$
declare v_receipt_id uuid;
begin
  v_receipt_id := public.create_qb_receipt_line_draft(
    '00000000-0000-4000-8000-00000000c101',
    array['00000000-0000-4000-8000-00000000e201'::uuid,
          '00000000-0000-4000-8000-00000000e301'::uuid]);
  if (select count(*) from public.qb_receipt_lines where receipt_id = v_receipt_id) <> 2 then
    raise exception 'Receipt omitted zero-stock or partial-stock delivered line';
  end if;
  if exists (select 1 from public.qb_receipt_lines where receipt_id = v_receipt_id
      and (delivered_base_quantity <> 10 or cost_base_unit_snapshot <> 5.5
        or warehouse_purchase_line_id <> '00000000-0000-4000-8000-00000000f001'::uuid)) then
    raise exception 'Receipt quantity or purchase cost is wrong';
  end if;
end $$;
insert into public.qb_receipts (id, receipt_number, customer_account_id, pricing_mode)
values ('00000000-0000-4000-8000-00000000e103', 'QB-QA-REC-001',
  '00000000-0000-4000-8000-00000000c101', 'line_cost_markup');
insert into public.qb_receipt_orders (id, receipt_id, order_id, customer_account_id)
values ('00000000-0000-4000-8000-00000000e104', '00000000-0000-4000-8000-00000000e103',
  '00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-00000000c101');
insert into public.qb_receipt_lines
  (id, receipt_id, receipt_order_id, order_id, preparation_item_id, product_id,
   product_name_snapshot, delivered_base_quantity, base_unit_id, base_unit_symbol,
   visible_unit_label, cost_base_unit_snapshot, cost_source)
values ('00000000-0000-4000-8000-00000000f103',
  '00000000-0000-4000-8000-00000000e103', '00000000-0000-4000-8000-00000000e104',
  '00000000-0000-4000-8000-00000000e101', '00000000-0000-4000-8000-00000000f102',
  '00000000-0000-4000-8000-00000000c001', 'QA papa', 10,
  '00000000-0000-4000-8000-00000000b001', 'KG', 'KG', 999, 'purchase_snapshot');
do $$ begin
  if (select cost_base_unit_snapshot from public.qb_receipt_lines
      where id = '00000000-0000-4000-8000-00000000f103') <> 5.5 then
    raise exception 'Receipt did not use confirmed purchase reference';
  end if;
  if (select warehouse_purchase_line_id from public.qb_receipt_lines
      where id = '00000000-0000-4000-8000-00000000f103') <>
      '00000000-0000-4000-8000-00000000f001'::uuid then
    raise exception 'Receipt did not retain purchase source';
  end if;
end $$;
select public.set_qb_receipt_line_pricing('00000000-0000-4000-8000-00000000e103',
  '[{"line_id":"00000000-0000-4000-8000-00000000f103","cost_base_unit":"7",
    "distance_factor_percent":0,"exigency_factor_percent":0,
    "weather_factor_percent":0,"extraordinary_factor_percent":0}]'::jsonb);
do $$ begin
  if (select cost_base_unit_snapshot from public.qb_receipt_lines
      where id = '00000000-0000-4000-8000-00000000f103') <> 7
    or (select cost_source from public.qb_receipt_lines
      where id = '00000000-0000-4000-8000-00000000f103') <> 'manual' then
    raise exception 'Manual receipt cost did not take priority';
  end if;
end $$;
-- Simulate a late Provisión precharge; it must not overwrite the manual snapshot.
update public.qb_receipt_lines
set cost_base_unit_snapshot = 2, cost_total_input_precise = 20,
    cost_source = 'purchase_snapshot'
where id = '00000000-0000-4000-8000-00000000f103';
do $$ begin
  if (select cost_base_unit_snapshot from public.qb_receipt_lines
      where id = '00000000-0000-4000-8000-00000000f103') <> 7
    or (select cost_source from public.qb_receipt_lines
      where id = '00000000-0000-4000-8000-00000000f103') <> 'manual' then
    raise exception 'Late provision update replaced the manual cost';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a001', true);
insert into public.qb_merchandise_receipts (id, receipt_date, status, created_by)
values ('00000000-0000-4000-8000-00000000e501', current_date, 'borrador',
  '00000000-0000-4000-8000-00000000a001');
insert into public.qb_merchandise_receipt_lines
  (id, receipt_id, product_id, allowed_unit_id, source_kind, source_unit_id, source_label,
   source_quantity, base_unit_id, base_unit_symbol, base_quantity, conversion_factor_to_base,
   unit_cost, total_cost, requires_classification, is_warehouse_purchase, created_by)
values ('00000000-0000-4000-8000-00000000f501',
  '00000000-0000-4000-8000-00000000e501', '00000000-0000-4000-8000-00000000c001',
  '00000000-0000-4000-8000-00000000b101', 'universal_unit',
  '00000000-0000-4000-8000-00000000b001', 'KG', 1,
  '00000000-0000-4000-8000-00000000b001', 'KG', 1, 1,
  5, 5, false, true, '00000000-0000-4000-8000-00000000a001');
insert into public.qb_conversion_snapshots
  (id, source_table, source_id, product_id, dimension_code, source_kind, source_unit_id,
   source_label, source_quantity, base_unit_id, base_unit_symbol, base_quantity,
   conversion_factor_to_base, snapshot)
values ('00000000-0000-4000-8000-00000000a501', 'qb_merchandise_receipt_lines',
  '00000000-0000-4000-8000-00000000f501', '00000000-0000-4000-8000-00000000c001',
  'qa_weight', 'universal_unit', '00000000-0000-4000-8000-00000000b001',
  'KG', 1, '00000000-0000-4000-8000-00000000b001', 'KG', 1, 1, '{}');
update public.qb_merchandise_receipt_lines
set conversion_snapshot_id = '00000000-0000-4000-8000-00000000a501',
    reference_unit_id = '00000000-0000-4000-8000-00000000b002',
    reference_price = 70, reference_price_origin = 'manual'
where id = '00000000-0000-4000-8000-00000000f501';
select public.set_warehouse_purchase_actual_quantity(
  '00000000-0000-4000-8000-00000000f501', 1);
select public.confirm_qb_merchandise_receipt('00000000-0000-4000-8000-00000000e501');
reset role;
do $$ begin
  if (select cost_base_unit_snapshot from public.qb_receipt_lines
      where id = '00000000-0000-4000-8000-00000000f103') <> 7 then
    raise exception 'Later confirmed purchase repriced historical receipt';
  end if;
end $$;
set local role authenticated;
do $$
declare v_rows integer;
begin
  update public.qb_merchandise_receipt_lines set reference_price = 70
  where id = '00000000-0000-4000-8000-00000000f001';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Confirmed warehouse purchase remained editable'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a002', true);
do $$
declare v_rows integer;
begin
  select count(*) into v_rows from public.qb_merchandise_receipt_lines
  where id = '00000000-0000-4000-8000-00000000f001';
  if v_rows <> 0 then raise exception 'Unrelated role can read warehouse purchase'; end if;
end $$;
do $$ begin
  insert into public.qb_merchandise_receipts (id, receipt_date, status, created_by)
  values ('00000000-0000-4000-8000-00000000e502', current_date, 'borrador',
    '00000000-0000-4000-8000-00000000a002');
  raise exception 'Unrelated role created a warehouse receipt';
exception when others then
  if sqlerrm = 'Unrelated role created a warehouse receipt' then raise; end if;
end $$;
reset role;

rollback;
