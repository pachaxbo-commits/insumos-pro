\set ON_ERROR_STOP on
begin;
do $$ begin
  if exists(select 1 from pg_trigger where tgrelid='public.qb_receipt_lines'::regclass
    and tgname='align_qb_receipt_weight_pricing_unit' and not tgisinternal) then
    raise exception 'FAIL: legacy trigger that conflates commercial quantity and weight is still active';
  end if;
  if not exists(select 1 from public.qb_order_preparation_items
    where id='90000000-0000-0000-0000-000000000009' and actual_weight_kg=4.25
      and actual_weight_value is null and actual_weight_unit_id is null) then
    raise exception 'FAIL: legacy measurement was backfilled with an invented original unit';
  end if;
end $$;
insert into public.profiles(id,role,is_active,full_name)
values('30000000-0000-0000-0000-000000000001','administrador',true,'Fixture Admin');
select set_config('test.user_id','30000000-0000-0000-0000-000000000001',true);
insert into public.qb_orders(id,customer_account_id,public_reference)
values('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','FIXTURE-ORDER');
insert into public.qb_order_items(id,order_id,product_id,source_kind,base_unit_id,conversion_factor_to_base,source_label)
values('60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 '70000000-0000-0000-0000-000000000001','universal_unit','20000000-0000-0000-0000-000000000003',1,'UNIDAD');

select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',0,8,true,12,
 '20000000-0000-0000-0000-000000000002',0.45359237,'original','fixture note',0,0,0,false,'fixture-preparation-weight-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items where order_item_id='60000000-0000-0000-0000-000000000001'
    and actual_weight_value=12 and actual_weight_unit_id='20000000-0000-0000-0000-000000000002'
    and actual_weight_factor_to_kg=0.45359237 and actual_weight_kg=5.443108) then
    raise exception 'FAIL: 12 LB did not persist independently from normalized KG';
  end if;
end $$;

select public.save_qb_matrix_delivery_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',0,0,8,true,12,
 '20000000-0000-0000-0000-000000000002',0.45359237,'original','fixture delivery note',
 0,0,8,0,true,'fixture-delivery-weight-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_delivery_items where order_item_id='60000000-0000-0000-0000-000000000001'
    and actual_weight_value=12 and actual_weight_unit_id='20000000-0000-0000-0000-000000000002'
    and actual_weight_factor_to_kg=0.45359237 and actual_weight_kg=5.443108) then
    raise exception 'FAIL: delivery original weight unit was not persisted';
  end if;
end $$;

insert into public.qb_product_presentations(id,product_id,symbol,base_unit_id,conversion_factor_to_base)
values
 ('80000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','UNIDAD','20000000-0000-0000-0000-000000000003',1),
 ('80000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','CUARTILLA','20000000-0000-0000-0000-000000000001',1);
insert into public.qb_order_items(id,order_id,product_id,source_kind,product_presentation_id,requested_quantity,base_quantity,base_unit_id,conversion_factor_to_base,source_label)
values('60000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001',
 '70000000-0000-0000-0000-000000000001','product_presentation','80000000-0000-0000-0000-000000000001',
 1,1,'20000000-0000-0000-0000-000000000003',1,'UNIDAD');
-- Explicit product-specific cross-dimension mappings remain valid when their
-- configured factor and snapshot agree exactly.
insert into public.qb_product_presentations(id,product_id,symbol,base_unit_id,conversion_factor_to_base)
values('80000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001',
 'CAJA','20000000-0000-0000-0000-000000000001',0.25);
insert into public.qb_order_items(id,order_id,product_id,source_kind,product_presentation_id,requested_quantity,base_quantity,
 base_unit_id,conversion_factor_to_base,source_label)
values('60000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000001',
 '70000000-0000-0000-0000-000000000001','product_presentation','80000000-0000-0000-0000-000000000003',
 4,1,'20000000-0000-0000-0000-000000000001',0.25,'CAJA');
do $$ begin
  begin
    insert into public.qb_order_items(id,order_id,product_id,source_kind,product_presentation_id,requested_quantity,base_quantity,base_unit_id,conversion_factor_to_base,source_label)
    values('60000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001',
     '70000000-0000-0000-0000-000000000001','product_presentation','80000000-0000-0000-0000-000000000002',
     2,2,'20000000-0000-0000-0000-000000000003',1,'CUARTILLA');
    raise exception 'FAIL: stale presentation base-unit snapshot was accepted';
  exception when others then
    if sqlerrm = 'FAIL: stale presentation base-unit snapshot was accepted' then raise; end if;
    if sqlerrm not like '%no coincide con su configuración vigente%' then raise; end if;
  end;
end $$;

insert into public.qb_order_preparation_items(id,order_item_id,actual_weight_kg,actual_weight_value,actual_weight_unit_id,actual_weight_factor_to_kg)
values('90000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',5.443108,12,
 '20000000-0000-0000-0000-000000000002',0.45359237);
insert into public.qb_receipt_lines(id,order_id,preparation_item_id,delivered_base_quantity,base_unit_symbol,visible_unit_label,actual_weight_kg)
values('a0000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 '90000000-0000-0000-0000-000000000001',8,'UNIDAD','8 UNIDADES',5.443108);
do $$ begin
  if not exists(select 1 from public.qb_receipt_lines where id='a0000000-0000-0000-0000-000000000001'
    and actual_weight_value=12 and actual_weight_unit_id='20000000-0000-0000-0000-000000000002'
    and actual_weight_factor_to_kg=0.45359237 and actual_weight_kg=5.443108) then
    raise exception 'FAIL: receipt did not snapshot delivered measurement';
  end if;
  if not exists(select 1 from public.qb_receipt_lines where id='a0000000-0000-0000-0000-000000000001'
    and delivered_base_quantity=8 and base_unit_symbol='UNIDAD' and visible_unit_label='8 UNIDADES') then
    raise exception 'FAIL: measured weight changed the commercial receipt quantity or unit';
  end if;
  if not exists(select 1 from public.qb_supervisor_receipt_lines where id='a0000000-0000-0000-0000-000000000001'
    and actual_weight_unit_symbol='LB') then
    raise exception 'FAIL: operational receipt projection omitted weight unit';
  end if;
end $$;
rollback;
