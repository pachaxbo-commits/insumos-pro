-- Integration test for commercial packaging without a known physical conversion.
-- Run only on isolated local Supabase; all fixture data rolls back.
begin;

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-4000-8000-00000000a401', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'commercial-purchase@example.invalid');
insert into public.profiles (id, role, is_active)
values ('00000000-0000-4000-8000-00000000a401', 'administrador', true);

insert into public.units_of_measure (id, name, abbreviation, is_active)
values ('00000000-0000-4000-8000-00000000b401', 'Kilogramo QA', 'KG', true);
insert into public.qb_unit_dimensions (id, code, name, base_unit_code)
values ('00000000-0000-4000-8000-00000000d401', 'qa_weight_purchase', 'QA weight', 'qa_kg_purchase');
insert into public.qb_units (id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base, is_active)
values ('00000000-0000-4000-8000-00000000b402', '00000000-0000-4000-8000-00000000d401', 'qa_kg_purchase', 'Kilogramo QA', 'kg', 1, true, true);
insert into public.products (id, name, unit_id, stock_current, stock_minimum, purchase_price, sale_price, is_active)
values ('00000000-0000-4000-8000-00000000c401', 'Producto empaque QA', '00000000-0000-4000-8000-00000000b401', 0, 0, 0, 0, true);
insert into public.qb_product_unit_settings
  (product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id, base_price_unit_id, is_qb_active)
values
  ('00000000-0000-4000-8000-00000000c401', '00000000-0000-4000-8000-00000000b402', '00000000-0000-4000-8000-00000000b402', '00000000-0000-4000-8000-00000000b402', '00000000-0000-4000-8000-00000000b402', true);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a401', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.qb_merchandise_receipts (id, receipt_date, status, reference_code, created_by, updated_by)
values ('00000000-0000-4000-8000-00000000e401', current_date, 'borrador', 'QA-COMMERCIAL', '00000000-0000-4000-8000-00000000a401', '00000000-0000-4000-8000-00000000a401');
insert into public.qb_conversion_snapshots
  (id, source_table, source_id, product_id, dimension_code, source_kind, source_label, source_quantity,
   base_unit_id, base_unit_symbol, base_quantity, conversion_factor_to_base, snapshot, created_by)
values
   ('00000000-0000-4000-8000-00000000f401', 'qb_merchandise_receipt_lines', '00000000-0000-4000-8000-00000000e402', '00000000-0000-4000-8000-00000000c401', 'qa_weight_purchase', 'commercial_unmeasured', 'CARGA', 5,
   '00000000-0000-4000-8000-00000000b402', 'kg', 0, 0,
   '{"measurement_required_before_stock":true}', '00000000-0000-4000-8000-00000000a401');
insert into public.qb_merchandise_receipt_lines
  (id, receipt_id, product_id, source_kind, source_label, source_quantity, base_unit_id, base_unit_symbol,
   base_quantity, conversion_factor_to_base, conversion_snapshot_id, unit_cost, total_cost,
   requires_classification, is_warehouse_purchase, created_by, updated_by)
values
  ('00000000-0000-4000-8000-00000000e402', '00000000-0000-4000-8000-00000000e401', '00000000-0000-4000-8000-00000000c401',
   'commercial_unmeasured', 'CARGA', 5, '00000000-0000-4000-8000-00000000b402', 'kg',
   0, 0, '00000000-0000-4000-8000-00000000f401', 600, 3000, false, true,
   '00000000-0000-4000-8000-00000000a401', '00000000-0000-4000-8000-00000000a401');

do $$
begin
  begin
    perform public.confirm_qb_merchandise_receipt('00000000-0000-4000-8000-00000000e401');
    raise exception 'Unmeasured commercial purchase was confirmed';
  exception when others then
    if sqlerrm = 'Unmeasured commercial purchase was confirmed' then raise; end if;
  end;
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c401') <> 0 then
    raise exception 'Unmeasured commercial purchase changed stock';
  end if;
end $$;

select public.set_warehouse_purchase_actual_quantity('00000000-0000-4000-8000-00000000e402', 75);
select public.confirm_qb_merchandise_receipt('00000000-0000-4000-8000-00000000e401');

do $$
begin
  if (select stock_current from public.products where id = '00000000-0000-4000-8000-00000000c401') <> 75 then
    raise exception 'Measured useful quantity was not posted exactly once';
  end if;
  if (select base_quantity from public.qb_merchandise_receipt_lines where id = '00000000-0000-4000-8000-00000000e402') <> 75
    or (select source_quantity from public.qb_merchandise_receipt_lines where id = '00000000-0000-4000-8000-00000000e402') <> 5
    or (select unit_cost from public.qb_merchandise_receipt_lines where id = '00000000-0000-4000-8000-00000000e402') <> 600
    or (select total_cost from public.qb_merchandise_receipt_lines where id = '00000000-0000-4000-8000-00000000e402') <> 3000 then
    raise exception 'Commercial quantity or measured physical quantity was altered';
  end if;
  if (select count(*) from public.inventory_movements where reason = 'Ingreso QB de mercaderia' and notes like '%00000000-0000-4000-8000-00000000e401%') <> 1 then
    raise exception 'Expected exactly one inventory movement';
  end if;
end $$;

select 'PASS: 5 CARGAS × Bs 600 stays Bs 3000; only measured 75 KG enter stock';
rollback;
