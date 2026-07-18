-- Classified receipts: variable percentages, exact conservation and administrator-only configuration.

begin;

alter table public.qb_merchandise_receipt_classification_results
  add column if not exists assigned_percentage numeric(7, 4),
  add column if not exists calculation_snapshot jsonb;

alter table public.qb_merchandise_receipt_classification_results
  drop constraint if exists qb_merchandise_classification_results_percentage_check;
alter table public.qb_merchandise_receipt_classification_results
  add constraint qb_merchandise_classification_results_percentage_check
  check (assigned_percentage is null or (assigned_percentage >= 0 and assigned_percentage <= 100));

create unique index if not exists qb_merchandise_classification_results_output_unique_idx
  on public.qb_merchandise_receipt_classification_results (line_id, configured_output_id)
  where configured_output_id is not null;

comment on column public.qb_merchandise_receipt_classification_results.assigned_percentage is
  'Porcentaje variable introducido para esta recepción; no es una proporción predeterminada del producto.';
comment on column public.qb_merchandise_receipt_classification_results.calculation_snapshot is
  'Política de cálculo y conservación utilizada para convertir porcentajes a cantidades con seis decimales.';

create or replace function public.save_qb_merchandise_classification_percentages(
  p_line_id uuid,
  p_results jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_line public.qb_merchandise_receipt_lines%rowtype;
  v_receipt_status text;
  v_row jsonb;
  v_output public.qb_product_classification_outputs%rowtype;
  v_output_id uuid;
  v_output_ids uuid[] := array[]::uuid[];
  v_percentage numeric(7, 4);
  v_percentage_total numeric(12, 4) := 0;
  v_quantity numeric(18, 6);
  v_quantity_total numeric(18, 6) := 0;
  v_assigned_cost numeric(18, 4);
  v_cost_total numeric(18, 4) := 0;
  v_last_output_id uuid;
begin
  if v_user_id is null then
    raise exception 'QB_CLASSIFICATION_AUTH_REQUIRED';
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_role is null or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'QB_CLASSIFICATION_ROLE_REQUIRED';
  end if;

  select line.*
  into v_line
  from public.qb_merchandise_receipt_lines line
  join public.qb_merchandise_receipts receipt on receipt.id = line.receipt_id
  where line.id = p_line_id
  for update of line, receipt;

  if v_line.id is null then
    raise exception 'QB_CLASSIFICATION_LINE_NOT_FOUND';
  end if;
  select status into v_receipt_status
  from public.qb_merchandise_receipts
  where id = v_line.receipt_id;
  if v_receipt_status <> 'borrador' then
    raise exception 'QB_CLASSIFICATION_DRAFT_REQUIRED';
  end if;
  if not v_line.requires_classification then
    raise exception 'QB_CLASSIFICATION_NOT_REQUIRED';
  end if;
  if p_results is null or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) = 0 then
    raise exception 'QB_CLASSIFICATION_RESULTS_REQUIRED';
  end if;

  for v_row in select * from jsonb_array_elements(p_results)
  loop
    begin
      v_output_id := (v_row ->> 'output_id')::uuid;
      v_percentage := (v_row ->> 'percentage')::numeric;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'QB_CLASSIFICATION_INVALID_PERCENTAGE';
    end;

    if v_output_id = any(v_output_ids) then
      raise exception 'QB_CLASSIFICATION_DUPLICATE_OUTPUT';
    end if;
    v_output_ids := array_append(v_output_ids, v_output_id);

    select * into v_output
    from public.qb_product_classification_outputs
    where id = v_output_id
      and source_product_id = v_line.product_id
      and output_type = 'product'
      and output_product_id is not null
      and is_active = true;

    if v_output.id is null then
      raise exception 'QB_CLASSIFICATION_OUTPUT_INVALID';
    end if;
    if not exists (
      select 1 from public.products product
      where product.id = v_output.output_product_id and product.is_active = true
    ) then
      raise exception 'QB_CLASSIFICATION_PRODUCT_INACTIVE';
    end if;
    if v_percentage::text in ('NaN', 'Infinity', '-Infinity')
      or v_percentage < 0 or v_percentage > 100 then
      raise exception 'QB_CLASSIFICATION_INVALID_PERCENTAGE';
    end if;

    v_percentage_total := v_percentage_total + v_percentage;
  end loop;

  if v_percentage_total <> 100 then
    raise exception 'QB_CLASSIFICATION_PERCENTAGE_TOTAL';
  end if;

  select (item ->> 'output_id')::uuid
  into v_last_output_id
  from jsonb_array_elements(p_results) item
  join public.qb_product_classification_outputs output
    on output.id = (item ->> 'output_id')::uuid
  where (item ->> 'percentage')::numeric > 0
  order by output.sort_order desc, output.id desc
  limit 1;

  if v_last_output_id is null then
    raise exception 'QB_CLASSIFICATION_POSITIVE_RESULT_REQUIRED';
  end if;

  delete from public.qb_merchandise_receipt_classification_results
  where line_id = p_line_id;

  for v_row in
    select item
    from jsonb_array_elements(p_results) item
    join public.qb_product_classification_outputs output
      on output.id = (item ->> 'output_id')::uuid
    order by output.sort_order, output.id
  loop
    v_output_id := (v_row ->> 'output_id')::uuid;
    v_percentage := (v_row ->> 'percentage')::numeric;

    select * into v_output
    from public.qb_product_classification_outputs
    where id = v_output_id;

    if v_output_id = v_last_output_id then
      v_quantity := round(v_line.base_quantity - v_quantity_total, 6);
      v_assigned_cost := round(v_line.total_cost - v_cost_total, 4);
    else
      v_quantity := round(v_line.base_quantity * v_percentage / 100, 6);
      v_assigned_cost := round(v_line.total_cost * v_percentage / 100, 4);
    end if;

    if v_percentage > 0 and v_quantity <= 0 then
      raise exception 'QB_CLASSIFICATION_NON_POSITIVE_QUANTITY';
    end if;

    v_quantity_total := v_quantity_total + v_quantity;
    v_cost_total := v_cost_total + v_assigned_cost;

    insert into public.qb_merchandise_receipt_classification_results (
      line_id, configured_output_id, output_type, output_product_id, label,
      assigned_percentage, base_quantity, assigned_cost, calculation_snapshot,
      sort_order, created_by, updated_by
    ) values (
      p_line_id, v_output.id, 'product', v_output.output_product_id, v_output.label,
      v_percentage, v_quantity, v_assigned_cost,
      jsonb_build_object(
        'version', 'classified-percentage-v1',
        'base_quantity', v_line.base_quantity,
        'percentage', v_percentage,
        'quantity_scale', 6,
        'residual_policy', 'last_positive_output'
      ),
      v_output.sort_order, v_user_id, v_user_id
    );
  end loop;

  if v_quantity_total <> v_line.base_quantity then
    raise exception 'QB_CLASSIFICATION_CONSERVATION_FAILED';
  end if;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'save_qb_merchandise_classification_percentages',
    'qb_merchandise_receipt',
    v_line.receipt_id,
    jsonb_build_object(
      'line_id', p_line_id,
      'result_count', jsonb_array_length(p_results),
      'percentage_total', v_percentage_total,
      'base_quantity', v_line.base_quantity,
      'residual_policy', 'last_positive_output'
    )
  );

  return p_line_id;
end;
$$;

revoke all on function public.save_qb_merchandise_classification_percentages(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_qb_merchandise_classification_percentages(uuid, jsonb)
  to authenticated;

-- Product and reception configuration is administrator-only. Inventory keeps read access
-- and continues to register and confirm merchandise receipts through the guarded flow.
drop policy if exists "Internal roles can insert product categories" on public.product_categories;
drop policy if exists "Internal roles can update product categories" on public.product_categories;
create policy "Administrators can insert product categories" on public.product_categories for insert
  with check (public.current_user_role() in ('admin', 'administrador'));
create policy "Administrators can update product categories" on public.product_categories for update
  using (public.current_user_role() in ('admin', 'administrador'))
  with check (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Internal roles can insert units" on public.units_of_measure;
drop policy if exists "Internal roles can update units" on public.units_of_measure;
create policy "Administrators can insert units" on public.units_of_measure for insert
  with check (public.current_user_role() in ('admin', 'administrador'));
create policy "Administrators can update units" on public.units_of_measure for update
  using (public.current_user_role() in ('admin', 'administrador'))
  with check (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Internal roles can insert products" on public.products;
drop policy if exists "Internal roles can update products" on public.products;
create policy "Administrators can insert products" on public.products for insert to authenticated
  with check (public.current_user_role() in ('admin', 'administrador'));
create policy "Administrators can update products" on public.products for update to authenticated
  using (public.current_user_role() in ('admin', 'administrador'))
  with check (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Inventory roles can insert QB unit dimensions" on public.qb_unit_dimensions;
drop policy if exists "Inventory roles can update QB unit dimensions" on public.qb_unit_dimensions;
create policy "Administrators can insert QB unit dimensions" on public.qb_unit_dimensions for insert
  with check (public.current_user_role() in ('admin', 'administrador'));
create policy "Administrators can update QB unit dimensions" on public.qb_unit_dimensions for update
  using (public.current_user_role() in ('admin', 'administrador'))
  with check (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Inventory roles can insert QB units" on public.qb_units;
drop policy if exists "Inventory roles can update QB units" on public.qb_units;
create policy "Administrators can insert QB units" on public.qb_units for insert
  with check (public.current_user_role() in ('admin', 'administrador'));
create policy "Administrators can update QB units" on public.qb_units for update
  using (public.current_user_role() in ('admin', 'administrador'))
  with check (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Inventory roles can insert QB product unit settings" on public.qb_product_unit_settings;
drop policy if exists "Inventory roles can update QB product unit settings" on public.qb_product_unit_settings;
create policy "Administrators can insert QB product unit settings" on public.qb_product_unit_settings for insert
  with check (public.current_user_role() in ('admin', 'administrador'));
create policy "Administrators can update QB product unit settings" on public.qb_product_unit_settings for update
  using (public.current_user_role() in ('admin', 'administrador'))
  with check (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Inventory roles can insert QB product presentations" on public.qb_product_presentations;
drop policy if exists "Inventory roles can update QB product presentations" on public.qb_product_presentations;
create policy "Administrators can insert QB product presentations" on public.qb_product_presentations for insert
  with check (public.current_user_role() in ('admin', 'administrador'));
create policy "Administrators can update QB product presentations" on public.qb_product_presentations for update
  using (public.current_user_role() in ('admin', 'administrador'))
  with check (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Inventory roles can insert QB product allowed units" on public.qb_product_allowed_units;
drop policy if exists "Inventory roles can update QB product allowed units" on public.qb_product_allowed_units;
create policy "Administrators can insert QB product allowed units" on public.qb_product_allowed_units for insert
  with check (public.current_user_role() in ('admin', 'administrador'));
create policy "Administrators can update QB product allowed units" on public.qb_product_allowed_units for update
  using (public.current_user_role() in ('admin', 'administrador'))
  with check (public.current_user_role() in ('admin', 'administrador'));

drop policy if exists "Inventory roles can insert QB classification outputs" on public.qb_product_classification_outputs;
drop policy if exists "Inventory roles can update QB classification outputs" on public.qb_product_classification_outputs;
create policy "Administrators can insert QB classification outputs" on public.qb_product_classification_outputs for insert
  with check (public.current_user_role() in ('admin', 'administrador'));
create policy "Administrators can update QB classification outputs" on public.qb_product_classification_outputs for update
  using (public.current_user_role() in ('admin', 'administrador'))
  with check (public.current_user_role() in ('admin', 'administrador'));

-- Percentages and their calculation snapshots can only be replaced through the guarded RPC.
drop policy if exists "Inventory roles can manage QB merchandise classification results"
  on public.qb_merchandise_receipt_classification_results;

commit;
