-- Prueba focalizada de presentación exclusiva de recepción.
-- Todos los fixtures y el borrador terminan en ROLLBACK.

begin;

do $$
declare
  v_admin_id uuid;
  v_kg_id uuid;
  v_arroba_id uuid;
  v_suffix text := pg_catalog.substr(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 10);
  v_source_id uuid := extensions.gen_random_uuid();
  v_small_id uuid := extensions.gen_random_uuid();
  v_medium_id uuid := extensions.gen_random_uuid();
  v_large_id uuid := extensions.gen_random_uuid();
  v_presentation_id uuid := extensions.gen_random_uuid();
  v_allowed_id uuid;
  v_receipt_id uuid := extensions.gen_random_uuid();
  v_line_id uuid := extensions.gen_random_uuid();
  v_snapshot_id uuid := extensions.gen_random_uuid();
  v_small_output_id uuid;
  v_medium_output_id uuid;
  v_large_output_id uuid;
begin
  select id into v_admin_id
  from public.profiles
  where is_active and role in ('admin', 'administrador')
  order by id
  limit 1;
  if v_admin_id is null then raise exception 'QB_TEST_ACTIVE_ADMIN_REQUIRED'; end if;

  select id into v_kg_id from public.qb_units
  where is_active and pg_catalog.lower(code) = 'kg' order by is_base desc, id limit 1;
  select id into v_arroba_id from public.qb_units
  where is_active and pg_catalog.lower(code) in ('arroba', 'arrobas') order by id limit 1;
  if v_kg_id is null or v_arroba_id is null then raise exception 'QB_TEST_KG_ARROBA_REQUIRED'; end if;

  perform set_config('request.jwt.claims', pg_catalog.jsonb_build_object('role', 'authenticated', 'sub', v_admin_id::text)::text, true);
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  insert into public.products (id, name, requires_classification, is_sellable, is_active, stock_current)
  values
    (v_source_id, 'QB TEST Recepcion Papa ' || v_suffix, true, false, true, 0),
    (v_small_id, 'QB TEST Recepcion Pequena ' || v_suffix, false, true, true, 0),
    (v_medium_id, 'QB TEST Recepcion Mediana ' || v_suffix, false, true, true, 0),
    (v_large_id, 'QB TEST Recepcion Grande ' || v_suffix, false, true, true, 0);

  insert into public.qb_product_unit_settings (
    product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id,
    is_visible_in_qb_catalog, is_classifiable, classification_mode,
    is_qb_active, created_by, updated_by
  ) values
    (v_source_id, v_kg_id, v_kg_id, v_kg_id, false, true, 'percentage', true, v_admin_id, v_admin_id),
    (v_small_id, v_kg_id, v_kg_id, v_kg_id, false, false, 'none', true, v_admin_id, v_admin_id),
    (v_medium_id, v_kg_id, v_kg_id, v_kg_id, false, false, 'none', true, v_admin_id, v_admin_id),
    (v_large_id, v_kg_id, v_kg_id, v_kg_id, false, false, 'none', true, v_admin_id, v_admin_id);

  insert into public.qb_product_presentations (
    id, product_id, name, symbol, contained_quantity, contained_unit_id,
    base_quantity, base_unit_id, conversion_factor_to_base,
    allow_purchase, allow_order, allow_sale, allow_inventory,
    is_active, created_by, updated_by
  ) values (
    v_presentation_id, v_source_id, 'Carga', 'carga', 10, v_arroba_id,
    112.5, v_kg_id, 112.5,
    true, false, false, false,
    true, v_admin_id, v_admin_id
  );

  select id into v_allowed_id
  from public.qb_product_allowed_units
  where product_id = v_source_id
    and usage_context = 'recepcion'
    and presentation_id = v_presentation_id
    and is_active;
  if v_allowed_id is null then raise exception 'QB_TEST_RECEIVING_SOURCE_NOT_SYNCED'; end if;
  if exists (
    select 1 from public.qb_product_allowed_units
    where product_id = v_source_id and presentation_id = v_presentation_id
      and usage_context in ('pedido', 'inventario', 'recibo') and is_active
  ) then raise exception 'QB_TEST_UNAUTHORIZED_CONTEXT_CREATED'; end if;

  perform public.save_qb_product_classification_configuration(
    v_source_id,
    pg_catalog.jsonb_build_array(v_small_id::text, v_medium_id::text, v_large_id::text)
  );
  select id into v_small_output_id from public.qb_product_classification_outputs
  where source_product_id = v_source_id and output_product_id = v_small_id and is_active;
  select id into v_medium_output_id from public.qb_product_classification_outputs
  where source_product_id = v_source_id and output_product_id = v_medium_id and is_active;
  select id into v_large_output_id from public.qb_product_classification_outputs
  where source_product_id = v_source_id and output_product_id = v_large_id and is_active;

  insert into public.qb_merchandise_receipts (
    id, receipt_date, status, reference_code, created_by, updated_by
  ) values (
    v_receipt_id, current_date, 'borrador', 'QB-TEST-RECEPTION-' || v_suffix, v_admin_id, v_admin_id
  );
  insert into public.qb_conversion_snapshots (
    id, source_table, source_id, product_id, dimension_code, source_kind,
    product_presentation_id, source_label, source_quantity, base_unit_id,
    base_unit_symbol, base_quantity, conversion_factor_to_base, snapshot, created_by
  ) values (
    v_snapshot_id, 'qb_merchandise_receipt_lines', v_line_id, v_source_id,
    'peso', 'product_presentation', v_presentation_id, 'Carga', 1,
    v_kg_id, 'kg', 112.5, 112.5,
    pg_catalog.jsonb_build_object('allow_purchase', true, 'allow_order', false, 'allow_sale', false, 'allow_inventory', false),
    v_admin_id
  );
  insert into public.qb_merchandise_receipt_lines (
    id, receipt_id, product_id, allowed_unit_id, source_kind,
    product_presentation_id, source_label, source_quantity, base_unit_id,
    base_unit_symbol, base_quantity, conversion_factor_to_base,
    conversion_snapshot_id, total_cost, requires_classification, created_by, updated_by
  ) values (
    v_line_id, v_receipt_id, v_source_id, v_allowed_id, 'product_presentation',
    v_presentation_id, 'Carga', 1, v_kg_id,
    'kg', 112.5, 112.5,
    v_snapshot_id, 0, true, v_admin_id, v_admin_id
  );

  perform public.save_qb_merchandise_classification_percentages(
    v_line_id,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('output_id', v_small_output_id, 'percentage', 0),
      pg_catalog.jsonb_build_object('output_id', v_medium_output_id, 'percentage', 60),
      pg_catalog.jsonb_build_object('output_id', v_large_output_id, 'percentage', 40)
    )
  );

  if not exists (
    select 1
    from public.qb_merchandise_receipt_classification_results result
    where result.line_id = v_line_id
    group by result.line_id
    having pg_catalog.sum(result.assigned_percentage) = 100
      and pg_catalog.sum(result.base_quantity) = 112.5
      and pg_catalog.sum(case when result.output_product_id = v_small_id and result.base_quantity = 0 then 1 else 0 end) = 1
      and pg_catalog.sum(case when result.output_product_id = v_medium_id and result.base_quantity = 67.5 then 1 else 0 end) = 1
      and pg_catalog.sum(case when result.output_product_id = v_large_id and result.base_quantity = 45 then 1 else 0 end) = 1
  ) then raise exception 'QB_TEST_0_60_40_DISTRIBUTION_FAILED'; end if;
end;
$$;

select 'PASS: Carga exclusiva de recepcion, 112.5 kg y distribucion 0/60/40';

rollback;
