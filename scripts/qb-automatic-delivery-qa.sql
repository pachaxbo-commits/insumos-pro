-- Run against isolated QA with a synthetic customer and administrator.
\set ON_ERROR_STOP on
begin;

do $$
#variable_conflict use_variable
declare
  scenario integer;
  actor uuid;
  customer uuid;
  location uuid;
  unit_id uuid;
  product_id uuid;
  order_id uuid;
  item_id uuid;
  receipt_id uuid;
  order_unit uuid;
  purchase_unit uuid;
  expected_at timestamptz;
  initial_stock numeric;
  purchase_quantity numeric;
  shortage numeric;
  final_stock numeric;
  request_key text;
  sales_receipt uuid;
  sales_line public.qb_receipt_lines%rowtype;
  unit_case public.qb_order_items%rowtype;
begin
  select id into strict actor from public.profiles where role='administrador' and is_active
  order by id limit 1;
  select o.customer_account_id,o.customer_location_id into strict customer, location
  from public.qb_orders o where o.public_reference='QB-20261118-F5FA8D';
  select u.id into strict unit_id from public.qb_units u join public.qb_unit_dimensions d on d.id=u.dimension_id
  where d.code='peso' and u.symbol='KG' and u.is_base and u.is_active limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  for scenario in 1..2 loop
    initial_stock := case when scenario=1 then 0 else 3 end;
    purchase_quantity := case when scenario=1 then 20 else 10 end;
    shortage := 5-initial_stock;
    final_stock := purchase_quantity-shortage;
    insert into public.products(name) values ('QA conciliación '||gen_random_uuid()) returning id into product_id;
    insert into public.qb_product_unit_settings(product_id,base_unit_id,base_inventory_unit_id,base_price_unit_id)
    values(product_id,unit_id,unit_id,unit_id);
    insert into public.qb_product_allowed_units(product_id,usage_context,unit_id,is_default)
    values(product_id,'pedido',unit_id,true) on conflict do nothing;
    select a.id into strict order_unit from public.qb_product_allowed_units a where a.product_id=product_id and a.unit_id=unit_id and a.usage_context='pedido';
    insert into public.qb_product_allowed_units(product_id,usage_context,unit_id,is_default)
    values(product_id,'recepcion',unit_id,true) returning id into purchase_unit;

    if initial_stock>0 then
      receipt_id := public.create_qb_warehouse_purchase_draft(current_date,product_id,purchase_unit,
        'universal_unit',unit_id,null,'KG',initial_stock,unit_id,'KG',initial_stock,1,
        14,14*initial_stock,unit_id,14,'manual',null,'peso','{}');
      perform public.set_warehouse_purchase_actual_quantity((select l.id from public.qb_merchandise_receipt_lines l where l.receipt_id=receipt_id),initial_stock);
      perform public.confirm_qb_warehouse_purchase_draft(receipt_id);
    end if;

    insert into public.qb_orders(customer_account_id,customer_location_id,public_reference,idempotency_key)
    values(customer,location,'QA-CONC-'||gen_random_uuid(),gen_random_uuid()::text) returning id into order_id;
    insert into public.qb_order_items(order_id,product_id,allowed_unit_id,source_kind,source_unit_id,
      source_label,requested_quantity,base_unit_id,base_unit_symbol,base_quantity,conversion_factor_to_base)
    values(order_id,product_id,order_unit,'universal_unit',unit_id,'KG',5,unit_id,'KG',5,1) returning id into item_id;

    perform public.save_qb_matrix_preparation_with_check_reset(item_id,0,5,true,null,null,null,
      false,'original','',0,0,0,false,false,false,gen_random_uuid()::text);
    perform public.save_qb_matrix_delivery_origin_with_weight_snapshot(item_id,0,0,5,true,null,null,null,
      false,'original','',0,0,0,0,false,gen_random_uuid()::text);
    select updated_at into strict expected_at from public.qb_orders where id=order_id;
    request_key := gen_random_uuid()::text;
    perform public.confirm_qb_matrix_delivery(order_id,expected_at,request_key);
    perform public.confirm_qb_matrix_delivery(order_id,expected_at,request_key);
    assert (select stock_current from public.products where id=product_id)=0;
    assert (select count(*) from public.qb_order_delivery_movements m where m.order_id=order_id)=1;
    assert exists(select 1 from public.qb_same_day_reconciliation_requests r
      where r.order_id=order_id and pending_quantity=shortage and reconciled_quantity=0);

    if scenario=1 then
      -- Simulate yesterday's delivery without modifying any preexisting QA data.
      update public.qb_same_day_reconciliation_requests r
        set operational_date = (now() at time zone 'America/La_Paz')::date - 1
        where r.order_id=order_id;
    end if;

    if scenario=1 then
      sales_receipt := public.create_qb_receipt_line_draft(customer,array[order_id]);
      select * into strict sales_line from public.qb_receipt_lines l where l.receipt_id=sales_receipt;
      assert sales_line.cost_base_unit_snapshot is null and sales_line.cost_source is null;
      perform public.set_qb_receipt_line_pricing(sales_receipt,jsonb_build_array(jsonb_build_object(
        'line_id',sales_line.id,'cost_base_unit',12,'distance_factor_percent',20,
        'exigency_factor_percent',0,'weather_factor_percent',0,'extraordinary_factor_percent',0)));
      perform public.emit_qb_receipt(sales_receipt);
      select * into strict sales_line from public.qb_receipt_lines l where l.receipt_id=sales_receipt;
      assert sales_line.cost_total_precise=60 and sales_line.sale_total_precise=72;
    end if;

    receipt_id := public.create_qb_warehouse_purchase_draft(current_date,product_id,purchase_unit,
      'universal_unit',unit_id,null,'KG',purchase_quantity,unit_id,'KG',purchase_quantity,1,
      10,10*purchase_quantity,unit_id,10,'manual',null,'peso','{}');
    perform public.set_warehouse_purchase_actual_quantity((select l.id from public.qb_merchandise_receipt_lines l where l.receipt_id=receipt_id),purchase_quantity);
    perform public.confirm_qb_warehouse_purchase_draft(receipt_id);
    perform public.confirm_qb_warehouse_purchase_draft(receipt_id);
    assert (select stock_current from public.products where id=product_id)=final_stock;
    assert exists(select 1 from public.qb_same_day_reconciliation_requests r
      where r.order_id=order_id and pending_quantity=shortage and reconciled_quantity=shortage and status='reconciled');
    assert (select sum(c.quantity_consumed) from public.inventory_lot_consumptions c
      join public.qb_order_delivery_movements m on m.id=c.delivery_movement_id where m.order_id=order_id)=5;
    assert (select sum(c.total_cost) from public.inventory_lot_consumptions c
      join public.qb_order_delivery_movements m on m.id=c.delivery_movement_id where m.order_id=order_id)
      =14*initial_stock+10*shortage;
    assert (select sum(l.remaining_quantity) from public.inventory_lots l where l.product_id=product_id)=final_stock;
    if scenario=1 then
      assert (select to_jsonb(l) from public.qb_receipt_lines l where l.id=sales_line.id)=to_jsonb(sales_line);
      assert (select status from public.qb_receipts where id=sales_receipt)='emitido';
    else
      sales_receipt := public.create_qb_receipt_line_draft(customer,array[order_id]);
      select * into strict sales_line from public.qb_receipt_lines l where l.receipt_id=sales_receipt;
      assert sales_line.cost_source='fifo' and sales_line.cost_total_precise=62;
    end if;
    raise notice 'PASS: stock inicial %, entrega 5, compra %, stock final %, repetición sin duplicados',
      initial_stock,purchase_quantity,final_stock;
  end loop;

  insert into public.qb_orders(customer_account_id,customer_location_id,public_reference,idempotency_key)
  values(customer,location,'QA-UNITS-'||gen_random_uuid(),gen_random_uuid()::text) returning id into order_id;
  for unit_case in select i.* from public.qb_order_items i join public.qb_orders o on o.id=i.order_id
    where o.public_reference='QB-20261118-4C1555'
  loop
    insert into public.qb_order_items(order_id,product_id,allowed_unit_id,source_kind,source_unit_id,
      source_label,requested_quantity,base_unit_id,base_unit_symbol,base_quantity,conversion_factor_to_base)
    values(order_id,unit_case.product_id,unit_case.allowed_unit_id,unit_case.source_kind,unit_case.source_unit_id,
      unit_case.source_label,unit_case.requested_quantity,unit_case.base_unit_id,unit_case.base_unit_symbol,
      unit_case.base_quantity,unit_case.conversion_factor_to_base) returning id into item_id;
    perform public.save_qb_matrix_preparation_with_check_reset(item_id,0,unit_case.requested_quantity,true,null,null,null,
      false,'original','',0,0,0,false,false,false,gen_random_uuid()::text);
    perform public.save_qb_matrix_delivery_origin_with_weight_snapshot(item_id,0,0,unit_case.requested_quantity,true,
      null,null,null,false,'original','',0,0,0,0,false,gen_random_uuid()::text);
  end loop;
  select updated_at into strict expected_at from public.qb_orders where id=order_id;
  perform public.confirm_qb_matrix_delivery(order_id,expected_at,gen_random_uuid()::text);
  sales_receipt := public.create_qb_receipt_line_draft(customer,array[order_id]);
  assert (select count(*) from public.qb_receipt_lines l where l.receipt_id=sales_receipt)=4;
  assert not exists (
    select 1 from public.qb_receipt_lines l
    join public.qb_order_preparation_items p on p.id=l.preparation_item_id
    join public.qb_order_items i on i.id=p.order_item_id
    where l.receipt_id=sales_receipt and
      (l.commercial_unit_label_snapshot is distinct from i.source_label
        or l.commercial_quantity_snapshot is distinct from i.requested_quantity)
  );
  raise notice 'PASS: KG, LIBRA, ARROBA y UNIDAD conservados en Recibos';
end;
$$;

rollback;
