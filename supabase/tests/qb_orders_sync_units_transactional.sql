-- Contrato transaccional focalizado para la configuración canónica de unidades.
-- Todos los productos, configuraciones y auditorías QA terminan en ROLLBACK.

begin;

create temp table qb_sync_units_test_results (
  scenario text primary key,
  description text not null
) on commit drop;

do $$
declare
  v_admin_id uuid;
  v_category_id uuid;
  v_primary_unit public.qb_units%rowtype;
  v_alternate_unit public.qb_units%rowtype;
  v_product_id uuid := extensions.gen_random_uuid();
  v_unknown_user_id uuid := extensions.gen_random_uuid();
  v_created_id uuid;
  v_unauthorized_rejected boolean := false;
begin
  select profile.id into v_admin_id
  from public.profiles profile
  where profile.is_active = true
    and profile.role in ('admin', 'administrador')
  order by profile.id
  limit 1;
  if v_admin_id is null then
    raise exception 'QB_SYNC_UNITS_ACTIVE_ADMIN_REQUIRED';
  end if;

  select category.id into v_category_id
  from public.product_categories category
  where category.is_active = true
  order by category.id
  limit 1;
  if v_category_id is null then
    raise exception 'QB_SYNC_UNITS_ACTIVE_CATEGORY_REQUIRED';
  end if;

  select unit.* into v_primary_unit
  from public.qb_units unit
  where unit.is_active = true
  order by unit.is_base desc, unit.code, unit.id
  limit 1;
  if v_primary_unit.id is null then
    raise exception 'QB_SYNC_UNITS_ACTIVE_UNIT_REQUIRED';
  end if;

  select unit.* into v_alternate_unit
  from public.qb_units unit
  where unit.is_active = true
    and unit.dimension_id = v_primary_unit.dimension_id
    and unit.id <> v_primary_unit.id
  order by unit.code, unit.id
  limit 1;
  if v_alternate_unit.id is null then
    v_alternate_unit := v_primary_unit;
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_admin_id::text)::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select public.save_qb_product_with_units(
    v_product_id, true, 'QB TEST UNIDADES', null, v_category_id,
    v_primary_unit.id, v_primary_unit.id, v_primary_unit.id,
    0, null, null, false, true, null, 0, 1, 1, true
  ) into v_created_id;

  if v_created_id is distinct from v_product_id
    or not exists (
      select 1
      from public.products product
      join public.qb_product_unit_settings settings on settings.product_id = product.id
      where product.id = v_product_id
        and settings.base_unit_id = v_primary_unit.id
        and settings.inventory_unit_id = v_primary_unit.id
        and settings.base_inventory_unit_id = v_primary_unit.id
        and settings.base_price_unit_id = v_primary_unit.id
    ) then
    raise exception 'QB_SYNC_UNITS_CREATE_FAILED';
  end if;
  insert into qb_sync_units_test_results values
    ('01_create', 'Producto y configuración canónica creados atómicamente');

  perform public.save_qb_product_with_units(
    v_product_id, false, 'QB TEST UNIDADES EDITADO', 'QB-TEST-UNITS', v_category_id,
    v_alternate_unit.id, v_alternate_unit.id, v_alternate_unit.id,
    2, null, null, false, true, null, 1, 1, 1, true
  );

  if not exists (
    select 1
    from public.products product
    join public.qb_product_unit_settings settings on settings.product_id = product.id
    where product.id = v_product_id
      and product.name = 'QB TEST UNIDADES EDITADO'
      and settings.base_unit_id = v_alternate_unit.id
      and settings.inventory_unit_id = v_alternate_unit.id
      and settings.base_price_unit_id = v_alternate_unit.id
  ) then
    raise exception 'QB_SYNC_UNITS_UPDATE_FAILED';
  end if;
  insert into qb_sync_units_test_results values
    ('02_update', 'Edición y cambio de unidad sin movimientos confirmados');

  if exists (
    select 1 from public.inventory_movements movement where movement.product_id = v_product_id
  ) then
    raise exception 'QB_SYNC_UNITS_UNEXPECTED_MOVEMENT';
  end if;
  insert into qb_sync_units_test_results values
    ('03_no_inventory', 'La configuración no crea stock ni movimientos');

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_unknown_user_id::text)::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_unknown_user_id::text, true);
  begin
    perform public.save_qb_product_with_units(
      extensions.gen_random_uuid(), true, 'QB TEST NO AUTORIZADO', null, v_category_id,
      v_primary_unit.id, v_primary_unit.id, v_primary_unit.id,
      0, null, null, false, true, null, 0, 1, 1, true
    );
  exception when others then
    v_unauthorized_rejected := sqlerrm = 'Solo un administrador puede configurar productos.';
  end;
  if not v_unauthorized_rejected then
    raise exception 'QB_SYNC_UNITS_UNAUTHORIZED_NOT_REJECTED';
  end if;
  insert into qb_sync_units_test_results values
    ('04_authorization', 'Una sesión sin administrador fue rechazada');
end;
$$;

select scenario, description
from qb_sync_units_test_results
order by scenario;

rollback;
