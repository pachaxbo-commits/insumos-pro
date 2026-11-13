begin;
do $$
declare
  admin_id uuid;
  v_customer_id uuid := gen_random_uuid();
  v_location_id uuid := gen_random_uuid();
  v_product_id uuid;
  v_order_id uuid;
  item_id uuid;
  allowed_id uuid;
  base_id uuid;
  source_id uuid;
  lb_id uuid;
  lb_factor numeric;
  arroba_id uuid;
  updated timestamptz;
  v_receipt_id uuid;
  scenario record;
  delivery_version int;
  expected_sale numeric;
begin
  select id into strict admin_id from profiles where is_active and role in ('admin','administrador') limit 1;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  insert into auth.users(id,email) values(v_customer_id,'pr19-customer@example.test');
  insert into customer_accounts(id,email,full_name,business_name,responsible_name,phone,is_active)
    values(v_customer_id,'pr19-customer@example.test','QA','QA','QA','70000000',true);
  insert into qb_customer_locations(id,customer_account_id,label,address,is_active)
    values(v_location_id,v_customer_id,'QA','Dirección ficticia QA',true);
  select id,conversion_factor_to_base into strict lb_id,lb_factor from qb_units where code='libra' and is_active;
  select id into strict arroba_id from qb_units where code='arroba' and is_active;
  for scenario in select * from (values ('Cuartilla QA','kg','cuartilla',1,3,0,6),
    ('Pimenton QA','unidad','unidad',8,8,0,12),('Parcial QA','kg','kg',25,20,5,25))
    s(name,base_code,source_code,commercial,warehouse,external,weight_lb)
  loop
    select id into strict base_id from qb_units where code=scenario.base_code and is_active;
    select id into strict source_id from qb_units where code=scenario.source_code and is_active;
    insert into products(name,stock_current,stock_minimum,is_sellable,is_active,controls_actual_weight)
      values(scenario.name,scenario.warehouse,0,true,true,scenario.source_code<>'kg') returning id into v_product_id;
    insert into qb_product_unit_settings(product_id,base_unit_id,inventory_unit_id,base_inventory_unit_id,
      base_price_unit_id,base_sale_price,is_visible_in_qb_catalog,is_qb_active)
      values(v_product_id,base_id,base_id,base_id,case when scenario.source_code='cuartilla' then arroba_id else base_id end,
        case when scenario.source_code='cuartilla' then 112.5 else 10 end,true,true);
    select id into allowed_id from qb_product_allowed_units a where a.product_id=v_product_id and a.unit_id=source_id and a.usage_context='pedido';
    if allowed_id is null then
      insert into qb_product_allowed_units(product_id,usage_context,unit_id,is_active)
        values(v_product_id,'pedido',source_id,true) returning id into allowed_id;
    end if;
    select created_order_id into strict v_order_id from create_qb_internal_catalog_order('registered',v_customer_id,v_location_id,
      null,null,null,null,null,null,null,'QA PR19',
      jsonb_build_array(jsonb_build_object('product_id',v_product_id,'allowed_unit_id',allowed_id,'quantity',scenario.commercial)),
      gen_random_uuid()::text);
    select id into strict item_id from qb_order_items i where i.order_id=v_order_id;
    perform save_qb_matrix_preparation_with_check_reset(item_id,0,
      case when scenario.external>0 then scenario.warehouse else scenario.commercial end,true,
      null,null,null,false,'original',null,0,scenario.external,0,true,true,false,gen_random_uuid()::text);
    if (select stock_current from products where id=v_product_id)<>scenario.warehouse then
      raise exception 'Preparing changed stock';
    end if;
    select updated_at into strict updated from qb_orders where id=v_order_id;
    perform finalize_qb_matrix_preparation(v_order_id,updated,gen_random_uuid()::text);
    select coalesce(max(d.row_version),0) into delivery_version from qb_order_delivery_items d where d.order_item_id=item_id;
    perform save_qb_matrix_delivery_origin_with_weight_snapshot(item_id,delivery_version,scenario.external,scenario.commercial,
      true,scenario.weight_lb,lb_id,lb_factor,false,'original','QA',
      case when scenario.source_code='cuartilla' then round(scenario.weight_lb*lb_factor,6) else scenario.warehouse end,
      0,scenario.external,0,true,gen_random_uuid()::text);
    select updated_at into strict updated from qb_orders where id=v_order_id;
    perform confirm_qb_matrix_delivery(v_order_id,updated,gen_random_uuid()::text);
    v_receipt_id:=create_qb_receipt_line_draft(v_customer_id,array[v_order_id]);
    expected_sale:=case when scenario.source_code='cuartilla' then 27 else scenario.commercial*10 end;
    if (select warehouse_base_quantity from qb_order_delivery_movements where order_id=v_order_id)
      <> (case when scenario.source_code='cuartilla' then round(scenario.weight_lb*lb_factor,6) else scenario.warehouse end)
      or (select external_definitive_base_quantity from qb_order_delivery_items where order_item_id=item_id)<>scenario.external then
      raise exception 'Inventory basis mixed with tariff or commercial quantity: %',scenario.name;
    end if;
    if not exists(select 1 from qb_receipt_lines l where l.receipt_id=v_receipt_id and
      l.commercial_quantity_snapshot=scenario.commercial and l.actual_weight_value=scenario.weight_lb
      and l.actual_weight_unit_id=lb_id and l.sale_total_precise=expected_sale) then
      raise exception 'Commercial price or quantity changed with measurement: % / %',scenario.name,(select jsonb_build_array(commercial_quantity_snapshot,actual_weight_value,sale_total_precise,base_price_used,delivered_base_quantity) from qb_receipt_lines where qb_receipt_lines.receipt_id=v_receipt_id limit 1);
    end if;
  end loop;
end;
$$;
rollback;
