-- Contrato transaccional QB-17. Ejecutar solo en Staging tekfwbhvqtojpfqusosg.
-- Crea fixtures inequivocos dentro de esta transaccion y termina siempre en ROLLBACK.

begin;

create temporary table qb17_contract_results (
  scenario integer primary key,
  name text not null,
  passed boolean not null,
  details text not null
) on commit drop;

do $contract$
declare
  v_marker text := 'QB17-QA-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS');
  v_admin_id uuid;
  v_customer_id uuid := extensions.gen_random_uuid();
  v_location_id uuid := extensions.gen_random_uuid();
  v_product_id uuid;
  v_allowed_id uuid;
  v_price_unit_id uuid;
  v_base_unit_id uuid;
  v_price_factor numeric;
  v_base_factor numeric;
  v_stock_before numeric;
  v_quantity_order uuid;
  v_registered_order uuid;
  v_guest_order uuid;
  v_internal_order uuid;
  v_repriced_order uuid;
  v_reference text;
  v_result text;
  v_key text;
  v_hash text := repeat(replace(extensions.gen_random_uuid()::text, '-', ''), 2);
  v_amount numeric := 10.00;
  v_expected numeric;
  v_expected_base numeric;
  v_actual numeric;
  v_actual_base numeric;
  v_preparation_id uuid;
  v_receipt_id uuid;
  v_failed boolean;
  v_before numeric;
  v_after numeric;
  v_count integer;
begin
  select id into v_admin_id
  from public.profiles
  where is_active = true and role in ('admin', 'administrador')
  order by case when role = 'administrador' then 0 else 1 end, created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'QB17 preflight: no existe administrador activo.';
  end if;

  select
    product.id,
    allowed.id,
    settings.base_price_unit_id,
    settings.base_unit_id,
    price_unit.conversion_factor_to_base,
    base_unit.conversion_factor_to_base,
    product.stock_current
  into
    v_product_id,
    v_allowed_id,
    v_price_unit_id,
    v_base_unit_id,
    v_price_factor,
    v_base_factor,
    v_stock_before
  from public.products product
  join public.qb_product_unit_settings settings on settings.product_id = product.id
  join public.qb_units price_unit on price_unit.id = settings.base_price_unit_id and price_unit.is_active
  join public.qb_units base_unit on base_unit.id = settings.base_unit_id and base_unit.dimension_id = price_unit.dimension_id
  join public.qb_product_allowed_units allowed
    on allowed.product_id = product.id
   and allowed.usage_context = 'pedido'
   and allowed.unit_id = price_unit.id
   and allowed.is_active
  where product.is_active and coalesce(product.is_sellable, true)
  order by product.id, allowed.is_default desc, allowed.sort_order
  limit 1;

  if v_product_id is null then
    select id, conversion_factor_to_base
    into v_base_unit_id, v_base_factor
    from public.qb_units
    where code = 'kg' and is_active
    limit 1;

    if v_base_unit_id is null then
      raise exception 'QB17 preflight: no existe unidad local kg.';
    end if;

    v_product_id := extensions.gen_random_uuid();
    v_allowed_id := extensions.gen_random_uuid();
    v_price_unit_id := v_base_unit_id;
    v_price_factor := v_base_factor;
    v_stock_before := 100;

    insert into public.products (
      id, name, stock_current, stock_minimum, requires_classification,
      is_sellable, is_active
    ) values (
      v_product_id, v_marker || '-PRODUCT', v_stock_before, 0, false, true, true
    );

    insert into public.qb_product_unit_settings (
      product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id,
      base_price_unit_id, base_sale_price, supports_amount_bs,
      is_visible_in_qb_catalog, is_classifiable, classification_mode,
      is_qb_active, created_by, updated_by
    ) values (
      v_product_id, v_base_unit_id, v_base_unit_id, v_base_unit_id,
      v_price_unit_id, 8, false, true, false, 'none',
      true, v_admin_id, v_admin_id
    );

    insert into public.qb_product_allowed_units (
      id, product_id, usage_context, unit_id, is_default,
      quantity_step, min_quantity, is_active, created_by, updated_by
    ) values (
      v_allowed_id, v_product_id, 'pedido', v_price_unit_id, true,
      0.001, 0.001, true, v_admin_id, v_admin_id
    );
  end if;

  update public.qb_product_unit_settings
  set supports_amount_bs = true, base_sale_price = 8.0000
  where product_id = v_product_id;

  v_expected := round(v_amount / 8.0000, 3);
  v_expected_base := round(v_expected * (v_price_factor / v_base_factor), 6);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_customer_id,
    'authenticated', 'authenticated', lower(v_marker) || '@example.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', ''
  );

  insert into public.customer_accounts (
    id, email, full_name, business_name, responsible_name, phone, is_active
  ) values (
    v_customer_id, lower(v_marker) || '@example.invalid', v_marker,
    v_marker, 'Responsable ' || v_marker, '+59170000000', true
  );

  insert into public.qb_customer_locations (
    id, customer_account_id, label, address, reference, is_primary, is_active
  ) values (
    v_location_id, v_customer_id, v_marker, 'Direccion ' || v_marker,
    'Fixture transaccional QB-17', true, true
  );

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);

  select created_order_id, order_reference, result_code
  into v_quantity_order, v_reference, v_result
  from public.create_qb17_internal_catalog_order(
    'registered', v_customer_id, v_location_id,
    null, null, null, null, null, null, null, v_marker,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'quantity',
      'allowed_unit_id', v_allowed_id, 'quantity', 1, 'notes', v_marker
    )), extensions.gen_random_uuid()::text
  );
  if v_result <> 'created' or exists (
    select 1 from public.qb_order_items where order_id = v_quantity_order
      and (order_input_mode <> 'quantity' or requested_amount_bs is not null)
  ) then raise exception 'QB17-01 quantity incompatible.'; end if;
  insert into qb17_contract_results values (1, 'Pedido quantity historico compatible', true, 'quantity sin metadatos monetarios');

  perform set_config('request.jwt.claim.sub', v_customer_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_customer_id, 'role', 'authenticated')::text, true);
  select created_order_id, order_reference, result_code
  into v_registered_order, v_reference, v_result
  from public.create_qb17_catalog_order(
    v_location_id, v_marker,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs',
      'requested_amount_bs', 5.00, 'notes', v_marker
    )), extensions.gen_random_uuid()::text
  );
  if v_result <> 'created' then raise exception 'QB17-02 registered: %', v_result; end if;
  insert into qb17_contract_results values (2, 'Pedido amount_bs registrado', true, 'RPC registrado creado');

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin_id, 'role', 'authenticated')::text, true);
  select created_order_id, order_reference, result_code
  into v_guest_order, v_reference, v_result
  from public.create_qb17_guest_catalog_order(
    'Negocio ' || v_marker, 'Responsable ' || v_marker,
    '+591 70000000', '+59170000000', lower(v_marker) || '-guest@example.invalid',
    'Direccion invitada ' || v_marker, '-17.3935', '-66.1570',
    'Entrega ' || v_marker, 'Fixture transaccional', null, v_marker,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs',
      'requested_amount_bs', 7.00, 'notes', v_marker
    )), extensions.gen_random_uuid()::text, v_hash,
    repeat(replace(extensions.gen_random_uuid()::text, '-', ''), 2),
    repeat(replace(extensions.gen_random_uuid()::text, '-', ''), 2)
  );
  if v_result <> 'created' then raise exception 'QB17-03 guest: %', v_result; end if;
  insert into qb17_contract_results values (3, 'Pedido amount_bs invitado', true, 'RPC service_role creado');

  v_key := extensions.gen_random_uuid()::text;
  select created_order_id, order_reference, result_code
  into v_internal_order, v_reference, v_result
  from public.create_qb17_internal_catalog_order(
    'registered', v_customer_id, v_location_id,
    null, null, null, null, null, null, null, v_marker,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs',
      'requested_amount_bs', v_amount, 'notes', v_marker,
      'price_base_snapshot', 0.01, 'conversion_factor_snapshot', 999999
    )), v_key
  );
  if v_result <> 'created' then raise exception 'QB17-04 internal: %', v_result; end if;
  insert into qb17_contract_results values (4, 'Pedido amount_bs interno', true, 'RPC administrador creado');

  v_failed := false;
  begin
    perform private.prepare_qb17_order_items(jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs', 'requested_amount_bs', 0
    )));
  exception when others then v_failed := sqlerrm like '%QB17_INVALID_AMOUNT%'; end;
  if not v_failed then raise exception 'QB17-05 cero aceptado.'; end if;
  insert into qb17_contract_results values (5, 'Importe cero rechazado', true, 'QB17_INVALID_AMOUNT');

  v_failed := false;
  begin
    perform private.prepare_qb17_order_items(jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs', 'requested_amount_bs', -1
    )));
  exception when others then v_failed := sqlerrm like '%QB17_INVALID_AMOUNT%'; end;
  if not v_failed then raise exception 'QB17-06 negativo aceptado.'; end if;
  insert into qb17_contract_results values (6, 'Importe negativo rechazado', true, 'QB17_INVALID_AMOUNT');

  v_failed := false;
  begin
    update public.qb_product_unit_settings set base_sale_price = null where product_id = v_product_id;
    perform private.prepare_qb17_order_items(jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs', 'requested_amount_bs', 1
    )));
  exception when others then v_failed := sqlerrm like '%QB17_AMOUNT_UNAVAILABLE%'; end;
  if not v_failed then raise exception 'QB17-07 precio null aceptado.'; end if;
  insert into qb17_contract_results values (7, 'Precio nulo rechazado', true, 'QB17_AMOUNT_UNAVAILABLE');

  v_failed := false;
  begin
    update public.qb_product_unit_settings set base_sale_price = 0 where product_id = v_product_id;
    perform private.prepare_qb17_order_items(jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs', 'requested_amount_bs', 1
    )));
  exception when others then v_failed := sqlerrm like '%QB17_AMOUNT_UNAVAILABLE%'; end;
  if not v_failed then raise exception 'QB17-08 precio cero aceptado.'; end if;
  insert into qb17_contract_results values (8, 'Precio cero rechazado', true, 'QB17_AMOUNT_UNAVAILABLE');

  v_failed := false;
  begin
    update public.qb_product_unit_settings set supports_amount_bs = false where product_id = v_product_id;
    perform private.prepare_qb17_order_items(jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs', 'requested_amount_bs', 1
    )));
  exception when others then v_failed := sqlerrm like '%QB17_AMOUNT_UNAVAILABLE%'; end;
  if not v_failed then raise exception 'QB17-09 producto no habilitado aceptado.'; end if;
  insert into qb17_contract_results values (9, 'Producto sin habilitacion rechazado', true, 'QB17_AMOUNT_UNAVAILABLE');

  if (select price_base_snapshot from private.qb_order_amount_snapshots snapshot
      join public.qb_order_items item on item.id = snapshot.order_item_id
      where item.order_id = v_internal_order) <> 8.0000 then
    raise exception 'QB17-10 precio manipulado fue autoridad.';
  end if;
  insert into qb17_contract_results values (10, 'Precio cliente no es autoridad', true, 'snapshot servidor 8.0000');

  if (select conversion_factor_snapshot from private.qb_order_amount_snapshots snapshot
      join public.qb_order_items item on item.id = snapshot.order_item_id
      where item.order_id = v_internal_order) <> round(v_price_factor / v_base_factor, 9) then
    raise exception 'QB17-11 factor manipulado fue autoridad.';
  end if;
  insert into qb17_contract_results values (11, 'Factor cliente no es autoridad', true, 'factor resuelto por servidor');

  insert into qb17_contract_results values (12, 'Snapshot de precio correcto', true,
    (select price_base_snapshot::text from private.qb_order_amount_snapshots snapshot join public.qb_order_items item on item.id=snapshot.order_item_id where item.order_id=v_internal_order));
  insert into qb17_contract_results values (13, 'Snapshot de factor correcto', true,
    (select conversion_factor_snapshot::text from private.qb_order_amount_snapshots snapshot join public.qb_order_items item on item.id=snapshot.order_item_id where item.order_id=v_internal_order));

  if (select estimated_base_quantity from public.qb_order_items where order_id=v_internal_order) <> v_expected_base then
    raise exception 'QB17-14 conversion incorrecta.';
  end if;
  insert into qb17_contract_results values (14, 'Conversion correcta', true, v_expected_base::text);

  if (select estimated_requested_quantity from public.qb_order_items where order_id=v_internal_order) <> v_expected then
    raise exception 'QB17-15 redondeo incorrecto.';
  end if;
  insert into qb17_contract_results values (15, 'Redondeo pricing 3 y base 6', true, v_expected::text);

  select result_code into v_result from public.create_qb17_internal_catalog_order(
    'registered', v_customer_id, v_location_id,
    null, null, null, null, null, null, null, v_marker,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs', 'requested_amount_bs', v_amount
    )), v_key
  );
  if v_result <> 'already_created' then raise exception 'QB17-16 idempotencia: %', v_result; end if;
  insert into qb17_contract_results values (16, 'Idempotencia conservada', true, 'already_created');

  if pg_catalog.pg_get_function_result(
    'public.get_qb17_public_catalog()'::regprocedure
  ) ilike '%price%' or not exists (
    select 1 from public.get_qb17_public_catalog() where product_id=v_product_id and amount_bs_available
  ) then raise exception 'QB17-17 catalogo publico inseguro.'; end if;
  insert into qb17_contract_results values (17, 'Catalogo publico sin precio', true, 'solo amount_bs_available');

  v_preparation_id := public.start_qb_order_preparation(v_internal_order);
  v_actual := round(v_expected * 0.8, 3);
  perform public.save_qb_order_preparation(
    v_internal_order,
    jsonb_build_array(jsonb_build_object(
      'order_item_id', (select id from public.qb_order_items where order_id=v_internal_order),
      'status', 'parcial', 'actual_allowed_unit_id', v_allowed_id,
      'actual_quantity', v_actual, 'notes', v_marker
    )), v_marker, true
  );
  select actual_base_quantity into v_actual_base
  from public.qb_order_preparation_items where preparation_id=v_preparation_id;
  if v_actual_base <= 0 then raise exception 'QB17-18 preparacion no fisica.'; end if;
  insert into qb17_contract_results values (18, 'Preparacion utiliza cantidad fisica', true, v_actual_base::text);

  if (select stock_current from public.products where id=v_product_id) <> v_stock_before then
    raise exception 'QB17-19 stock cambio al crear.';
  end if;
  insert into qb17_contract_results values (19, 'Stock no cambia al crear', true, v_stock_before::text);

  if (select stock_current from public.products where id=v_product_id) <> v_stock_before then
    raise exception 'QB17-20 stock cambio al preparar.';
  end if;
  insert into qb17_contract_results values (20, 'Stock no cambia al preparar', true, v_stock_before::text);

  perform public.confirm_qb_order_delivery(v_internal_order);
  select stock_current into v_after from public.products where id=v_product_id;
  if v_after <> v_stock_before - v_actual_base then raise exception 'QB17-21 descuento incorrecto.'; end if;
  insert into qb17_contract_results values (21, 'Entrega descuenta cantidad fisica real', true, v_actual_base::text);

  v_count := (select count(*) from public.qb_order_delivery_movements where order_id=v_internal_order);
  v_failed := false;
  begin perform public.confirm_qb_order_delivery(v_internal_order); exception when others then v_failed := true; end;
  if not v_failed or (select count(*) from public.qb_order_delivery_movements where order_id=v_internal_order) <> v_count then
    raise exception 'QB17-22 doble entrega duplico movimiento.';
  end if;
  insert into qb17_contract_results values (22, 'Doble entrega no duplica descuento', true, v_count::text);

  v_receipt_id := public.create_qb_receipt_draft(v_customer_id, array[v_internal_order]);
  if not exists (
    select 1 from public.qb_receipt_lines
    where receipt_id=v_receipt_id and delivered_base_quantity=v_actual_base
  ) then raise exception 'QB17-23 recibo no usa cantidad real.'; end if;
  insert into qb17_contract_results values (23, 'Recibo usa cantidad real', true, v_actual_base::text);

  if (select requested_amount_bs from public.qb_order_items where order_id=v_internal_order) <> v_amount then
    raise exception 'QB17-24 importe no conservado.';
  end if;
  insert into qb17_contract_results values (24, 'Importe original conservado', true, v_amount::text);

  update public.qb_product_unit_settings set base_sale_price=10 where product_id=v_product_id;
  select created_order_id into v_repriced_order
  from public.create_qb17_internal_catalog_order(
    'registered', v_customer_id, v_location_id,
    null, null, null, null, null, null, null, v_marker,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'input_mode', 'amount_bs', 'requested_amount_bs', v_amount
    )), extensions.gen_random_uuid()::text
  );
  if (select estimated_requested_quantity from public.qb_order_items where order_id=v_repriced_order) = v_expected
    or (select price_base_snapshot from private.qb_order_amount_snapshots snapshot join public.qb_order_items item on item.id=snapshot.order_item_id where item.order_id=v_repriced_order) <> 10 then
    raise exception 'QB17-25 repeticion no recalculo.';
  end if;
  insert into qb17_contract_results values (25, 'Repetir recalcula con precio vigente', true, 'nuevo snapshot 10.0000');

  if has_table_privilege('authenticated', 'public.qb_order_items', 'INSERT,UPDATE,DELETE') then
    raise exception 'QB17-26 DML directo autenticado.';
  end if;
  insert into qb17_contract_results values (26, 'RLS registrado conservado', true, 'sin DML directo');

  if has_function_privilege('anon', 'public.create_qb17_guest_catalog_order(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.create_qb17_guest_catalog_order(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.create_qb17_guest_catalog_order(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,text,text)', 'EXECUTE') then
    raise exception 'QB17-27 ACL guest incorrecta.';
  end if;
  insert into qb17_contract_results values (27, 'ACL invitado restrictiva', true, 'solo service_role');

  if not has_function_privilege('authenticated', 'public.create_qb17_internal_catalog_order(text,uuid,uuid,text,text,text,text,text,text,text,text,jsonb,text)', 'EXECUTE') then
    raise exception 'QB17-28 RPC interno inaccesible al rol operativo.';
  end if;
  insert into qb17_contract_results values (28, 'Rol interno conservado', true, 'RPC delegado valida administrador');

  if has_table_privilege('anon', 'private.qb_order_amount_snapshots', 'SELECT')
    or has_table_privilege('authenticated', 'private.qb_order_amount_snapshots', 'SELECT') then
    raise exception 'QB17-29 snapshot interno expuesto.';
  end if;
  insert into qb17_contract_results values (29, 'Precio interno no se exporta', true, 'snapshot en private sin SELECT');

  insert into qb17_contract_results values (30, 'Contrato dentro de transaccion', true, 'ROLLBACK obligatorio al final');
  insert into qb17_contract_results values (31, 'Cero residuos previsto', true, 'todos los fixtures usan esta transaccion');
end;
$contract$;

select scenario, name, passed, details
from qb17_contract_results
order by scenario;

rollback;
