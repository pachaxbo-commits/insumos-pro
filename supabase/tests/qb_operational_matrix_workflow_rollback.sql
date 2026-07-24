-- Contrato funcional de la Matriz operativa. Todos los datos son sinteticos
-- locales y la transaccion completa termina en rollback.

begin;

do $$
declare
  v_admin uuid;
  v_inventory uuid := extensions.gen_random_uuid();
  v_delivery uuid := extensions.gen_random_uuid();
  v_customer uuid := extensions.gen_random_uuid();
  v_location uuid := extensions.gen_random_uuid();
  v_product uuid := extensions.gen_random_uuid();
  v_allowed uuid := extensions.gen_random_uuid();
  v_unit uuid;
  v_order uuid;
  v_item uuid;
  v_reference text;
  v_result text;
  v_updated_at timestamptz;
  v_confirmation_key text := 'matrix-confirm-contract';
  v_movements integer;
  v_audits integer;
  v_receipt uuid;
  v_denied boolean;
  v_conflict boolean;
begin
  select id into v_admin
  from public.profiles
  where role in ('admin', 'administrador') and is_active
  order by id limit 1;
  select id into v_unit from public.qb_units where code = 'kg' and is_active limit 1;
  if v_unit is null then
    raise exception 'QB_MATRIX_FIXTURE_BASE_MISSING';
  end if;
  if v_admin is null then
    v_admin := extensions.gen_random_uuid();
    insert into auth.users (id, email, created_at, updated_at)
    values (v_admin, 'matrix-admin@example.test', now(), now());
    insert into public.profiles (id, email, full_name, role, is_active)
    values (v_admin, 'matrix-admin@example.test', 'Matrix Admin', 'administrador', true);
  end if;

  insert into auth.users (id, email, created_at, updated_at)
  values
    (v_inventory, 'matrix-inventory@example.test', now(), now()),
    (v_delivery, 'matrix-delivery@example.test', now(), now()),
    (v_customer, 'matrix-customer@example.test', now(), now());
  insert into public.profiles (id, email, full_name, role, is_active)
  values
    (v_inventory, 'matrix-inventory@example.test', 'Matrix Inventory', 'inventario', true),
    (v_delivery, 'matrix-delivery@example.test', 'Matrix Delivery', 'entregador', true);
  insert into public.customer_accounts (
    id, email, full_name, business_name, responsible_name, phone, is_active
  ) values (
    v_customer, 'matrix-customer@example.test', 'Matrix Customer',
    'Matrix Customer', 'Matrix Responsible', '+59170000000', true
  );
  insert into public.qb_customer_locations (
    id, customer_account_id, label, address, is_primary, is_active
  ) values (
    v_location, v_customer, 'Matrix Location', 'Local fixture', true, true
  );
  insert into public.products (
    id, name, stock_current, stock_minimum, requires_classification, is_sellable, is_active
  ) values (
    v_product, 'QB MATRIX WORKFLOW PRODUCT', 100, 0, false, true, true
  );
  insert into public.qb_product_unit_settings (
    product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id,
    base_price_unit_id, base_sale_price, is_visible_in_qb_catalog,
    is_classifiable, classification_mode, is_qb_active, created_by, updated_by
  ) values (
    v_product, v_unit, v_unit, v_unit, v_unit, 10, true,
    false, 'none', true, v_admin, v_admin
  );
  insert into public.qb_product_allowed_units (
    id, product_id, usage_context, unit_id, is_default,
    quantity_step, min_quantity, is_active, created_by, updated_by
  ) values (
    v_allowed, v_product, 'pedido', v_unit, true,
    1, 1, true, v_admin, v_admin
  );

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select created_order_id, order_reference, result_code
  into v_order, v_reference, v_result
  from public.create_qb_internal_catalog_order(
    'registered', v_customer, v_location,
    null, null, null, null, null, null, null,
    'Matrix workflow contract',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product,
      'allowed_unit_id', v_allowed,
      'quantity', 5,
      'notes', 'Matrix workflow contract'
    )),
    extensions.gen_random_uuid()::text
  );
  if v_result <> 'created' then raise exception 'QB_MATRIX_ORDER_NOT_CREATED'; end if;
  select id into v_item from public.qb_order_items where order_id = v_order;

  perform set_config('request.jwt.claim.sub', v_delivery::text, true);
  begin
    perform public.save_qb_matrix_preparation_item(v_item, 0, 3, false, null, 'delivery-cannot-prepare');
  exception when others then v_denied := sqlerrm like 'No tienes permisos%'; end;
  if not coalesce(v_denied, false) then raise exception 'QB_MATRIX_DELIVERY_PREPARED'; end if;

  perform set_config('request.jwt.claim.sub', v_inventory::text, true);
  perform public.save_qb_matrix_preparation_item(v_item, 0, 3, false, null, 'prepare-partial-contract');
  begin
    perform public.save_qb_matrix_preparation_item(v_item, 0, 3, false, null, 'prepare-stale-contract');
  exception when sqlstate '40001' then v_conflict := true; end;
  if not coalesce(v_conflict, false) then raise exception 'QB_MATRIX_STALE_PREPARATION_ACCEPTED'; end if;

  select updated_at into v_updated_at from public.qb_orders where id = v_order;
  perform public.finalize_qb_matrix_preparation(v_order, v_updated_at, 'finalize-preparation-contract');

  v_denied := false;
  begin
    perform public.save_qb_matrix_delivery_item(v_item, 0, 2, 5, true, null, 'inventory-cannot-deliver');
  exception when others then v_denied := sqlerrm like 'Solo administracion o entrega%'; end;
  if not coalesce(v_denied, false) then raise exception 'QB_MATRIX_INVENTORY_DELIVERED'; end if;

  perform set_config('request.jwt.claim.sub', v_delivery::text, true);
  v_denied := false;
  begin
    perform public.save_qb_matrix_delivery_item(v_item, 0, 3, 6, true, null, 'delivery-difference-no-note');
  exception when others then v_denied := sqlerrm like 'Explica la diferencia%'; end;
  if not coalesce(v_denied, false) then raise exception 'QB_MATRIX_DIFFERENCE_WITHOUT_NOTE'; end if;

  perform public.save_qb_matrix_delivery_item(v_item, 0, 2, 5, true, null, 'delivery-complete-contract');
  select updated_at into v_updated_at from public.qb_orders where id = v_order;
  perform public.confirm_qb_matrix_delivery(v_order, v_updated_at, v_confirmation_key);

  select count(*) into v_movements
  from public.inventory_movements
  where product_id = v_product and reason = 'Entrega QB';
  select count(*) into v_audits
  from public.audit_logs
  where entity_id = v_order and action = 'confirm_qb_matrix_delivery';

  perform public.confirm_qb_matrix_delivery(v_order, v_updated_at, v_confirmation_key);

  if (select stock_current from public.products where id = v_product) <> 97
    or v_movements <> 1
    or (select count(*) from public.inventory_movements where product_id = v_product and reason = 'Entrega QB') <> 1
    or (select count(*) from public.qb_order_delivery_movements where order_id = v_order) <> 1
    or (select count(*) from public.qb_order_delivery_confirmations where order_id = v_order) <> 1
    or (select confirmation_version from public.qb_order_delivery_confirmations where order_id = v_order) <> 1
    or v_audits <> 1
    or (select count(*) from public.audit_logs where entity_id = v_order and action = 'confirm_qb_matrix_delivery') <> 1
  then
    raise exception 'QB_MATRIX_CONFIRMATION_NOT_IDEMPOTENT';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  select public.create_qb_receipt_draft(v_customer, array[v_order]) into v_receipt;
  if not exists (
    select 1 from public.qb_receipt_lines
    where receipt_id = v_receipt and delivered_base_quantity = 5
  ) then
    raise exception 'QB_MATRIX_RECEIPT_DID_NOT_USE_ACTUAL_DELIVERY';
  end if;

  if (select externally_sourced_base_quantity from public.qb_order_delivery_items where order_id = v_order) <> 2
    or (select warehouse_base_quantity from public.qb_order_delivery_movements where order_id = v_order) <> 3
    or (select delivered_base_quantity from public.qb_order_delivery_movements where order_id = v_order) <> 5
  then
    raise exception 'QB_MATRIX_EXTERNAL_STOCK_OR_RECEIPT_CONTRACT_FAILED';
  end if;
end;
$$;

rollback;
