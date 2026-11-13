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
    'planned_pending_base_quantity','planned_external_base_quantity','planned_review_base_quantity',
    'actual_weight_value','actual_weight_unit_id','actual_weight_factor_to_kg',
    'auto_completed_before_quantity'
  ]::text[];
begin
  select array_agg(attname::text order by attnum) into v_columns from pg_attribute
    where attrelid='public.qb_operational_preparation_items'::regclass and attnum>0 and not attisdropped;
  if v_columns is distinct from v_expected then
    raise exception 'FAIL: preparation view prefix/order changed when adding the reset marker: %',v_columns;
  end if;
  if not has_function_privilege('authenticated',
      'public.save_qb_matrix_preparation_with_check_reset(uuid,integer,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,boolean,boolean,boolean,text)','execute')
    or has_function_privilege('anon',
      'public.save_qb_matrix_preparation_with_check_reset(uuid,integer,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,boolean,boolean,boolean,text)','execute')
    or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
      where p.oid='public.save_qb_matrix_preparation_with_check_reset(uuid,integer,numeric,boolean,numeric,uuid,numeric,boolean,text,text,numeric,numeric,numeric,boolean,boolean,boolean,text)'::regprocedure
        and x.grantee=0 and x.privilege_type='EXECUTE') then
    raise exception 'FAIL: preparation reset RPC grants are not restricted to authenticated.';
  end if;
end $$;

insert into public.profiles(id,role,is_active,full_name) values
 ('31000000-0000-0000-0000-000000000001','inventario',true,'Fixture Inventory');
insert into public.qb_orders(id,customer_account_id,public_reference)
values('41000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001','CHECK-RESET-FIXTURE');
insert into public.qb_order_items(id,order_id,product_id,source_kind,base_unit_id,
  requested_quantity,base_quantity,conversion_factor_to_base,source_label)
values('61000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000001','universal_unit',
  '20000000-0000-0000-0000-000000000003',20,20,1,'UNIDAD');

select set_config('test.user_id','31000000-0000-0000-0000-000000000001',true);

-- Checking an empty line is the only path that records the pre-check value.
select public.save_qb_matrix_preparation_with_check_reset(
 '61000000-0000-0000-0000-000000000001',0,20,true,null,null,null,false,'original','',0,0,0,false,true,false,'check-autofill-first-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items
    where order_item_id='61000000-0000-0000-0000-000000000001'
      and actual_quantity=20 and actual_base_quantity=20 and preparation_check
      and auto_completed_before_quantity=0 and row_version=1) then
    raise exception 'FAIL: auto-fill marker or checked state was not saved';
  end if;
end $$;

-- Idempotent replay must not duplicate an audit or lose the persisted marker.
select public.save_qb_matrix_preparation_with_check_reset(
 '61000000-0000-0000-0000-000000000001',0,20,true,null,null,null,false,'original','',0,0,0,false,true,false,'check-autofill-first-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items
    where order_item_id='61000000-0000-0000-0000-000000000001'
      and actual_quantity=20 and preparation_check and auto_completed_before_quantity=0 and row_version=1) then
    raise exception 'FAIL: replay changed the prepared row or its reset marker';
  end if;
end $$;

-- Unchecking after reload passes the persisted marker intent, restoring zero.
select public.save_qb_matrix_preparation_with_check_reset(
 '61000000-0000-0000-0000-000000000001',1,20,false,null,null,null,false,'original','',0,0,0,false,false,true,'check-reset-zero-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items
    where order_item_id='61000000-0000-0000-0000-000000000001'
      and actual_quantity=0 and actual_base_quantity=0 and not preparation_check
      and auto_completed_before_quantity is null and row_version=2 and notes is null) then
    raise exception 'FAIL: unchecking did not restore zero and clear auto-fill provenance';
  end if;
end $$;

-- A manually entered partial amount is never treated as check-generated.
select public.save_qb_matrix_preparation_with_check_reset(
 '61000000-0000-0000-0000-000000000001',2,8,false,null,null,null,false,'original','manual quantity',0,0,0,false,false,false,'manual-partial-key'
);
select public.save_qb_matrix_preparation_with_check_reset(
 '61000000-0000-0000-0000-000000000001',3,8,true,null,null,null,false,'original','manual quantity',0,0,0,false,false,false,'manual-check-key'
);
select public.save_qb_matrix_preparation_with_check_reset(
 '61000000-0000-0000-0000-000000000001',4,8,false,null,null,null,false,'original','manual quantity',0,0,0,false,false,true,'manual-uncheck-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items
    where order_item_id='61000000-0000-0000-0000-000000000001'
      and actual_quantity=8 and actual_base_quantity=8 and not preparation_check
      and auto_completed_before_quantity is null and row_version=5 and notes='manual quantity') then
    raise exception 'FAIL: manual quantity or its note was destroyed by unchecking';
  end if;
end $$;

-- The existing preparation RPC persists a line-level source plan independently
-- from its commercially measured quantity and check state.
select public.save_qb_matrix_preparation_with_check_reset(
 '61000000-0000-0000-0000-000000000001',5,8,true,null,null,null,false,'original','manual quantity',12,0,0,true,false,false,'prep-origin-plan-key'
);
do $$ begin
  if not exists(select 1 from public.qb_order_preparation_items
    where order_item_id='61000000-0000-0000-0000-000000000001'
      and actual_quantity=8 and actual_base_quantity=8 and preparation_check
      and origin_plan_confirmed and planned_pending_base_quantity=12
      and planned_external_base_quantity=0 and planned_review_base_quantity=0
      and row_version=6 and notes='manual quantity') then
    raise exception 'FAIL: preparation origin plan was not persisted with the line, quantity, check and note intact';
  end if;
end $$;

-- A stale version is rejected without changing quantity, check, plan, or note.
do $$ begin
  begin
    perform public.save_qb_matrix_preparation_with_check_reset(
      '61000000-0000-0000-0000-000000000001',5,20,true,null,null,null,false,'original','stale',0,0,0,false,true,false,'check-reset-stale-key'
    );
    raise exception 'FAIL: stale preparation version was accepted';
  exception when sqlstate '40001' then null;
  end;
  if not exists(select 1 from public.qb_order_preparation_items
    where order_item_id='61000000-0000-0000-0000-000000000001'
      and actual_quantity=8 and preparation_check and auto_completed_before_quantity is null
      and row_version=6 and origin_plan_confirmed and planned_pending_base_quantity=12
      and notes='manual quantity') then
    raise exception 'FAIL: stale request partially changed preparation state';
  end if;
end $$;

rollback;
