\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;
create schema auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.profiles (
  id uuid primary key,
  role text not null,
  is_active boolean not null default true
);
create table public.qb_order_items (
  id uuid primary key,
  requested_quantity numeric not null,
  row_version integer not null default 0
);
create table public.qb_correction_contract_events (
  item_id uuid not null,
  idempotency_key text not null,
  primary key (item_id, idempotency_key)
);

create or replace function public.admin_update_qb_requested_quantity(
  p_order_item_id uuid,
  p_expected_version integer,
  p_requested_quantity numeric,
  p_reason text,
  p_idempotency_key text
) returns jsonb language plpgsql as $$
declare
  v_item public.qb_order_items%rowtype;
begin
  select * into v_item from public.qb_order_items
  where id = p_order_item_id for update;
  if v_item.id is null or v_item.row_version <> p_expected_version then
    raise exception 'QB_MATRIX_CONFLICT' using errcode = '40001';
  end if;
  if exists (select 1 from public.qb_correction_contract_events
    where item_id = p_order_item_id and idempotency_key = p_idempotency_key) then
    return jsonb_build_object('id', v_item.id, 'row_version', v_item.row_version, 'replayed', true);
  end if;
  insert into public.qb_correction_contract_events values (p_order_item_id, p_idempotency_key);
  update public.qb_order_items
  set requested_quantity = p_requested_quantity, row_version = row_version + 1
  where id = p_order_item_id returning * into v_item;
  return jsonb_build_object('id', v_item.id, 'row_version', v_item.row_version, 'replayed', false);
end;
$$;

\ir ../supabase/migrations/20261108130000_qb_atomic_grouped_order_correction.sql

insert into public.profiles(id, role) values
  ('00000000-0000-0000-0000-000000000001', 'administrador'),
  ('00000000-0000-0000-0000-000000000002', 'inventario');
insert into public.qb_order_items(id, requested_quantity) values
  ('10000000-0000-0000-0000-000000000001', 2),
  ('10000000-0000-0000-0000-000000000002', 3),
  ('10000000-0000-0000-0000-000000000003', 4);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
do $$
declare v_result jsonb;
begin
  v_result := public.admin_update_qb_requested_quantities(
    '[{"orderItemId":"10000000-0000-0000-0000-000000000001","expectedVersion":0,"requestedQuantity":5},{"orderItemId":"10000000-0000-0000-0000-000000000002","expectedVersion":0,"requestedQuantity":6}]',
    'Ajuste solicitado por el cliente', 'contract-success-0001'
  );
  if jsonb_array_length(v_result -> 'results') <> 2 then raise exception 'Batch incompleto'; end if;
  if (select requested_quantity from public.qb_order_items where id = '10000000-0000-0000-0000-000000000001') <> 5
    or (select requested_quantity from public.qb_order_items where id = '10000000-0000-0000-0000-000000000002') <> 6 then
    raise exception 'No se aplicaron ambas líneas';
  end if;
  v_result := public.admin_update_qb_requested_quantities(
    '[{"orderItemId":"10000000-0000-0000-0000-000000000001","expectedVersion":0,"requestedQuantity":5},{"orderItemId":"10000000-0000-0000-0000-000000000002","expectedVersion":0,"requestedQuantity":6}]',
    'Ajuste solicitado por el cliente', 'contract-success-0001'
  );
  if v_result ->> 'replayed' <> 'true' then raise exception 'Reintento no idempotente'; end if;
  if (select count(*) from public.qb_correction_contract_events) <> 2 then raise exception 'El reintento duplico auditorias'; end if;
end;
$$;

do $$
declare v_failed boolean := false;
begin
  begin
    perform public.admin_update_qb_requested_quantities(
      '[{"orderItemId":"10000000-0000-0000-0000-000000000001","expectedVersion":1,"requestedQuantity":7},{"orderItemId":"10000000-0000-0000-0000-000000000003","expectedVersion":9,"requestedQuantity":8}]',
      'Prueba de conflicto concurrente', 'contract-conflict-0001'
    );
  exception when sqlstate '40001' then v_failed := true;
  end;
  if not v_failed then raise exception 'Se esperaba el conflicto de version'; end if;
  if (select requested_quantity from public.qb_order_items where id = '10000000-0000-0000-0000-000000000001') <> 5 then
    raise exception 'Una linea se guardo parcialmente antes del conflicto';
  end if;
  if exists (select 1 from public.qb_order_grouped_correction_requests where idempotency_key = 'contract-conflict-0001') then
    raise exception 'El intento fallido dejo idempotencia parcial';
  end if;
end;
$$;

do $$
declare v_denied boolean := false;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
  begin
    perform public.admin_update_qb_requested_quantities(
      '[{"orderItemId":"10000000-0000-0000-0000-000000000003","expectedVersion":0,"requestedQuantity":9}]',
      'Prueba de rol', 'contract-denied-0001'
    );
  exception when others then
    if sqlerrm like 'Solo administracion%' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'El rol Inventario no fue rechazado'; end if;
end;
$$;

do $$
begin
  if not has_function_privilege('authenticated', 'public.admin_update_qb_requested_quantities(jsonb,text,text)', 'EXECUTE') then
    raise exception 'authenticated debe tener EXECUTE';
  end if;
  if has_function_privilege('anon', 'public.admin_update_qb_requested_quantities(jsonb,text,text)', 'EXECUTE') then
    raise exception 'anon no debe tener EXECUTE';
  end if;
  if exists (
    select 1 from pg_proc proc
    join pg_namespace ns on ns.oid = proc.pronamespace
    cross join lateral aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) acl
    where ns.nspname = 'public' and proc.proname = 'admin_update_qb_requested_quantities'
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then raise exception 'PUBLIC no debe tener EXECUTE'; end if;
end;
$$;

\echo 'PASS: lote atomico, rollback ante conflicto, idempotencia y autorizacion de rol'
