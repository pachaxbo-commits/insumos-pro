-- Run only against an isolated local Supabase database. Always rolls back.
begin;

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-4000-8000-00000000a301', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unit-review@example.invalid');
insert into public.profiles (id, role, is_active)
values ('00000000-0000-4000-8000-00000000a301', 'administrador', true);

insert into public.units_of_measure (id, name, abbreviation, is_active)
values
  ('00000000-0000-4000-8000-00000000b301', 'Boliviano QA', 'BS', true),
  ('00000000-0000-4000-8000-00000000b302', 'Kilogramo QA', 'KG_QA_SAFE_CORRECTION', true);
insert into public.qb_unit_dimensions (id, code, name, base_unit_code)
values
  ('00000000-0000-4000-8000-00000000d301', 'qa_money', 'QA monetaria', 'qa_bs'),
  ('00000000-0000-4000-8000-00000000d302', 'qa_weight', 'QA peso', 'qa_kg');
insert into public.qb_units (id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base, is_active)
values
  ('00000000-0000-4000-8000-00000000b303', '00000000-0000-4000-8000-00000000d301', 'qa_bs', 'Boliviano QA', 'BS', 1, true, true),
  ('00000000-0000-4000-8000-00000000b304', '00000000-0000-4000-8000-00000000d302', 'kg_qa_safe_correction', 'Kilogramo QA', 'KG_QA_SAFE_CORRECTION', 1, true, true);
-- Simulate the legacy rows under repair; this QA fixture alone bypasses the current write guard.
insert into public.products (id, name, unit_id, stock_current, stock_minimum, purchase_price, sale_price)
values
  ('00000000-0000-4000-8000-00000000c301', 'Producto QA sin historial', '00000000-0000-4000-8000-00000000b301', 0, 0, 0, 0),
  ('00000000-0000-4000-8000-00000000c302', 'Producto QA con saldo', '00000000-0000-4000-8000-00000000b301', 1, 0, 0, 0);
alter table public.qb_product_unit_settings disable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings disable trigger sync_qb_price_unit_for_orders;
insert into public.qb_product_unit_settings
  (product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id, base_price_unit_id, is_qb_active)
values
  ('00000000-0000-4000-8000-00000000c301', '00000000-0000-4000-8000-00000000b303', '00000000-0000-4000-8000-00000000b303', '00000000-0000-4000-8000-00000000b303', '00000000-0000-4000-8000-00000000b303', true),
  ('00000000-0000-4000-8000-00000000c302', '00000000-0000-4000-8000-00000000b303', '00000000-0000-4000-8000-00000000b303', '00000000-0000-4000-8000-00000000b303', '00000000-0000-4000-8000-00000000b303', true);
alter table public.qb_product_unit_settings enable trigger enforce_qb_physical_product_units;
alter table public.qb_product_unit_settings enable trigger sync_qb_price_unit_for_orders;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a301', true);
select public.set_qb_product_physical_unit_if_safe(
  '00000000-0000-4000-8000-00000000c301',
  '00000000-0000-4000-8000-00000000b304'
);
do $$
begin
  if (select unit_id from public.products where id = '00000000-0000-4000-8000-00000000c301')
    <> '00000000-0000-4000-8000-00000000b302' then raise exception 'Legacy product unit not synchronized'; end if;
  if exists (
    select 1 from public.qb_product_unit_settings
    where product_id = '00000000-0000-4000-8000-00000000c301'
      and (base_unit_id <> '00000000-0000-4000-8000-00000000b304'
        or inventory_unit_id <> '00000000-0000-4000-8000-00000000b304'
        or base_inventory_unit_id <> '00000000-0000-4000-8000-00000000b304'
        or base_price_unit_id <> '00000000-0000-4000-8000-00000000b304')
  ) then raise exception 'QB unit settings were not synchronized'; end if;
  if (select count(*) from public.audit_logs where entity_id = '00000000-0000-4000-8000-00000000c301' and action = 'set_qb_product_physical_unit') <> 1 then
    raise exception 'Unit correction audit entry missing';
  end if;
end $$;

do $$
begin
  perform public.set_qb_product_physical_unit_if_safe(
    '00000000-0000-4000-8000-00000000c302',
    '00000000-0000-4000-8000-00000000b304'
  );
  raise exception 'Product with nonzero stock was allowed to change unit';
exception when others then
  if sqlerrm = 'Product with nonzero stock was allowed to change unit' then raise; end if;
end $$;

update public.profiles set role = 'inventario' where id = '00000000-0000-4000-8000-00000000a301';
select public.ensure_qb_reception_unit_for_purchase(
  '00000000-0000-4000-8000-00000000c301',
  '00000000-0000-4000-8000-00000000b304'
);
select public.ensure_qb_reception_unit_for_purchase(
  '00000000-0000-4000-8000-00000000c301',
  '00000000-0000-4000-8000-00000000b304'
);
do $$
begin
  if (select count(*) from public.qb_product_allowed_units
      where product_id = '00000000-0000-4000-8000-00000000c301'
        and usage_context = 'recepcion' and unit_id = '00000000-0000-4000-8000-00000000b304') <> 1 then
    raise exception 'Purchase unit activation is not idempotent';
  end if;
  if (select count(*) from public.audit_logs
      where entity_id = '00000000-0000-4000-8000-00000000c301'
        and action = 'create_qb_reception_unit') <> 1 then
    raise exception 'Purchase unit activation audit is missing or duplicated';
  end if;
end $$;

rollback;
