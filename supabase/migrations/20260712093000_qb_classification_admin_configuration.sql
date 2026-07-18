-- Administracion atomica y segura de productos resultantes para recepcion clasificada.

begin;

create or replace function public.save_qb_product_classification_configuration(
  p_source_product_id uuid,
  p_output_product_ids jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_source public.products%rowtype;
  v_source_settings public.qb_product_unit_settings%rowtype;
  v_source_dimension_id uuid;
  v_output_product_id uuid;
  v_output_ids uuid[] := array[]::uuid[];
  v_output_count integer;
  v_sort_order integer := 0;
begin
  select profile.role
  into v_role
  from public.profiles profile
  where profile.id = v_user_id
    and profile.is_active = true;

  if v_user_id is null or v_role is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo un administrador puede configurar productos resultantes.';
  end if;

  select product.*
  into v_source
  from public.products product
  where product.id = p_source_product_id
  for update;

  if v_source.id is null or not v_source.is_active then
    raise exception 'El producto de recepcion no existe o no esta activo.';
  end if;

  select settings.*
  into v_source_settings
  from public.qb_product_unit_settings settings
  where settings.product_id = p_source_product_id
    and settings.is_qb_active = true;

  if not v_source.requires_classification
    or v_source_settings.product_id is null
    or not v_source_settings.is_classifiable
    or v_source_settings.classification_mode <> 'percentage'
  then
    raise exception 'Configura el producto para clasificacion porcentual antes de guardar resultados.';
  end if;

  select unit.dimension_id
  into v_source_dimension_id
  from public.qb_units unit
  where unit.id = v_source_settings.base_unit_id
    and unit.is_active = true;

  if v_source_dimension_id is null then
    raise exception 'La unidad base del producto de recepcion no esta activa.';
  end if;

  if p_output_product_ids is null
    or jsonb_typeof(p_output_product_ids) <> 'array'
    or jsonb_array_length(p_output_product_ids) = 0
    or jsonb_array_length(p_output_product_ids) > 20
  then
    raise exception 'Selecciona entre uno y veinte productos resultantes.';
  end if;

  begin
    for v_output_product_id in
      select value::uuid
      from jsonb_array_elements_text(p_output_product_ids) item(value)
    loop
      if v_output_product_id = p_source_product_id then
        raise exception 'El producto de recepcion no puede ser también un resultado.';
      end if;
      if v_output_product_id = any(v_output_ids) then
        raise exception 'No puedes repetir un producto resultante.';
      end if;

      if not exists (
        select 1
        from public.products product
        join public.qb_product_unit_settings settings
          on settings.product_id = product.id
         and settings.is_qb_active = true
        join public.qb_units unit
          on unit.id = settings.base_unit_id
         and unit.is_active = true
        where product.id = v_output_product_id
          and product.is_active = true
          and unit.dimension_id = v_source_dimension_id
      ) then
        raise exception 'Cada producto resultante debe estar activo y usar una unidad de la misma dimension.';
      end if;

      v_output_ids := array_append(v_output_ids, v_output_product_id);
    end loop;
  exception
    when invalid_text_representation then
      raise exception 'La seleccion de productos resultantes no es valida.';
  end;

  update public.qb_product_classification_outputs output
  set is_active = false,
      updated_by = v_user_id
  where output.source_product_id = p_source_product_id
    and output.is_active = true
    and (
      output.output_type <> 'product'
      or output.output_product_id is null
      or not (output.output_product_id = any(v_output_ids))
    );

  foreach v_output_product_id in array v_output_ids
  loop
    insert into public.qb_product_classification_outputs (
      source_product_id,
      output_type,
      output_product_id,
      label,
      expected_percentage,
      is_active,
      sort_order,
      created_by,
      updated_by
    )
    select
      p_source_product_id,
      'product',
      product.id,
      product.name,
      null,
      true,
      v_sort_order,
      v_user_id,
      v_user_id
    from public.products product
    where product.id = v_output_product_id
    on conflict (source_product_id, output_product_id)
      where output_product_id is not null
    do update
    set output_type = 'product',
        label = excluded.label,
        expected_percentage = null,
        is_active = true,
        sort_order = excluded.sort_order,
        updated_by = v_user_id;

    v_sort_order := v_sort_order + 1;
  end loop;

  v_output_count := cardinality(v_output_ids);

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'save_qb_product_classification_configuration',
    'product',
    p_source_product_id,
    jsonb_build_object(
      'active_output_count', v_output_count,
      'classification_mode', 'percentage',
      'default_percentages', false,
      'loss_output', false
    )
  );

  return v_output_count;
end;
$$;

revoke all on function public.save_qb_product_classification_configuration(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_qb_product_classification_configuration(uuid, jsonb)
  to authenticated;

revoke insert, update, delete on table public.qb_product_classification_outputs
  from public, anon, authenticated;

drop policy if exists "Authenticated users can view QB classification outputs"
  on public.qb_product_classification_outputs;
drop policy if exists "Internal roles can view QB classification outputs"
  on public.qb_product_classification_outputs;
create policy "Internal roles can view QB classification outputs"
  on public.qb_product_classification_outputs for select to authenticated
  using (public.current_user_role() in ('admin', 'administrador', 'inventario'));

drop policy if exists "Administrators can insert QB classification outputs"
  on public.qb_product_classification_outputs;
drop policy if exists "Administrators can update QB classification outputs"
  on public.qb_product_classification_outputs;

comment on function public.save_qb_product_classification_configuration(uuid, jsonb) is
  'Guarda atomicamente los resultados activos de una clasificacion porcentual. Desactiva relaciones omitidas y preserva snapshots historicos.';

commit;
