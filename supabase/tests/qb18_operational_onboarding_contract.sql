begin;

do $$
declare
  v_admin uuid;
  v_price_product uuid;
  v_stock_product uuid;
  v_base_unit uuid;
  v_old_price numeric;
  v_old_stock numeric;
  v_allowed uuid;
  v_orders bigint;
  v_receipts bigint;
  v_movements bigint;
  v_result jsonb;
begin
  select id into v_admin from public.profiles where role in ('admin','administrador') and is_active order by id limit 1;
  if v_admin is null then raise exception 'QA_ADMIN_REQUIRED'; end if;
  perform pg_catalog.set_config('request.jwt.claims',pg_catalog.jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);

  select p.id,s.base_sale_price into v_price_product,v_old_price
  from public.products p join public.qb_product_unit_settings s on s.product_id=p.id
  where p.is_active and s.is_qb_active and s.supports_amount_bs and s.base_sale_price is null order by p.id limit 1;
  select p.id,coalesce(s.base_inventory_unit_id,s.inventory_unit_id,s.base_unit_id),p.stock_current
  into v_stock_product,v_base_unit,v_old_stock
  from public.products p join public.qb_product_unit_settings s on s.product_id=p.id
  where p.is_active and s.is_qb_active and not s.is_classifiable order by p.id limit 1;
  if v_price_product is null or v_stock_product is null then raise exception 'QA_FIXTURE_REQUIRED'; end if;

  select count(*) into v_orders from public.qb_orders;
  select count(*) into v_receipts from public.qb_receipts;
  select count(*) into v_movements from public.inventory_movements;

  -- A/B/C/I: one backed product, positive price and QB-17 activation path.
  v_result:=public.apply_qb_operational_import('prices',repeat('a',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_price_product,'expected_price',v_old_price,'new_price',12.34)),'APLICAR');
  if v_result->>'status'<>'applied' then raise exception 'QA_PRICE_NOT_APPLIED'; end if;

  -- D/E: zero and negative are rejected atomically.
  begin perform public.apply_qb_operational_import('prices',repeat('b',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_price_product,'expected_price',12.34,'new_price',0)),'APLICAR'); raise exception 'QA_ZERO_ACCEPTED'; exception when others then if sqlerrm='QA_ZERO_ACCEPTED' then raise; end if; end;
  begin perform public.apply_qb_operational_import('prices',repeat('c',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_price_product,'expected_price',12.34,'new_price',-1)),'APLICAR'); raise exception 'QA_NEGATIVE_ACCEPTED'; exception when others then if sqlerrm='QA_NEGATIVE_ACCEPTED' then raise; end if; end;

  -- F/H: unknown product and stale expected value rejected.
  begin perform public.apply_qb_operational_import('prices',repeat('d',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',extensions.gen_random_uuid(),'expected_price',null,'new_price',1)),'APLICAR'); raise exception 'QA_UNKNOWN_ACCEPTED'; exception when others then if sqlerrm='QA_UNKNOWN_ACCEPTED' then raise; end if; end;
  begin perform public.apply_qb_operational_import('prices',repeat('e',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_price_product,'expected_price',null,'new_price',1)),'APLICAR'); raise exception 'QA_STALE_ACCEPTED'; exception when others then if sqlerrm='QA_STALE_ACCEPTED' then raise; end if; end;

  -- J: public catalog result has availability only, never the internal price.
  if pg_catalog.pg_get_function_result('public.get_qb17_public_catalog()'::regprocedure) like '%base_sale_price%' then raise exception 'QA_PUBLIC_PRICE_EXPOSED'; end if;
  -- K: same applied batch cannot run twice.
  begin perform public.apply_qb_operational_import('prices',repeat('a',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_price_product,'expected_price',12.34,'new_price',12.35)),'APLICAR'); raise exception 'QA_PRICE_REAPPLIED'; exception when others then if sqlerrm='QA_PRICE_REAPPLIED' then raise; end if; end;

  -- L: exact existing base unit factor creates one receiving relation.
  v_result:=public.apply_qb_operational_import('conversions',repeat('f',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'target_kind','unit','target_id',v_base_unit,'new_factor',1)),'APLICAR');
  select id into v_allowed from public.qb_product_allowed_units where product_id=v_stock_product and usage_context='recepcion' and unit_id=v_base_unit and is_active;
  if v_allowed is null then raise exception 'QA_CONVERSION_NOT_APPLIED'; end if;
  -- M/N/O: invalid factor, unknown target and ambiguous kind rejected.
  begin perform public.apply_qb_operational_import('conversions',repeat('1',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'target_kind','unit','target_id',v_base_unit,'new_factor',0)),'APLICAR'); raise exception 'QA_FACTOR_ZERO_ACCEPTED'; exception when others then if sqlerrm='QA_FACTOR_ZERO_ACCEPTED' then raise; end if; end;
  begin perform public.apply_qb_operational_import('conversions',repeat('2',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'target_kind','unit','target_id',extensions.gen_random_uuid(),'new_factor',1)),'APLICAR'); raise exception 'QA_UNKNOWN_UNIT_ACCEPTED'; exception when others then if sqlerrm='QA_UNKNOWN_UNIT_ACCEPTED' then raise; end if; end;
  begin perform public.apply_qb_operational_import('conversions',repeat('3',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'target_kind','other','target_id',v_base_unit,'new_factor',1)),'APLICAR'); raise exception 'QA_AMBIGUOUS_ACCEPTED'; exception when others then if sqlerrm='QA_AMBIGUOUS_ACCEPTED' then raise; end if; end;
  -- P/Q/R: conversion changes neither stock nor movements and is idempotent.
  if (select stock_current from public.products where id=v_stock_product) is distinct from v_old_stock or (select count(*) from public.inventory_movements)<>v_movements then raise exception 'QA_CONVERSION_CHANGED_STOCK'; end if;
  begin perform public.apply_qb_operational_import('conversions',repeat('f',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'target_kind','unit','target_id',v_base_unit,'new_factor',1)),'APLICAR'); raise exception 'QA_CONVERSION_REAPPLIED'; exception when others then if sqlerrm='QA_CONVERSION_REAPPLIED' then raise; end if; end;

  -- T/U/V: missing date, negative quantity and missing relation are rejected.
  begin perform public.apply_qb_operational_import('initial_stock',repeat('4',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'allowed_unit_id',v_allowed,'initial_quantity',1,'cutoff_date','')),'APLICAR'); raise exception 'QA_DATE_MISSING_ACCEPTED'; exception when others then if sqlerrm='QA_DATE_MISSING_ACCEPTED' then raise; end if; end;
  begin perform public.apply_qb_operational_import('initial_stock',repeat('5',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'allowed_unit_id',v_allowed,'initial_quantity',-1,'cutoff_date',current_date)),'APLICAR'); raise exception 'QA_NEGATIVE_STOCK_ACCEPTED'; exception when others then if sqlerrm='QA_NEGATIVE_STOCK_ACCEPTED' then raise; end if; end;
  begin perform public.apply_qb_operational_import('initial_stock',repeat('6',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'allowed_unit_id',extensions.gen_random_uuid(),'initial_quantity',1,'cutoff_date',current_date)),'APLICAR'); raise exception 'QA_RELATION_MISSING_ACCEPTED'; exception when others then if sqlerrm='QA_RELATION_MISSING_ACCEPTED' then raise; end if; end;

  -- W/X: opening receipt and normal movement increase stock.
  v_result:=public.apply_qb_operational_import('initial_stock',repeat('7',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'allowed_unit_id',v_allowed,'initial_quantity',1,'cutoff_date',current_date)),'APLICAR');
  if v_result->>'receipt_id' is null or (select stock_current from public.products where id=v_stock_product)<=v_old_stock or (select count(*) from public.inventory_movements)<>v_movements+1 then raise exception 'QA_OPENING_RECEIPT_FAILED'; end if;
  -- Y: second stock application blocked.
  begin perform public.apply_qb_operational_import('initial_stock',repeat('7',64),pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('product_id',v_stock_product,'allowed_unit_id',v_allowed,'initial_quantity',1,'cutoff_date',current_date)),'APLICAR'); raise exception 'QA_STOCK_REAPPLIED'; exception when others then if sqlerrm='QA_STOCK_REAPPLIED' then raise; end if; end;
  -- Z: no orders or billing receipts changed.
  if (select count(*) from public.qb_orders)<>v_orders or (select count(*) from public.qb_receipts)<>v_receipts then raise exception 'QA_ORDERS_OR_RECEIPTS_CHANGED'; end if;
  raise notice 'QB18 QA A-Z PASSED; ROLLBACK follows.';
end;
$$;

rollback;
