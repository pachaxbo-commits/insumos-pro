-- Isolated Supabase/PostgreSQL contract test for Phase 4C.1.
-- Run against supabase_db_qb-isolated-test only. Fixtures are rolled back.
begin;

insert into public.products(id,name,unit_id,stock_current,purchase_price,sale_price,is_active)
select x.id,x.name,legacy.id,0,0,0,x.is_active
from (values
 ('4c100000-0000-4000-8000-000000000001'::uuid,'QA 4C1 SOLIDO',true),
 ('4c100000-0000-4000-8000-000000000002'::uuid,'QA 4C1 LIQUIDO',true),
 ('4c100000-0000-4000-8000-000000000003'::uuid,'QA 4C1 REFERENCIADO',true),
 ('4c100000-0000-4000-8000-000000000004'::uuid,'QA 4C1 CON PRECIO',true),
 ('4c100000-0000-4000-8000-000000000005'::uuid,'QA 4C1 CON STOCK',true),
 ('4c100000-0000-4000-8000-000000000006'::uuid,'QA 4C1 INACTIVO',false)
) x(id,name,is_active)
cross join lateral (select id from public.units_of_measure where upper(abbreviation)='BS' limit 1) legacy;

alter table public.qb_product_unit_settings disable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings disable trigger sync_qb_price_unit_for_orders;
insert into public.qb_product_unit_settings(product_id,base_unit_id,inventory_unit_id,base_inventory_unit_id,base_price_unit_id,is_qb_active,is_visible_in_qb_catalog)
select p.id,legacy.id,legacy.id,legacy.id,legacy.id,p.id<>'4c100000-0000-4000-8000-000000000006',false
from public.products p cross join lateral (select id from public.qb_units where upper(symbol)='BS' limit 1) legacy
where p.id::text like '4c100000-%';
alter table public.qb_product_unit_settings enable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings enable trigger sync_qb_price_unit_for_orders;

insert into public.products(id,name,unit_id,stock_current,purchase_price,sale_price,is_active)
select '4c100000-0000-4000-8000-000000000007','QA 4C1 PRESENTACION',legacy.id,0,0,0,true
from public.units_of_measure legacy where upper(legacy.abbreviation)='BS' limit 1;
alter table public.qb_product_unit_settings disable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings disable trigger sync_qb_price_unit_for_orders;
insert into public.qb_product_unit_settings(product_id,base_unit_id,inventory_unit_id,base_inventory_unit_id,base_price_unit_id)
select '4c100000-0000-4000-8000-000000000007',legacy.id,legacy.id,legacy.id,legacy.id
from public.qb_units legacy where upper(legacy.symbol)='BS' limit 1;
alter table public.qb_product_unit_settings enable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings enable trigger sync_qb_price_unit_for_orders;

insert into public.products(id,name,unit_id,stock_current,purchase_price,sale_price)
select '4c100000-0000-4000-8000-000000000008','QA 4C1 UNIDAD AJENA',legacy.id,0,0,0
from public.units_of_measure legacy where upper(legacy.abbreviation)='BS' limit 1;
alter table public.qb_product_unit_settings disable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings disable trigger sync_qb_price_unit_for_orders;
insert into public.qb_product_unit_settings(product_id,base_unit_id,inventory_unit_id,base_inventory_unit_id,base_price_unit_id)
select '4c100000-0000-4000-8000-000000000008',legacy.id,legacy.id,legacy.id,legacy.id
from public.qb_units legacy where upper(legacy.symbol)='BS' limit 1;
alter table public.qb_product_unit_settings enable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings enable trigger sync_qb_price_unit_for_orders;

alter table public.qb_product_allowed_units disable trigger enforce_qb_physical_order_unit;
insert into public.qb_product_allowed_units(product_id,usage_context,unit_id,is_active,is_default,min_quantity,quantity_step)
select p.id,c.context,u.id,c.active,c.is_default,0.25,0.25
from public.products p
cross join (values ('pedido',true,false),('inventario',true,true),('recepcion',true,false),('recibo',true,false),('venta',false,false)) c(context,active,is_default)
cross join lateral (select id from public.qb_units where upper(symbol)='BS' and dimension_id=(select id from public.qb_unit_dimensions where code='legacy_dump') limit 1) u
where p.id in ('4c100000-0000-4000-8000-000000000001','4c100000-0000-4000-8000-000000000002','4c100000-0000-4000-8000-000000000003','4c100000-0000-4000-8000-000000000004','4c100000-0000-4000-8000-000000000005','4c100000-0000-4000-8000-000000000006','4c100000-0000-4000-8000-000000000007','4c100000-0000-4000-8000-000000000008');
alter table public.qb_product_allowed_units enable trigger enforce_qb_physical_order_unit;

update public.products set purchase_price=3 where id='4c100000-0000-4000-8000-000000000004';
update public.products set stock_current=1 where id='4c100000-0000-4000-8000-000000000005';
insert into public.qb_product_presentations(product_id,name,symbol,contained_quantity,contained_unit_id,base_quantity,base_unit_id,conversion_factor_to_base)
select '4c100000-0000-4000-8000-000000000007','QA presentación','QAP',1,kg.id,1,kg.id,1
from public.qb_units kg where lower(kg.code)='kg' limit 1;
create table public.phase41_allowed_reference(allowed_id uuid not null references public.qb_product_allowed_units(id));
insert into phase41_allowed_reference
select id from public.qb_product_allowed_units where product_id='4c100000-0000-4000-8000-000000000003' and usage_context='pedido';

set local request.jwt.claim.sub='d4b00000-0000-4000-8000-000000000001';
set local role authenticated;

do $$
declare
  v_kg uuid;
  v_l uuid;
  v_legacy uuid;
  v_result jsonb;
  v_admin uuid:='d4b00000-0000-4000-8000-000000000001';
  v_context_count integer;
begin
  select id into v_kg from public.qb_units where lower(code)='kg' and is_active;
  select id into v_l from public.qb_units where lower(code)='litro' and is_active;
  select id into v_legacy from public.qb_units where upper(symbol)='BS' and dimension_id=(select id from public.qb_unit_dimensions where code='legacy_dump') limit 1;
  if v_kg is null or v_l is null or v_legacy is null then raise exception 'QA requiere KG, L y unidad BS legacy_dump.'; end if;

  -- Non-admin business roles cannot invoke the regularization RPC.
  foreach v_admin in array array['d4b00000-0000-4000-8000-000000000002'::uuid,'d4b00000-0000-4000-8000-000000000003'::uuid] loop
    perform set_config('request.jwt.claim.sub',v_admin::text,true);
    begin
      perform public.admin_regularize_legacy_product_units('4c100000-0000-4000-8000-000000000001',v_kg,'REGULARIZAR');
      raise exception 'Un rol no administrador pudo regularizar unidades.';
    exception when others then
      if sqlerrm='Un rol no administrador pudo regularizar unidades.' then raise; end if;
    end;
    begin
      perform * from public.admin_preview_legacy_unit_references(array['4c100000-0000-4000-8000-000000000001'::uuid]);
      raise exception 'Un rol no administrador pudo previsualizar referencias.';
    exception when others then
      if sqlerrm='Un rol no administrador pudo previsualizar referencias.' then raise; end if;
    end;
  end loop;
  perform set_config('request.jwt.claim.sub','d4b00000-0000-4000-8000-000000000001',true);

  if not exists(
    select 1 from public.admin_preview_legacy_unit_references(array['4c100000-0000-4000-8000-000000000001'::uuid]) r
    where r.references_verified and not exists(select 1 from jsonb_each(r.association_references) association where jsonb_array_length(association.value)>0)
  ) then raise exception 'La vista previa no confirmó las asociaciones sin referencias.'; end if;
  if not exists(
    select 1 from public.admin_preview_legacy_unit_references(array['4c100000-0000-4000-8000-000000000003'::uuid]) r
    where exists(select 1 from jsonb_each(r.association_references) association where jsonb_array_length(association.value)>0)
  ) then raise exception 'La vista previa no detectó la FK de asociación.'; end if;

  v_result:=public.admin_regularize_legacy_product_units('4c100000-0000-4000-8000-000000000001',v_kg,'REGULARIZAR');
  if v_result->>'status'<>'regularized' then raise exception 'Regularización KG falló: %',v_result; end if;
  if exists(select 1 from public.qb_product_allowed_units a join public.qb_units u on u.id=a.unit_id join public.qb_unit_dimensions d on d.id=u.dimension_id where a.product_id='4c100000-0000-4000-8000-000000000001' and d.code='legacy_dump') then raise exception 'Persistieron asociaciones legacy_dump.'; end if;
  if not exists(select 1 from public.qb_product_allowed_units where product_id='4c100000-0000-4000-8000-000000000001' and usage_context='pedido' and unit_id=v_kg and is_active)
     or not exists(select 1 from public.qb_product_allowed_units where product_id='4c100000-0000-4000-8000-000000000001' and usage_context='inventario' and unit_id=v_kg and is_active)
     or not exists(select 1 from public.qb_product_allowed_units where product_id='4c100000-0000-4000-8000-000000000001' and usage_context='recepcion' and unit_id=v_kg and is_active) then raise exception 'No se crearon los contextos físicos esperados.'; end if;
  if exists(select 1 from public.qb_product_allowed_units where product_id='4c100000-0000-4000-8000-000000000001' and usage_context in ('inventario','recepcion') and unit_id=v_kg and (min_quantity is not null or quantity_step is not null)) then raise exception 'Se copiaron por error mínimo/incremento heredado.'; end if;
  if not exists(select 1 from public.qb_product_unit_regularization_audit where product_id='4c100000-0000-4000-8000-000000000001' and removed_allowed_units @> '[{"min_quantity":0.250000}]'::jsonb) then raise exception 'La auditoría no preservó el snapshot original.'; end if;
  if (select is_visible_in_qb_catalog from public.qb_product_unit_settings where product_id='4c100000-0000-4000-8000-000000000001') then raise exception 'Cambió la visibilidad del catálogo.'; end if;
  if not (select is_qb_active from public.qb_product_unit_settings where product_id='4c100000-0000-4000-8000-000000000001') or not (select is_active from public.products where id='4c100000-0000-4000-8000-000000000001') then raise exception 'Cambió el estado activo del producto.'; end if;

  v_result:=public.admin_regularize_legacy_product_units('4c100000-0000-4000-8000-000000000001',v_kg,'REGULARIZAR');
  if v_result->>'status'<>'already_regularized' then raise exception 'El reintento no fue idempotente: %',v_result; end if;
  select count(*) into v_context_count from public.qb_product_allowed_units where product_id='4c100000-0000-4000-8000-000000000001' and unit_id=v_kg;
  if v_context_count<>3 then raise exception 'El reintento duplicó configuraciones: %',v_context_count; end if;

  v_result:=public.admin_regularize_legacy_product_units('4c100000-0000-4000-8000-000000000002',v_l,'REGULARIZAR');
  if v_result->>'status'<>'regularized' or not exists(select 1 from public.qb_product_allowed_units where product_id='4c100000-0000-4000-8000-000000000002' and usage_context='recepcion' and unit_id=v_l) then raise exception 'Regularización de líquido a L falló: %',v_result; end if;

  -- Inactive products are blocked until Administration explicitly enables them.
  begin
    perform public.admin_regularize_legacy_product_units('4c100000-0000-4000-8000-000000000006',v_kg,'REGULARIZAR');
    raise exception 'Se regularizó una configuración inactiva.';
  exception when others then
    if sqlerrm='Se regularizó una configuración inactiva.' then raise; end if;
  end;
  if (select is_active from public.products where id='4c100000-0000-4000-8000-000000000006') or (select is_qb_active from public.qb_product_unit_settings where product_id='4c100000-0000-4000-8000-000000000006') then raise exception 'La regularización activó producto o configuración QB.'; end if;
  if exists(select 1 from public.qb_product_allowed_units where product_id='4c100000-0000-4000-8000-000000000006' and unit_id=v_kg and usage_context in ('pedido','recepcion','inventario') and is_active) then raise exception 'Se añadieron contextos físicos a producto inactivo.'; end if;

  -- Historical allowed-unit reference, price, stock and presentation all block.
  foreach v_admin in array array['4c100000-0000-4000-8000-000000000003'::uuid,'4c100000-0000-4000-8000-000000000004'::uuid,'4c100000-0000-4000-8000-000000000005'::uuid,'4c100000-0000-4000-8000-000000000007'::uuid] loop
    begin
      perform public.admin_regularize_legacy_product_units(v_admin,v_kg,'REGULARIZAR');
      raise exception 'Se aceptó un producto con historial, precio, stock o presentación: %',v_admin;
    exception when others then
      if sqlerrm like 'Se aceptó un producto%' then raise; end if;
    end;
  end loop;

  -- No arbitrary physical dimension or commercial unit is accepted.
  select id into v_legacy from public.qb_units where lower(code)='arroba' and is_active limit 1;
  begin
    perform public.admin_regularize_legacy_product_units('4c100000-0000-4000-8000-000000000008',v_legacy,'REGULARIZAR');
    raise exception 'Se permitió elegir una presentación comercial como unidad física objetivo.';
  exception when others then
    if sqlerrm='Se permitió elegir una presentación comercial como unidad física objetivo.' then raise; end if;
  end;
  update public.units_of_measure set is_active=false where upper(abbreviation)='KG';
  begin
    perform public.admin_regularize_legacy_product_units('4c100000-0000-4000-8000-000000000008',v_kg,'REGULARIZAR');
    raise exception 'Se permitió regularizar sin una correspondencia única del catálogo legacy.';
  exception when others then
    if sqlerrm='Se permitió regularizar sin una correspondencia única del catálogo legacy.' then raise; end if;
  end;
  update public.units_of_measure set is_active=true where upper(abbreviation)='KG';
end $$;

reset role;
rollback;
