-- Run only against the isolated local Supabase database. Every fixture and
-- mutation is rolled back at the end of this script.
begin;

insert into public.products (id, name, unit_id, stock_current, purchase_price, sale_price)
select '4c000000-0000-4000-8000-000000000001', 'QA 4C SOLIDO', u.id, 0, 0, 0
from public.units_of_measure u where upper(u.abbreviation) = 'BS' limit 1;
insert into public.products (id, name, unit_id, stock_current, purchase_price, sale_price)
select '4c000000-0000-4000-8000-000000000002', 'QA 4C LIQUIDO', u.id, 0, 0, 0
from public.units_of_measure u where upper(u.abbreviation) = 'BS' limit 1;
insert into public.products (id, name, unit_id, stock_current, purchase_price, sale_price)
select '4c000000-0000-4000-8000-000000000003', 'QA 4C HISTORICO', u.id, 0, 0, 0
from public.units_of_measure u where upper(u.abbreviation) = 'BS' limit 1;
insert into public.products (id, name, unit_id, stock_current, purchase_price, sale_price)
select '4c000000-0000-4000-8000-000000000004', 'QA 4C BORRABLE', u.id, 0, 0, 0
from public.units_of_measure u where upper(u.abbreviation) = 'BS' limit 1;
insert into public.products (id, name, unit_id, stock_current, purchase_price, sale_price)
select '4c000000-0000-4000-8000-000000000005', 'QA 4C CON PRECIO', u.id, 0, 8, 0
from public.units_of_measure u where upper(u.abbreviation) = 'BS' limit 1;
insert into public.products (id, name, unit_id, stock_current, purchase_price, sale_price)
select '4c000000-0000-4000-8000-000000000006', 'QA 4C FK FUTURA', u.id, 0, 0, 0
from public.units_of_measure u where upper(u.abbreviation) = 'BS' limit 1;

-- The pre-existing bad state is fixture-only; disable just the legacy-unit
-- guard while seeding it, then immediately restore it before calling the RPC.
alter table public.qb_product_unit_settings disable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings disable trigger sync_qb_price_unit_for_orders;
insert into public.qb_product_unit_settings (product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id, base_price_unit_id)
select p.id, u.id, u.id, u.id, u.id
from public.products p cross join public.qb_units u
where p.id::text like '4c000000-0000-4000-8000-00000000000%'
  and upper(u.symbol) = 'BS';
alter table public.qb_product_unit_settings enable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings enable trigger sync_qb_price_unit_for_orders;

insert into public.inventory_movements (product_id, movement_type, quantity, stock_before, stock_after, reason, created_by)
values ('4c000000-0000-4000-8000-000000000003', 'entrada', 0, 0, 0, 'Fixture de integración Fase 4C', 'd4b00000-0000-4000-8000-000000000001');
insert into public.qb_product_allowed_units (product_id, usage_context, unit_id)
select '4c000000-0000-4000-8000-000000000004', 'pedido', id from public.qb_units where lower(code)='kg' limit 1;
create table public.phase4c_future_product_reference(product_id uuid not null references public.products(id));
insert into phase4c_future_product_reference values ('4c000000-0000-4000-8000-000000000006');

set local request.jwt.claim.sub = 'd4b00000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare
  v_result jsonb;
  v_kg uuid;
  v_l uuid;
  v_admin uuid := 'd4b00000-0000-4000-8000-000000000001';
  v_supervisor uuid := 'd4b00000-0000-4000-8000-000000000002';
begin
  select id into v_kg from public.qb_units where lower(code) = 'kg' and is_active;
  select id into v_l from public.qb_units where lower(code) = 'litro' and is_active;
  if v_kg is null or v_l is null then raise exception 'QA requiere unidades KG y L activas.'; end if;

  perform set_config('request.jwt.claim.sub', v_supervisor::text, true);
  begin
    perform * from public.admin_get_product_reference_review(array['4c000000-0000-4000-8000-000000000001'::uuid]);
    raise exception 'Supervisor pudo revisar dependencias administrativas.';
  exception when others then
    if sqlerrm = 'Supervisor pudo revisar dependencias administrativas.' then raise; end if;
  end;
  begin
    perform public.set_qb_product_physical_unit_if_safe('4c000000-0000-4000-8000-000000000001', v_kg);
    raise exception 'Supervisor pudo corregir unidad física.';
  exception when others then
    if sqlerrm = 'Supervisor pudo corregir unidad física.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  if not exists (
    select 1 from public.admin_get_product_reference_review(array[
      '4c000000-0000-4000-8000-000000000001'::uuid,
      '4c000000-0000-4000-8000-000000000003'::uuid
    ]) r where r.product_id='4c000000-0000-4000-8000-000000000001' and r.references_verified and r.reference_counts='{}'::jsonb
  ) then raise exception 'La revisión no distinguió configuración propia de historial.'; end if;
  if not exists (
    select 1 from public.admin_get_product_reference_review(array['4c000000-0000-4000-8000-000000000003'::uuid]) r
    where r.reference_counts ? 'inventory_movements.product_id'
  ) then raise exception 'La revisión no encontró el movimiento histórico.'; end if;
  if not exists (
    select 1 from public.admin_get_product_reference_review(array['4c000000-0000-4000-8000-000000000006'::uuid]) r
    where exists (select 1 from jsonb_each_text(r.reference_counts) item where item.key like 'phase4c_future_product_reference.%' and item.value='1')
  ) then raise exception 'La revisión no encontró una FK futura del esquema.'; end if;

  perform public.set_qb_product_physical_unit_if_safe('4c000000-0000-4000-8000-000000000001', v_kg);
  if (select upper(u.abbreviation) from public.products p join public.units_of_measure u on u.id=p.unit_id where p.id='4c000000-0000-4000-8000-000000000001') <> 'KG'
     or (select upper(u.symbol) from public.qb_product_unit_settings s join public.qb_units u on u.id=s.base_inventory_unit_id where s.product_id='4c000000-0000-4000-8000-000000000001') <> 'KG'
  then raise exception 'La corrección segura a KG no sincronizó ambas unidades.'; end if;

  perform public.set_qb_product_physical_unit_if_safe('4c000000-0000-4000-8000-000000000002', v_l);
  if (select upper(u.symbol) from public.qb_units u join public.qb_product_unit_settings s on s.base_inventory_unit_id=u.id where s.product_id='4c000000-0000-4000-8000-000000000002') not in ('L','LITRO')
  then raise exception 'La corrección segura a L no se aplicó.'; end if;

  begin
    perform public.set_qb_product_physical_unit_if_safe('4c000000-0000-4000-8000-000000000003', v_kg);
    raise exception 'Se permitió corregir un producto con historial.';
  exception when others then
    if sqlerrm = 'Se permitió corregir un producto con historial.' then raise; end if;
  end;

  begin
    perform public.set_qb_product_physical_unit_if_safe('4c000000-0000-4000-8000-000000000005', v_kg);
    raise exception 'Se permitió corregir un producto con precio.';
  exception when others then
    if sqlerrm = 'Se permitió corregir un producto con precio.' then raise; end if;
  end;
  begin
    perform public.set_qb_product_physical_unit_if_safe('4c000000-0000-4000-8000-000000000006', v_kg);
    raise exception 'Se permitió corregir una unidad con una FK futura.';
  exception when others then
    if sqlerrm = 'Se permitió corregir una unidad con una FK futura.' then raise; end if;
  end;

  v_result := public.admin_delete_product_if_unused('4c000000-0000-4000-8000-000000000003', 'ELIMINAR');
  if v_result->>'status' <> 'blocked' then raise exception 'No se bloqueó eliminación con movimiento: %', v_result; end if;
  v_result := public.admin_delete_product_if_unused('4c000000-0000-4000-8000-000000000006', 'ELIMINAR');
  if v_result->>'status' <> 'blocked' then raise exception 'No se bloqueó eliminación con una FK futura: %', v_result; end if;
  v_result := public.admin_delete_product_if_unused('4c000000-0000-4000-8000-000000000004', 'ELIMINAR');
  if v_result->>'status' <> 'deleted' then raise exception 'No se eliminó producto sin dependencias: %', v_result; end if;
  if exists(select 1 from public.products where id='4c000000-0000-4000-8000-000000000004') then raise exception 'El producto permitido sigue presente.'; end if;
  if not exists(select 1 from public.product_deletion_audit where original_product_id='4c000000-0000-4000-8000-000000000004' and result='deleted' and actor_profile_id=v_admin) then
    raise exception 'Falta auditoría durable de eliminación.';
  end if;
  if exists(select 1 from public.qb_product_allowed_units where product_id='4c000000-0000-4000-8000-000000000004') then
    raise exception 'No se limpió la configuración auxiliar segura.';
  end if;

  perform set_config('request.jwt.claim.sub', v_supervisor::text, true);
  begin
    perform public.admin_delete_product_if_unused('4c000000-0000-4000-8000-000000000001', 'ELIMINAR');
    raise exception 'Supervisor pudo eliminar definitivamente.';
  exception when others then
    if sqlerrm = 'Supervisor pudo eliminar definitivamente.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', 'd4b00000-0000-4000-8000-000000000003', true);
  begin
    perform public.admin_delete_product_if_unused('4c000000-0000-4000-8000-000000000001', 'ELIMINAR');
    raise exception 'Inventario pudo eliminar definitivamente.';
  exception when others then
    if sqlerrm = 'Inventario pudo eliminar definitivamente.' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  begin
    delete from public.products where id='4c000000-0000-4000-8000-000000000001';
    raise exception 'Authenticated conservó DELETE directo sobre products.';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
