-- Run only against the local Supabase test database, never Production.
-- Every fixture and movement is rolled back at the end.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

do $$
declare
  v_user uuid := gen_random_uuid();
  v_product uuid;
  v_base_unit uuid;
  v_base_symbol text;
  v_base_factor numeric;
  v_dimension uuid;
  v_dimension_code text;
  v_kg_mapping uuid;
  v_arroba uuid;
  v_arroba_factor numeric;
  v_arroba_mapping uuid;
  v_receipt uuid;
  v_line uuid;
  v_updated_at timestamptz;
  v_stock_before numeric;
  v_stock_after numeric;
  v_movement_count integer;
  v_lot_count integer;
  v_failed boolean;
  v_factor numeric;
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
  values (v_user, 'authenticated', 'authenticated', 'phase1-purchase-test@local.invalid', now(), '{}'::jsonb, '{}'::jsonb);
  insert into public.profiles(id, full_name, role, is_active) values (v_user, 'QA Compra Fase 1', 'administrador', true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  select product.id, unit.id, unit.symbol, unit.conversion_factor_to_base,
         unit.dimension_id, dimension.code
    into v_product, v_base_unit, v_base_symbol, v_base_factor, v_dimension, v_dimension_code
    from public.products product
    join public.qb_product_unit_settings settings on settings.product_id = product.id
    join public.qb_units unit on unit.id = coalesce(settings.base_inventory_unit_id, settings.inventory_unit_id, settings.base_unit_id)
    join public.qb_unit_dimensions dimension on dimension.id = unit.dimension_id
   where product.is_active and unit.is_active and upper(unit.symbol) = 'KG'
   order by product.id limit 1;
  if v_product is null then raise exception 'No hay producto ficticio/local parametrizado en KG para la prueba.'; end if;

  -- 3 commercial loads × Bs 600: save exactly as a draft, no assumed weight.
  v_receipt := public.create_qb_warehouse_purchase_draft(
    current_date, v_product, null, 'commercial_unmeasured', null, null, 'CARGA',
    3, v_base_unit, v_base_symbol, 0, 0, 600, 1800, null, null, null,
    'prueba local transaccional', v_dimension_code, jsonb_build_object('commercial_label','CARGA'));
  select id, updated_at into v_line, v_updated_at from public.qb_merchandise_receipt_lines where receipt_id = v_receipt;
  if v_line is null then raise exception 'El borrador CARGA no persistió su línea.'; end if;
  if not exists (select 1 from public.qb_merchandise_receipt_lines where id = v_line
      and source_kind = 'commercial_unmeasured' and source_label = 'CARGA'
      and source_quantity = 3 and unit_cost = 600 and total_cost = 1800
      and base_quantity = 0 and conversion_factor_to_base = 0 and not actual_base_quantity_recorded) then
    raise exception 'El borrador CARGA no conserva cantidad, costo o ausencia de equivalencia.';
  end if;

  -- Record 75 physical kg independently, still preserving the commercial Bs 1,800.
  perform public.update_qb_warehouse_purchase_draft(v_line, v_updated_at, 3, 600, null,
    'CARGA', null, null, null, 'prueba local transaccional', 75, v_base_unit);
  select updated_at into v_updated_at from public.qb_merchandise_receipt_lines where id = v_line;
  if not exists (select 1 from public.qb_merchandise_receipt_lines where id = v_line
      and source_quantity = 3 and total_cost = 1800 and source_label = 'CARGA'
      and base_quantity = 75 and actual_base_quantity_recorded) then
    raise exception 'La cantidad efectiva no quedó separada de la compra comercial.';
  end if;

  -- A stale editor must receive a conflict instead of overwriting the row.
  v_failed := false;
  begin
    perform public.update_qb_warehouse_purchase_draft(v_line, v_updated_at - interval '1 second', 4, 600,
      null, 'CARGA', null, null, null, 'edición obsoleta', 75, v_base_unit);
  exception when others then
    if position('QB_PURCHASE_ROW_CONFLICT' in sqlerrm) > 0 then v_failed := true; else raise; end if;
  end;
  if not v_failed then raise exception 'La edición concurrente obsoleta no fue rechazada.'; end if;

  select stock_current into v_stock_before from public.products where id = v_product;
  perform public.confirm_qb_warehouse_purchase_draft(v_receipt);
  perform public.confirm_qb_warehouse_purchase_draft(v_receipt);
  select stock_current into v_stock_after from public.products where id = v_product;
  select count(*) into v_movement_count from public.qb_merchandise_receipt_movements where receipt_id = v_receipt;
  select count(*) into v_lot_count from public.inventory_lots lot
    join public.qb_merchandise_receipt_movements movement on movement.id = lot.source_receipt_movement_id
   where movement.receipt_id = v_receipt;
  if v_stock_after <> v_stock_before + 75 or v_movement_count <> 1 or v_lot_count <> 1 then
    raise exception 'Confirmación repetida alteró stock/movimientos/lotes más de una vez.';
  end if;

  -- A confirmed line is not editable through the draft RPC.
  v_failed := false;
  begin
    perform public.update_qb_warehouse_purchase_draft(v_line, v_updated_at, 3, 600,
      null, 'CARGA', null, null, null, 'edición confirmada', 75, v_base_unit);
  exception when others then
    if position('Solo se editan compras borrador' in sqlerrm) > 0 then v_failed := true; else raise; end if;
  end;
  if not v_failed then raise exception 'La edición de compra confirmada no fue bloqueada.'; end if;

  -- Standard KG and configured arroba conversions are checked against their actual unit factors.
  insert into public.qb_product_allowed_units(product_id, usage_context, unit_id, created_by, updated_by)
  values (v_product, 'recepcion', v_base_unit, v_user, v_user) returning id into v_kg_mapping;
  v_receipt := public.create_qb_warehouse_purchase_draft(current_date, v_product, v_kg_mapping,
    'universal_unit', v_base_unit, null, v_base_symbol, 2, v_base_unit, v_base_symbol,
    round(2 * v_base_factor / v_base_factor, 6), round(v_base_factor / v_base_factor, 9),
    10, 20, null, null, null, 'prueba kg', v_dimension_code, '{}'::jsonb);
  if not exists (select 1 from public.qb_merchandise_receipt_lines where receipt_id = v_receipt and base_quantity = 2) then
    raise exception 'La compra por KG no convirtió con la unidad configurada.';
  end if;
  select id, conversion_factor_to_base into v_arroba, v_arroba_factor
    from public.qb_units where is_active and dimension_id = v_dimension
      and lower(name || ' ' || symbol) like '%arroba%' order by conversion_factor_to_base desc limit 1;
  if v_arroba is null then raise exception 'No hay unidad arroba compatible configurada para la prueba.'; end if;
  insert into public.qb_product_allowed_units(product_id, usage_context, unit_id, created_by, updated_by)
  values (v_product, 'recepcion', v_arroba, v_user, v_user) returning id into v_arroba_mapping;
  v_factor := round(v_arroba_factor / v_base_factor, 9);
  v_receipt := public.create_qb_warehouse_purchase_draft(current_date, v_product, v_arroba_mapping,
    'universal_unit', v_arroba, null, 'ARROBA', 2, v_base_unit, v_base_symbol,
    round(2 * v_factor, 6), v_factor, 15, 30, null, null, null, 'prueba arroba', v_dimension_code, '{}'::jsonb);
  if not exists (select 1 from public.qb_merchandise_receipt_lines where receipt_id = v_receipt
      and base_quantity = round(2 * v_factor, 6) and total_cost = 30) then
    raise exception 'La compra por arroba no utilizó el factor configurado.';
  end if;

  -- Draft cancellation is audited, repeat-safe, and creates no stock movement.
  v_receipt := public.create_qb_warehouse_purchase_draft(current_date, v_product, null,
    'commercial_unmeasured', null, null, 'CHIPA', 1, v_base_unit, v_base_symbol,
    0, 0, 5, 5, null, null, null, 'borrador para anular', v_dimension_code, '{}'::jsonb);
  perform public.annul_qb_warehouse_purchase_draft(v_receipt, 'Prueba de anulación local.');
  perform public.annul_qb_warehouse_purchase_draft(v_receipt, 'Prueba de anulación local.');
  if not exists (select 1 from public.qb_merchandise_receipts where id = v_receipt and status = 'anulado')
    or exists (select 1 from public.qb_merchandise_receipt_movements where receipt_id = v_receipt) then
    raise exception 'La anulación del borrador no fue consistente/idempotente.';
  end if;
  raise notice 'PASS: CARGA draft, effective KG, stale edit conflict, confirmed edit block, idempotent stock/FIFO, KG/ar arroba conversion, draft annulment.';
end;
$$;

rollback;
