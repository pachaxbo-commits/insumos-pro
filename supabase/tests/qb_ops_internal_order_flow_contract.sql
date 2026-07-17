-- Contrato operativo QB-OPS A-O.
-- Ejecutar exclusivamente en Staging autorizado dentro de esta transaccion.
-- Todos los fixtures y cambios se eliminan con ROLLBACK.

begin;

create temporary table qb_ops_qa_result (
  marker text not null,
  admin_id uuid not null,
  customer_id uuid not null,
  location_id uuid not null,
  product_id uuid not null,
  order_id uuid not null,
  preparation_id uuid not null,
  receipt_id uuid not null,
  requested_quantity numeric not null,
  actual_quantity numeric not null,
  actual_base_quantity numeric not null,
  stock_initial numeric not null,
  stock_after_preparation numeric not null,
  stock_after_delivery numeric not null,
  movement_count integer not null,
  payment_count_before bigint not null,
  payment_count_after bigint not null,
  final_order_status text not null
) on commit drop;

do $$
declare
  v_marker text := 'QB-OPS-QA-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MI');
  v_admin_id uuid;
  v_customer_id uuid := extensions.gen_random_uuid();
  v_location_id uuid := extensions.gen_random_uuid();
  v_product_id uuid;
  v_allowed_unit_id uuid;
  v_requested_quantity numeric(18, 6);
  v_actual_quantity numeric(18, 6);
  v_order_id uuid;
  v_order_reference text;
  v_result_code text;
  v_preparation_id uuid;
  v_receipt_id uuid;
  v_actual_base_quantity numeric(18, 6);
  v_stock_initial numeric(18, 6);
  v_stock_after_preparation numeric(18, 6);
  v_stock_after_delivery numeric(18, 6);
  v_movement_count integer;
  v_payment_count_before bigint;
  v_payment_count_after bigint;
  v_order_status text;
  v_retry_failed boolean := false;
begin
  select profile.id
  into v_admin_id
  from public.profiles profile
  where profile.is_active = true
    and profile.role in ('admin', 'administrador')
  order by case when profile.role = 'administrador' then 0 else 1 end, profile.created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'QB-OPS preflight: no existe administrador activo.';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_admin_id, 'role', 'authenticated')::text,
    true
  );

  select
    product.id,
    allowed.id,
    coalesce(nullif(allowed.min_quantity, 0), nullif(allowed.quantity_step, 0), 1)
      + coalesce(nullif(allowed.quantity_step, 0), 1),
    product.stock_current
  into
    v_product_id,
    v_allowed_unit_id,
    v_requested_quantity,
    v_stock_initial
  from public.products product
  join public.qb_product_unit_settings settings
    on settings.product_id = product.id
   and settings.is_qb_active = true
   and settings.is_visible_in_qb_catalog = true
   and settings.base_sale_price > 0
  join public.qb_product_allowed_units allowed
    on allowed.product_id = product.id
   and allowed.usage_context = 'pedido'
   and allowed.is_active = true
  where product.is_active = true
    and coalesce(product.is_sellable, true) = true
    and coalesce(product.is_qb_loss_product, false) = false
  order by product.id, allowed.is_default desc, allowed.sort_order
  limit 1;

  if v_product_id is null then
    raise exception 'QB-OPS preflight: no existe producto catalogable con precio y unidad permitida.';
  end if;

  v_actual_quantity := v_requested_quantity - coalesce(
    (select nullif(allowed.quantity_step, 0) from public.qb_product_allowed_units allowed where allowed.id = v_allowed_unit_id),
    1
  );

  select count(*) into v_payment_count_before from public.payments;

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
    'Fixture transaccional', true, true
  );

  select result.created_order_id, result.order_reference, result.result_code
  into v_order_id, v_order_reference, v_result_code
  from public.create_qb_internal_catalog_order(
    'registered', v_customer_id, v_location_id,
    null, null, null, null, null, null, null,
    v_marker,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'allowed_unit_id', v_allowed_unit_id,
      'quantity', v_requested_quantity,
      'notes', v_marker
    )),
    extensions.gen_random_uuid()::text
  ) result;

  if v_result_code <> 'created' or v_order_id is null or v_order_reference is null then
    raise exception 'A: creacion interna fallo con codigo %.', v_result_code;
  end if;

  select orders.status into v_order_status from public.qb_orders orders where orders.id = v_order_id;
  if v_order_status <> 'pendiente_preparacion' then
    raise exception 'B: el pedido no quedo pendiente de preparacion.';
  end if;

  if (select product.stock_current from public.products product where product.id = v_product_id) <> v_stock_initial then
    raise exception 'A-B: crear pedido modifico stock.';
  end if;

  v_preparation_id := public.start_qb_order_preparation(v_order_id);

  perform public.save_qb_order_preparation(
    v_order_id,
    jsonb_build_array(jsonb_build_object(
      'order_item_id', (select item.id from public.qb_order_items item where item.order_id = v_order_id),
      'status', 'parcial',
      'actual_allowed_unit_id', v_allowed_unit_id,
      'actual_quantity', v_actual_quantity,
      'notes', v_marker
    )),
    v_marker,
    false
  );

  select item.actual_base_quantity
  into v_actual_base_quantity
  from public.qb_order_preparation_items item
  where item.preparation_id = v_preparation_id;

  if v_actual_base_quantity <= 0
    or (select item.actual_quantity from public.qb_order_preparation_items item where item.preparation_id = v_preparation_id) <> v_actual_quantity
    or (select preparation.status from public.qb_order_preparations preparation where preparation.id = v_preparation_id) <> 'en_preparacion'
  then
    raise exception 'C-F: el avance de preparacion no se guardo o reabrio correctamente.';
  end if;

  select product.stock_current into v_stock_after_preparation
  from public.products product where product.id = v_product_id;
  if v_stock_after_preparation <> v_stock_initial then
    raise exception 'G-H: guardar preparacion modifico stock.';
  end if;

  perform public.save_qb_order_preparation(
    v_order_id,
    jsonb_build_array(jsonb_build_object(
      'order_item_id', (select item.id from public.qb_order_items item where item.order_id = v_order_id),
      'status', 'parcial',
      'actual_allowed_unit_id', v_allowed_unit_id,
      'actual_quantity', v_actual_quantity,
      'notes', v_marker
    )),
    v_marker,
    true
  );

  if (select product.stock_current from public.products product where product.id = v_product_id) <> v_stock_initial then
    raise exception 'G-H: confirmar preparacion modifico stock.';
  end if;

  perform public.confirm_qb_order_delivery(v_order_id);

  select product.stock_current into v_stock_after_delivery
  from public.products product where product.id = v_product_id;
  select count(*) into v_movement_count
  from public.qb_order_delivery_movements movement where movement.order_id = v_order_id;

  if v_stock_after_delivery <> v_stock_initial - v_actual_base_quantity or v_movement_count <> 1 then
    raise exception 'I-J: entrega no desconto exactamente una vez la cantidad real.';
  end if;

  begin
    perform public.confirm_qb_order_delivery(v_order_id);
  exception when others then
    v_retry_failed := true;
  end;

  if not v_retry_failed
    or (select product.stock_current from public.products product where product.id = v_product_id) <> v_stock_after_delivery
    or (select count(*) from public.qb_order_delivery_movements movement where movement.order_id = v_order_id) <> 1
  then
    raise exception 'K: el reintento permitio doble entrega o doble descuento.';
  end if;

  select count(*) into v_payment_count_after from public.payments;
  if v_payment_count_after <> v_payment_count_before then
    raise exception 'L: el flujo registro un pago inesperado.';
  end if;

  if (select orders.status from public.qb_orders orders where orders.id = v_order_id) <> 'entregado_pendiente_recibo' then
    raise exception 'M-N: pedido entregado no quedo elegible para recibo.';
  end if;

  v_receipt_id := public.create_qb_receipt_draft(v_customer_id, array[v_order_id]);

  if not exists (
    select 1
    from public.qb_receipt_lines line
    join public.qb_order_delivery_movements movement
      on movement.preparation_item_id = line.preparation_item_id
    where line.receipt_id = v_receipt_id
      and line.delivered_base_quantity = v_actual_base_quantity
      and line.delivered_base_quantity = movement.delivered_base_quantity
  ) then
    raise exception 'O: el recibo no uso la cantidad real entregada.';
  end if;

  select orders.status into v_order_status from public.qb_orders orders where orders.id = v_order_id;

  insert into qb_ops_qa_result values (
    v_marker, v_admin_id, v_customer_id, v_location_id, v_product_id,
    v_order_id, v_preparation_id, v_receipt_id,
    v_requested_quantity, v_actual_quantity, v_actual_base_quantity,
    v_stock_initial, v_stock_after_preparation, v_stock_after_delivery,
    v_movement_count, v_payment_count_before, v_payment_count_after, v_order_status
  );
end;
$$;

select * from qb_ops_qa_result;

rollback;
