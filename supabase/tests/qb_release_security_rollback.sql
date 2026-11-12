-- Fictitious QA fixtures only. Every write is rolled back.
begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  inactive_id uuid := gen_random_uuid();
  no_profile_id uuid := gen_random_uuid();
  supervisor_id uuid := gen_random_uuid();
  target_id uuid := gen_random_uuid();
  actor uuid;
begin
  insert into auth.users(id, email)
  select id, id || '@example.test'
  from unnest(array[admin_id, inactive_id, no_profile_id, supervisor_id, target_id]) id;

  insert into public.profiles(id, role, is_active) values
    (admin_id, 'administrador', true), (inactive_id, 'administrador', false),
    (supervisor_id, 'supervisor', true), (target_id, 'ventas', true);

  set local role authenticated;
  foreach actor in array array[null::uuid, inactive_id, no_profile_id, supervisor_id] loop
    perform set_config('request.jwt.claim.sub', coalesce(actor::text, ''), true);
    begin
      perform public.admin_update_profile(target_id, 'QB QA', 'administrador', true);
      raise exception 'Unauthorized profile update succeeded';
    exception when insufficient_privilege then null;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', inactive_id::text, true);
  begin
    perform public.admin_update_profile(inactive_id, 'QB QA', 'administrador', true);
    raise exception 'An inactive administrator reactivated itself';
  exception when insufficient_privilege then null;
  end;

  reset role;
  if not exists (select 1 from public.profiles where id = target_id and role = 'ventas')
    or not exists (select 1 from public.profiles where id = inactive_id and not is_active) then
    raise exception 'Denied profile requests changed data';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.admin_update_profile(target_id, 'QB QA', 'entregador', true);
  reset role;
  if not exists (select 1 from public.profiles where id = target_id and role = 'entregador' and is_active) then
    raise exception 'Authorized profile update did not persist';
  end if;
end;
$$;

do $$
declare
  admin_id uuid;
  supervisor_id uuid;
  customer_id uuid;
  location_id uuid;
  other_location_id uuid;
  unit_id uuid;
  products uuid[];
  cart jsonb;
  first_item jsonb;
  changed jsonb;
  key text := gen_random_uuid()::text;
  batch_key text := gen_random_uuid()::text;
  invalid_key text := gen_random_uuid()::text;
  legacy_key text := gen_random_uuid()::text;
  delivery_date date := (now() at time zone 'America/La_Paz')::date + 1;
  original uuid;
  reply record;
  batch_ids uuid[];
  replay_ids uuid[];
  count_before bigint;
begin
  select id into strict admin_id from public.profiles
    where role = 'administrador' and is_active and email like 'qa-%@example.test' limit 1;
  select id into strict supervisor_id from public.profiles where role = 'supervisor' and is_active limit 1;
  select c.id, l.id into strict customer_id, location_id
  from public.customer_accounts c join public.qb_customer_locations l on l.customer_account_id = c.id
  where c.email like 'qa-customer-%@example.test' and c.is_active and l.is_active limit 1;

  insert into public.qb_customer_locations(customer_account_id, label, address, is_active)
    values (customer_id, 'QA alternativa', 'QA alternativa', true) returning id into other_location_id;
  select id into strict unit_id from public.qb_units where code = 'kg' and is_active limit 1;

  with inserted as (
    insert into public.products(name, stock_current, stock_minimum, requires_classification, is_sellable, is_active)
    select 'QB QA idempotencia ' || n, 100, 0, false, true, true from generate_series(1,31) n
    returning id
  )
  select array_agg(id order by id) into products from inserted;

  insert into public.qb_product_unit_settings(
    product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id, base_price_unit_id,
    base_sale_price, is_visible_in_qb_catalog, is_classifiable, classification_mode, is_qb_active
  )
  select p, unit_id, unit_id, unit_id, unit_id, 10, true, false, 'none', true from unnest(products) p;

  select jsonb_agg(jsonb_build_object('product_id', p.id, 'allowed_unit_id', a.id, 'quantity', 4) order by p.ordinal)
  into cart
  from unnest(products) with ordinality p(id, ordinal)
  cross join lateral (
    select id from public.qb_product_allowed_units
    where product_id = p.id and usage_context = 'pedido' and is_active
    order by is_default desc, id limit 1
  ) a;
  if jsonb_array_length(cart) is distinct from 31 then raise exception 'Missing QA products or units'; end if;

  first_item := jsonb_build_array(cart->0);
  changed := jsonb_set(first_item, '{0,quantity}', '5');
  select count(*) into count_before from public.qb_orders;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  select * into strict reply from public.create_qb17_internal_catalog_order_with_date(
    'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',delivery_date,first_item,key
  );
  if reply.result_code <> 'created' then raise exception 'Initial create: %', reply.result_code; end if;
  original := reply.created_order_id;

  select * into strict reply from public.create_qb17_internal_catalog_order_with_date(
    'registered',customer_id,location_id,null,null,null,null,null,null,null,' QA ',delivery_date,
    jsonb_set(first_item, '{0,quantity}', '4.00'),upper(key)
  );
  if reply.result_code <> 'already_created' or reply.created_order_id <> original then
    raise exception 'Equivalent replay did not return the same order';
  end if;

  begin
    perform public.create_qb17_internal_catalog_order_with_date(
      'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',delivery_date,changed,key
    );
    raise exception 'Changed quantity accepted';
  exception when unique_violation then
    if sqlerrm <> 'QB_ORDER_CREATE_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.create_qb17_internal_catalog_order_with_date(
      'registered',customer_id,other_location_id,null,null,null,null,null,null,null,'QA',delivery_date,first_item,key
    );
    raise exception 'Changed location accepted';
  exception when unique_violation then
    if sqlerrm <> 'QB_ORDER_CREATE_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.create_qb17_internal_catalog_order_with_date(
      'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',delivery_date + 1,first_item,key
    );
    raise exception 'Changed date accepted';
  exception when unique_violation then
    if sqlerrm <> 'QB_ORDER_CREATE_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  begin
    perform public.create_qb_internal_catalog_order(
      'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',changed,key
    );
    raise exception 'Physical RPC bypassed the request check';
  exception when unique_violation then
    if sqlerrm <> 'QB_ORDER_CREATE_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', supervisor_id::text, true);
  begin
    perform public.create_qb17_internal_catalog_order_with_date(
      'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',delivery_date,first_item,key
    );
    raise exception 'Other actor reused the key';
  exception when unique_violation then
    if sqlerrm <> 'QB_ORDER_CREATE_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  select * into strict reply from public.create_qb17_internal_catalog_order_with_date(
    'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',delivery_date,
    jsonb_set(cart, '{30,quantity}', '0'),invalid_key
  );
  if reply.result_code <> 'invalid_quantity' or reply.created_order_id is not null then
    raise exception 'Failed part should return one validation error: %', reply.result_code;
  end if;

  select array_agg(created_order_id order by ordinal) into batch_ids
  from public.create_qb17_internal_catalog_order_with_date(
    'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',delivery_date,cart,batch_key
  ) with ordinality as batch(created_order_id, order_reference, result_code, ordinal)
  where result_code = 'created';
  select array_agg(created_order_id order by ordinal) into replay_ids
  from public.create_qb17_internal_catalog_order_with_date(
    'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',delivery_date,cart,batch_key
  ) with ordinality as batch(created_order_id, order_reference, result_code, ordinal)
  where result_code = 'already_created';
  if cardinality(batch_ids) is distinct from 2 or batch_ids is distinct from replay_ids then
    raise exception 'Batch replay did not preserve both orders';
  end if;
  begin
    perform public.create_qb17_internal_catalog_order_with_date(
      'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',delivery_date,first_item,batch_key
    );
    raise exception 'Changing the number of batches reused the key';
  exception when unique_violation then
    if sqlerrm <> 'QB_ORDER_CREATE_IDEMPOTENCY_CONFLICT' then raise; end if;
  end;

  reset role;
  if (select count(*) from public.qb_orders) <> count_before + 3
    or (select count(*) from public.qb_order_items where order_id = any(batch_ids)) <> 31
    or (select requested_quantity from public.qb_order_items where order_id = original) is distinct from 4::numeric
    or exists (select 1 from public.qb_orders where id = any(batch_ids) and operational_date <> delivery_date)
    or exists (select 1 from private.qb_internal_order_requests where request_key = invalid_key) then
    raise exception 'Incorrect persistence after creation, conflict or failed batch';
  end if;

  -- Emulate a pre-migration order from a split request.
  select * into strict reply from private.insert_qb_internal_catalog_order(
    'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',first_item,legacy_key || '-01'
  );
  if reply.result_code <> 'created' then raise exception 'Could not stage legacy request'; end if;
  set local role authenticated;
  begin
    perform public.create_qb17_internal_catalog_order_with_date(
      'registered',customer_id,location_id,null,null,null,null,null,null,null,'QA',delivery_date,cart,legacy_key
    );
    raise exception 'Unverifiable legacy request succeeded';
  exception when unique_violation then
    if sqlerrm <> 'QB_ORDER_CREATE_LEGACY_REPLAY_REQUIRES_REFRESH' then raise; end if;
  end;
end;
$$;

rollback;

