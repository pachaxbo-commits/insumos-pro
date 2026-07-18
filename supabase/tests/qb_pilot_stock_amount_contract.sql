-- Contrato transaccional focalizado del arranque piloto.
-- Ejecutar una sola vez en tekfwbhvqtojpfqusosg. Todo termina en ROLLBACK.

begin;

create temporary table qb_pilot_stock_amount_results (
  scenario integer primary key,
  name text not null,
  result text not null
) on commit drop;

do $qa$
declare
  v_marker text := 'QB-PILOT-STOCK-AMOUNT-QA-' || replace(extensions.gen_random_uuid()::text, '-', '');
  v_admin uuid;
  v_inventory uuid := extensions.gen_random_uuid();
  v_customer uuid := extensions.gen_random_uuid();
  v_location uuid := extensions.gen_random_uuid();
  v_unit uuid;
  v_amount_product uuid := extensions.gen_random_uuid();
  v_strict_product uuid := extensions.gen_random_uuid();
  v_amount_allowed uuid := extensions.gen_random_uuid();
  v_strict_allowed uuid := extensions.gen_random_uuid();
  v_amount_order uuid;
  v_strict_order uuid;
  v_amount_item uuid;
  v_strict_item uuid;
  v_preparation uuid;
  v_receipt uuid;
  v_result text;
  v_blocked boolean := false;
  v_inventory_blocked boolean := false;
  v_anon_blocked boolean := false;
begin
  select profile.id into v_admin
  from public.profiles profile
  where profile.is_active = true and profile.role in ('admin', 'administrador')
  order by profile.created_at
  limit 1;
  if v_admin is null then raise exception 'QB PILOT QA: no existe administrador activo.'; end if;

  select unit.id into v_unit
  from public.qb_units unit
  join public.qb_unit_dimensions dimension on dimension.id = unit.dimension_id
  where unit.is_active = true and unit.is_base = true
    and (unit.symbol = 'kg' or dimension.code in ('peso', 'weight'))
  order by case when unit.symbol = 'kg' then 0 else 1 end, unit.id
  limit 1;
  if v_unit is null then raise exception 'QB PILOT QA: no existe unidad base de peso activa.'; end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into qb_pilot_stock_amount_results values (1, 'Preflight administrador y unidad', 'PASS');

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
  ('00000000-0000-0000-0000-000000000000', v_inventory, 'authenticated', 'authenticated', lower(v_marker) || '-inventory@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', v_customer, 'authenticated', 'authenticated', lower(v_marker) || '-customer@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

  insert into public.profiles (id, email, full_name, role, is_active)
  values (v_inventory, lower(v_marker) || '-inventory@example.invalid', v_marker, 'inventario', true);
  insert into public.customer_accounts (id, email, full_name, business_name, responsible_name, phone, is_active)
  values (v_customer, lower(v_marker) || '-customer@example.invalid', v_marker, v_marker, v_marker, '+59170000000', true);
  insert into public.qb_customer_locations (id, customer_account_id, label, address, is_primary, is_active)
  values (v_location, v_customer, v_marker, v_marker, true, true);
  insert into qb_pilot_stock_amount_results values (2, 'Fixtures inequívocos', 'PASS');

  insert into public.products (id, name, stock_current, stock_minimum, requires_classification, is_sellable, is_active)
  values
    (v_amount_product, v_marker || '-AMOUNT', 0, 0, false, true, true),
    (v_strict_product, v_marker || '-STRICT', 5, 0, false, true, true);

  insert into public.qb_product_unit_settings (
    product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id, base_price_unit_id,
    base_sale_price, supports_amount_bs, is_visible_in_qb_catalog, is_classifiable,
    classification_mode, is_qb_active, created_by, updated_by
  ) values
    (v_amount_product, v_unit, v_unit, v_unit, v_unit, 8, false, true, false, 'none', true, v_admin, v_admin),
    (v_strict_product, v_unit, v_unit, v_unit, v_unit, 8, false, true, false, 'none', true, v_admin, v_admin);

  insert into public.qb_product_allowed_units (
    id, product_id, usage_context, unit_id, is_default, quantity_step, min_quantity, is_active, created_by, updated_by
  ) values
    (v_amount_allowed, v_amount_product, 'pedido', v_unit, true, 0.001, 0.001, true, v_admin, v_admin),
    (v_strict_allowed, v_strict_product, 'pedido', v_unit, true, 0.001, 0.001, true, v_admin, v_admin);
  insert into qb_pilot_stock_amount_results values (3, 'Productos QA sin tocar catálogo real', 'PASS');

  begin
    perform * from public.create_qb17_internal_catalog_order(
      'registered', v_customer, v_location, null, null, null, null, null, null, null, v_marker,
      jsonb_build_array(jsonb_build_object('product_id', v_amount_product, 'input_mode', 'amount_bs', 'requested_amount_bs', 10)),
      extensions.gen_random_uuid()::text
    );
  exception when others then
    if sqlerrm not like '%QB17_AMOUNT_UNAVAILABLE%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'QB PILOT QA: payload amount fue aceptado con modalidad desactivada.'; end if;
  insert into qb_pilot_stock_amount_results values (4, 'Payload amount deshabilitado', 'PASS');

  perform public.set_qb_product_amount_mode(v_amount_product, true);
  if not (select supports_amount_bs from public.qb_product_unit_settings where product_id = v_amount_product) then
    raise exception 'QB PILOT QA: no se habilitó la modalidad por Bs.';
  end if;
  insert into qb_pilot_stock_amount_results values (5, 'Habilitación individual por RPC', 'PASS');

  select created_order_id, result_code into v_amount_order, v_result
  from public.create_qb17_internal_catalog_order(
    'registered', v_customer, v_location, null, null, null, null, null, null, null, v_marker,
    jsonb_build_array(jsonb_build_object('product_id', v_amount_product, 'input_mode', 'amount_bs', 'requested_amount_bs', 10)),
    extensions.gen_random_uuid()::text
  );
  if v_result <> 'created' or v_amount_order is null then raise exception 'QB PILOT QA: pedido por Bs no creado.'; end if;
  insert into qb_pilot_stock_amount_results values (6, 'Pedido interno por Bs', 'PASS');

  select id into v_amount_item from public.qb_order_items where order_id = v_amount_order;
  if (select requested_amount_bs from public.qb_order_items where id = v_amount_item) <> 10 then
    raise exception 'QB PILOT QA: importe solicitado incorrecto.';
  end if;
  insert into qb_pilot_stock_amount_results values (7, 'Importe solicitado Bs 10', 'PASS');
  if (select estimated_base_quantity from public.qb_order_items where id = v_amount_item) <> 1.250000 then
    raise exception 'QB PILOT QA: estimación esperada 1.25 kg no coincide.';
  end if;
  insert into qb_pilot_stock_amount_results values (8, 'Estimación física 1.25', 'PASS');
  if not exists (select 1 from private.qb_order_amount_snapshots where order_item_id = v_amount_item and price_base_snapshot = 8 and currency_snapshot = 'BOB') then
    raise exception 'QB PILOT QA: snapshot monetario ausente.';
  end if;
  insert into qb_pilot_stock_amount_results values (9, 'Snapshot de precio y moneda', 'PASS');

  v_preparation := public.start_qb_order_preparation(v_amount_order);
  perform public.save_qb_order_preparation(
    v_amount_order,
    jsonb_build_array(jsonb_build_object('order_item_id', v_amount_item, 'status', 'parcial', 'actual_allowed_unit_id', v_amount_allowed, 'actual_quantity', 1.23, 'notes', v_marker)),
    v_marker, true
  );
  if (select actual_base_quantity from public.qb_order_preparation_items where preparation_id = v_preparation) <> 1.230000 then
    raise exception 'QB PILOT QA: cantidad real 1.23 no conservada.';
  end if;
  insert into qb_pilot_stock_amount_results values (10, 'Preparación real 1.23', 'PASS');

  perform public.set_qb_strict_stock_control(false, null);
  perform public.confirm_qb_order_delivery(v_amount_order);
  if (select stock_current from public.products where id = v_amount_product) <> -1.230 then
    raise exception 'QB PILOT QA: modo piloto no permitió saldo -1.23.';
  end if;
  insert into qb_pilot_stock_amount_results values (11, 'Piloto permite saldo negativo', 'PASS');
  if not exists (select 1 from public.inventory_movements where product_id = v_amount_product and quantity = 1.23 and stock_after = -1.23) then
    raise exception 'QB PILOT QA: movimiento real no trazable.';
  end if;
  insert into qb_pilot_stock_amount_results values (12, 'Movimiento real trazable', 'PASS');

  v_receipt := public.create_qb_receipt_draft(v_customer, array[v_amount_order]);
  if not exists (
    select 1 from public.qb_receipt_lines line
    where line.receipt_id = v_receipt and line.order_input_mode = 'amount_bs'
      and line.requested_amount_bs = 10 and line.fixed_line_amount = 10
      and line.line_total = 10 and line.delivered_base_quantity = 1.23
  ) then raise exception 'QB PILOT QA: recibo no separa importe fijo y cantidad real.'; end if;
  insert into qb_pilot_stock_amount_results values (13, 'Recibo Bs 10 con cantidad 1.23', 'PASS');

  perform public.update_qb_product_base_price(v_amount_product, 12, 8, false);
  perform public.recalculate_qb_receipt_totals(v_receipt);
  if (select total_amount from public.qb_receipts where id = v_receipt) <> 10
    or (select line_total from public.qb_receipt_lines where receipt_id = v_receipt) <> 10 then
    raise exception 'QB PILOT QA: cambio posterior de precio alteró el importe fijo.';
  end if;
  insert into qb_pilot_stock_amount_results values (14, 'Cambio de precio no altera histórico', 'PASS');
  perform public.emit_qb_receipt(v_receipt);
  if (select total_amount from public.qb_receipts where id = v_receipt) <> 10 then raise exception 'QB PILOT QA: emisión no conserva Bs 10.'; end if;
  insert into qb_pilot_stock_amount_results values (15, 'Recibo emitido Bs 10', 'PASS');

  select created_order_id, result_code into v_strict_order, v_result
  from public.create_qb17_internal_catalog_order(
    'registered', v_customer, v_location, null, null, null, null, null, null, null, v_marker,
    jsonb_build_array(jsonb_build_object('product_id', v_strict_product, 'allowed_unit_id', v_strict_allowed, 'quantity', 6)),
    extensions.gen_random_uuid()::text
  );
  select id into v_strict_item from public.qb_order_items where order_id = v_strict_order;
  v_preparation := public.start_qb_order_preparation(v_strict_order);
  perform public.save_qb_order_preparation(v_strict_order, jsonb_build_array(jsonb_build_object('order_item_id', v_strict_item, 'status', 'completo', 'actual_allowed_unit_id', v_strict_allowed, 'actual_quantity', 6)), v_marker, true);
  insert into qb_pilot_stock_amount_results values (16, 'Pedido físico 6 con stock 5', 'PASS');

  perform public.set_qb_strict_stock_control(true, 'ACTIVAR CONTROL ESTRICTO');
  insert into qb_pilot_stock_amount_results values (17, 'Control estricto activado', 'PASS');
  v_blocked := false;
  begin
    perform public.confirm_qb_order_delivery(v_strict_order);
  exception when others then
    if sqlerrm not like '%QB_STOCK_INSUFFICIENT:%Existencia disponible:%Faltante:%' then raise; end if;
    v_blocked := true;
  end;
  if not v_blocked or (select stock_current from public.products where id = v_strict_product) <> 5 then
    raise exception 'QB PILOT QA: entrega 6 no fue bloqueada sin efectos.';
  end if;
  insert into qb_pilot_stock_amount_results values (18, 'Entrega 6 bloqueada', 'PASS');

  perform public.save_qb_order_preparation(v_strict_order, jsonb_build_array(jsonb_build_object('order_item_id', v_strict_item, 'status', 'parcial', 'actual_allowed_unit_id', v_strict_allowed, 'actual_quantity', 4)), v_marker, true);
  perform public.confirm_qb_order_delivery(v_strict_order);
  if (select stock_current from public.products where id = v_strict_product) <> 1 then
    raise exception 'QB PILOT QA: entrega 4 no dejó saldo 1.';
  end if;
  insert into qb_pilot_stock_amount_results values (19, 'Entrega 4 deja saldo 1', 'PASS');
  if (select count(*) from public.qb_order_delivery_movements where order_id = v_strict_order) <> 1 then
    raise exception 'QB PILOT QA: entrega duplicada.';
  end if;
  insert into qb_pilot_stock_amount_results values (20, 'Una sola entrega y movimiento', 'PASS');

  perform set_config('request.jwt.claim.sub', v_inventory::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_inventory, 'role', 'authenticated')::text, true);
  begin perform public.set_qb_strict_stock_control(false, null); exception when others then if sqlerrm not like '%QB_STOCK_ADMIN_REQUIRED%' then raise; end if; v_inventory_blocked := true; end;
  if not v_inventory_blocked then raise exception 'QB PILOT QA: inventario cambió modo global.'; end if;
  insert into qb_pilot_stock_amount_results values (21, 'Inventario no cambia modo global', 'PASS');
  v_inventory_blocked := false;
  begin perform public.set_qb_product_amount_mode(v_strict_product, true); exception when others then if sqlerrm not like '%QB_AMOUNT_ADMIN_REQUIRED%' then raise; end if; v_inventory_blocked := true; end;
  if not v_inventory_blocked then raise exception 'QB PILOT QA: inventario cambió modalidad Bs.'; end if;
  insert into qb_pilot_stock_amount_results values (22, 'Inventario no cambia modalidad Bs', 'PASS');

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.get_qb_operational_settings(); exception when others then v_anon_blocked := true; end;
  if not v_anon_blocked then raise exception 'QB PILOT QA: anon leyó configuración.'; end if;
  insert into qb_pilot_stock_amount_results values (23, 'Anon no accede a configuración', 'PASS');

  if has_table_privilege('anon', 'public.qb_operational_settings', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.qb_operational_settings', 'INSERT,UPDATE,DELETE') then
    raise exception 'QB PILOT QA: existe DML directo inseguro.';
  end if;
  insert into qb_pilot_stock_amount_results values (24, 'Sin DML directo de configuración', 'PASS');

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  if (public.get_qb_operational_settings() ->> 'strict_stock_control')::boolean is not true then raise exception 'QB PILOT QA: lectura de modo inconsistente.'; end if;
  insert into qb_pilot_stock_amount_results values (25, 'Lectura canónica del modo', 'PASS');
  if not exists (select 1 from public.audit_logs where action = 'set_qb_strict_stock_control' and user_id = v_admin) then raise exception 'QB PILOT QA: auditoría global ausente.'; end if;
  insert into qb_pilot_stock_amount_results values (26, 'Auditoría de modo global', 'PASS');
  if not exists (select 1 from public.audit_logs where action = 'set_qb_product_amount_mode' and entity_id = v_amount_product) then raise exception 'QB PILOT QA: auditoría por producto ausente.'; end if;
  insert into qb_pilot_stock_amount_results values (27, 'Auditoría de modalidad por producto', 'PASS');
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qb_operational_settings') then raise exception 'QB PILOT QA: configuración no publicada en Realtime.'; end if;
  insert into qb_pilot_stock_amount_results values (28, 'Configuración publicada en Realtime', 'PASS');
  if (select count(*) from qb_pilot_stock_amount_results) <> 28 then raise exception 'QB PILOT QA: conteo de escenarios inválido.'; end if;
end
$qa$;

select scenario, name, result
from qb_pilot_stock_amount_results
order by scenario;

rollback;

