\set ON_ERROR_STOP on
begin;
do $$
declare
  v_columns text[];
  v_expected text[] := array[
    'id','preparation_id','order_item_id','product_id','requested_source_label','requested_quantity',
    'requested_base_unit_id','requested_base_unit_symbol','requested_base_quantity','actual_allowed_unit_id',
    'actual_source_kind','actual_source_unit_id','actual_product_presentation_id','actual_source_label',
    'actual_quantity','actual_base_unit_id','actual_base_unit_symbol','actual_base_quantity',
    'conversion_factor_to_base','conversion_snapshot_id','status','notes','created_at','updated_at',
    'preparation_check','prepared_by_line','prepared_at_line','row_version','last_idempotency_key',
    'actual_weight_kg','display_unit_id','prepared_by_name','origin_plan_confirmed',
    'planned_pending_base_quantity','planned_external_base_quantity','planned_review_base_quantity'
  ]::text[];
  v_full text[];
  v_receipt_columns text[];
  v_receipt_prefix text[] := array[
    'id','receipt_id','order_id','order_reference','product_id','product_name_snapshot',
    'product_code_snapshot','category_name_snapshot','delivered_base_quantity','base_unit_symbol',
    'visible_unit_label','order_input_mode','requested_amount_bs','currency_snapshot',
    'pricing_unit_symbol','estimated_base_quantity','fixed_line_amount','base_price_used',
    'final_unit_price','line_total','cost_base_unit_snapshot','notes','created_at'
  ]::text[];
  v_receipt_full text[];
begin
    select array_agg(attname::text order by attnum) into v_columns from pg_attribute
    where attrelid='public.qb_operational_preparation_items'::regclass and attnum>0 and not attisdropped;
    v_full := v_expected || array['actual_weight_value','actual_weight_unit_id','actual_weight_factor_to_kg']::text[];
    if v_columns is distinct from v_full then
      raise exception 'FAIL: operational view columns/order differ from predecessor prefix plus appended measurement fields: %', v_columns;
    end if;
    select array_agg(attname::text order by attnum) into v_receipt_columns from pg_attribute
    where attrelid='public.qb_supervisor_receipt_lines'::regclass and attnum>0 and not attisdropped;
    v_receipt_full := v_receipt_prefix || array[
      'actual_weight_value','actual_weight_unit_id','actual_weight_factor_to_kg','actual_weight_kg',
      'actual_weight_unit_symbol','commercial_quantity_snapshot','commercial_unit_label_snapshot',
      'commercial_conversion_factor_snapshot'
    ]::text[];
    if v_receipt_columns is distinct from v_receipt_full then
      raise exception 'FAIL: supervisor receipt view lost or reordered a predecessor column: %', v_receipt_columns;
    end if;
    if (select format_type(atttypid,atttypmod) from pg_attribute
        where attrelid='public.qb_operational_preparation_items'::regclass and attname='origin_plan_confirmed') <> 'boolean'
      or (select format_type(atttypid,atttypmod) from pg_attribute
        where attrelid='public.qb_operational_preparation_items'::regclass and attname='planned_pending_base_quantity') <> 'numeric'
      or (select format_type(atttypid,atttypmod) from pg_attribute
        where attrelid='public.qb_operational_preparation_items'::regclass and attname='planned_external_base_quantity') <> 'numeric'
      or (select format_type(atttypid,atttypmod) from pg_attribute
        where attrelid='public.qb_operational_preparation_items'::regclass and attname='planned_review_base_quantity') <> 'numeric' then
      raise exception 'FAIL: inherited origin-plan view column types changed';
    end if;
    if (select format_type(atttypid,atttypmod) from pg_attribute
        where attrelid='public.qb_operational_preparation_items'::regclass and attname='actual_weight_value') <> 'numeric(18,6)'
      or (select format_type(atttypid,atttypmod) from pg_attribute
        where attrelid='public.qb_operational_preparation_items'::regclass and attname='actual_weight_unit_id') <> 'uuid'
      or (select format_type(atttypid,atttypmod) from pg_attribute
        where attrelid='public.qb_operational_preparation_items'::regclass and attname='actual_weight_factor_to_kg') <> 'numeric(18,9)' then
      raise exception 'FAIL: appended measurement view column types changed';
    end if;
    if has_table_privilege('anon','public.qb_operational_preparation_items','select')
      or not has_table_privilege('authenticated','public.qb_operational_preparation_items','select') then
      raise exception 'FAIL: operational view grants changed unexpectedly';
    end if;
    if not has_function_privilege('authenticated',
      'public.save_qb_matrix_preparation_origin_with_weight_snapshot(uuid,integer,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,boolean,text)','execute')
      or has_function_privilege('anon',
      'public.save_qb_matrix_preparation_origin_with_weight_snapshot(uuid,integer,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,boolean,text)','execute') then
      raise exception 'FAIL: preparation snapshot RPC privileges are not scoped to authenticated';
    end if;
    if not has_function_privilege('authenticated',
      'public.save_qb_matrix_delivery_origin_with_weight_snapshot(uuid,integer,numeric,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,numeric,boolean,text)','execute')
      or has_function_privilege('anon',
      'public.save_qb_matrix_delivery_origin_with_weight_snapshot(uuid,integer,numeric,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,numeric,boolean,text)','execute') then
      raise exception 'FAIL: delivery snapshot RPC privileges are not scoped to authenticated';
    end if;
    if has_table_privilege('anon','public.qb_supervisor_receipt_lines','select')
      or not has_table_privilege('authenticated','public.qb_supervisor_receipt_lines','select') then
      raise exception 'FAIL: supervisor receipt projection grants changed unexpectedly';
    end if;
    if (select count(*) from pg_constraint where conname in
      ('qb_preparation_weight_snapshot_check','qb_delivery_weight_snapshot_check','qb_receipt_weight_snapshot_check')) <> 3 then
      raise exception 'FAIL: one or more immediate weight-snapshot constraints are missing';
    end if;
    if not exists(select 1 from pg_proc where oid='public.save_qb_matrix_preparation_origin_with_weight_snapshot(uuid,integer,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,boolean,text)'::regprocedure
      and prosecdef and proconfig @> array['search_path=pg_catalog'])
      or not exists(select 1 from pg_proc where oid='public.save_qb_matrix_delivery_origin_with_weight_snapshot(uuid,integer,numeric,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,numeric,boolean,text)'::regprocedure
      and prosecdef and proconfig @> array['search_path=pg_catalog']) then
      raise exception 'FAIL: snapshot RPC security-definer/search_path contract changed';
    end if;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgrelid='public.qb_receipt_lines'::regclass
    and tgname='align_qb_receipt_weight_pricing_unit' and not tgisinternal) then
    raise exception 'FAIL: configured weight-based pricing trigger was unexpectedly removed';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.qb_receipt_lines'::regclass
    and tgname='snapshot_qb_receipt_line_actual_weight' and not tgisinternal) then
    raise exception 'FAIL: receipt measurement snapshot trigger is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.qb_order_items'::regclass
    and tgname='guard_qb_order_item_presentation_snapshot' and not tgisinternal) then
    raise exception 'FAIL: product presentation guard trigger is missing';
  end if;
  if not exists(select 1 from public.qb_order_preparation_items
    where id='90000000-0000-0000-0000-000000000009' and actual_weight_kg=4.25
      and actual_weight_value is null and actual_weight_unit_id is null) then
    raise exception 'FAIL: legacy measurement was backfilled with an invented original unit';
  end if;
end $$;
insert into public.profiles(id,role,is_active,full_name)
values
 ('30000000-0000-0000-0000-000000000001','administrador',true,'Fixture Admin'),
 ('30000000-0000-0000-0000-000000000002','inventario',true,'Fixture Inventory'),
 ('30000000-0000-0000-0000-000000000003','entregador',true,'Fixture Delivery');
select set_config('test.user_id','30000000-0000-0000-0000-000000000001',true);
insert into public.qb_orders(id,customer_account_id,public_reference)
values('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','FIXTURE-ORDER');
insert into public.qb_order_items(id,order_id,product_id,source_kind,base_unit_id,requested_quantity,base_quantity,conversion_factor_to_base,source_label)
values('60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 '70000000-0000-0000-0000-000000000001','universal_unit','20000000-0000-0000-0000-000000000003',8,8,1,'UNIDAD');
insert into public.qb_order_items(id,order_id,product_id,source_kind,base_unit_id,conversion_factor_to_base,source_label)
values('60000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000001',
 '70000000-0000-0000-0000-000000000001','universal_unit','20000000-0000-0000-0000-000000000003',1,'UNIDAD');
update public.qb_order_preparation_items set order_item_id='60000000-0000-0000-0000-000000000005'
where id='90000000-0000-0000-0000-000000000009';
select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000005',0,1,false,null,null,null,false,'original','legacy note',0,0,0,false,'fixture-legacy-weight-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items where order_item_id='60000000-0000-0000-0000-000000000005'
    and actual_weight_kg=4.25 and actual_weight_value is null and actual_weight_unit_id is null) then
    raise exception 'FAIL: saving another field did not preserve a legacy normalized weight';
  end if;
end $$;
select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000005',1,1,false,null,null,null,true,'original','legacy note',0,0,0,false,'fixture-clear-legacy-weight-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items where order_item_id='60000000-0000-0000-0000-000000000005'
    and actual_weight_kg is null and actual_weight_value is null and actual_weight_unit_id is null) then
    raise exception 'FAIL: explicitly clearing a legacy weight did not clear its normalized value';
  end if;
end $$;

select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',0,8,true,12,
 '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','prep initial note',0,0,0,true,'prep-weight-12lb-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items where order_item_id='60000000-0000-0000-0000-000000000001'
    and actual_weight_value=12 and actual_weight_unit_id='20000000-0000-0000-0000-000000000002'
    and actual_weight_factor_to_kg=0.45359237 and actual_weight_kg=5.443108
    and preparation_check and notes='prep initial note' and row_version=1) then
    raise exception 'FAIL: initial 12 LB preparation snapshot/check/note was not persisted';
  end if;
end $$;
-- Edit 12 LB to 10 LB, then change its selected source unit to KG. Each write
-- executes the actual snapshot RPC and must satisfy the immediate CHECK.
select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',1,8,true,10,
 '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','prep edited note',0,0,0,true,'prep-weight-10lb-key'
);
select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',2,8,true,4.535924,
 '20000000-0000-0000-0000-000000000001',1,false,'original','prep edited note',0,0,0,true,'prep-weight-kg-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items where order_item_id='60000000-0000-0000-0000-000000000001'
    and actual_weight_value=4.535924 and actual_weight_unit_id='20000000-0000-0000-0000-000000000001'
    and actual_weight_factor_to_kg=1 and actual_weight_kg=4.535924
    and preparation_check and notes='prep edited note' and origin_plan_confirmed
    and planned_pending_base_quantity=0 and planned_external_base_quantity=0 and planned_review_base_quantity=0
    and row_version=3) then
    raise exception 'FAIL: LB edit/KG selection did not update the complete snapshot atomically';
  end if;
end $$;
select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',3,8,true,null,null,null,true,'original','prep edited note',0,0,0,true,'prep-weight-clear-key'
);
select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',4,8,true,12,
 '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','prep measurement note',0,0,0,true,'prep-weight-note-base-key'
);
select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',5,8,true,null,null,null,false,'original','note changed only',0,0,0,true,'prep-note-only-key'
);
-- Same idempotency key with a different payload must replay the saved row and
-- restore the snapshot that was temporarily cleared for the delegated RPC.
select public.save_qb_matrix_preparation_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',5,7,false,99,
 '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','must not replace saved note',0,0,0,false,'prep-note-only-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items where order_item_id='60000000-0000-0000-0000-000000000001'
    and actual_weight_value=12 and actual_weight_unit_id='20000000-0000-0000-0000-000000000002'
    and actual_weight_factor_to_kg=0.45359237 and actual_weight_kg=5.443108
    and preparation_check and notes='note changed only' and origin_plan_confirmed
    and planned_pending_base_quantity=0 and planned_external_base_quantity=0 and planned_review_base_quantity=0
    and row_version=6) then
    raise exception 'FAIL: note-only or replay request changed the saved weight/check/note';
  end if;
  begin
    perform public.save_qb_matrix_preparation_origin_with_weight_snapshot(
      '60000000-0000-0000-0000-000000000001',5,7,false,9,
      '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','stale payload',0,0,0,false,'prep-stale-version-key'
    );
    raise exception 'FAIL: stale preparation version was accepted';
  exception when sqlstate '40001' then null;
  end;
  if not exists(select 1 from public.qb_order_preparation_items where order_item_id='60000000-0000-0000-0000-000000000001'
    and actual_weight_value=12 and actual_weight_unit_id='20000000-0000-0000-0000-000000000002'
    and actual_weight_factor_to_kg=0.45359237 and actual_weight_kg=5.443108
    and preparation_check and notes='note changed only' and origin_plan_confirmed and row_version=6) then
    raise exception 'FAIL: stale preparation request partially changed the measurement tuple';
  end if;
end $$;

-- The real delivery RPC requires a prepared order/preparation. Represent the
-- completed preparation transition before exercising delivery saves.
update public.qb_order_preparations set status='preparado'
where order_id='40000000-0000-0000-0000-000000000001';
update public.qb_orders set status='preparado'
where id='40000000-0000-0000-0000-000000000001';
select set_config('test.user_id','30000000-0000-0000-0000-000000000003',true);
select public.save_qb_matrix_delivery_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',0,0,8,true,12,
 '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','delivery initial note',
 0,0,8,0,true,'delivery-weight-12lb-key'
);
select public.save_qb_matrix_delivery_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',1,0,8,true,10,
 '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','delivery edited note',
 0,0,8,0,true,'delivery-weight-10lb-key'
);
select public.save_qb_matrix_delivery_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',2,0,8,true,4.535924,
 '20000000-0000-0000-0000-000000000001',1,false,'original','delivery edited note',
 0,0,8,0,true,'delivery-weight-kg-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_delivery_items where order_item_id='60000000-0000-0000-0000-000000000001'
    and actual_weight_value=4.535924 and actual_weight_unit_id='20000000-0000-0000-0000-000000000001'
    and actual_weight_factor_to_kg=1 and actual_weight_kg=4.535924
    and delivery_check and delivery_note='delivery edited note' and row_version=3) then
    raise exception 'FAIL: delivery LB edit/KG selection did not update atomically';
  end if;
end $$;
select public.save_qb_matrix_delivery_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',3,0,8,true,null,null,null,true,'original','delivery edited note',
 0,0,8,0,true,'delivery-weight-clear-key'
);
select public.save_qb_matrix_delivery_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',4,0,8,true,12,
 '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','delivery measurement note',
 0,0,8,0,true,'delivery-weight-note-base-key'
);
select public.save_qb_matrix_delivery_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',5,0,8,true,null,null,null,false,'original','delivery note only',
 0,0,8,0,true,'delivery-note-only-key'
);
select public.save_qb_matrix_delivery_origin_with_weight_snapshot(
 '60000000-0000-0000-0000-000000000001',5,0,7,false,99,
 '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','must not replace saved delivery note',
 0,0,7,0,true,'delivery-note-only-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_delivery_items where order_item_id='60000000-0000-0000-0000-000000000001'
    and actual_weight_value=12 and actual_weight_unit_id='20000000-0000-0000-0000-000000000002'
    and actual_weight_factor_to_kg=0.45359237 and actual_weight_kg=5.443108
    and delivery_check and delivery_note='delivery note only' and source_origin_confirmed
    and warehouse_used_base_quantity=0 and pending_incoming_base_quantity=0
    and external_definitive_base_quantity=8 and origin_review_base_quantity=0 and row_version=6) then
    raise exception 'FAIL: note-only or replay delivery request changed the saved measurement';
  end if;
  begin
    perform public.save_qb_matrix_delivery_origin_with_weight_snapshot(
      '60000000-0000-0000-0000-000000000001',5,0,7,false,9,
      '20000000-0000-0000-0000-000000000002',0.45359237,false,'original','stale delivery payload',
      0,0,7,0,true,'delivery-stale-version-key'
    );
    raise exception 'FAIL: stale delivery version was accepted';
  exception when sqlstate '40001' then null;
  end;
  if not exists(select 1 from public.qb_order_delivery_items where order_item_id='60000000-0000-0000-0000-000000000001'
    and actual_weight_value=12 and actual_weight_unit_id='20000000-0000-0000-0000-000000000002'
    and actual_weight_factor_to_kg=0.45359237 and actual_weight_kg=5.443108
    and delivery_check and delivery_note='delivery note only' and source_origin_confirmed and row_version=6) then
    raise exception 'FAIL: stale delivery request partially changed the measurement tuple';
  end if;
end $$;
select set_config('test.user_id','30000000-0000-0000-0000-000000000001',true);

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

insert into public.qb_receipt_lines(id,order_id,preparation_item_id,delivered_base_quantity,base_unit_symbol,visible_unit_label,actual_weight_kg)
values('a0000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 (select id from public.qb_order_preparation_items where order_item_id='60000000-0000-0000-0000-000000000001'),
 8,'UNIDAD','8 UNIDADES',5.443108);
do $$ begin
  if not exists(select 1 from public.qb_receipt_lines where id='a0000000-0000-0000-0000-000000000001'
    and actual_weight_value=12 and actual_weight_unit_id='20000000-0000-0000-0000-000000000002'
    and actual_weight_factor_to_kg=0.45359237 and actual_weight_kg=5.443108) then
    raise exception 'FAIL: receipt did not snapshot delivered measurement';
  end if;
  if not exists(select 1 from public.qb_receipt_lines where id='a0000000-0000-0000-0000-000000000001'
    and delivered_base_quantity=5.443108 and visible_unit_label='KG'
    and commercial_quantity_snapshot=8 and commercial_unit_label_snapshot='UNIDAD'
    and commercial_conversion_factor_snapshot=1) then
    raise exception 'FAIL: receipt did not keep commercial quantity separate from weight-based pricing quantity';
  end if;
  if not exists(select 1 from public.qb_supervisor_receipt_lines where id='a0000000-0000-0000-0000-000000000001'
    and actual_weight_unit_symbol='LB') then
    raise exception 'FAIL: operational receipt projection omitted weight unit';
  end if;
end $$;
rollback;
