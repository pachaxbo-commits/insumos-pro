-- Contrato local: la administracion acepta Entregador y conserva sus defensas.
-- Todos los fixtures terminan en rollback.

begin;

insert into auth.users (id, email, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'admin-entregador-contract@example.test', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'target-entregador-contract@example.test', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'inventory-entregador-contract@example.test', now(), now());

insert into public.profiles (id, email, full_name, role, is_active)
values
  ('10000000-0000-0000-0000-000000000001', 'admin-entregador-contract@example.test', 'Admin contract', 'administrador', true),
  ('10000000-0000-0000-0000-000000000002', 'target-entregador-contract@example.test', 'Target contract', 'inventario', true),
  ('10000000-0000-0000-0000-000000000003', 'inventory-entregador-contract@example.test', 'Inventory contract', 'inventario', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select public.admin_update_profile(
  '10000000-0000-0000-0000-000000000002',
  'Entregador contract',
  'entregador',
  true
);

do $$
declare
  v_role text;
  v_active boolean;
begin
  select role, is_active into v_role, v_active
  from public.profiles
  where id = '10000000-0000-0000-0000-000000000002';

  if v_role <> 'entregador' or v_active is not true then
    raise exception 'La RPC no asigno una membresia Entregador activa.';
  end if;
end;
$$;

select public.admin_update_profile(
  '10000000-0000-0000-0000-000000000002',
  'Entregador contract',
  'entregador',
  false
);

do $$
begin
  if exists (
    select 1
    from public.profiles
    where id = '10000000-0000-0000-0000-000000000002'
      and is_active
  ) then
    raise exception 'La RPC no desactivo la membresia Entregador.';
  end if;
end;
$$;

do $$
begin
  begin
    perform public.admin_update_profile(
      '10000000-0000-0000-0000-000000000002',
      'Invalid role',
      'cliente',
      true
    );
    raise exception 'La RPC acepto un rol fuera del contrato.';
  exception
    when others then
      if sqlerrm = 'La RPC acepto un rol fuera del contrato.' then
        raise;
      end if;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

do $$
begin
  begin
    perform public.admin_update_profile(
      '10000000-0000-0000-0000-000000000002',
      'Forbidden update',
      'entregador',
      true
    );
    raise exception 'Inventario pudo administrar perfiles.';
  exception
    when others then
      if sqlerrm = 'Inventario pudo administrar perfiles.' then
        raise;
      end if;
  end;
end;
$$;

reset role;
rollback;
