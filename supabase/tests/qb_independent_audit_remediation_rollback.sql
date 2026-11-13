\set ON_ERROR_STOP on
-- Use only the isolated QA database with the fictitious fixtures from the audit.
begin;
do $$
declare
  admin_id uuid;
  inactive_id uuid := gen_random_uuid();
  client_id uuid := gen_random_uuid();
  supervisor_id uuid := gen_random_uuid();
  actor uuid;
  rule public.qb_product_cost_rules%rowtype;
  target public.qb_orders%rowtype;
  customer_id uuid;
  location_id uuid;
  order_id_new uuid;
  item_id uuid;
  items jsonb;
  reply jsonb;
  edit_key text := gen_random_uuid()::text;
begin
  select id into strict admin_id from public.profiles
  where role='administrador' and is_active and email like 'qa-%@example.test' limit 1;
  insert into auth.users(id,email)
  select id,id||'@example.test' from unnest(array[inactive_id,client_id,supervisor_id]) id;
  insert into public.profiles(id,role,is_active)
  values(inactive_id,'supervisor',false),(supervisor_id,'supervisor',true);

  select r.* into strict rule from public.qb_product_cost_rules r join public.products p on p.id=r.product_id
  where p.sku like 'QA-papa-%' limit 1;
  select c.id,l.id into strict customer_id,location_id
  from public.customer_accounts c join public.qb_customer_locations l on l.customer_account_id=c.id
  where c.email like 'qa-customer-%@example.test' and c.is_active and l.is_active limit 1;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  select created_order_id into strict order_id_new from public.create_qb_internal_catalog_order(
    'registered',customer_id,location_id,null,null,null,null,null,null,null,
    'Pedido ficticio de reauditoría',jsonb_build_array(jsonb_build_object(
      'product_id',rule.product_id,'allowed_unit_id',rule.order_allowed_unit_id,'quantity',4)),
    gen_random_uuid()::text);
  select id into strict item_id from public.qb_order_items where order_id=order_id_new;
  perform public.save_qb_matrix_preparation_item(item_id,0,2,false,null,'audit-prep-'||gen_random_uuid());
  select * into strict target from public.qb_orders where id=order_id_new;
  select jsonb_agg(jsonb_build_object('order_item_id',i.id,'expected_version',i.row_version,
    'product_id',i.product_id,'allowed_unit_id',i.allowed_unit_id,'quantity',i.requested_quantity))
  into items from public.qb_order_items i where i.order_id=target.id;

  perform set_config('role','authenticated',true);
  foreach actor in array array[inactive_id,client_id,supervisor_id] loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    begin
      perform public.upsert_qb_product_cost_rule(rule.product_id,rule.order_allowed_unit_id,
        'commercial_unit',rule.rate_amount+1,null,true,rule.row_version);
      raise exception 'AUDIT_UNAUTHORIZED_COST_WRITE';
    exception when others then
      if sqlerrm <> 'QB_COST_RULE_ADMIN_REQUIRED' then raise; end if;
    end;
    begin
      perform public.admin_update_qb_internal_order_after_preparation(target.id,target.updated_at,
        target.operational_date,'Auditoría ficticia','Reauditoría de autorización',items,edit_key);
      raise exception 'AUDIT_UNAUTHORIZED_ORDER_EDIT';
    exception when others then
      if sqlerrm <> 'Solo administracion puede modificar pedidos.' then raise; end if;
    end;
    begin
      perform public.confirm_qb_order_delivery(target.id);
      raise exception 'AUDIT_UNAUTHORIZED_LEGACY_DELIVERY';
    exception when others then
      if sqlerrm not like 'No tienes permisos para confirmar entrega%' then raise; end if;
    end;
  end loop;
  perform set_config('role','postgres',true);
  if not exists (select 1 from public.qb_product_cost_rules where id=rule.id and row_version=rule.row_version)
    or not exists (select 1 from public.qb_orders where id=target.id and customer_notes=target.customer_notes) then
    raise exception 'AUDIT_DENIAL_CHANGED_DATA';
  end if;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  reply:=public.upsert_qb_product_cost_rule(rule.product_id,rule.order_allowed_unit_id,
    'commercial_unit',rule.rate_amount+1,null,true,rule.row_version);
  if (reply->>'row_version')::integer<>rule.row_version+1 then raise exception 'AUDIT_ADMIN_COST_REJECTED'; end if;
  reply:=public.admin_update_qb_internal_order_after_preparation(target.id,target.updated_at,
    target.operational_date,'Auditoría ficticia','Reauditoría de autorización',items,edit_key);
  if reply->>'replayed'<>'false' then raise exception 'AUDIT_FIRST_EDIT'; end if;
  reply:=public.admin_update_qb_internal_order_after_preparation(target.id,target.updated_at,
    target.operational_date,'Auditoría ficticia','Reauditoría de autorización',items,edit_key);
  if reply->>'replayed'<>'true' then raise exception 'AUDIT_IDENTICAL_REPLAY'; end if;
  begin
    perform public.admin_update_qb_internal_order_after_preparation(target.id,target.updated_at,
      target.operational_date+1,'Auditoría ficticia','Reauditoría de autorización',items,edit_key);
    raise exception 'AUDIT_MISMATCHED_REPLAY';
  exception when others then
    if sqlerrm <> 'QB_ORDER_EDIT_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  raise notice 'A1/A5: tres roles denegados, Administración autorizada, replay idéntico y conflicto por fecha';
end $$;
rollback;

begin;
do $$
declare
  actor uuid;
  receipt uuid;
  product uuid;
  line_item uuid;
  other_price numeric;
begin
  select id into strict actor from public.profiles where role='administrador' and is_active and email like 'qa-%@example.test' limit 1;
  select r.id,l.product_id,l.id into strict receipt,product,line_item
  from public.qb_receipts r join public.qb_receipt_lines l on l.receipt_id=r.id
  join public.products p on p.id=l.product_id where r.status='borrador'
  and p.sku like 'QA-papa-%' and l.sale_price_independent_snapshot and l.base_price_used is null
  limit 1;
  select base_price_used into strict other_price from public.qb_receipt_lines
  where receipt_id=receipt and id<>line_item;
  update public.qb_product_unit_settings set base_sale_price=0.12,
    base_price_unit_id=(select id from public.qb_units where code='gr') where product_id=product;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('role','authenticated',true);
  if public.resolve_qb_draft_sale_tariffs(receipt)<>1 then raise exception 'AUDIT_TARIFF_NOT_APPLIED'; end if;
  if public.resolve_qb_draft_sale_tariffs(receipt)<>0 then raise exception 'AUDIT_TARIFF_REWRITTEN'; end if;
  perform public.emit_qb_receipt(receipt);
  begin
    perform public.resolve_qb_draft_sale_tariffs(receipt);
    raise exception 'AUDIT_ISSUED_TARIFF_MUTATION';
  exception when others then
    if sqlerrm<>'QB_RECEIPT_REQUIRES_DRAFT' then raise; end if;
  end;
  perform set_config('role','postgres',true);
  if not exists (select 1 from public.qb_receipt_lines where id=line_item and base_price_used=120
    and cost_total_precise=475 and sale_total_precise=600 and profit_total_precise=125)
    or exists (select 1 from public.qb_receipt_lines where receipt_id=receipt and id<>line_item
      and base_price_used is distinct from other_price) then raise exception 'AUDIT_TARIFF_SNAPSHOT_WRONG'; end if;
  raise notice 'A3: tarifa de Papa resuelta, tarifa confirmada conservada y recibo emitido congelado';
end $$;
rollback;

begin;
do $$
declare
  actor uuid;
  receipt uuid;
  location uuid;
  d date := (now() at time zone 'America/La_Paz')::date;
  unattributed_before numeric;
  site_before numeric;
begin
  select id into strict actor from public.profiles where role='administrador' and is_active and email like 'qa-%@example.test' limit 1;
  select r.id,o.customer_location_id into strict receipt,location
  from public.qb_receipts r join public.qb_receipt_orders ro on ro.receipt_id=r.id
  join public.qb_orders o on o.id=ro.order_id join public.customer_accounts c on c.id=r.customer_account_id
  where r.status='borrador' and c.email like 'qa-customer-%@example.test'
    and (select count(*) from public.qb_receipt_lines l where l.receipt_id=r.id)=2
  limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('qb.line_pricing_write','enabled',true);
  update public.qb_receipt_lines set base_price_used=0.3333 where receipt_id=receipt;
  perform public.recalculate_qb_receipt_totals(receipt);
  if (select total_amount from public.qb_receipts where id=receipt)<>4.33
    or (select sum(line_total) from public.qb_receipt_lines where receipt_id=receipt)<>4.34 then
    raise exception 'AUDIT_FIXTURE_ROUNDING_CHANGED';
  end if;
  select coalesce(sum(sales),0) into unattributed_before from public.get_qb_site_sales_report(d,d) where location_id is null;
  select sales into strict site_before from public.get_qb_site_sales_report(d,d) where location_id=location;
  perform public.emit_qb_receipt(receipt);
  if (select sales from public.get_qb_site_sales_report(d,d) where location_id=location)<>site_before+4.33
    or (select coalesce(sum(sales),0) from public.get_qb_site_sales_report(d,d) where location_id is null)<>unattributed_before then
    raise exception 'AUDIT_KNOWN_SITE_LOST';
  end if;
  raise notice 'A4: Bs 4,33 atribuidos a la sede conocida, con suma de líneas redondeadas Bs 4,34';
end $$;
rollback;

begin;
do $$
declare
  actor uuid;
  customer uuid;
  product uuid;
  allowed uuid;
  order_id_new uuid;
  item uuid;
  receipt uuid;
  stamp timestamptz;
  orders uuid[] := '{}';
  target_sites uuid[];
  d date := (now() at time zone 'America/La_Paz')::date;
  before_sum numeric;
  after_sum numeric;
  unattributed_before numeric;
  n integer;
begin
  select id into strict actor from public.profiles where role='administrador' and is_active and email like 'qa-%@example.test' limit 1;
  select c.id,array_agg(l.id order by l.id) into strict customer,target_sites
  from public.customer_accounts c join public.qb_customer_locations l on l.customer_account_id=c.id
  where c.email like 'qa-customer-%@example.test' and l.is_active
  group by c.id having count(*)=2 limit 1;
  select r.product_id,r.order_allowed_unit_id into strict product,allowed
  from public.qb_product_cost_rules r join public.products p on p.id=r.product_id
  where p.sku like 'QA-papa-%' and r.is_active and p.stock_current>=3 limit 1;
  update public.qb_product_unit_settings set base_sale_price=0.374 where product_id=product;
  perform set_config('request.jwt.claim.sub',actor::text,true);

  for n in 1..3 loop
    select created_order_id into strict order_id_new from public.create_qb_internal_catalog_order(
      'registered',customer,target_sites[1+n%2],null,null,null,null,null,null,null,
      'Reauditoría multisede',jsonb_build_array(jsonb_build_object('product_id',product,
        'allowed_unit_id',allowed,'quantity',1)),gen_random_uuid()::text);
    select id into strict item from public.qb_order_items where order_id=order_id_new;
    perform public.save_qb_matrix_preparation_item(item,0,1,true,null,'prepare-'||gen_random_uuid());
    select updated_at into stamp from public.qb_orders where id=order_id_new;
    perform public.finalize_qb_matrix_preparation(order_id_new,stamp,'prep-'||gen_random_uuid());
    perform public.save_qb_matrix_delivery_origin_with_unit(
      item,0,0,1,true,null,'original',null,1,0,0,0,true,'delivery-'||gen_random_uuid());
    select updated_at into stamp from public.qb_orders where id=order_id_new;
    perform public.confirm_qb_matrix_delivery(order_id_new,stamp,gen_random_uuid()::text);
    orders:=array_append(orders,order_id_new);
  end loop;
  receipt:=public.create_qb_receipt_line_draft(customer,orders);
  perform set_config('qb.line_pricing_write','enabled',true);
  update public.qb_receipt_lines set distance_factor_percent=-10 where receipt_id=receipt;
  select sum(sales) into before_sum from public.get_qb_site_sales_report(d,d)
  where location_id=any(target_sites);
  select coalesce(sum(sales),0) into unattributed_before from public.get_qb_site_sales_report(d,d)
  where location_id is null;
  perform public.emit_qb_receipt(receipt);
  if (select total_amount from public.qb_receipts where id=receipt)<>1.01
    or (select sum(line_total) from public.qb_receipt_lines where receipt_id=receipt)<>1.02 then
    raise exception 'AUDIT_MULTISITE_ROUNDING_FIXTURE';
  end if;
  select sum(sales) into after_sum from public.get_qb_site_sales_report(d,d)
  where location_id=any(target_sites);
  if after_sum is distinct from before_sum+1.01
    or (select coalesce(sum(sales),0) from public.get_qb_site_sales_report(d,d)
      where location_id is null) is distinct from unattributed_before then
    raise exception 'AUDIT_MULTISITE_DISCOUNT_ROUNDING';
  end if;
  raise notice 'A4: recibo multisede de Bs 1,01 tras descuento, suma por sedes exacta pese a Bs 1,02 en líneas redondeadas';
end $$;
rollback;
