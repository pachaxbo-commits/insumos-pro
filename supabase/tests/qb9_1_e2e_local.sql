-- QB-9.1 local-only end-to-end validation.
-- Run only against Supabase local DB: postgresql://postgres:postgres@127.0.0.1:54322/postgres

\set ON_ERROR_STOP on

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'sku'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'stock_min'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'supplier_name'
  ) then
    raise exception 'QB-9.4 canonical product baseline is incomplete.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'ip_address'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'user_agent'
  ) then
    raise exception 'QB-9.4 canonical Fase 12C audit baseline is incomplete.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('products', 'product_categories')
      and column_name = 'is_catalog_visible'
  ) then
    raise exception 'QB-9.4 reintroduced a legacy catalog visibility source.';
  end if;
end $$;

do $$
declare
  v_admin_id uuid := '00000000-0000-4000-8000-000000000001';
  v_customer_id uuid := '00000000-0000-4000-8000-000000000002';
  v_inventory_id uuid := '00000000-0000-4000-8000-000000000003';
  v_customer_b_id uuid := '00000000-0000-4000-8000-000000000004';
  v_no_account_id uuid := '00000000-0000-4000-8000-000000000005';
  v_category_id uuid;
  v_legacy_unit_id uuid;
  v_papa_base_id uuid;
  v_papa_grande_id uuid;
  v_papa_mediana_id uuid;
  v_papa_pequena_id uuid;
  v_kg_id uuid;
  v_arroba_id uuid;
  v_carga_id uuid;
  v_allowed_receipt_carga_id uuid;
  v_allowed_receipt_kg_id uuid;
  v_allowed_order_arroba_id uuid;
  v_output_grande_id uuid;
  v_output_mediana_id uuid;
  v_output_pequena_id uuid;
  v_output_loss_id uuid;
  v_receipt_id uuid;
  v_simple_receipt_id uuid;
  v_receipt_line_id uuid;
  v_snapshot_id uuid;
  v_location_id uuid;
  v_location_b_id uuid;
  v_order_id uuid;
  v_order_b_id uuid;
  v_order_reference text;
  v_result_code text;
  v_order_item_id uuid;
  v_preparation_id uuid;
  v_qb_receipt_id uuid;
  v_stock_before_receipt numeric(14, 3);
  v_stock_after_receipt numeric(14, 3);
  v_catalog_rows integer;
  v_order_count integer;
  v_movement_count integer;
  v_total numeric(14, 2);
  v_final_unit_price numeric(14, 4);
  v_legacy_sales_before integer;
  v_legacy_payments_before integer;
  v_legacy_cash_before integer;
  v_legacy_ar_before integer;
begin
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  )
  values
    (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'admin-qb91-local@example.test',
      '',
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', ''
    ),
    (
      v_customer_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'cliente-qb91-local@example.test',
      '',
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', ''
    ),
    (
      v_inventory_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'inventario-qb92-local@example.test',
      '', now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', ''
    ),
    (
      v_customer_b_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'cliente-b-qb92-local@example.test',
      '', now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', ''
    ),
    (
      v_no_account_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'sin-cuenta-qb92-local@example.test',
      '', now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      '', '', '', ''
    )
  on conflict (id) do nothing;

  insert into public.profiles (id, email, full_name, role, is_active)
  values (v_admin_id, 'admin-qb91-local@example.test', 'Admin QB local', 'administrador', true)
  on conflict (id) do update
  set role = excluded.role,
      is_active = excluded.is_active,
      full_name = excluded.full_name;

  insert into public.profiles (id, email, full_name, role, is_active)
  values (v_inventory_id, 'inventario-qb92-local@example.test', 'Inventario QB local', 'inventario', true);

  insert into public.customer_accounts (id, email, full_name, phone, is_active)
  values (v_customer_id, 'cliente-qb91-local@example.test', 'Cliente QB local', '70000001', true)
  on conflict (id) do update
  set full_name = excluded.full_name,
      phone = excluded.phone,
      is_active = excluded.is_active;

  insert into public.customer_accounts (id, email, full_name, phone, is_active)
  values (v_customer_b_id, 'cliente-b-qb92-local@example.test', 'Cliente B QB local', '70000002', true);

  if exists (select 1 from public.profiles where id in (v_customer_id, v_customer_b_id)) then
    raise exception 'External customers must not have internal profiles.';
  end if;

  select count(*) into v_legacy_sales_before from public.sales;
  select count(*) into v_legacy_payments_before from public.payments;
  select count(*) into v_legacy_cash_before from public.cash_movements;
  select count(*) into v_legacy_ar_before from public.accounts_receivable;

  insert into public.product_categories (name, is_active, catalog_slug, catalog_sort_order)
  values ('Tuberculos QB local', true, 'tuberculos-qb-local', 10)
  returning id into v_category_id;

  insert into public.units_of_measure (name, abbreviation)
  values ('Kilogramo', 'kg')
  returning id into v_legacy_unit_id;

  insert into public.products (name, category_id, unit_id, stock_current, is_active, requires_classification)
  values ('Papa para clasificar QB local', v_category_id, v_legacy_unit_id, 0, true, true)
  returning id into v_papa_base_id;

  insert into public.products (name, category_id, unit_id, stock_current, is_active, requires_classification)
  values ('Papa grande QB local', v_category_id, v_legacy_unit_id, 0, true, false)
  returning id into v_papa_grande_id;

  insert into public.products (name, category_id, unit_id, stock_current, is_active, requires_classification)
  values ('Papa mediana QB local', v_category_id, v_legacy_unit_id, 0, true, false)
  returning id into v_papa_mediana_id;

  insert into public.products (name, category_id, unit_id, stock_current, is_active, requires_classification)
  values ('Papa pequena QB local', v_category_id, v_legacy_unit_id, 0, true, false)
  returning id into v_papa_pequena_id;

  select id into v_kg_id from public.qb_units where code = 'kg';
  select id into v_arroba_id from public.qb_units where code = 'arroba';

  if v_kg_id is null or v_arroba_id is null then
    raise exception 'QB-2 units kg/arroba missing.';
  end if;

  if (select count(*) from public.qb_units where code in ('kg', 'libra', 'arroba', 'cuartilla')) <> 4
    or (select conversion_factor_to_base from public.qb_units where code = 'kg') <> 1
    or (select conversion_factor_to_base from public.qb_units where code = 'libra') <> 0.453592
    or (select conversion_factor_to_base from public.qb_units where code = 'arroba') <> 11.25
    or (select conversion_factor_to_base from public.qb_units where code = 'cuartilla') <> 2.7 then
    raise exception 'Required QB weight units or factors are incorrect.';
  end if;

  insert into public.qb_product_unit_settings (
    product_id,
    base_unit_id,
    inventory_unit_id,
    base_inventory_unit_id,
    base_price_unit_id,
    base_sale_price,
    is_visible_in_qb_catalog,
    is_classifiable,
    classification_mode,
    is_qb_active
  )
  values
    (v_papa_base_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, null, false, true, 'weight', true),
    (v_papa_grande_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, 100, true, false, 'none', true),
    (v_papa_mediana_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, 80, false, false, 'none', true),
    (v_papa_pequena_id, v_kg_id, v_kg_id, v_kg_id, v_kg_id, 60, false, false, 'none', true);

  insert into public.qb_product_presentations (
    product_id,
    name,
    symbol,
    contained_quantity,
    contained_unit_id,
    base_quantity,
    base_unit_id,
    conversion_factor_to_base,
    allow_purchase,
    allow_inventory,
    is_active
  )
  values (
    v_papa_base_id,
    'Carga',
    'carga',
    10,
    v_arroba_id,
    112.5,
    v_kg_id,
    112.5,
    true,
    true,
    true
  )
  returning id into v_carga_id;

  insert into public.qb_product_allowed_units (
    product_id,
    usage_context,
    presentation_id,
    is_default,
    quantity_step,
    min_quantity,
    is_active
  )
  values (v_papa_base_id, 'recepcion', v_carga_id, true, 1, 1, true)
  returning id into v_allowed_receipt_carga_id;

  insert into public.qb_product_allowed_units (
    product_id, usage_context, unit_id, is_default, quantity_step, min_quantity, is_active
  )
  values (v_papa_grande_id, 'recepcion', v_kg_id, true, 1, 1, true)
  returning id into v_allowed_receipt_kg_id;

  insert into public.qb_product_allowed_units (
    product_id,
    usage_context,
    unit_id,
    is_default,
    quantity_step,
    min_quantity,
    is_active
  )
  values (v_papa_grande_id, 'pedido', v_arroba_id, true, 0.5, 0.5, true)
  returning id into v_allowed_order_arroba_id;

  insert into public.qb_product_classification_outputs (
    source_product_id,
    output_type,
    output_product_id,
    label,
    expected_percentage,
    is_active,
    sort_order
  )
  values
    (v_papa_base_id, 'product', v_papa_grande_id, 'Grande', 60, true, 10),
    (v_papa_base_id, 'product', v_papa_mediana_id, 'Mediana', 20, true, 20),
    (v_papa_base_id, 'product', v_papa_pequena_id, 'Pequena', 20, true, 30),
    (v_papa_base_id, 'loss', null, 'Merma', 0, true, 40);

  select id into v_output_grande_id
  from public.qb_product_classification_outputs
  where source_product_id = v_papa_base_id and label = 'Grande';

  select id into v_output_mediana_id
  from public.qb_product_classification_outputs
  where source_product_id = v_papa_base_id and label = 'Mediana';

  select id into v_output_pequena_id
  from public.qb_product_classification_outputs
  where source_product_id = v_papa_base_id and label = 'Pequena';

  select id into v_output_loss_id
  from public.qb_product_classification_outputs
  where source_product_id = v_papa_base_id and label = 'Merma';

  insert into public.qb_merchandise_receipts (reference_code, supplier_name, created_by)
  values ('QB91-ING-001', 'Proveedor ficticio local', v_admin_id)
  returning id into v_receipt_id;

  insert into public.qb_merchandise_receipt_lines (
    receipt_id,
    product_id,
    allowed_unit_id,
    source_kind,
    product_presentation_id,
    source_label,
    source_quantity,
    base_unit_id,
    base_unit_symbol,
    base_quantity,
    conversion_factor_to_base,
    total_cost,
    requires_classification,
    created_by
  )
  values (
    v_receipt_id,
    v_papa_base_id,
    v_allowed_receipt_carga_id,
    'product_presentation',
    v_carga_id,
    'carga',
    10,
    v_kg_id,
    'kg',
    1125,
    112.5,
    0,
    true,
    v_admin_id
  )
  returning id into v_receipt_line_id;

  insert into public.qb_conversion_snapshots (
    source_table,
    source_id,
    product_id,
    dimension_code,
    source_kind,
    product_presentation_id,
    source_label,
    source_quantity,
    base_unit_id,
    base_unit_symbol,
    base_quantity,
    conversion_factor_to_base,
    snapshot,
    created_by
  )
  values (
    'qb_merchandise_receipt_lines',
    v_receipt_line_id,
    v_papa_base_id,
    'peso',
    'product_presentation',
    v_carga_id,
    'carga',
    10,
    v_kg_id,
    'kg',
    1125,
    112.5,
    '{"test":"QB-9.1"}'::jsonb,
    v_admin_id
  )
  returning id into v_snapshot_id;

  update public.qb_merchandise_receipt_lines
  set conversion_snapshot_id = v_snapshot_id
  where id = v_receipt_line_id;

  insert into public.qb_merchandise_receipt_classification_results (
    line_id,
    configured_output_id,
    output_type,
    output_product_id,
    label,
    base_quantity,
    sort_order,
    created_by
  )
  values
    (v_receipt_line_id, v_output_grande_id, 'product', v_papa_grande_id, 'Grande', 675, 10, v_admin_id),
    (v_receipt_line_id, v_output_mediana_id, 'product', v_papa_mediana_id, 'Mediana', 225, 20, v_admin_id),
    (v_receipt_line_id, v_output_pequena_id, 'product', v_papa_pequena_id, 'Pequena', 225, 30, v_admin_id),
    (v_receipt_line_id, v_output_loss_id, 'loss', null, 'Merma', 0, 40, v_admin_id);

  perform public.confirm_qb_merchandise_receipt(v_receipt_id);

  if (select stock_current from public.products where id = v_papa_base_id) <> 0 then
    raise exception 'Classified base product received duplicated stock.';
  end if;

  if abs((select stock_current from public.products where id = v_papa_grande_id) - 675) > 0.001
    or abs((select stock_current from public.products where id = v_papa_mediana_id) - 225) > 0.001
    or abs((select stock_current from public.products where id = v_papa_pequena_id) - 225) > 0.001 then
    raise exception 'Classified output stock mismatch.';
  end if;

  if not exists (
    select 1 from public.qb_conversion_snapshots
    where id = v_snapshot_id
      and created_by = v_admin_id
      and created_by_auth_user_id = v_admin_id
  ) then
    raise exception 'QB-4 internal snapshot actor was not recorded correctly.';
  end if;

  begin
    perform public.confirm_qb_merchandise_receipt(v_receipt_id);
    raise exception 'Double merchandise confirmation was not blocked.';
  exception when others then
    if sqlerrm = 'Double merchandise confirmation was not blocked.' then
      raise;
    end if;
  end;

  insert into public.qb_merchandise_receipts (reference_code, supplier_name, created_by)
  values ('QB92-ING-SIMPLE-001', 'Proveedor simple local', v_admin_id)
  returning id into v_simple_receipt_id;

  insert into public.qb_merchandise_receipt_lines (
    receipt_id, product_id, allowed_unit_id, source_kind, source_unit_id,
    source_label, source_quantity, base_unit_id, base_unit_symbol, base_quantity,
    conversion_factor_to_base, total_cost, requires_classification, created_by
  ) values (
    v_simple_receipt_id, v_papa_grande_id, v_allowed_receipt_kg_id, 'universal_unit', v_kg_id,
    'kg', 10, v_kg_id, 'kg', 10, 1, 0, false, v_admin_id
  ) returning id into v_receipt_line_id;

  insert into public.qb_conversion_snapshots (
    source_table, source_id, product_id, dimension_code, source_kind, source_unit_id,
    source_label, source_quantity, base_unit_id, base_unit_symbol, base_quantity,
    conversion_factor_to_base, snapshot, created_by
  ) values (
    'qb_merchandise_receipt_lines', v_receipt_line_id, v_papa_grande_id, 'peso',
    'universal_unit', v_kg_id, 'kg', 10, v_kg_id, 'kg', 10, 1,
    '{"test":"QB-9.2-simple"}'::jsonb, v_admin_id
  ) returning id into v_snapshot_id;

  update public.qb_merchandise_receipt_lines
  set conversion_snapshot_id = v_snapshot_id
  where id = v_receipt_line_id;

  perform public.confirm_qb_merchandise_receipt(v_simple_receipt_id);

  if abs((select stock_current from public.products where id = v_papa_grande_id) - 685) > 0.001
    or not exists (
      select 1 from public.qb_conversion_snapshots
      where id = v_snapshot_id
        and created_by = v_admin_id
        and created_by_auth_user_id = v_admin_id
    ) then
    raise exception 'QB-4 simple receipt or internal snapshot actor is incorrect.';
  end if;

  insert into public.qb_customer_locations (
    customer_account_id,
    label,
    address,
    reference,
    phone,
    is_primary
  )
  values (v_customer_id, 'Casa', 'Calle local 123', 'Porton azul', '70000001', true)
  returning id into v_location_id;

  insert into public.qb_customer_locations (
    customer_account_id, label, address, reference, phone, is_primary
  )
  values (v_customer_b_id, 'Casa B', 'Calle local 456', 'Puerta verde', '70000002', true)
  returning id into v_location_b_id;

  select count(*) into v_catalog_rows
  from public.get_qb_public_catalog()
  where product_id = v_papa_grande_id;

  if v_catalog_rows <> 1 then
    raise exception 'QB catalog should expose exactly one configured unit for papa grande.';
  end if;

  perform set_config('request.jwt.claim.sub', v_customer_id::text, true);

  select created_order_id, order_reference, result_code
  into v_order_id, v_order_reference, v_result_code
  from public.create_qb_catalog_order(
    v_location_id,
    'Pedido ficticio local',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_papa_grande_id,
      'allowed_unit_id', v_allowed_order_arroba_id,
      'quantity', 2,
      'notes', 'Sin precio'
    )),
    '11111111-1111-4111-8111-111111111111'
  );

  if v_result_code <> 'created' or v_order_id is null then
    raise exception 'QB catalog order was not created. Result: %', v_result_code;
  end if;

  if (select status from public.qb_orders where id = v_order_id) <> 'pendiente_preparacion' then
    raise exception 'New QB order did not start in pendiente_preparacion.';
  end if;

  if not exists (
    select 1
    from public.qb_order_items item
    join public.qb_conversion_snapshots snapshot on snapshot.id = item.conversion_snapshot_id
    where item.order_id = v_order_id
      and abs(item.requested_quantity - 2) <= 0.001
      and abs(item.base_quantity - 22.5) <= 0.001
      and snapshot.created_by is null
      and snapshot.created_by_auth_user_id = v_customer_id
  ) then
    raise exception 'QB-5 customer snapshot actor or 2-arroba conversion is incorrect.';
  end if;

  if abs((select stock_current from public.products where id = v_papa_grande_id) - 685) > 0.001 then
    raise exception 'Order creation moved stock.';
  end if;

  select created_order_id, result_code
  into v_snapshot_id, v_result_code
  from public.create_qb_catalog_order(
    v_location_id,
    'Pedido repetido',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_papa_grande_id,
      'allowed_unit_id', v_allowed_order_arroba_id,
      'quantity', 2
    )),
    '11111111-1111-4111-8111-111111111111'
  );

  if v_result_code <> 'already_created' or v_snapshot_id <> v_order_id then
    raise exception 'QB order idempotency did not return the existing order.';
  end if;

  select result_code into v_result_code
  from public.create_qb_catalog_order(
    v_location_b_id,
    null,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_papa_grande_id,
      'allowed_unit_id', v_allowed_order_arroba_id,
      'quantity', 1
    )),
    '22222222-2222-4222-8222-222222222222'
  );

  if v_result_code <> 'invalid_location' then
    raise exception 'Customer could create an order for another customer location.';
  end if;

  perform set_config('request.jwt.claim.sub', v_no_account_id::text, true);
  select result_code into v_result_code
  from public.create_qb_catalog_order(
    v_location_id,
    null,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_papa_grande_id,
      'allowed_unit_id', v_allowed_order_arroba_id,
      'quantity', 1
    )),
    '33333333-3333-4333-8333-333333333333'
  );

  if v_result_code <> 'missing_customer' then
    raise exception 'User without customer_account created an order.';
  end if;

  perform set_config('request.jwt.claim.sub', v_customer_b_id::text, true);
  select created_order_id, result_code
  into v_order_b_id, v_result_code
  from public.create_qb_catalog_order(
    v_location_b_id,
    'Pedido cliente B para RLS',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_papa_grande_id,
      'allowed_unit_id', v_allowed_order_arroba_id,
      'quantity', 1
    )),
    '44444444-4444-4444-8444-444444444444'
  );

  if v_result_code <> 'created' or v_order_b_id is null then
    raise exception 'Customer B order for RLS validation was not created.';
  end if;

  perform set_config('request.jwt.claim.sub', v_customer_id::text, true);

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'qb_order_items'
      and column_name ilike '%price%'
  ) then
    raise exception 'QB order items unexpectedly contain price columns.';
  end if;

  if (select count(*) from public.qb_receipts) <> 0
    or (select count(*) from public.sales) <> v_legacy_sales_before
    or (select count(*) from public.payments) <> v_legacy_payments_before
    or (select count(*) from public.cash_movements) <> v_legacy_cash_before then
    raise exception 'Order creation produced receipt, sale, payment or cash rows.';
  end if;

  select id into v_order_item_id
  from public.qb_order_items
  where order_id = v_order_id
  limit 1;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);

  perform public.start_qb_order_preparation(v_order_id);

  select public.save_qb_order_preparation(
    v_order_id,
    jsonb_build_array(jsonb_build_object(
      'order_item_id', v_order_item_id,
      'status', 'parcial',
      'actual_allowed_unit_id', v_allowed_order_arroba_id,
      'actual_quantity', 1.5,
      'notes', 'Entrega parcial local'
    )),
    'Preparacion QB-9.1 local',
    true
  )
  into v_preparation_id;

  if abs((select stock_current from public.products where id = v_papa_grande_id) - 685) > 0.001 then
    raise exception 'Preparation moved stock before delivery.';
  end if;

  if not exists (
    select 1
    from public.qb_order_preparation_items item
    join public.qb_conversion_snapshots snapshot on snapshot.id = item.conversion_snapshot_id
    where item.preparation_id = v_preparation_id
      and abs(item.actual_quantity - 1.5) <= 0.001
      and abs(item.actual_base_quantity - 16.875) <= 0.001
      and snapshot.created_by = v_admin_id
      and snapshot.created_by_auth_user_id = v_admin_id
  ) then
    raise exception 'QB-6 internal snapshot actor or 1.5-arroba conversion is incorrect.';
  end if;

  perform public.confirm_qb_order_delivery(v_order_id);

  if abs((select stock_current from public.products where id = v_papa_grande_id) - 668.125) > 0.001 then
    raise exception 'Delivery stock discount mismatch.';
  end if;

  begin
    perform public.confirm_qb_order_delivery(v_order_id);
    raise exception 'Double delivery was not blocked.';
  exception when others then
    if sqlerrm = 'Double delivery was not blocked.' then
      raise;
    end if;
  end;

  select count(*) into v_movement_count
  from public.qb_order_delivery_movements
  where order_id = v_order_id;

  if v_movement_count <> 1 then
    raise exception 'Expected exactly one delivery movement, found %.', v_movement_count;
  end if;

  v_stock_before_receipt := (select stock_current from public.products where id = v_papa_grande_id);

  select public.create_qb_receipt_draft(v_customer_id, array[v_order_id])
  into v_qb_receipt_id;

  begin
    perform public.create_qb_receipt_draft(v_customer_id, array[v_order_id]);
    raise exception 'Double active receipt was not blocked.';
  exception when others then
    if sqlerrm = 'Double active receipt was not blocked.' then
      raise;
    end if;
  end;

  select public.update_qb_receipt_draft(
    v_qb_receipt_id,
    5,
    7,
    5,
    7,
    'Recibo no fiscal local',
    'QB-9.1 local',
    null
  )
  into v_qb_receipt_id;

  perform set_config('request.jwt.claim.sub', v_inventory_id::text, true);
  begin
    perform public.emit_qb_receipt(v_qb_receipt_id);
    raise exception 'Inventory role emitted a QB receipt.';
  exception when others then
    if sqlerrm = 'Inventory role emitted a QB receipt.' then
      raise;
    end if;
  end;
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);

  select receipt.total_amount, line.final_unit_price
  into v_total, v_final_unit_price
  from public.qb_receipts receipt
  join public.qb_receipt_lines line on line.receipt_id = receipt.id
  where receipt.id = v_qb_receipt_id;

  if v_final_unit_price <> 126.2252 or round(v_final_unit_price, 2) <> 126.23 then
    raise exception 'Compound unit price mismatch. Expected 126.2252/126.23, got %.', v_final_unit_price;
  end if;

  if abs(v_total - 2130.05) > 0.01 then
    raise exception 'Compound receipt total mismatch. Expected 2130.05, got %.', v_total;
  end if;

  perform public.emit_qb_receipt(v_qb_receipt_id);
  perform public.void_qb_receipt(v_qb_receipt_id, 'Prueba local QB-9.1');

  v_stock_after_receipt := (select stock_current from public.products where id = v_papa_grande_id);

  if abs(v_stock_after_receipt - v_stock_before_receipt) > 0.001 then
    raise exception 'Receipt flow changed stock.';
  end if;

  select count(*) into v_order_count
  from public.qb_orders
  where customer_account_id = v_customer_id;

  if v_order_count <> 1 then
    raise exception 'Unexpected QB order count: %.', v_order_count;
  end if;

  if (select status from public.qb_orders where id = v_order_id) <> 'entregado_pendiente_recibo' then
    raise exception 'Voiding receipt did not return order to pending receipt.';
  end if;

  if (select count(*) from public.sales) <> v_legacy_sales_before
    or (select count(*) from public.payments) <> v_legacy_payments_before
    or (select count(*) from public.cash_movements) <> v_legacy_cash_before
    or (select count(*) from public.accounts_receivable) <> v_legacy_ar_before then
    raise exception 'QB E2E mutated legacy sales, payments, cash or accounts receivable.';
  end if;

  raise notice 'QB-9.1 E2E local OK. Order %, receipt %, total %.', v_order_reference, v_qb_receipt_id, v_total;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);

do $$
begin
  if (select count(*) from public.qb_orders) <> 1
    or exists (
      select 1 from public.qb_orders
      where customer_account_id <> auth.uid()
    ) then
    raise exception 'Customer A can read orders belonging to another customer.';
  end if;

  if (select count(*) from public.qb_customer_locations) <> 1
    or (select count(*) from public.qb_order_items) <> 1 then
    raise exception 'Customer A cannot read own location or order items.';
  end if;

  if exists (select 1 from public.qb_order_preparations)
    or exists (select 1 from public.qb_merchandise_receipts)
    or exists (select 1 from public.qb_receipts)
    or exists (select 1 from public.qb_product_unit_settings)
    or exists (select 1 from public.qb_conversion_snapshots)
    or exists (
      select purchase_price, sale_price
      from public.products
    ) then
    raise exception 'External customer can read internal QB operational data.';
  end if;

  if (select count(*) from public.get_qb_public_catalog()) = 0 then
    raise exception 'Authenticated customer cannot read curated QB catalog.';
  end if;

  begin
    insert into public.qb_orders (public_reference, customer_account_id, customer_location_id, idempotency_key)
    values ('DIRECT-BLOCK', auth.uid(), gen_random_uuid(), gen_random_uuid()::text);
    raise exception 'Customer inserted directly into qb_orders.';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.qb_order_items (
      order_id, product_id, allowed_unit_id, source_kind, source_label,
      requested_quantity, base_unit_id, base_unit_symbol, base_quantity,
      conversion_factor_to_base
    ) values (
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'universal_unit',
      'kg', 1, gen_random_uuid(), 'kg', 1, 1
    );
    raise exception 'Customer inserted directly into qb_order_items.';
  exception when insufficient_privilege then
    null;
  end;
end $$;

rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);

do $$
begin
  if (select count(*) from public.qb_orders) <> 1
    or exists (select 1 from public.qb_orders where customer_account_id <> auth.uid()) then
    raise exception 'Customer B order isolation failed.';
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);

do $$
declare
  v_result_code text;
begin
  if (select count(*) from public.get_qb_public_catalog()) = 0 then
    raise exception 'User without customer account cannot read public catalog.';
  end if;

  select result_code into v_result_code
  from public.create_qb_catalog_order(
    '00000000-0000-0000-0000-000000000000', null, '[]'::jsonb,
    '55555555-5555-4555-8555-555555555555'
  );

  if v_result_code <> 'missing_customer' or exists (select 1 from public.qb_orders) then
    raise exception 'User without customer account created or read a QB order.';
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);

do $$
begin
  if (select count(*) from public.qb_merchandise_receipts) <> 2
    or (select count(*) from public.qb_orders) <> 2
    or (select count(*) from public.qb_order_preparations) <> 1
    or (select count(*) from public.qb_product_unit_settings) < 4
    or (select count(*) from public.products) < 4 then
    raise exception 'Inventory role cannot read expected QB operational data.';
  end if;

  if has_table_privilege('authenticated', 'public.qb_receipts', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.sales', 'SELECT')
    or has_table_privilege('authenticated', 'public.payments', 'SELECT')
    or has_table_privilege('authenticated', 'public.cash_movements', 'SELECT') then
    raise exception 'Inventory/authenticated retained forbidden receipt or legacy privileges.';
  end if;

  if not has_function_privilege('authenticated', 'public.confirm_qb_merchandise_receipt(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.save_qb_order_preparation(uuid,jsonb,text,boolean)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.confirm_qb_order_delivery(uuid)', 'EXECUTE') then
    raise exception 'Inventory role is missing required QB-4/QB-6 RPC execution.';
  end if;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

do $$
begin
  if (select count(*) from public.qb_unit_dimensions) = 0
    or (select count(*) from public.qb_merchandise_receipts) <> 2
    or (select count(*) from public.qb_orders) <> 2
    or (select count(*) from public.qb_receipts) <> 1
    or (select count(*) from public.customer_accounts) <> 2
    or (select count(*) from public.products) < 4 then
    raise exception 'Administrator cannot read complete QB/report data.';
  end if;

  if has_table_privilege('authenticated', 'public.qb_orders', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.qb_order_items', 'INSERT,UPDATE,DELETE') then
    raise exception 'Critical QB order tables allow direct authenticated mutation.';
  end if;
end $$;
rollback;

begin;
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'actor-aislado-qb92@example.test', '', now(),
  now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', ''
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);

insert into public.qb_conversion_snapshots (
  dimension_code, source_kind, source_label, source_quantity, base_unit_symbol,
  base_quantity, conversion_factor_to_base, snapshot
) values (
  'prueba_actor', 'universal_unit', 'kg', 1, 'kg', 1, 1,
  '{"test":"QB-9.2-auth-delete"}'::jsonb
);

delete from auth.users
where id = '00000000-0000-4000-8000-000000000006';

do $$
begin
  if not exists (
    select 1
    from public.qb_conversion_snapshots snapshot
    where snapshot.snapshot ->> 'test' = 'QB-9.2-auth-delete'
      and snapshot.created_by is null
      and snapshot.created_by_auth_user_id is null
  ) then
    raise exception 'Deleting an Auth actor removed or corrupted the physical snapshot.';
  end if;
end $$;

rollback;

select
  (select count(*) from public.qb_unit_dimensions) as qb_dimensions,
  (select count(*) from public.qb_units) as qb_units,
  (select count(*) from public.qb_merchandise_receipts) as qb_receipts_in,
  (select count(*) from public.qb_orders) as qb_orders,
  (select count(*) from public.qb_order_delivery_movements) as qb_delivery_movements,
  (select count(*) from public.qb_receipts) as qb_accumulated_receipts,
  (select count(*) from public.sales) as legacy_sales_rows,
  (select count(*) from public.payments) as legacy_payments_rows,
  (select count(*) from public.cash_movements) as legacy_cash_rows;
