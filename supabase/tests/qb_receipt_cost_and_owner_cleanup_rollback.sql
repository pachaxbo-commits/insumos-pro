begin;
create function pg_temp.qb_fail_cleanup() returns trigger language plpgsql as $$
begin
  if new.action='qb_owner_cleanup' and current_setting('qb.qa_fail_cleanup',true)='yes' then
    raise exception 'QA cleanup rollback probe';
  end if;
  return new;
end;
$$;
create trigger qb_qa_fail_cleanup before insert on audit_logs for each row execute function pg_temp.qb_fail_cleanup();
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
  line_id uuid;
  preview jsonb;
  saved_orders bigint;
  master_fingerprint text;
  master_counts jsonb;
  non_admin uuid:=gen_random_uuid();
  failed boolean;
  initial_stock numeric;
  expected_stock numeric;
  independent_movements bigint;
  old_data jsonb;
  kg uuid;
  next_receipt uuid;
  libra uuid;
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
  select id into kg from qb_units where code='kg';
  select id into libra from qb_units where code='libra';
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
    select l.id into strict line_id from qb_receipt_lines l where l.receipt_id=v_receipt_id;
    if exists(select 1 from qb_receipt_lines l where l.id=line_id and
      (l.cost_base_unit_snapshot is not null or l.cost_source is not null or l.sale_price_independent_snapshot)) then
      raise exception 'Unexpected starting cost';
    end if;
    perform set_qb_receipt_line_pricing(v_receipt_id,jsonb_build_array(jsonb_build_object(
      'line_id',line_id,'cost_base_unit',20,'distance_factor_percent',10,'exigency_factor_percent',5,
      'weather_factor_percent',0,'extraordinary_factor_percent',0)));
    if private.qb_latest_receipt_cost(v_product_id,base_id)<>20 then raise exception '20 not remembered'; end if;
    perform set_qb_receipt_line_pricing(v_receipt_id,jsonb_build_array(jsonb_build_object(
      'line_id',line_id,'cost_base_unit',22,'distance_factor_percent',10,'exigency_factor_percent',5,
      'weather_factor_percent',0,'extraordinary_factor_percent',0)));
    if private.qb_latest_receipt_cost(v_product_id,base_id)<>22 then raise exception '22 not remembered'; end if;
    if base_id=kg and private.qb_latest_receipt_cost(v_product_id,libra)<>round(22*lb_factor,8) then
      raise exception 'Weight conversion failed';
    end if;
    if base_id<>kg and private.qb_latest_receipt_cost(v_product_id,kg) is not null then
      raise exception 'Invented count to weight cost';
    end if;
    expected_sale:=round((select delivered_base_quantity from qb_receipt_lines where id=line_id)*22*1.15,8);
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
    insert into qb_receipts(receipt_number,customer_account_id,status,pricing_mode,created_by)
      values('QA-COST-NEXT-'||gen_random_uuid(),v_customer_id,'borrador','line_cost_markup',admin_id) returning id into next_receipt;
    insert into qb_receipt_orders(receipt_id,order_id,customer_account_id,inclusion_status)
      values(next_receipt,v_order_id,v_customer_id,'anulado');
    insert into qb_receipt_lines(receipt_id,receipt_order_id,order_id,preparation_item_id,product_id,
      product_name_snapshot,delivered_base_quantity,base_unit_id,base_unit_symbol,visible_unit_label,cost_source,cost_base_unit_snapshot)
      select next_receipt,ro.id,l.order_id,l.preparation_item_id,l.product_id,l.product_name_snapshot,
        l.delivered_base_quantity,l.base_unit_id,l.base_unit_symbol,l.visible_unit_label,'purchase_snapshot',95
      from qb_receipt_lines l join qb_receipt_orders ro on ro.receipt_id=next_receipt where l.id=line_id;
    if (select suggested_cost from get_qb_draft_receipt_cost_suggestions(array[next_receipt])) is distinct from 22::numeric
      or exists(select 1 from qb_receipt_lines where receipt_id=next_receipt and cost_base_unit_snapshot is not null) then
      raise exception 'Next receipt did not suggest 22 or accepted a purchase reference';
    end if;
    if scenario.source_code='kg' then
      perform emit_qb_receipt(v_receipt_id);
      select count(*) into saved_orders from qb_orders;
      preview:=preview_qb_owner_cleanup('receipts');
      perform execute_qb_owner_cleanup('receipts',array[v_receipt_id],preview->>'revision','BORRAR DATOS');
      if (select count(*) from qb_orders)<>saved_orders or exists(select 1 from qb_receipts where id=v_receipt_id)
        or (select suggested_cost from get_qb_draft_receipt_cost_suggestions(array[next_receipt])) is not null
        or (select status from qb_orders where id=v_order_id)<>'entregado_pendiente_recibo' then
        raise exception 'Receipts-only cleanup corrupted orders or retained cost history';
      end if;
    end if;
  end loop;

  insert into auth.users(id,email) values(non_admin,'cleanup-denied@example.test');
  insert into profiles(id,email,full_name,role,is_active) values(non_admin,'cleanup-denied@example.test','QA','inventario',true);
  preview:=preview_qb_owner_cleanup('orders');
  perform set_config('request.jwt.claim.sub',non_admin::text,true);
  failed:=false;
  begin
    perform execute_qb_owner_cleanup('orders','{}',preview->>'revision','BORRAR DATOS');
  exception when insufficient_privilege then failed:=true; end;
  if not failed then raise exception 'Non-admin cleanup allowed'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);

  select md5(string_agg((to_jsonb(p)-'stock_current'-'updated_at')::text,'' order by id)) into master_fingerprint from products p;
  select jsonb_build_array(
    (select count(*) from auth.users), (select count(*) from profiles),
    (select count(*) from customer_accounts), (select count(*) from qb_units),
    (select count(*) from qb_product_unit_settings), (select count(*) from product_categories),
    (select count(*) from qb_operational_settings), (select count(*) from qb_legacy_order_templates),
    (select count(*) from qb_legacy_order_template_lines)
  ) into master_counts;
  select count(*) into independent_movements from inventory_movements m where not exists
    (select 1 from qb_order_delivery_movements d where d.inventory_movement_id=m.id) and not exists
    (select 1 from qb_same_day_reconciliation_allocations a where a.inventory_movement_id=m.id);
  select stock_current into initial_stock from products where id=v_product_id;
  expected_stock:=initial_stock+20;

  old_data:=preview_qb_owner_cleanup('orders');
  failed:=false;
  begin
    perform set_config('qb.qa_fail_cleanup','yes',true);
    perform execute_qb_owner_cleanup('orders','{}',old_data->>'revision','BORRAR DATOS');
  exception when raise_exception then
    if sqlerrm<>'QA cleanup rollback probe' then raise; end if;
    failed:=true;
  end;
  if not failed or preview_qb_owner_cleanup('orders')<>old_data
    or (select stock_current from products where id=v_product_id)<>initial_stock then
    raise exception 'Cleanup did not roll back';
  end if;
  perform execute_qb_owner_cleanup('orders','{}',old_data->>'revision','BORRAR DATOS');
  if exists(select 1 from qb_orders) or exists(select 1 from qb_receipts)
    or exists(select 1 from qb_order_delivery_movements)
    or jsonb_build_array(
      (select count(*) from auth.users), (select count(*) from profiles),
      (select count(*) from customer_accounts), (select count(*) from qb_units),
      (select count(*) from qb_product_unit_settings), (select count(*) from product_categories),
      (select count(*) from qb_operational_settings), (select count(*) from qb_legacy_order_templates),
      (select count(*) from qb_legacy_order_template_lines)
    )<>master_counts
    or (select count(*) from inventory_movements)<>independent_movements
    or (select stock_current from products where id=v_product_id)<>expected_stock
    or (select md5(string_agg((to_jsonb(p)-'stock_current'-'updated_at')::text,'' order by id)) from products p)<>master_fingerprint then
    raise exception 'Order cleanup lost inventory or master data';
  end if;
end;
$$;
rollback;
