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
   'universal_unit', '00000000-0000-4000-8000-00000000b001', 'KG', 5,
   '00000000-0000-4000-8000-00000000b001', 'KG', 5, 1, 5.5, 27.5, false,
   '00000000-0000-4000-8000-00000000b002', 55, 'manual', true,
   '00000000-0000-4000-8000-00000000a001'),
  ('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000e001',
   '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000b101',
   'universal_unit', '00000000-0000-4000-8000-00000000b001', 'KG', 5,
   '00000000-0000-4000-8000-00000000b001', 'KG', 5, 1, 5.5, 27.5, false,
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
   'KG', 5, '00000000-0000-4000-8000-00000000b001', 'KG', 5, 1, '{}'),
  ('00000000-0000-4000-8000-00000000a102', 'qb_merchandise_receipt_lines',
   '00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000c001',
   'qa_weight', 'universal_unit', '00000000-0000-4000-8000-00000000b001',
   'KG', 5, '00000000-0000-4000-8000-00000000b001', 'KG', 5, 1, '{}');
update public.qb_merchandise_receipt_lines
set conversion_snapshot_id = '00000000-0000-4000-8000-00000000a101'
where id = '00000000-0000-4000-8000-00000000f001';
update public.qb_merchandise_receipt_lines
set conversion_snapshot_id = '00000000-0000-4000-8000-00000000a102'
where id = '00000000-0000-4000-8000-00000000f002';

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a002', true);
do $$ begin
  perform public.set_warehouse_purchase_actual_quantity(
    '00000000-0000-4000-8000-00000000f001', 10);
  raise exception 'Viewer was allowed to measure purchase';
exception when others then
  if sqlerrm = 'Viewer was allowed to measure purchase' then raise; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a001', true);
select public.set_warehouse_purchase_actual_quantity('00000000-0000-4000-8000-00000000f001', 5);
select public.set_warehouse_purchase_actual_quantity('00000000-0000-4000-8000-00000000f002', 5);
select public.confirm_qb_merchandise_receipt('00000000-0000-4000-8000-00000000e001');
do $$ begin
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c001') <> 10 then
    raise exception 'Stock after purchase is not 10';
  end if;
  if (select count(*) from public.qb_merchandise_receipt_movements where receipt_id = '00000000-0000-4000-8000-00000000e001') <> 2
    or (select count(*) from public.inventory_lots where product_id = '00000000-0000-4000-8000-00000000c001') <> 2 then
    raise exception 'Purchase did not create two stock movements and FIFO lots';
  end if;
end $$;
update public.inventory_lots lot set received_at = case
  when movement.line_id = '00000000-0000-4000-8000-00000000f001' then now() - interval '2 days'
  else now() - interval '1 day' end
from public.qb_merchandise_receipt_movements movement
where movement.id = lot.source_receipt_movement_id;
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
  '00000000-0000-4000-8000-00000000b001', 'KG', 10, 6, 6, 'parcial',
  allowed.id, 'universal_unit', '00000000-0000-4000-8000-00000000b001',
  'KG', '00000000-0000-4000-8000-00000000b001', 'KG', 1, true, now()
from public.qb_product_allowed_units allowed
where allowed.product_id = '00000000-0000-4000-8000-00000000c001'
  and allowed.usage_context = 'pedido' and allowed.is_default = true;
select public.save_qb_matrix_delivery_item_with_weight_v2(
  '00000000-0000-4000-8000-00000000f101', 0, 3, 9, true, null, '1 kg faltante; 3 kg de compra externa',
  'qa-delivery-line-001');
select public.confirm_qb_matrix_delivery(
  '00000000-0000-4000-8000-00000000e101',
  (select updated_at from public.qb_orders where id = '00000000-0000-4000-8000-00000000e101'),
  'qa-delivery-confirm-001');
do $$ begin
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c001') <> 4 then
    raise exception 'Mixed delivery did not deduct only its warehouse quantity';
  end if;
  if (select status from public.qb_orders where id = '00000000-0000-4000-8000-00000000e101') <>
    'entregado_pendiente_recibo' then
    raise exception 'Delivered order did not become receipt-eligible';
  end if;
  if (select actual_weight_kg from public.qb_order_delivery_items
      where order_item_id = '00000000-0000-4000-8000-00000000f101') is not null then
    raise exception 'Optional weight was invented';
  end if;
  if (select count(*) from public.inventory_lot_consumptions consumption
      join public.inventory_lots lot on lot.id = consumption.lot_id
      where consumption.delivery_movement_id in (select id from public.qb_order_delivery_movements
        where order_id = '00000000-0000-4000-8000-00000000e101')
        and consumption.cost_status = 'known'
        and consumption.quantity_consumed = 5
        and lot.source_receipt_movement_id = (select id from public.qb_merchandise_receipt_movements where line_id = '00000000-0000-4000-8000-00000000f001')) <> 1
    or (select count(*) from public.inventory_lot_consumptions consumption join public.inventory_lots lot on lot.id = consumption.lot_id where consumption.delivery_movement_id in (select id from public.qb_order_delivery_movements where order_id = '00000000-0000-4000-8000-00000000e101') and consumption.cost_status = 'known' and consumption.quantity_consumed = 1 and lot.source_receipt_movement_id = (select id from public.qb_merchandise_receipt_movements where line_id = '00000000-0000-4000-8000-00000000f002')) <> 1 then
    raise exception 'FIFO did not consume the oldest lot first';
  end if;
  if (select lot.remaining_quantity from public.inventory_lots lot
      where lot.source_receipt_movement_id = (select id from public.qb_merchandise_receipt_movements
        where line_id = '00000000-0000-4000-8000-00000000f001')) <> 0
    or (select lot.remaining_quantity from public.inventory_lots lot
      where lot.source_receipt_movement_id = (select id from public.qb_merchandise_receipt_movements
        where line_id = '00000000-0000-4000-8000-00000000f002')) <> 4 then
    raise exception 'FIFO did not consume the oldest lot before the newer lot';
  end if;
end $$;

rollback;
