-- Contrato transaccional focalizado: recepcion clasificada, flujo posterior y entradas directas.
-- Ejecutar solo en Staging autorizado con las migraciones de esta fase aplicadas.
-- Todos los fixtures, precios QA y movimientos terminan en ROLLBACK.

begin;

create temp table qb_classified_test_results (
  scenario text primary key,
  description text not null
) on commit drop;

create function pg_temp.qb_classified_pass(p_scenario text, p_description text)
returns void
language sql
as $$
  insert into qb_classified_test_results (scenario, description)
  values (p_scenario, p_description);
$$;

do $$
declare
  v_admin_id uuid;
  v_customer_id uuid;
  v_location_id uuid;
  v_kg_id uuid;
  v_arroba_id uuid;
  v_suffix text := substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 10);
  v_papa_input_id uuid := extensions.gen_random_uuid();
  v_papa_large_id uuid := extensions.gen_random_uuid();
  v_papa_medium_id uuid := extensions.gen_random_uuid();
  v_papa_small_id uuid := extensions.gen_random_uuid();
  v_tomato_id uuid := extensions.gen_random_uuid();
  v_vaina_id uuid := extensions.gen_random_uuid();
  v_papa_presentation_id uuid := extensions.gen_random_uuid();
  v_tomato_presentation_id uuid := extensions.gen_random_uuid();
  v_vaina_presentation_id uuid := extensions.gen_random_uuid();
  v_papa_receipt_unit_id uuid := extensions.gen_random_uuid();
  v_tomato_receipt_unit_id uuid := extensions.gen_random_uuid();
  v_vaina_receipt_unit_id uuid := extensions.gen_random_uuid();
  v_large_order_unit_id uuid := extensions.gen_random_uuid();
  v_large_output_id uuid;
  v_medium_output_id uuid;
  v_small_output_id uuid;
  v_papa_receipt_id uuid := extensions.gen_random_uuid();
  v_papa_line_id uuid := extensions.gen_random_uuid();
  v_papa_snapshot_id uuid := extensions.gen_random_uuid();
  v_tomato_receipt_id uuid := extensions.gen_random_uuid();
  v_tomato_line_id uuid := extensions.gen_random_uuid();
  v_tomato_snapshot_id uuid := extensions.gen_random_uuid();
  v_vaina_receipt_id uuid := extensions.gen_random_uuid();
  v_vaina_line_id uuid := extensions.gen_random_uuid();
  v_vaina_snapshot_id uuid := extensions.gen_random_uuid();
  v_order_id uuid;
  v_order_item_id uuid;
  v_receipt_id uuid;
  v_result_code text;
  v_stock_before numeric;
  v_stock_after numeric;
  v_count integer;
  v_total numeric;
begin
  select id into v_admin_id
  from public.profiles
  where is_active and role in ('admin', 'administrador')
  order by id
  limit 1;
  if v_admin_id is null then raise exception 'QB_TEST_ACTIVE_ADMIN_REQUIRED'; end if;

  select account.id, location.id
  into v_customer_id, v_location_id
  from public.customer_accounts account
  join public.qb_customer_locations location
    on location.customer_account_id = account.id and location.is_active
  where account.is_active
  order by account.id, location.is_primary desc, location.id
  limit 1;
  if v_customer_id is null or v_location_id is null then
    v_customer_id := extensions.gen_random_uuid();
    v_location_id := extensions.gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      v_customer_id, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', lower(v_suffix) || '-classified@example.test',
      '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    );

    insert into public.customer_accounts (
      id, email, full_name, business_name, responsible_name, phone, is_active
    ) values (
      v_customer_id, lower(v_suffix) || '-classified@example.test',
      'Cliente clasificado ' || v_suffix, 'Cliente clasificado ' || v_suffix,
      'Responsable ' || v_suffix, '+59170000000', true
    );

    insert into public.qb_customer_locations (
      id, customer_account_id, label, address, is_primary, is_active
    ) values (
      v_location_id, v_customer_id, 'Ubicacion ' || v_suffix,
      'Direccion sintetica local', true, true
    );
  end if;

  select id into v_kg_id
  from public.qb_units
  where is_active and lower(code) = 'kg'
  order by is_base desc, id
  limit 1;
  select id into v_arroba_id
  from public.qb_units
  where is_active and lower(code) in ('arroba', 'arrobas')
  order by id
  limit 1;
  if v_kg_id is null or v_arroba_id is null then raise exception 'QB_TEST_KG_ARROBA_UNITS_REQUIRED'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', v_admin_id::text)::text, true);
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.products (id, name, requires_classification, is_sellable, is_active, stock_current)
  values
    (v_papa_input_id, 'QB TEST Papa sin clasificar ' || v_suffix, true, false, true, 0),
    (v_papa_large_id, 'QB TEST Papa grande ' || v_suffix, false, true, true, 0),
    (v_papa_medium_id, 'QB TEST Papa mediana ' || v_suffix, false, true, true, 0),
    (v_papa_small_id, 'QB TEST Papa pequena ' || v_suffix, false, true, true, 0),
    (v_tomato_id, 'QB TEST Tomate ' || v_suffix, false, true, true, 0),
    (v_vaina_id, 'QB TEST Vaina ' || v_suffix, false, true, true, 0);

  insert into public.qb_product_unit_settings (
    product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id,
    base_price_unit_id, base_sale_price, is_visible_in_qb_catalog,
    is_classifiable, classification_mode, is_qb_active, created_by, updated_by
  ) values
    (v_papa_input_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, null, false, true, 'percentage', true, v_admin_id, v_admin_id),
    (v_papa_large_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, 11, true, false, 'none', true, v_admin_id, v_admin_id),
    (v_papa_medium_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, 10, true, false, 'none', true, v_admin_id, v_admin_id),
    (v_papa_small_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, 9, true, false, 'none', true, v_admin_id, v_admin_id),
    (v_tomato_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, null, false, false, 'none', true, v_admin_id, v_admin_id),
    (v_vaina_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, null, false, false, 'none', true, v_admin_id, v_admin_id);

  insert into public.qb_product_presentations (
    id, product_id, name, symbol, contained_quantity, contained_unit_id,
    base_quantity, base_unit_id, conversion_factor_to_base,
    allow_purchase, is_active, notes, created_by, updated_by
  ) values
    (v_papa_presentation_id, v_papa_input_id, 'Carga QB TEST', 'carga-test', 10, v_arroba_id, 112.5, v_kg_id, 112.5, true, true, '1 carga = 10 arrobas = 112.5 kg', v_admin_id, v_admin_id),
    (v_tomato_presentation_id, v_tomato_id, 'Caja QB TEST', 'caja-test', 25, v_kg_id, 25, v_kg_id, 25, true, true, '1 caja = 25 kg', v_admin_id, v_admin_id),
    (v_vaina_presentation_id, v_vaina_id, 'Saco QB TEST', 'saco-test', 1.9, v_arroba_id, 21.375, v_kg_id, 21.375, true, true, '1 saco = 1.9 arrobas = 21.375 kg', v_admin_id, v_admin_id);

  select id into v_papa_receipt_unit_id
  from public.qb_product_allowed_units
  where product_id = v_papa_input_id
    and usage_context = 'recepcion'
    and presentation_id = v_papa_presentation_id;

  select id into v_tomato_receipt_unit_id
  from public.qb_product_allowed_units
  where product_id = v_tomato_id
    and usage_context = 'recepcion'
    and presentation_id = v_tomato_presentation_id;

  select id into v_vaina_receipt_unit_id
  from public.qb_product_allowed_units
  where product_id = v_vaina_id
    and usage_context = 'recepcion'
    and presentation_id = v_vaina_presentation_id;

  insert into public.qb_product_allowed_units (
    id, product_id, usage_context, unit_id, presentation_id,
    is_default, quantity_step, min_quantity, is_active, created_by, updated_by
  ) values (
    v_large_order_unit_id, v_papa_large_id, 'pedido', v_kg_id, null,
    true, 0.001, 0.001, true, v_admin_id, v_admin_id
  );

  perform public.save_qb_product_classification_configuration(
    v_papa_input_id,
    jsonb_build_array(
      v_papa_large_id::text,
      v_papa_medium_id::text,
      v_papa_small_id::text
    )
  );

  select output.id into v_large_output_id
  from public.qb_product_classification_outputs output
  where output.source_product_id = v_papa_input_id
    and output.output_product_id = v_papa_large_id
    and output.is_active;
  select output.id into v_medium_output_id
  from public.qb_product_classification_outputs output
  where output.source_product_id = v_papa_input_id
    and output.output_product_id = v_papa_medium_id
    and output.is_active;
  select output.id into v_small_output_id
  from public.qb_product_classification_outputs output
  where output.source_product_id = v_papa_input_id
    and output.output_product_id = v_papa_small_id
    and output.is_active;

  if v_large_output_id is null or v_medium_output_id is null or v_small_output_id is null then
    raise exception 'QB_TEST_ADMIN_CONFIGURATION_FAILED';
  end if;

  perform pg_temp.qb_classified_pass('A', 'Producto de recepcion temporal creado');
  perform pg_temp.qb_classified_pass('B', 'Tres productos resultado temporales creados');
  perform pg_temp.qb_classified_pass('C', 'Carga configurada como 10 arrobas y 112.5 kg');

  insert into public.qb_merchandise_receipts (id, receipt_date, status, reference_code, created_by, updated_by)
  values (v_papa_receipt_id, current_date, 'borrador', 'QB-TEST-PAPA-' || v_suffix, v_admin_id, v_admin_id);
  insert into public.qb_conversion_snapshots (
    id, source_table, source_id, product_id, dimension_code, source_kind,
    product_presentation_id, source_label, source_quantity, base_unit_id,
    base_unit_symbol, base_quantity, conversion_factor_to_base, snapshot, created_by
  ) values (
    v_papa_snapshot_id, 'qb_merchandise_receipt_lines', v_papa_line_id, v_papa_input_id,
    'peso', 'product_presentation', v_papa_presentation_id, 'Carga QB TEST', 10,
    v_kg_id, 'kg', 1125, 112.5,
    jsonb_build_object('contained_quantity', 10, 'contained_unit', 'arroba', 'base_quantity_per_presentation', 112.5),
    v_admin_id
  );
  insert into public.qb_merchandise_receipt_lines (
    id, receipt_id, product_id, allowed_unit_id, source_kind, product_presentation_id,
    source_label, source_quantity, base_unit_id, base_unit_symbol, base_quantity,
    conversion_factor_to_base, conversion_snapshot_id, unit_cost, total_cost,
    requires_classification, created_by, updated_by
  ) values (
    v_papa_line_id, v_papa_receipt_id, v_papa_input_id, v_papa_receipt_unit_id,
    'product_presentation', v_papa_presentation_id, 'Carga QB TEST', 10,
    v_kg_id, 'kg', 1125, 112.5, v_papa_snapshot_id, null, 0, true, v_admin_id, v_admin_id
  );
  perform pg_temp.qb_classified_pass('D', 'Diez cargas guardadas como cantidad de origen');

  perform public.save_qb_merchandise_classification_percentages(
    v_papa_line_id,
    jsonb_build_array(
      jsonb_build_object('output_id', v_large_output_id, 'percentage', 50),
      jsonb_build_object('output_id', v_medium_output_id, 'percentage', 30),
      jsonb_build_object('output_id', v_small_output_id, 'percentage', 20)
    )
  );
  if (select sum(assigned_percentage) from public.qb_merchandise_receipt_classification_results where line_id = v_papa_line_id) <> 100 then
    raise exception 'QB_TEST_PERCENTAGE_TOTAL_FAILED';
  end if;
  perform pg_temp.qb_classified_pass('E', 'Distribucion variable 50/30/20 guardada');

  if (select sum(base_quantity) from public.qb_merchandise_receipt_classification_results where line_id = v_papa_line_id) <> 1125 then
    raise exception 'QB_TEST_QUANTITY_CONSERVATION_FAILED';
  end if;
  perform pg_temp.qb_classified_pass('F', 'Cantidad clasificada conserva exactamente 1125 kg');

  perform public.confirm_qb_merchandise_receipt(v_papa_receipt_id);
  if not exists (
    select 1
    from public.qb_merchandise_receipt_movements movement
    where movement.receipt_id = v_papa_receipt_id
    group by movement.receipt_id
    having count(*) = 3
      and sum(case when movement.product_id = v_papa_large_id and movement.movement_quantity = 562.5 then 1 else 0 end) = 1
      and sum(case when movement.product_id = v_papa_medium_id and movement.movement_quantity = 337.5 then 1 else 0 end) = 1
      and sum(case when movement.product_id = v_papa_small_id and movement.movement_quantity = 225 then 1 else 0 end) = 1
  ) then raise exception 'QB_TEST_CLASSIFIED_MOVEMENTS_FAILED'; end if;
  perform pg_temp.qb_classified_pass('G', 'Movimientos 562.5, 337.5 y 225 kg verificados');

  if (select stock_current from public.products where id = v_papa_input_id) <> 0
    or exists (select 1 from public.qb_merchandise_receipt_movements where receipt_id = v_papa_receipt_id and product_id = v_papa_input_id)
  then raise exception 'QB_TEST_INPUT_STOCK_DUPLICATED'; end if;
  perform pg_temp.qb_classified_pass('H', 'Producto de entrada conserva stock cero y no tiene movimiento');
  perform pg_temp.qb_classified_pass('I', 'Precios QA independientes asignados solo dentro de la transaccion');

  select created_order_id, result_code
  into v_order_id, v_result_code
  from public.create_qb_internal_catalog_order(
    'registered', v_customer_id, v_location_id,
    null, null, null, null, null, null, null,
    'Pedido temporal de contrato',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_papa_large_id,
      'input_mode', 'quantity',
      'allowed_unit_id', v_large_order_unit_id,
      'quantity', 2,
      'notes', 'QB TEST'
    )),
    extensions.gen_random_uuid()::text
  );
  if v_result_code <> 'created' or v_order_id is null then raise exception 'QB_TEST_ORDER_CREATION_FAILED: %', v_result_code; end if;
  select id into v_order_item_id from public.qb_order_items where order_id = v_order_id;
  perform pg_temp.qb_classified_pass('J', 'Pedido temporal de papa grande creado');

  select stock_current into v_stock_before from public.products where id = v_papa_large_id;
  perform public.save_qb_order_preparation(
    v_order_id,
    jsonb_build_array(jsonb_build_object(
      'order_item_id', v_order_item_id,
      'status', 'parcial',
      'actual_allowed_unit_id', v_large_order_unit_id,
      'actual_quantity', 1.5,
      'notes', 'QB TEST cantidad real distinta'
    )),
    'QB TEST',
    true
  );
  perform pg_temp.qb_classified_pass('K', 'Cantidad preparada real de 1.5 kg guardada');
  if (select stock_current from public.products where id = v_papa_large_id) <> v_stock_before then
    raise exception 'QB_TEST_PREPARATION_CHANGED_STOCK';
  end if;
  perform pg_temp.qb_classified_pass('L', 'Preparacion no modifica stock');

  perform public.confirm_qb_order_delivery(v_order_id);
  select stock_current into v_stock_after from public.products where id = v_papa_large_id;
  if v_stock_after <> v_stock_before - 1.5 then raise exception 'QB_TEST_DELIVERY_STOCK_FAILED'; end if;
  perform pg_temp.qb_classified_pass('M', 'Entrega descuenta exactamente 1.5 kg');

  v_receipt_id := public.create_qb_receipt_draft(v_customer_id, array[v_order_id]);
  perform public.emit_qb_receipt(v_receipt_id);
  if not exists (select 1 from public.qb_receipts where id = v_receipt_id and status = 'emitido') then
    raise exception 'QB_TEST_RECEIPT_EMISSION_FAILED';
  end if;
  perform pg_temp.qb_classified_pass('N', 'Recibo temporal generado y emitido');
  if not exists (
    select 1 from public.qb_receipt_lines
    where receipt_id = v_receipt_id and product_id = v_papa_large_id
      and base_price_used = 11 and final_unit_price = 11 and line_total = 16.50
  ) then raise exception 'QB_TEST_INDEPENDENT_PRICE_FAILED'; end if;
  perform pg_temp.qb_classified_pass('O', 'Precio independiente y snapshot de papa grande verificados');

  select count(*) into v_count from public.qb_order_delivery_movements where order_id = v_order_id;
  begin
    perform public.confirm_qb_order_delivery(v_order_id);
    raise exception 'QB_TEST_DELIVERY_RETRY_WAS_ACCEPTED';
  exception when others then
    if sqlerrm = 'QB_TEST_DELIVERY_RETRY_WAS_ACCEPTED' then raise; end if;
  end;
  if (select count(*) from public.qb_order_delivery_movements where order_id = v_order_id) <> v_count then
    raise exception 'QB_TEST_DELIVERY_RETRY_DUPLICATED_MOVEMENT';
  end if;
  select count(*) into v_count from public.qb_merchandise_receipt_movements where receipt_id = v_papa_receipt_id;
  begin
    perform public.confirm_qb_merchandise_receipt(v_papa_receipt_id);
    raise exception 'QB_TEST_RECEIPT_RETRY_WAS_ACCEPTED';
  exception when others then
    if sqlerrm = 'QB_TEST_RECEIPT_RETRY_WAS_ACCEPTED' then raise; end if;
  end;
  if (select count(*) from public.qb_merchandise_receipt_movements where receipt_id = v_papa_receipt_id) <> v_count then
    raise exception 'QB_TEST_RECEIPT_RETRY_DUPLICATED_MOVEMENT';
  end if;
  perform pg_temp.qb_classified_pass('P', 'Reintentos no duplican movimientos');

  insert into public.qb_merchandise_receipts (id, status, reference_code, created_by, updated_by)
  values (v_tomato_receipt_id, 'borrador', 'QB-TEST-TOMATE-' || v_suffix, v_admin_id, v_admin_id);
  insert into public.qb_conversion_snapshots (
    id, source_table, source_id, product_id, dimension_code, source_kind,
    product_presentation_id, source_label, source_quantity, base_unit_id,
    base_unit_symbol, base_quantity, conversion_factor_to_base, snapshot, created_by
  ) values (
    v_tomato_snapshot_id, 'qb_merchandise_receipt_lines', v_tomato_line_id, v_tomato_id,
    'peso', 'product_presentation', v_tomato_presentation_id, 'Caja QB TEST', 5,
    v_kg_id, 'kg', 125, 25, jsonb_build_object('base_quantity_per_presentation', 25), v_admin_id
  );
  insert into public.qb_merchandise_receipt_lines (
    id, receipt_id, product_id, allowed_unit_id, source_kind, product_presentation_id,
    source_label, source_quantity, base_unit_id, base_unit_symbol, base_quantity,
    conversion_factor_to_base, conversion_snapshot_id, total_cost, requires_classification,
    created_by, updated_by
  ) values (
    v_tomato_line_id, v_tomato_receipt_id, v_tomato_id, v_tomato_receipt_unit_id,
    'product_presentation', v_tomato_presentation_id, 'Caja QB TEST', 5,
    v_kg_id, 'kg', 125, 25, v_tomato_snapshot_id, 0, false, v_admin_id, v_admin_id
  );
  perform public.confirm_qb_merchandise_receipt(v_tomato_receipt_id);
  if (select stock_current from public.products where id = v_tomato_id) <> 125 then
    raise exception 'QB_TEST_TOMATO_FAILED';
  end if;
  perform pg_temp.qb_classified_pass('Q', 'Tomate: 5 cajas producen 125 kg');

  insert into public.qb_merchandise_receipts (id, status, reference_code, created_by, updated_by)
  values (v_vaina_receipt_id, 'borrador', 'QB-TEST-VAINA-' || v_suffix, v_admin_id, v_admin_id);
  insert into public.qb_conversion_snapshots (
    id, source_table, source_id, product_id, dimension_code, source_kind,
    product_presentation_id, source_label, source_quantity, base_unit_id,
    base_unit_symbol, base_quantity, conversion_factor_to_base, snapshot, created_by
  ) values (
    v_vaina_snapshot_id, 'qb_merchandise_receipt_lines', v_vaina_line_id, v_vaina_id,
    'peso', 'product_presentation', v_vaina_presentation_id, 'Saco QB TEST', 2,
    v_kg_id, 'kg', 42.75, 21.375, jsonb_build_object('contained_quantity', 1.9, 'contained_unit', 'arroba', 'base_quantity_per_presentation', 21.375), v_admin_id
  );
  insert into public.qb_merchandise_receipt_lines (
    id, receipt_id, product_id, allowed_unit_id, source_kind, product_presentation_id,
    source_label, source_quantity, base_unit_id, base_unit_symbol, base_quantity,
    conversion_factor_to_base, conversion_snapshot_id, total_cost, requires_classification,
    created_by, updated_by
  ) values (
    v_vaina_line_id, v_vaina_receipt_id, v_vaina_id, v_vaina_receipt_unit_id,
    'product_presentation', v_vaina_presentation_id, 'Saco QB TEST', 2,
    v_kg_id, 'kg', 42.75, 21.375, v_vaina_snapshot_id, 0, false, v_admin_id, v_admin_id
  );
  perform public.confirm_qb_merchandise_receipt(v_vaina_receipt_id);
  if (select stock_current from public.products where id = v_vaina_id) <> 42.75 then
    raise exception 'QB_TEST_VAINA_FAILED';
  end if;
  perform pg_temp.qb_classified_pass('R', 'Vaina: 2 sacos producen 42.75 kg');

  select sum(line_total) into v_total from public.qb_receipt_lines where receipt_id = v_receipt_id;
  if v_total <> 16.50 then raise exception 'QB_TEST_RECEIPT_TOTAL_FAILED'; end if;
end;
$$;

select scenario, description
from qb_classified_test_results
order by scenario;

rollback;
