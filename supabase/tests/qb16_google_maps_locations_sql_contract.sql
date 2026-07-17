-- Contrato SQL transaccional QB-16.
-- Ejecutar solo en una base local autorizada con QB-16 aplicada.
-- Todos los fixtures y llamadas de negocio quedan contenidos por ROLLBACK.

begin;

create temp table qb16_test_context (
  customer_a_id uuid not null,
  customer_b_id uuid not null,
  inactive_customer_id uuid not null,
  internal_user_id uuid not null,
  customer_b_location_id uuid not null,
  product_id uuid not null,
  allowed_unit_id uuid not null,
  location_a1_id uuid,
  location_a2_id uuid,
  manual_location_id uuid,
  registered_order_id uuid,
  registered_snapshot jsonb
) on commit drop;

create temp table qb16_test_results (
  scenario integer primary key,
  description text not null
) on commit drop;

grant select, update on qb16_test_context to authenticated, service_role;
grant select, insert on qb16_test_results to authenticated, service_role;

create function pg_temp.qb16_pass(p_scenario integer, p_description text)
returns void
language sql
as $$
  insert into qb16_test_results (scenario, description)
  values (p_scenario, p_description);
$$;

create function pg_temp.qb16_set_claim(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    case
      when p_user_id is null then '{"role":"authenticated"}'
      else jsonb_build_object('role', 'authenticated', 'sub', p_user_id::text)::text
    end,
    true
  );
  perform set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create function pg_temp.qb16_guest_call(
  p_key uuid,
  p_latitude text,
  p_longitude text,
  p_place_id text,
  p_payload_hash text
)
returns table (
  created_order_id uuid,
  order_reference text,
  order_status text,
  order_created_at timestamptz,
  result_code text
)
language sql
as $$
  select result.*
  from qb16_test_context context
  cross join lateral public.create_qb_guest_catalog_order(
    'Negocio QB16 TEST',
    'Responsable QB16 TEST',
    '+591 70000000',
    '+59170000000',
    'qb16-guest@example.test',
    'Direccion manual QB16 TEST',
    p_latitude,
    p_longitude,
    'Ubicacion invitada QB16 TEST',
    'Referencia invitada QB16 TEST',
    p_place_id,
    'Notas QB16 TEST',
    jsonb_build_array(jsonb_build_object(
      'product_id', context.product_id,
      'allowed_unit_id', context.allowed_unit_id,
      'quantity', 1,
      'notes', 'Linea QB16 TEST'
    )),
    p_key::text,
    coalesce(p_payload_hash, repeat(replace(p_key::text, '-', ''), 2)),
    repeat(replace(p_key::text, '-', ''), 2),
    repeat(replace(p_key::text, '-', ''), 2)
  ) result;
$$;

do $setup$
declare
  v_customer_a constant uuid := '16000000-0000-4000-8000-000000000001';
  v_customer_b constant uuid := '16000000-0000-4000-8000-000000000002';
  v_inactive constant uuid := '16000000-0000-4000-8000-000000000003';
  v_internal constant uuid := '16000000-0000-4000-8000-000000000004';
  v_b_location constant uuid := '16000000-0000-4000-8000-000000000111';
  v_product constant uuid := '16000000-0000-4000-8000-000000000101';
  v_allowed constant uuid := '16000000-0000-4000-8000-000000000102';
  v_base_unit_id uuid;
begin
  if to_regclass('public.qb_customer_locations') is null
    or to_regclass('public.customer_accounts') is null
    or to_regclass('public.qb_orders') is null
    or to_regclass('private.qb_guest_order_rate_limits') is null
    or to_regclass('private.qb_guest_order_idempotency') is null
    or to_regprocedure('public.save_own_qb_customer_location(uuid,text,text,text,text,numeric,numeric,text,boolean)') is null
    or to_regprocedure('public.set_own_qb_customer_location_primary(uuid)') is null
    or to_regprocedure('public.deactivate_own_qb_customer_location(uuid)') is null
    or to_regprocedure('public.create_qb_guest_catalog_order(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,text,text)') is null
  then
    raise exception 'QB-16 preflight: faltan relaciones o funciones canónicas.';
  end if;

  if exists (
    select 1 from auth.users
    where id in (v_customer_a, v_customer_b, v_inactive, v_internal)
  ) or exists (
    select 1 from public.qb_customer_locations where id = v_b_location
  ) or exists (
    select 1 from public.products where id = v_product
  ) then
    raise exception 'QB-16 preflight: los UUID reservados para fixtures ya existen.';
  end if;

  select unit.id
  into v_base_unit_id
  from public.qb_units unit
  where unit.is_active = true and unit.is_base = true
  order by unit.sort_order, unit.id
  limit 1;

  if v_base_unit_id is null then
    raise exception 'QB-16 preflight: no existe una unidad base activa para el fixture guest.';
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data,
    raw_user_meta_data, confirmation_token, recovery_token,
    email_change_token_new, email_change
  )
  select
    fixture.id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'authenticated',
    'authenticated',
    fixture.email,
    '',
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '',
    '',
    '',
    ''
  from (values
    (v_customer_a, 'qb16-a@example.test'),
    (v_customer_b, 'qb16-b@example.test'),
    (v_inactive, 'qb16-inactive@example.test'),
    (v_internal, 'qb16-internal@example.test')
  ) fixture(id, email);

  insert into public.profiles (id, email, full_name, role, is_active)
  values (v_internal, 'qb16-internal@example.test', 'Interno QB16 TEST', 'administrador', true);

  insert into public.customer_accounts (
    id, email, full_name, business_name, responsible_name, phone, is_active
  ) values
    (v_customer_a, 'qb16-a@example.test', 'Cliente A QB16', 'Negocio A QB16', 'Responsable A', '70000001', true),
    (v_customer_b, 'qb16-b@example.test', 'Cliente B QB16', 'Negocio B QB16', 'Responsable B', '70000002', true),
    (v_inactive, 'qb16-inactive@example.test', 'Inactivo QB16', 'Negocio inactivo', 'Responsable inactivo', '70000003', false);

  insert into public.qb_customer_locations (
    id, customer_account_id, label, address, reference,
    latitude, longitude, google_place_id, is_primary, is_active
  ) values (
    v_b_location,
    v_customer_b,
    'Ubicacion B',
    'Direccion cliente B QB16',
    'Referencia B',
    -17.3900000,
    -66.1500000,
    'QB16-PLACE-B',
    true,
    true
  );

  insert into public.products (id, name, is_active, is_sellable, stock_current)
  values (v_product, 'Producto guest QB16 TEST', true, true, 100);

  insert into public.qb_product_unit_settings (
    product_id, base_unit_id, base_inventory_unit_id, base_price_unit_id,
    is_visible_in_qb_catalog, is_qb_active
  ) values (
    v_product, v_base_unit_id, v_base_unit_id, v_base_unit_id, true, true
  );

  insert into public.qb_product_allowed_units (
    id, product_id, usage_context, unit_id, is_default,
    quantity_step, min_quantity, is_active
  ) values (
    v_allowed, v_product, 'pedido', v_base_unit_id, true, 1, 1, true
  );

  insert into qb16_test_context (
    customer_a_id, customer_b_id, inactive_customer_id, internal_user_id,
    customer_b_location_id, product_id, allowed_unit_id
  ) values (
    v_customer_a, v_customer_b, v_inactive, v_internal,
    v_b_location, v_product, v_allowed
  );
end
$setup$;

-- Escenarios 1 a 8: esquema y privilegios.
do $schema_and_acl$
declare
  v_definition text;
begin
  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'qb_customer_locations'
      and column_name in ('latitude', 'longitude', 'google_place_id')
  ) <> 3 then
    raise exception 'QB-16 escenario 1: faltan columnas de ubicación.';
  end if;
  perform pg_temp.qb16_pass(1, 'Existen las tres columnas.');

  select pg_get_constraintdef(constraint_info.oid)
  into v_definition
  from pg_catalog.pg_constraint constraint_info
  where constraint_info.conname = 'qb_customer_locations_coordinates_check'
    and constraint_info.conrelid = 'public.qb_customer_locations'::regclass;
  if v_definition is null
    or v_definition not like '%latitude IS NULL%longitude IS NULL%'
  then
    raise exception 'QB-16 escenario 2: falta el contrato del par opcional.';
  end if;
  perform pg_temp.qb16_pass(2, 'La pareja de coordenadas está protegida.');

  if v_definition not like '%latitude >=%90%latitude <=%90%'
    or v_definition not like '%longitude >=%180%longitude <=%180%'
  then
    raise exception 'QB-16 escenario 3: faltan rangos de coordenadas.';
  end if;
  perform pg_temp.qb16_pass(3, 'Los rangos de coordenadas están protegidos.');

  select pg_get_constraintdef(constraint_info.oid)
  into v_definition
  from pg_catalog.pg_constraint constraint_info
  where constraint_info.conname = 'qb_customer_locations_google_place_id_check'
    and constraint_info.conrelid = 'public.qb_customer_locations'::regclass;
  if v_definition is null or v_definition not like '%200%' then
    raise exception 'QB-16 escenario 4: falta el límite de Place ID.';
  end if;
  perform pg_temp.qb16_pass(4, 'Place ID tiene límite.');

  if has_function_privilege('anon', 'public.save_own_qb_customer_location(uuid,text,text,text,text,numeric,numeric,text,boolean)', 'EXECUTE')
    or has_function_privilege('anon', 'public.set_own_qb_customer_location_primary(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.deactivate_own_qb_customer_location(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.create_qb_guest_catalog_order(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,text,text)', 'EXECUTE')
  then
    raise exception 'QB-16 escenario 5: anon no debe ejecutar las RPC.';
  end if;
  perform pg_temp.qb16_pass(5, 'anon no ejecuta las RPC.');

  if not has_function_privilege('authenticated', 'public.save_own_qb_customer_location(uuid,text,text,text,text,numeric,numeric,text,boolean)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.set_own_qb_customer_location_primary(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.deactivate_own_qb_customer_location(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.create_qb_guest_catalog_order(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,text,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.create_qb_guest_catalog_order(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,text,text)', 'EXECUTE')
  then
    raise exception 'QB-16 escenario 6: authenticated debe ejecutar las tres RPC.';
  end if;
  perform pg_temp.qb16_pass(6, 'authenticated ejecuta las RPC autorizadas.');

  if has_table_privilege('anon', 'public.qb_customer_locations', 'INSERT')
    or has_table_privilege('anon', 'public.qb_customer_locations', 'UPDATE')
    or has_table_privilege('anon', 'public.qb_customer_locations', 'DELETE')
  then
    raise exception 'QB-16 escenario 7: anon conserva DML directo.';
  end if;
  perform pg_temp.qb16_pass(7, 'anon no tiene DML directo.');

  if has_table_privilege('authenticated', 'public.qb_customer_locations', 'INSERT')
    or has_table_privilege('authenticated', 'public.qb_customer_locations', 'UPDATE')
    or has_table_privilege('authenticated', 'public.qb_customer_locations', 'DELETE')
  then
    raise exception 'QB-16 escenario 8: authenticated conserva DML directo.';
  end if;
  perform pg_temp.qb16_pass(8, 'authenticated no tiene DML directo.');
end
$schema_and_acl$;

-- Escenario 9: SELECT propio continúa operativo con RLS.
select pg_temp.qb16_set_claim(customer_b_id) from qb16_test_context;
set local role authenticated;
do $own_select$
begin
  if (select count(*) from public.qb_customer_locations) <> 1
    or not exists (
      select 1
      from public.qb_customer_locations location
      join qb16_test_context context
        on context.customer_b_location_id = location.id
    )
  then
    raise exception 'QB-16 escenario 9: SELECT propio no devuelve solo la ubicación propia.';
  end if;
  perform pg_temp.qb16_pass(9, 'SELECT propio continúa disponible.');
end
$own_select$;

-- Escenarios 10 a 16, 18 a 20, 23 a 26 y 32: ejecución real de RPC autenticadas.
do $authenticated_rpcs$
declare
  context qb16_test_context%rowtype;
  v_location_a1 uuid;
  v_location_a2 uuid;
  v_manual uuid;
  v_soft_delete uuid;
  v_before_snapshot jsonb;
  v_rejected boolean;
begin
  select * into strict context from qb16_test_context;

  perform pg_temp.qb16_set_claim(null);
  v_rejected := false;
  begin
    perform public.save_own_qb_customer_location(
      null, 'Sin sesion', 'Direccion sin sesion QB16', null, null,
      null, null, null, false
    );
  exception when others then
    v_rejected := position('QB16_UNAUTHENTICATED' in sqlerrm) > 0;
  end;
  if not v_rejected then
    raise exception 'QB-16 escenario 10: usuario sin sesión no fue rechazado.';
  end if;
  perform pg_temp.qb16_pass(10, 'Usuario sin sesión es rechazado.');

  perform pg_temp.qb16_set_claim(context.internal_user_id);
  v_rejected := false;
  begin
    perform public.save_own_qb_customer_location(
      null, 'Interno', 'Direccion interno QB16', null, null,
      null, null, null, false
    );
  exception when others then
    v_rejected := position('QB16_CUSTOMER_UNAVAILABLE' in sqlerrm) > 0;
  end;
  if not v_rejected then
    raise exception 'QB-16 escenario 11: usuario interno sin cuenta no fue rechazado.';
  end if;
  perform pg_temp.qb16_pass(11, 'Usuario interno sin customer_account es rechazado.');

  perform pg_temp.qb16_set_claim(context.inactive_customer_id);
  v_rejected := false;
  begin
    perform public.save_own_qb_customer_location(
      null, 'Inactiva', 'Direccion inactiva QB16', null, null,
      null, null, null, false
    );
  exception when others then
    v_rejected := position('QB16_CUSTOMER_UNAVAILABLE' in sqlerrm) > 0;
  end;
  if not v_rejected
    or public.set_own_qb_customer_location_primary(gen_random_uuid())
    or public.deactivate_own_qb_customer_location(gen_random_uuid())
  then
    raise exception 'QB-16 escenario 12: una RPC aceptó la cuenta inactiva.';
  end if;
  perform pg_temp.qb16_pass(12, 'Cuenta inactiva es rechazada en las tres RPC.');

  perform pg_temp.qb16_set_claim(context.customer_a_id);
  select public.save_own_qb_customer_location(
    null,
    'Casa A',
    'Direccion principal cliente A QB16',
    'Porton verde',
    '+591 (4) 444-4444',
    -17.4000000,
    -66.1600000,
    'QB16-PLACE-A1',
    false
  ) into v_location_a1;
  if v_location_a1 is null then
    raise exception 'QB-16 escenario 13: no se creó la primera ubicación.';
  end if;
  perform pg_temp.qb16_pass(13, 'Cliente válido crea su primera ubicación.');

  if not exists (
    select 1 from public.qb_customer_locations
    where id = v_location_a1 and is_primary = true and is_active = true
  ) then
    raise exception 'QB-16 escenario 14: la primera ubicación no quedó principal.';
  end if;
  perform pg_temp.qb16_pass(14, 'La primera ubicación queda principal.');

  select public.save_own_qb_customer_location(
    null,
    'Sucursal A',
    'Direccion sucursal cliente A QB16',
    null,
    null,
    -17.4100000,
    -66.1700000,
    'QB16-PLACE-A2',
    false
  ) into v_location_a2;
  if (
    select count(*) from public.qb_customer_locations
    where customer_account_id = context.customer_a_id
      and is_active = true and is_primary = true
  ) <> 1 then
    raise exception 'QB-16 escenario 15: crear la segunda produjo principales duplicadas.';
  end if;
  perform pg_temp.qb16_pass(15, 'La segunda ubicación no duplica la principal.');

  begin
    if not public.set_own_qb_customer_location_primary(v_location_a2) then
      raise exception 'QB-16 escenario 16: no se cambió de A a B.';
    end if;
  exception when unique_violation then
    raise exception 'QB-16 escenario 16: A a B produjo unique_violation.';
  end;
  if (
    select count(*) from public.qb_customer_locations
    where customer_account_id = context.customer_a_id
      and is_active = true and is_primary = true
  ) <> 1 or not exists (
    select 1 from public.qb_customer_locations
    where id = v_location_a2 and is_active = true and is_primary = true
  ) then
    raise exception 'QB-16 escenario 16: B no quedó como única principal.';
  end if;

  begin
    if not public.set_own_qb_customer_location_primary(v_location_a1) then
      raise exception 'QB-16 escenario 16: no se cambió de B a A.';
    end if;
  exception when unique_violation then
    raise exception 'QB-16 escenario 16: B a A produjo unique_violation.';
  end;
  if (
    select count(*) from public.qb_customer_locations
    where customer_account_id = context.customer_a_id
      and is_active = true and is_primary = true
  ) <> 1 or not exists (
    select 1 from public.qb_customer_locations
    where id = v_location_a1 and is_active = true and is_primary = true
  ) then
    raise exception 'QB-16 escenario 16: A no quedó como única principal.';
  end if;

  begin
    if not public.set_own_qb_customer_location_primary(v_location_a2) then
      raise exception 'QB-16 escenario 16: no se cambió nuevamente de A a B.';
    end if;
  exception when unique_violation then
    raise exception 'QB-16 escenario 16: el segundo A a B produjo unique_violation.';
  end;
  if (
    select count(*) from public.qb_customer_locations
    where customer_account_id = context.customer_a_id
      and is_active = true and is_primary = true
  ) <> 1 or not exists (
    select 1 from public.qb_customer_locations
    where id = v_location_a2 and is_active = true and is_primary = true
  ) then
    raise exception 'QB-16 escenario 16: B no quedó como única principal al repetir el cambio.';
  end if;

  if public.set_own_qb_customer_location_primary(context.customer_b_location_id)
    or (
      select count(*) from public.qb_customer_locations
      where customer_account_id = context.customer_a_id
        and is_active = true and is_primary = true
    ) <> 1
    or not exists (
      select 1 from public.qb_customer_locations
      where id = v_location_a2 and is_active = true and is_primary = true
    )
  then
    raise exception 'QB-16 escenario 16: se aceptó una ubicación ajena o se alteró la principal.';
  end if;
  perform pg_temp.qb16_pass(16, 'Cambio A a B a A a B conserva una única principal y rechaza ubicaciones ajenas.');

  if public.save_own_qb_customer_location(
    v_location_a1,
    'Casa A editada',
    'Direccion principal editada QB16',
    'Porton verde',
    '+591 (4) 444-4444',
    -17.4000000,
    -66.1600000,
    'QB16-PLACE-A1',
    false
  ) is distinct from v_location_a1 then
    raise exception 'QB-16 escenario 18: editar cambió el ID.';
  end if;
  if (
    select count(*) from public.qb_customer_locations
    where customer_account_id = context.customer_a_id and id = v_location_a1
  ) <> 1 then
    raise exception 'QB-16 escenario 18: editar duplicó la ubicación.';
  end if;
  perform pg_temp.qb16_pass(18, 'Editar conserva el mismo ID.');

  v_rejected := false;
  begin
    perform public.save_own_qb_customer_location(
      context.customer_b_location_id,
      'Intento ajeno',
      'Direccion ajena QB16',
      null, null, null, null, null, false
    );
  exception when others then
    v_rejected := position('QB16_LOCATION_NOT_FOUND' in sqlerrm) > 0;
  end;
  if not v_rejected then
    raise exception 'QB-16 escenario 19: cliente A editó ubicación B.';
  end if;
  perform pg_temp.qb16_pass(19, 'Cliente A no edita ubicación de cliente B.');

  if public.deactivate_own_qb_customer_location(context.customer_b_location_id) then
    raise exception 'QB-16 escenario 20: cliente A desactivó ubicación B.';
  end if;
  perform pg_temp.qb16_pass(20, 'Cliente A no desactiva ubicación de cliente B.');

  select public.save_own_qb_customer_location(
    null, 'Temporal', 'Direccion temporal QB16', null, null,
    null, null, null, false
  ) into v_soft_delete;
  if not public.deactivate_own_qb_customer_location(v_soft_delete)
    or not exists (
      select 1 from public.qb_customer_locations
      where id = v_soft_delete and is_active = false
    )
  then
    raise exception 'QB-16 escenario 21: eliminar no realizó desactivación lógica.';
  end if;
  perform pg_temp.qb16_pass(21, 'Eliminar no borra físicamente.');

  select public.save_own_qb_customer_location(
    null, 'Manual', 'Direccion manual cliente A QB16', null, null,
    null, null, null, false
  ) into v_manual;
  if not exists (
    select 1 from public.qb_customer_locations
    where id = v_manual and latitude is null and longitude is null and google_place_id is null
  ) then
    raise exception 'QB-16 escenario 23: null/null no fue aceptado.';
  end if;
  perform pg_temp.qb16_pass(23, 'Coordenadas null/null son aceptadas.');

  v_rejected := false;
  begin
    perform public.save_own_qb_customer_location(
      null, 'Coordenada sola', 'Direccion coordenada sola QB16', null, null,
      -17.4, null, null, false
    );
  exception when others then
    v_rejected := position('QB16_INVALID_LOCATION' in sqlerrm) > 0;
  end;
  if not v_rejected then
    raise exception 'QB-16 escenario 24: una sola coordenada fue aceptada.';
  end if;
  perform pg_temp.qb16_pass(24, 'Una sola coordenada es rechazada.');

  v_rejected := false;
  begin
    perform public.save_own_qb_customer_location(
      null, 'Fuera de rango', 'Direccion fuera de rango QB16', null, null,
      91, -66, null, false
    );
  exception when others then
    v_rejected := position('QB16_INVALID_LOCATION' in sqlerrm) > 0;
  end;
  if not v_rejected then
    raise exception 'QB-16 escenario 25: coordenadas fuera de rango fueron aceptadas.';
  end if;
  perform pg_temp.qb16_pass(25, 'Coordenadas fuera de rango son rechazadas.');

  v_rejected := false;
  begin
    perform public.save_own_qb_customer_location(
      null, 'Telefono simbolos', 'Direccion telefono simbolos QB16', null, '-------',
      null, null, null, false
    );
  exception when others then
    v_rejected := position('QB16_INVALID_LOCATION' in sqlerrm) > 0;
  end;
  if not v_rejected then
    raise exception 'QB-16 escenario 26: teléfono solo con símbolos fue aceptado.';
  end if;
  perform pg_temp.qb16_pass(26, 'Teléfono compuesto solo por símbolos es rechazado.');

  update qb16_test_context
  set location_a1_id = v_location_a1,
      location_a2_id = v_location_a2,
      manual_location_id = v_manual;

  -- El escenario 32 se completa después de crear el snapshot como postgres.
end
$authenticated_rpcs$;
reset role;

-- Escenario 17: el índice bloquea dos principales incluso fuera de las RPC.
do $unique_primary$
declare
  context qb16_test_context%rowtype;
  v_rejected boolean := false;
begin
  select * into strict context from qb16_test_context;
  if to_regclass('public.qb_customer_locations_one_active_primary_idx') is null then
    raise exception 'QB-16 escenario 17: falta el índice único parcial.';
  end if;
  begin
    update public.qb_customer_locations
    set is_primary = true
    where id = context.location_a1_id;
  exception when unique_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'QB-16 escenario 17: el índice aceptó dos principales activas.';
  end if;
  perform pg_temp.qb16_pass(17, 'El índice impide dos principales activas.');
end
$unique_primary$;

-- Escenarios 27 a 32: snapshot registrado protegido e histórico.
do $registered_snapshot$
declare
  context qb16_test_context%rowtype;
  v_order_id uuid;
  v_snapshot jsonb;
  v_rejected boolean;
begin
  select * into strict context from qb16_test_context;
  insert into public.qb_orders (
    public_reference,
    customer_account_id,
    customer_location_id,
    customer_snapshot,
    location_snapshot,
    idempotency_key,
    order_mode
  ) values (
    'QB16-REGISTERED-SNAPSHOT',
    context.customer_a_id,
    context.location_a1_id,
    '{}'::jsonb,
    jsonb_build_object(
      'address', 'Direccion congelada QB16',
      'latitude', 1,
      'longitude', 2,
      'google_place_id', 'PLACE-FALSO',
      'preserve', 'ok'
    ),
    '16000000-0000-4000-8000-000000000301',
    'registered'
  ) returning id, location_snapshot into v_order_id, v_snapshot;

  if (v_snapshot ->> 'latitude')::numeric <> -17.4000000
    or (v_snapshot ->> 'longitude')::numeric <> -66.1600000
  then
    raise exception 'QB-16 escenario 27: snapshot no copió coordenadas reales.';
  end if;
  perform pg_temp.qb16_pass(27, 'Snapshot registrado copia coordenadas reales.');

  if v_snapshot ->> 'google_place_id' <> 'QB16-PLACE-A1' then
    raise exception 'QB-16 escenario 28: snapshot no copió Place ID real.';
  end if;
  perform pg_temp.qb16_pass(28, 'Snapshot registrado copia Place ID real.');

  if v_snapshot ->> 'google_place_id' = 'PLACE-FALSO'
    or (v_snapshot ->> 'latitude')::numeric = 1
    or v_snapshot ->> 'preserve' <> 'ok'
  then
    raise exception 'QB-16 escenario 29: snapshot conservó coordenadas falsas o eliminó datos ajenos.';
  end if;
  perform pg_temp.qb16_pass(29, 'Snapshot elimina valores falsos antes de combinar.');

  v_rejected := false;
  begin
    insert into public.qb_orders (
      public_reference, customer_account_id, customer_location_id,
      customer_snapshot, location_snapshot, idempotency_key, order_mode
    ) values (
      'QB16-REGISTERED-FOREIGN',
      context.customer_a_id,
      context.customer_b_location_id,
      '{}'::jsonb,
      '{}'::jsonb,
      '16000000-0000-4000-8000-000000000302',
      'registered'
    );
  exception when others then
    v_rejected := position('QB16_INVALID_REGISTERED_LOCATION' in sqlerrm) > 0;
  end;
  if not v_rejected then
    raise exception 'QB-16 escenario 30: ubicación ajena se usó en pedido registrado.';
  end if;
  perform pg_temp.qb16_pass(30, 'Ubicación ajena no puede usarse en pedido registrado.');

  update qb16_test_context
  set registered_order_id = v_order_id,
      registered_snapshot = v_snapshot;
end
$registered_snapshot$;

-- Escenario 32: editar ubicación no reescribe el snapshot anterior.
select pg_temp.qb16_set_claim(customer_a_id) from qb16_test_context;
set local role authenticated;
do $historical_snapshot$
declare
  context qb16_test_context%rowtype;
begin
  select * into strict context from qb16_test_context;
  perform public.save_own_qb_customer_location(
    context.location_a1_id,
    'Casa A posterior',
    'Direccion posterior QB16',
    null,
    null,
    -17.4500000,
    -66.2000000,
    'QB16-PLACE-POSTERIOR',
    false
  );
  if (select location_snapshot from public.qb_orders where id = context.registered_order_id)
    is distinct from context.registered_snapshot
  then
    raise exception 'QB-16 escenario 32: editar ubicación alteró snapshot histórico.';
  end if;
  perform pg_temp.qb16_pass(32, 'Editar ubicación no altera snapshots históricos.');
end
$historical_snapshot$;

-- Escenarios 22 y 31: sustitución segura e ubicación inactiva.
do $deactivate_primary$
declare
  context qb16_test_context%rowtype;
begin
  select * into strict context from qb16_test_context;
  if not public.deactivate_own_qb_customer_location(context.location_a2_id)
    or exists (
      select 1 from public.qb_customer_locations
      where id = context.location_a2_id and is_active = true
    )
    or (
      select count(*) from public.qb_customer_locations
      where customer_account_id = context.customer_a_id
        and is_active = true and is_primary = true
    ) <> 1
  then
    raise exception 'QB-16 escenario 22: eliminar la principal no eligió sustituta segura.';
  end if;
  if not public.deactivate_own_qb_customer_location(context.location_a1_id)
    or not public.deactivate_own_qb_customer_location(context.manual_location_id)
    or exists (
      select 1 from public.qb_customer_locations
      where customer_account_id = context.customer_a_id
        and is_active = true
    )
    or exists (
      select 1 from public.qb_customer_locations
      where customer_account_id = context.customer_a_id
        and is_primary = true
    )
  then
    raise exception 'QB-16 escenario 22: al quedar sin ubicaciones se conservó una principal.';
  end if;
  perform pg_temp.qb16_pass(22, 'Eliminar la principal elige una sustituta.');
end
$deactivate_primary$;
reset role;

do $inactive_registered_location$
declare
  context qb16_test_context%rowtype;
  v_rejected boolean := false;
begin
  select * into strict context from qb16_test_context;
  begin
    insert into public.qb_orders (
      public_reference, customer_account_id, customer_location_id,
      customer_snapshot, location_snapshot, idempotency_key, order_mode
    ) values (
      'QB16-REGISTERED-INACTIVE',
      context.customer_a_id,
      context.location_a2_id,
      '{}'::jsonb,
      '{}'::jsonb,
      '16000000-0000-4000-8000-000000000303',
      'registered'
    );
  exception when others then
    v_rejected := position('QB16_INVALID_REGISTERED_LOCATION' in sqlerrm) > 0;
  end;
  if not v_rejected then
    raise exception 'QB-16 escenario 31: ubicación inactiva se usó en pedido registrado.';
  end if;
  perform pg_temp.qb16_pass(31, 'Ubicación inactiva no puede utilizarse.');
end
$inactive_registered_location$;

-- Escenarios 33 a 38: contrato guest real mediante la RPC segura.
do $guest_contract$
declare
  context qb16_test_context%rowtype;
  v_coordinates record;
  v_manual record;
  v_result record;
  v_locations_before bigint;
  v_guest_definition text;
begin
  select * into strict context from qb16_test_context;
  select count(*) into v_locations_before from public.qb_customer_locations;

  select * into strict v_coordinates
  from pg_temp.qb16_guest_call(
    '16000000-0000-4000-8000-000000000401',
    '-17.3900',
    '-66.1500',
    'QB16-GUEST-PLACE',
    null
  );
  if v_coordinates.result_code <> 'created'
    or not exists (
      select 1 from public.qb_orders
      where id = v_coordinates.created_order_id
        and order_mode = 'guest'
        and (location_snapshot ->> 'latitude')::numeric = -17.3900
        and location_snapshot ->> 'google_place_id' = 'QB16-GUEST-PLACE'
    )
  then
    raise exception 'QB-16 escenario 33: guest con coordenadas válidas falló.';
  end if;
  perform pg_temp.qb16_pass(33, 'Invitado con dirección y coordenadas válidas funciona.');

  select * into strict v_manual
  from pg_temp.qb16_guest_call(
    '16000000-0000-4000-8000-000000000402',
    null,
    null,
    null,
    null
  );
  if v_manual.result_code <> 'created'
    or not exists (
      select 1 from public.qb_orders
      where id = v_manual.created_order_id
        and order_mode = 'guest'
        and location_snapshot ->> 'address' = 'Direccion manual QB16 TEST'
        and location_snapshot ->> 'latitude' is null
        and location_snapshot ->> 'longitude' is null
        and location_snapshot ->> 'google_place_id' is null
    )
  then
    raise exception 'QB-16 escenario 34: guest manual sin coordenadas falló.';
  end if;
  perform pg_temp.qb16_pass(34, 'Invitado con dirección y coordenadas null funciona.');

  select * into strict v_result
  from pg_temp.qb16_guest_call(
    '16000000-0000-4000-8000-000000000403',
    '-17.3900',
    null,
    null,
    null
  );
  if v_result.result_code <> 'invalid_location' then
    raise exception 'QB-16 escenario 35: guest con una coordenada obtuvo %.', v_result.result_code;
  end if;
  perform pg_temp.qb16_pass(35, 'Invitado con una sola coordenada se rechaza.');

  if (select count(*) from public.qb_customer_locations) <> v_locations_before then
    raise exception 'QB-16 escenario 36: guest creó una ubicación persistente.';
  end if;
  perform pg_temp.qb16_pass(36, 'Invitado no crea qb_customer_location.');

  select * into strict v_result
  from pg_temp.qb16_guest_call(
    '16000000-0000-4000-8000-000000000401',
    '-17.3900',
    '-66.1500',
    'QB16-GUEST-PLACE',
    null
  );
  if v_result.result_code <> 'already_created'
    or v_result.created_order_id <> v_coordinates.created_order_id
  then
    raise exception 'QB-16 escenario 37: idempotencia guest no se conservó.';
  end if;
  perform pg_temp.qb16_pass(37, 'Idempotencia invitada permanece.');

  select * into strict v_result
  from pg_temp.qb16_guest_call(
    '16000000-0000-4000-8000-000000000404',
    null,
    null,
    null,
    repeat('z', 64)
  );
  select pg_get_functiondef(
    'public.create_qb_guest_catalog_order(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,text,text)'::regprocedure
  ) into v_guest_definition;
  if v_result.result_code <> 'invalid_payload_hash'
    or v_guest_definition not like '%private.qb_guest_order_idempotency%'
    or v_guest_definition not like '%private.qb_guest_order_rate_limits%'
    or v_guest_definition not like '%least(v_fingerprint_lock, v_phone_lock)%'
    or v_guest_definition not like '%greatest(v_fingerprint_lock, v_phone_lock)%'
  then
    raise exception 'QB-16 escenario 38: HMAC, rate limit o locks cambiaron.';
  end if;
  perform pg_temp.qb16_pass(38, 'HMAC y rate limit permanecen.');
end
$guest_contract$;

-- Escenario 39: atributos de seguridad de todas las RPC.
do $function_security$
declare
  v_save_definition text;
  v_snapshot_definition text;
begin
  if (
    select count(*)
    from pg_catalog.pg_proc procedure_info
    where procedure_info.oid in (
      'public.save_own_qb_customer_location(uuid,text,text,text,text,numeric,numeric,text,boolean)'::regprocedure,
      'public.set_own_qb_customer_location_primary(uuid)'::regprocedure,
      'public.deactivate_own_qb_customer_location(uuid)'::regprocedure
    )
      and procedure_info.prosecdef = true
      and procedure_info.proconfig = array['search_path=pg_catalog']::text[]
  ) <> 3 then
    raise exception 'QB-16 escenario 39: RPC de ubicaciones sin SECURITY DEFINER/search_path.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure_info
    where procedure_info.oid =
      'public.create_qb_guest_catalog_order(text,text,text,text,text,text,text,text,text,text,text,text,jsonb,text,text,text,text)'::regprocedure
      and procedure_info.prosecdef = true
      and procedure_info.proconfig =
        array['search_path=pg_catalog, extensions, private']::text[]
  ) then
    raise exception 'QB-16 escenario 39: RPC guest perdió SECURITY DEFINER/search_path.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.save_own_qb_customer_location(uuid,text,text,text,text,numeric,numeric,text,boolean)'::regprocedure
  ) into v_save_definition;
  select pg_catalog.pg_get_functiondef(
    'public.qb16_set_registered_location_snapshot()'::regprocedure
  ) into v_snapshot_definition;

  if v_save_definition like '%pg_catalog.coalesce%'
    or v_save_definition like '%pg_catalog.nullif%'
    or v_snapshot_definition like '%pg_catalog.coalesce%'
    or v_save_definition not like '%QB16_UNAUTHENTICATED%'
  then
    raise exception 'QB-16 escenario 39: validación de identidad o expresiones condicionales inválidas.';
  end if;

  if (
    select count(*) from qb16_test_results
  ) <> 38 then
    raise exception 'QB-16: antes del escenario 39 se esperaban 38 resultados.';
  end if;
  perform pg_temp.qb16_pass(39, 'Funciones conservan SECURITY DEFINER y search_path.');

  if (select count(*) from qb16_test_results) <> 39
    or (select min(scenario) from qb16_test_results) <> 1
    or (select max(scenario) from qb16_test_results) <> 39
  then
    raise exception 'QB-16: el conteo transaccional de escenarios no es 39/39.';
  end if;
end
$function_security$;

rollback;

-- Escenario 40: comprobación independiente después del ROLLBACK.
do $zero_residue$
begin
  if exists (
    select 1 from auth.users
    where id in (
      '16000000-0000-4000-8000-000000000001'::uuid,
      '16000000-0000-4000-8000-000000000002'::uuid,
      '16000000-0000-4000-8000-000000000003'::uuid,
      '16000000-0000-4000-8000-000000000004'::uuid
    )
  ) or exists (
    select 1 from public.qb_customer_locations
    where id = '16000000-0000-4000-8000-000000000111'::uuid
  ) or exists (
    select 1 from public.products
    where id = '16000000-0000-4000-8000-000000000101'::uuid
  ) or exists (
    select 1 from public.qb_orders
    where idempotency_key like '16000000-0000-4000-8000-000000000%'
  ) then
    raise exception 'QB-16 escenario 40: quedaron residuos después del ROLLBACK.';
  end if;
end
$zero_residue$;

select
  'QB16_SQL_CONTRACT_OK'::text as marker,
  40::integer as scenarios_passed,
  'ROLLBACK_VERIFIED'::text as residue_state;
