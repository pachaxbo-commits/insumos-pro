-- Create only the explicitly selected, dimension-compatible reception unit.
-- The restricted RPC keeps the mapping and audit write in one transaction.
begin;

create or replace function public.ensure_qb_reception_unit_for_purchase(
  p_product_id uuid,
  p_unit_id uuid
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_base_dimension_id uuid;
  v_unit public.qb_units%rowtype;
  v_mapping_id uuid;
  v_inserted boolean := false;
begin
  select role into v_role
  from public.profiles
  where id = v_user_id and is_active = true;
  if v_user_id is null or v_role not in ('administrador', 'inventario') then
    raise exception 'No tienes permisos para usar unidades de recepción en compras.';
  end if;

  select coalesce(settings.base_inventory_unit_id, settings.inventory_unit_id, settings.base_unit_id)
  into v_base_dimension_id
  from public.products product
  join public.qb_product_unit_settings settings on settings.product_id = product.id
  where product.id = p_product_id
    and product.is_active = true
    and settings.is_qb_active = true
  for share of product, settings;
  if v_base_dimension_id is null then
    raise exception 'El producto no tiene una unidad base física activa.';
  end if;

  select * into v_unit
  from public.qb_units
  where id = p_unit_id and is_active = true
  for share;
  if v_unit.id is null
    or v_unit.dimension_id is distinct from (
      select dimension_id from public.qb_units
      where id = v_base_dimension_id and is_active = true
    )
    or upper(replace(replace(trim(v_unit.symbol), '.', ''), ' ', '')) in ('BS', 'BOB') then
    raise exception 'La unidad seleccionada no es física o no coincide con la dimensión del producto.';
  end if;

  select id, is_active into v_mapping_id, v_inserted
  from public.qb_product_allowed_units
  where product_id = p_product_id
    and usage_context = 'recepcion'
    and unit_id = p_unit_id
  for update;

  if v_mapping_id is not null then
    if not v_inserted then
      raise exception 'Esta unidad está deshabilitada para recepción de este producto.';
    end if;
    return v_mapping_id;
  end if;

  insert into public.qb_product_allowed_units (
    product_id, usage_context, unit_id, is_default, is_active,
    sort_order, notes, created_by, updated_by
  ) values (
    p_product_id, 'recepcion', p_unit_id, false, true,
    1000, 'Habilitada al seleccionar una unidad física compatible en Hoja de Compras.',
    v_user_id, v_user_id
  )
  on conflict (product_id, usage_context, unit_id) where unit_id is not null
  do nothing
  returning id into v_mapping_id;

  if v_mapping_id is not null then
    v_inserted := true;
  else
    select id, is_active into v_mapping_id, v_inserted
    from public.qb_product_allowed_units
    where product_id = p_product_id
      and usage_context = 'recepcion'
      and unit_id = p_unit_id
    for update;
    if v_mapping_id is null or not v_inserted then
      raise exception 'No se pudo habilitar la unidad de recepción.';
    end if;
  end if;

  if v_inserted then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    values (
      v_user_id,
      'create_qb_reception_unit',
      'product',
      p_product_id,
      jsonb_build_object(
        'allowed_unit_id', v_mapping_id,
        'unit_id', p_unit_id,
        'source', 'warehouse_purchase_selection'
      )
    );
  end if;

  return v_mapping_id;
end;
$$;

revoke all on function public.ensure_qb_reception_unit_for_purchase(uuid, uuid) from public, anon;
grant execute on function public.ensure_qb_reception_unit_for_purchase(uuid, uuid) to authenticated;

commit;
