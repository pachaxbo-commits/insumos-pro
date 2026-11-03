select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
set role authenticated;
do $$
declare
  row_data record;
  unit_cost_type text;
  total_cost_type text;
  ref_price_type text;
begin
  if has_table_privilege('authenticated', 'public.qb_merchandise_receipt_lines', 'select') then
    raise exception 'Authenticated users can bypass the role-filtered projection through the source table';
  end if;

  select format_type(a.atttypid, a.atttypmod) into unit_cost_type
  from pg_attribute a where a.attrelid = 'public.qb_operational_warehouse_purchases'::regclass
    and a.attname = 'unit_cost' and not a.attisdropped;
  select format_type(a.atttypid, a.atttypmod) into total_cost_type
  from pg_attribute a where a.attrelid = 'public.qb_operational_warehouse_purchases'::regclass
    and a.attname = 'total_cost' and not a.attisdropped;
  select format_type(a.atttypid, a.atttypmod) into ref_price_type
  from pg_attribute a where a.attrelid = 'public.qb_operational_warehouse_purchases'::regclass
    and a.attname = 'reference_price' and not a.attisdropped;
  if unit_cost_type <> 'numeric(18,4)' or total_cost_type <> 'numeric(18,4)'
     or ref_price_type <> 'numeric(20,8)' then
    raise exception 'Projection column types changed: %, %, %', unit_cost_type, total_cost_type, ref_price_type;
  end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
  select unit_cost, total_cost, reference_price into row_data
    from public.qb_operational_warehouse_purchases;
  if row_data.unit_cost <> 600 or row_data.total_cost <> 1800 or row_data.reference_price <> 760 then
    raise exception 'Administrator projection did not return full authorized amounts';
  end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
  select product_name, source_label, source_quantity, unit_cost, total_cost, reference_price into row_data
    from public.qb_operational_warehouse_purchases;
  if row_data.product_name <> 'FICTICIO PROJECTION TEST' or row_data.source_label <> 'SACO'
     or row_data.source_quantity <> 3 or row_data.unit_cost <> 600
     or row_data.total_cost is not null or row_data.reference_price <> 760 then
    raise exception 'Supervisor projection did not restrict aggregate totals';
  end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
  select product_name, source_label, source_quantity, unit_cost, total_cost, reference_price into row_data
    from public.qb_operational_warehouse_purchases;
  if row_data.product_name <> 'FICTICIO PROJECTION TEST' or row_data.source_label <> 'SACO'
     or row_data.source_quantity <> 3 or row_data.unit_cost is not null
     or row_data.total_cost is not null or row_data.reference_price is not null then
    raise exception 'Inventory projection exposed a cost field';
  end if;
end $$;
reset role;
