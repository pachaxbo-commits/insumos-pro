-- Contrato operativo final del piloto QB Insumos.
-- Ejecutar solamente en el Staging autorizado. Todo cambio termina en ROLLBACK.

begin;

create temporary table qb_pilot_qa_result (
  marker text not null,
  registered_order_id uuid not null,
  registered_reference text not null,
  guest_order_id uuid not null,
  guest_reference text not null,
  product_id uuid not null,
  source_unit text not null,
  requested_quantity numeric not null,
  registered_actual_quantity numeric not null,
  guest_actual_quantity numeric not null,
  registered_actual_base_quantity numeric not null,
  guest_actual_base_quantity numeric not null,
  base_unit text not null,
  stock_before numeric not null,
  stock_after_preparation numeric not null,
  stock_after_delivery numeric not null,
  delivery_movements integer not null,
  receipt_id uuid not null,
  receipt_status text not null,
  registered_status text not null,
  guest_status text not null,
  payments_before bigint not null,
  payments_after bigint not null
) on commit drop;

do $qa$
declare
  v_marker text := 'QB-PILOT-QA-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MI');
  v_admin_id uuid;
  v_customer_id uuid := extensions.gen_random_uuid();
  v_location_id uuid := extensions.gen_random_uuid();
  v_product_id uuid;
  v_allowed_unit_id uuid;
  v_unit_id uuid;
  v_source_unit text;
  v_base_unit text;
  v_step numeric(18, 6);
  v_requested numeric(18, 6);
  v_registered_actual numeric(18, 6);
  v_guest_actual numeric(18, 6);
  v_registered_order_id uuid;
  v_registered_reference text;
  v_guest_order_id uuid;
  v_guest_reference text;
  v_result_code text;
  v_registered_preparation_id uuid;
  v_guest_preparation_id uuid;
  v_registered_base numeric(18, 6);
  v_guest_base numeric(18, 6);
  v_stock_before numeric(18, 6);
  v_stock_after_preparation numeric(18, 6);
  v_stock_after_delivery numeric(18, 6);
  v_delivery_movements integer;
  v_receipt_id uuid;
  v_payments_before bigint;
  v_payments_after bigint;
  v_registered_retry_blocked boolean := false;
  v_guest_retry_blocked boolean := false;
  v_hash text := repeat(replace(extensions.gen_random_uuid()::text, '-', ''), 2);
begin
  select profile.id
  into v_admin_id
  from public.profiles profile
  where profile.is_active = true
    and profile.role in ('admin', 'administrador')
  order by case when profile.role = 'administrador' then 0 else 1 end, profile.created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'QB-PILOT preflight: no existe un administrador activo.';
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
    coalesce(unit.symbol, presentation.symbol),
    base_unit.symbol,
    coalesce(nullif(allowed.quantity_step, 0), 1),
    greatest(
      coalesce(nullif(allowed.min_quantity, 0), 1),
      coalesce(nullif(allowed.quantity_step, 0), 1)
    ) + coalesce(nullif(allowed.quantity_step, 0), 1),
    product.stock_current
  into
    v_product_id,
    v_allowed_unit_id,
    v_source_unit,
    v_base_unit,
    v_step,
    v_requested,
    v_stock_before
  from public.products product
  join public.qb_product_unit_settings settings
    on settings.product_id = product.id
   and settings.is_qb_active = true
   and settings.is_visible_in_qb_catalog = true
   and settings.base_sale_price > 0
  join public.qb_units base_unit on base_unit.id = settings.base_unit_id
  join public.qb_product_allowed_units allowed
    on allowed.product_id = product.id
   and allowed.usage_context = 'pedido'
   and allowed.is_active = true
  left join public.qb_units unit on unit.id = allowed.unit_id
  left join public.qb_product_presentations presentation on presentation.id = allowed.presentation_id
  where product.is_active = true
    and coalesce(product.is_sellable, true) = true
    and coalesce(product.is_qb_loss_product, false) = false
  order by allowed.is_default desc, allowed.sort_order, product.id
  limit 1;

  if v_product_id is null or v_source_unit is null or v_base_unit is null then
    select id, symbol into v_unit_id, v_base_unit
    from public.qb_units
    where code = 'kg' and is_active
    limit 1;
    if v_unit_id is null then
      raise exception 'QB-PILOT preflight: no existe unidad local kg.';
    end if;

    v_product_id := extensions.gen_random_uuid();
    v_allowed_unit_id := extensions.gen_random_uuid();
    v_source_unit := v_base_unit;
    v_step := 1;
    v_requested := 2;
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
      v_product_id, v_unit_id, v_unit_id, v_unit_id,
      v_unit_id, 10, false, true, false, 'none',
      true, v_admin_id, v_admin_id
    );

    insert into public.qb_product_allowed_units (
      id, product_id, usage_context, unit_id, is_default,
      quantity_step, min_quantity, is_active, created_by, updated_by
    ) values (
      v_allowed_unit_id, v_product_id, 'pedido', v_unit_id, true,
      v_step, 1, true, v_admin_id, v_admin_id
    );
  end if;

  v_registered_actual := v_requested - v_step;
  v_guest_actual := v_requested;
  if v_registered_actual <= 0 or v_guest_actual <= 0 then
    raise exception 'QB-PILOT preflight: las cantidades calculadas no son positivas.';
  end if;

  select count(*) into v_payments_before from public.payments;

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
  into v_registered_order_id, v_registered_reference, v_result_code
  from public.create_qb_internal_catalog_order(
    'registered', v_customer_id, v_location_id,
    null, null, null, null, null, null, null,
    v_marker,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'allowed_unit_id', v_allowed_unit_id,
      'quantity', v_requested,
      'notes', v_marker
    )),
    extensions.gen_random_uuid()::text
  ) result;

  if v_result_code <> 'created' or v_registered_order_id is null then
    raise exception 'QB-PILOT: no se creó el pedido registrado (%).', v_result_code;
  end if;

  select result.created_order_id, result.order_reference, result.result_code
  into v_guest_order_id, v_guest_reference, v_result_code
  from public.create_qb_guest_catalog_order(
    'Negocio ' || v_marker,
    'Responsable ' || v_marker,
    '+591 70000000',
    '+59170000000',
    lower(v_marker) || '-guest@example.invalid',
    'Direccion invitada ' || v_marker,
    '-17.3935',
    '-66.1570',
    'Entrega ' || v_marker,
    'Fixture transaccional',
    null,
    v_marker,
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'allowed_unit_id', v_allowed_unit_id,
      'quantity', v_requested,
      'notes', v_marker
    )),
    extensions.gen_random_uuid()::text,
    v_hash,
    repeat(replace(extensions.gen_random_uuid()::text, '-', ''), 2),
    repeat(replace(extensions.gen_random_uuid()::text, '-', ''), 2)
  ) result;

  if v_result_code <> 'created' or v_guest_order_id is null then
    raise exception 'QB-PILOT: no se creó el pedido invitado (%).', v_result_code;
  end if;

  if (select count(*) from public.qb_orders where customer_notes = v_marker) <> 2
    or exists (
      select 1 from public.qb_orders
      where id in (v_registered_order_id, v_guest_order_id)
        and status <> 'pendiente_preparacion'
    )
    or (select stock_current from public.products where id = v_product_id) <> v_stock_before
  then
    raise exception 'QB-PILOT: creación o estado inicial inconsistente.';
  end if;

  v_registered_preparation_id := public.start_qb_order_preparation(v_registered_order_id);
  v_guest_preparation_id := public.start_qb_order_preparation(v_guest_order_id);

  perform public.save_qb_order_preparation(
    v_registered_order_id,
    jsonb_build_array(jsonb_build_object(
      'order_item_id', (select id from public.qb_order_items where order_id = v_registered_order_id),
      'status', 'parcial',
      'actual_allowed_unit_id', v_allowed_unit_id,
      'actual_quantity', v_registered_actual,
      'notes', v_marker
    )),
    v_marker,
    false
  );

  if (select status from public.qb_order_preparations where id = v_registered_preparation_id) <> 'en_preparacion'
    or (select actual_quantity from public.qb_order_preparation_items where preparation_id = v_registered_preparation_id) <> v_registered_actual
  then
    raise exception 'QB-PILOT: el avance registrado no se guardó o reabrió correctamente.';
  end if;

  perform public.save_qb_order_preparation(
    v_guest_order_id,
    jsonb_build_array(jsonb_build_object(
      'order_item_id', (select id from public.qb_order_items where order_id = v_guest_order_id),
      'status', 'completo',
      'actual_allowed_unit_id', v_allowed_unit_id,
      'actual_quantity', v_guest_actual,
      'notes', v_marker
    )),
    v_marker,
    false
  );

  perform public.save_qb_order_preparation(
    v_registered_order_id,
    jsonb_build_array(jsonb_build_object(
      'order_item_id', (select id from public.qb_order_items where order_id = v_registered_order_id),
      'status', 'parcial',
      'actual_allowed_unit_id', v_allowed_unit_id,
      'actual_quantity', v_registered_actual,
      'notes', v_marker
    )),
    v_marker,
    true
  );

  perform public.save_qb_order_preparation(
    v_guest_order_id,
    jsonb_build_array(jsonb_build_object(
      'order_item_id', (select id from public.qb_order_items where order_id = v_guest_order_id),
      'status', 'completo',
      'actual_allowed_unit_id', v_allowed_unit_id,
      'actual_quantity', v_guest_actual,
      'notes', v_marker
    )),
    v_marker,
    true
  );

  select actual_base_quantity into v_registered_base
  from public.qb_order_preparation_items where preparation_id = v_registered_preparation_id;
  select actual_base_quantity into v_guest_base
  from public.qb_order_preparation_items where preparation_id = v_guest_preparation_id;
  select stock_current into v_stock_after_preparation from public.products where id = v_product_id;

  if v_registered_base <= 0 or v_guest_base <= 0 or v_stock_after_preparation <> v_stock_before then
    raise exception 'QB-PILOT: preparar pedidos alteró stock o produjo cantidad inválida.';
  end if;

  perform public.confirm_qb_order_delivery(v_registered_order_id);
  perform public.confirm_qb_order_delivery(v_guest_order_id);

  select stock_current into v_stock_after_delivery from public.products where id = v_product_id;
  select count(*) into v_delivery_movements
  from public.qb_order_delivery_movements
  where order_id in (v_registered_order_id, v_guest_order_id);

  if v_stock_after_delivery <> v_stock_before - v_registered_base - v_guest_base
    or v_delivery_movements <> 2
  then
    raise exception 'QB-PILOT: la entrega no descontó una sola vez las cantidades reales.';
  end if;

  begin
    perform public.confirm_qb_order_delivery(v_registered_order_id);
  exception when others then
    v_registered_retry_blocked := true;
  end;
  begin
    perform public.confirm_qb_order_delivery(v_guest_order_id);
  exception when others then
    v_guest_retry_blocked := true;
  end;

  if not v_registered_retry_blocked or not v_guest_retry_blocked
    or (select stock_current from public.products where id = v_product_id) <> v_stock_after_delivery
    or (select count(*) from public.qb_order_delivery_movements where order_id in (v_registered_order_id, v_guest_order_id)) <> 2
  then
    raise exception 'QB-PILOT: un reintento produjo doble entrega o doble descuento.';
  end if;

  select count(*) into v_payments_after from public.payments;
  if v_payments_after <> v_payments_before then
    raise exception 'QB-PILOT: el flujo registró un pago inesperado.';
  end if;

  v_receipt_id := public.create_qb_receipt_draft(v_customer_id, array[v_registered_order_id]);
  if not exists (
    select 1
    from public.qb_receipt_lines line
    where line.receipt_id = v_receipt_id
      and line.delivered_base_quantity = v_registered_base
  ) then
    raise exception 'QB-PILOT: el recibo no conserva la cantidad realmente entregada.';
  end if;

  perform public.emit_qb_receipt(v_receipt_id);

  insert into qb_pilot_qa_result
  select
    v_marker,
    v_registered_order_id,
    v_registered_reference,
    v_guest_order_id,
    v_guest_reference,
    v_product_id,
    v_source_unit,
    v_requested,
    v_registered_actual,
    v_guest_actual,
    v_registered_base,
    v_guest_base,
    v_base_unit,
    v_stock_before,
    v_stock_after_preparation,
    v_stock_after_delivery,
    v_delivery_movements,
    v_receipt_id,
    (select status from public.qb_receipts where id = v_receipt_id),
    (select status from public.qb_orders where id = v_registered_order_id),
    (select status from public.qb_orders where id = v_guest_order_id),
    v_payments_before,
    v_payments_after;
end
$qa$;

select * from qb_pilot_qa_result;

rollback;
