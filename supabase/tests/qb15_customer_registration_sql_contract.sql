-- Contrato SQL transaccional QB-15.
-- Ejecutar solo en una base Supabase local autorizada con QB-15 aplicada.
-- Todas las escrituras de fixtures quedan contenidas por ROLLBACK.

begin;

do $$
declare
  v_internal_id constant uuid := '15000000-0000-4000-8000-000000000001';
  v_customer_id constant uuid := '15000000-0000-4000-8000-000000000002';
  v_inactive_id constant uuid := '15000000-0000-4000-8000-000000000003';
  v_invalid_id constant uuid := '15000000-0000-4000-8000-000000000004';
  v_other_id constant uuid := '15000000-0000-4000-8000-000000000005';
  v_fixture_ids constant uuid[] := array[
    v_internal_id,
    v_customer_id,
    v_inactive_id,
    v_invalid_id,
    v_other_id
  ];
  v_result text;
  v_profiles_before bigint;
  v_locations_before bigint;
  v_orders_before bigint;
  v_inactive_update_rejected boolean := false;
  v_symbol_update_rejected boolean := false;
  v_short_update_rejected boolean := false;
  v_long_update_rejected boolean := false;
  v_internal_update_rejected boolean := false;
begin
  if to_regprocedure('public.register_own_customer_account(text,text,text)') is null
    or to_regprocedure('public.update_qb_customer_profile(text,text,text)') is null
    or to_regclass('public.customer_accounts') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.qb_customer_locations') is null
    or to_regclass('public.qb_orders') is null
  then
    raise exception 'QB-15 preflight: faltan funciones o relaciones canónicas.';
  end if;

  if exists (select 1 from auth.users where id = any(v_fixture_ids))
    or exists (select 1 from public.profiles where id = any(v_fixture_ids))
    or exists (select 1 from public.customer_accounts where id = any(v_fixture_ids))
  then
    raise exception 'QB-15 preflight: los UUID reservados para fixtures ya existen.';
  end if;

  if has_function_privilege(
    'anon',
    'public.register_own_customer_account(text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'QB-15: anon no debe ejecutar register_own_customer_account.';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.register_own_customer_account(text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'QB-15: authenticated debe ejecutar register_own_customer_account.';
  end if;

  if has_table_privilege('anon', 'public.customer_accounts', 'INSERT')
    or has_table_privilege('authenticated', 'public.customer_accounts', 'INSERT')
  then
    raise exception 'QB-15: anon y authenticated no deben insertar customer_accounts directamente.';
  end if;

  if has_table_privilege('anon', 'public.customer_accounts', 'UPDATE')
    or has_table_privilege('authenticated', 'public.customer_accounts', 'UPDATE')
  then
    raise exception 'QB-15: anon y authenticated no deben actualizar customer_accounts directamente.';
  end if;

  if has_column_privilege('authenticated', 'public.customer_accounts', 'id', 'UPDATE')
    or has_column_privilege('authenticated', 'public.customer_accounts', 'email', 'UPDATE')
    or has_column_privilege('authenticated', 'public.customer_accounts', 'is_active', 'UPDATE')
    or has_column_privilege('authenticated', 'public.customer_accounts', 'created_at', 'UPDATE')
    or has_column_privilege('authenticated', 'public.customer_accounts', 'updated_at', 'UPDATE')
  then
    raise exception 'QB-15: authenticated no debe actualizar columnas sensibles.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_accounts'
      and column_name = 'auth_user_id'
  ) then
    if has_column_privilege(
      'authenticated',
      'public.customer_accounts',
      'auth_user_id',
      'UPDATE'
    ) then
      raise exception 'QB-15: authenticated no debe actualizar auth_user_id.';
    end if;
  end if;

  if has_function_privilege(
    'anon',
    'public.update_qb_customer_profile(text,text,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.update_qb_customer_profile(text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'QB-15: EXECUTE de update_qb_customer_profile es incorrecto.';
  end if;

  if has_function_privilege(
    'anon',
    'public.update_own_customer_account(text,text,text,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.update_own_customer_account(text,text,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'QB-15: la edición anterior debe quedar deshabilitada para clientes.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid in (
      to_regprocedure('public.register_own_customer_account(text,text,text)'),
      to_regprocedure('public.update_qb_customer_profile(text,text,text)')
    )
      and (
        not p.prosecdef
        or p.proconfig is distinct from array['search_path=pg_catalog']::text[]
      )
  ) or (
    select count(*)
    from pg_catalog.pg_proc p
    where p.oid in (
      to_regprocedure('public.register_own_customer_account(text,text,text)'),
      to_regprocedure('public.update_qb_customer_profile(text,text,text)')
    )
  ) <> 2 then
    raise exception 'QB-15: ambas funciones deben ser SECURITY DEFINER con search_path pg_catalog.';
  end if;

  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select public.register_own_customer_account('Negocio prueba', 'Persona prueba', '70000000')
  into v_result;
  if v_result <> 'unauthenticated' then
    raise exception 'QB-15: una sesión sin UID debe devolver unauthenticated; obtuvo %.', v_result;
  end if;

  select count(*) into v_profiles_before from public.profiles;
  select count(*) into v_locations_before from public.qb_customer_locations;
  select count(*) into v_orders_before from public.qb_orders;

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
    (v_internal_id, 'qb15-internal@example.test'),
    (v_customer_id, 'qb15-customer@example.test'),
    (v_inactive_id, 'qb15-inactive@example.test'),
    (v_invalid_id, 'qb15-invalid@example.test'),
    (v_other_id, 'qb15-other@example.test')
  ) as fixture(id, email);

  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    v_internal_id,
    'qb15-internal@example.test',
    'Usuario interno QB-15',
    'administrador',
    true
  );

  insert into public.customer_accounts (
    id,
    email,
    full_name,
    business_name,
    responsible_name,
    phone,
    is_active
  ) values (
    v_inactive_id,
    'qb15-inactive@example.test',
    'Cuenta inactiva QB-15',
    'Cuenta inactiva QB-15',
    'Responsable inactivo',
    '70000003',
    false
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_internal_id::text,
      'email', 'qb15-internal@example.test',
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_internal_id::text, true);
  select public.register_own_customer_account('Interno QB', 'Responsable interno', '70000001')
  into v_result;
  if v_result <> 'internal_user'
    or exists (select 1 from public.customer_accounts where id = v_internal_id)
  then
    raise exception 'QB-15: un usuario interno no debe crear customer_account.';
  end if;

  -- Fixture deliberadamente inconsistente para demostrar que la RPC de edición
  -- también bloquea identidades internas aunque exista una cuenta cliente.
  insert into public.customer_accounts (
    id,
    email,
    full_name,
    business_name,
    responsible_name,
    phone,
    is_active
  ) values (
    v_internal_id,
    'qb15-internal@example.test',
    'Cuenta interna de prueba',
    'Cuenta interna de prueba',
    'Responsable interno',
    '70000001',
    true
  );

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_invalid_id::text,
      'email', 'qb15-invalid@example.test',
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_invalid_id::text, true);
  select public.register_own_customer_account('Negocio válido', 'Persona válida', '-------')
  into v_result;
  if v_result <> 'invalid_data' then
    raise exception 'QB-15: WhatsApp compuesto solo por símbolos debe rechazarse.';
  end if;
  select public.register_own_customer_account('Negocio válido', 'Persona válida', '123')
  into v_result;
  if v_result <> 'invalid_data' then
    raise exception 'QB-15: WhatsApp con menos de 7 dígitos debe rechazarse.';
  end if;
  select public.register_own_customer_account(
    'Negocio válido',
    'Persona válida',
    '1234567890123456'
  ) into v_result;
  if v_result <> 'invalid_data' then
    raise exception 'QB-15: WhatsApp con más de 15 dígitos debe rechazarse.';
  end if;
  select public.register_own_customer_account(
    'Negocio válido',
    'Persona válida',
    '(591) 70707070'
  ) into v_result;
  if v_result <> 'created'
    or not exists (
      select 1
      from public.customer_accounts
      where id = v_invalid_id
        and phone = '(591) 70707070'
    )
  then
    raise exception 'QB-15: WhatsApp formateado con 7 a 15 dígitos debe aceptarse.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_customer_id::text,
      'email', 'QB15-CUSTOMER@EXAMPLE.TEST',
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_customer_id::text, true);
  select public.register_own_customer_account(
    '  Mercado   QB-15  ',
    '  Responsable   QB-15  ',
    '+591 70000002'
  ) into v_result;
  if v_result <> 'created' then
    raise exception 'QB-15: el cliente válido debe devolver created; obtuvo %.', v_result;
  end if;

  if (select count(*) from public.customer_accounts where id = v_customer_id) <> 1
    or not exists (
      select 1
      from public.customer_accounts
      where id = v_customer_id
        and email = 'qb15-customer@example.test'
        and is_active = true
        and business_name = 'Mercado QB-15'
        and responsible_name = 'Responsable QB-15'
    )
  then
    raise exception 'QB-15: identidad, correo JWT o datos normalizados incorrectos.';
  end if;

  if exists (select 1 from public.profiles where id = v_customer_id) then
    raise exception 'QB-15: el registro cliente no debe crear public.profile.';
  end if;

  select public.register_own_customer_account('Mercado QB-15', 'Responsable QB-15', '70000002')
  into v_result;
  if v_result <> 'already_registered'
    or (select count(*) from public.customer_accounts where id = v_customer_id) <> 1
  then
    raise exception 'QB-15: la segunda llamada debe ser idempotente.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_inactive_id::text,
      'email', 'qb15-inactive@example.test',
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_inactive_id::text, true);
  select public.register_own_customer_account('Cuenta inactiva', 'Responsable inactivo', '70000003')
  into v_result;
  if v_result <> 'inactive_account' then
    raise exception 'QB-15: una cuenta inactiva debe devolver inactive_account.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_other_id::text,
      'email', 'qb15-other@example.test',
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_other_id::text, true);
  select public.register_own_customer_account('Otro negocio QB-15', 'Otra persona QB-15', '70000005')
  into v_result;
  if v_result <> 'created'
    or not exists (select 1 from public.customer_accounts where id = v_other_id)
    or exists (
      select 1
      from public.customer_accounts
      where id = v_customer_id
        and email <> 'qb15-customer@example.test'
    )
  then
    raise exception 'QB-15: auth.uid() debe impedir crear o alterar la cuenta de otro UUID.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_customer_id::text,
      'email', 'qb15-customer@example.test',
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_customer_id::text, true);

  begin
    perform public.update_qb_customer_profile('No debe cambiar', 'No debe cambiar', '-------');
  exception
    when others then
      v_symbol_update_rejected := sqlerrm = 'WhatsApp inválido.';
  end;
  begin
    perform public.update_qb_customer_profile('No debe cambiar', 'No debe cambiar', '123');
  exception
    when others then
      v_short_update_rejected := sqlerrm = 'WhatsApp inválido.';
  end;
  begin
    perform public.update_qb_customer_profile(
      'No debe cambiar',
      'No debe cambiar',
      '1234567890123456'
    );
  exception
    when others then
      v_long_update_rejected := sqlerrm = 'WhatsApp inválido.';
  end;
  if not v_symbol_update_rejected
    or not v_short_update_rejected
    or not v_long_update_rejected
    or not exists (
      select 1
      from public.customer_accounts
      where id = v_customer_id
        and business_name = 'Mercado QB-15'
        and responsible_name = 'Responsable QB-15'
        and email = 'qb15-customer@example.test'
        and is_active = true
    )
  then
    raise exception 'QB-15: la actualización debe rechazar WhatsApp inválido sin alterar la cuenta.';
  end if;

  perform public.update_qb_customer_profile(
    'Mercado QB-15 actualizado',
    'Responsable QB-15 actualizado',
    '(591) 70707070'
  );
  if not exists (
    select 1
    from public.customer_accounts
    where id = v_customer_id
      and business_name = 'Mercado QB-15 actualizado'
      and responsible_name = 'Responsable QB-15 actualizado'
      and phone = '(591) 70707070'
      and email = 'qb15-customer@example.test'
      and is_active = true
  ) or not exists (
    select 1
    from public.customer_accounts
    where id = v_inactive_id
      and business_name = 'Cuenta inactiva QB-15'
  ) or not exists (
    select 1
    from public.customer_accounts
    where id = v_other_id
      and business_name = 'Otro negocio QB-15'
      and email = 'qb15-other@example.test'
      and is_active = true
  ) then
    raise exception 'QB-15: la RPC debe actualizar solo campos comerciales de la cuenta propia.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_internal_id::text,
      'email', 'qb15-internal@example.test',
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_internal_id::text, true);
  begin
    perform public.update_qb_customer_profile(
      'No debe cambiar',
      'No debe cambiar',
      '70000011'
    );
  exception
    when others then
      v_internal_update_rejected := sqlerrm = 'Cuenta de cliente no disponible.';
  end;
  if not v_internal_update_rejected
    or not exists (
      select 1
      from public.customer_accounts
      where id = v_internal_id
        and business_name = 'Cuenta interna de prueba'
        and email = 'qb15-internal@example.test'
        and is_active = true
    )
  then
    raise exception 'QB-15: una identidad interna no debe actualizar customer_accounts.';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_inactive_id::text,
      'email', 'qb15-inactive@example.test',
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_inactive_id::text, true);
  begin
    perform public.update_qb_customer_profile(
      'No debe cambiar',
      'No debe cambiar',
      '70000033'
    );
  exception
    when others then
      v_inactive_update_rejected := sqlerrm = 'Cuenta de cliente no disponible.';
  end;
  if not v_inactive_update_rejected
    or not exists (
      select 1
      from public.customer_accounts
      where id = v_inactive_id
        and business_name = 'Cuenta inactiva QB-15'
        and phone = '70000003'
    )
  then
    raise exception 'QB-15: una cuenta inactiva no debe poder actualizarse.';
  end if;

  if (select count(*) from public.profiles) <> v_profiles_before + 1
    or (select count(*) from public.qb_customer_locations) <> v_locations_before
    or (select count(*) from public.qb_orders) <> v_orders_before
  then
    raise exception 'QB-15: el contrato detectó profiles, ubicaciones o pedidos inesperados.';
  end if;
end;
$$;

select 'Contrato SQL transaccional QB-15 aprobado; se ejecutará ROLLBACK.' as result;

rollback;

do $$
declare
  v_fixture_ids constant uuid[] := array[
    '15000000-0000-4000-8000-000000000001'::uuid,
    '15000000-0000-4000-8000-000000000002'::uuid,
    '15000000-0000-4000-8000-000000000003'::uuid,
    '15000000-0000-4000-8000-000000000004'::uuid,
    '15000000-0000-4000-8000-000000000005'::uuid
  ];
begin
  if exists (select 1 from auth.users where id = any(v_fixture_ids))
    or exists (select 1 from public.profiles where id = any(v_fixture_ids))
    or exists (select 1 from public.customer_accounts where id = any(v_fixture_ids))
    or exists (
      select 1 from public.qb_customer_locations
      where customer_account_id = any(v_fixture_ids)
    )
    or exists (
      select 1 from public.qb_orders
      where customer_account_id = any(v_fixture_ids)
    )
  then
    raise exception 'QB-15: quedaron residuos después de ROLLBACK.';
  end if;
end;
$$;

select 'Contrato SQL QB-15 sin residuos.' as result;
