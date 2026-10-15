begin;

create or replace function public.set_qb_product_physical_unit_if_safe(
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
  v_product public.products%rowtype;
  v_settings public.qb_product_unit_settings%rowtype;
  v_current_unit public.qb_units%rowtype;
  v_target_unit public.qb_units%rowtype;
  v_legacy_unit_id uuid;
  v_legacy_count integer;
begin
  select role into v_role
  from public.profiles
  where id = v_user_id and is_active = true;
  if v_user_id is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo un administrador puede corregir unidades fisicas.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;
  if not found then raise exception 'Producto no encontrado.'; end if;
  if coalesce(v_product.stock_current, 0) <> 0 then
    raise exception 'El producto tiene stock distinto de cero; requiere revisión controlada.';
  end if;
  if coalesce(v_product.purchase_price, 0) <> 0 or coalesce(v_product.sale_price, 0) <> 0 then
    raise exception 'El producto tiene precios registrados; no se pueden cambiar de unidad sin revisar su significado.';
  end if;

  select * into v_settings
  from public.qb_product_unit_settings
  where product_id = p_product_id
  for update;
  if not found then raise exception 'El producto no tiene configuración QB para corregir.'; end if;
  if coalesce(v_settings.base_sale_price, 0) <> 0 then
    raise exception 'El producto tiene un precio QB configurado; requiere conversión revisada antes de cambiar de unidad.';
  end if;

  select * into v_current_unit
  from public.qb_units
  where id = coalesce(v_settings.base_inventory_unit_id, v_settings.inventory_unit_id, v_settings.base_unit_id);
  if v_current_unit.id is null or (
    upper(replace(replace(trim(v_current_unit.symbol), '.', ''), ' ', '')) not in ('BS', 'BOB')
    and not exists (
      select 1 from public.units_of_measure legacy
      where legacy.id = v_product.unit_id
        and upper(replace(replace(trim(legacy.abbreviation), '.', ''), ' ', '')) in ('BS', 'BOB')
    )
  ) then
    raise exception 'El producto no coincide con la lista de unidades monetarias afectadas.';
  end if;

  select * into v_target_unit
  from public.qb_units
  where id = p_unit_id and is_active = true;
  if v_target_unit.id is null or upper(replace(replace(trim(v_target_unit.symbol), '.', ''), ' ', '')) in ('BS', 'BOB') then
    raise exception 'Selecciona una unidad fisica activa.';
  end if;

  select count(*) into v_legacy_count
  from public.units_of_measure legacy
  where legacy.is_active = true
    and lower(trim(legacy.abbreviation)) in (lower(v_target_unit.symbol), lower(v_target_unit.code));
  if v_legacy_count <> 1 then
    raise exception 'No hay una unidad de producto equivalente unica para sincronizar el catalogo.';
  end if;
  select legacy.id into v_legacy_unit_id
  from public.units_of_measure legacy
  where legacy.is_active = true
    and lower(trim(legacy.abbreviation)) in (lower(v_target_unit.symbol), lower(v_target_unit.code));

  if exists (select 1 from public.inventory_movements where product_id = p_product_id)
    or exists (select 1 from public.inventory_lots where product_id = p_product_id)
    or exists (select 1 from public.inventory_lot_consumptions where product_id = p_product_id)
    or exists (select 1 from public.order_items where product_id = p_product_id)
    or exists (select 1 from public.qb_order_items where product_id = p_product_id)
    or exists (select 1 from public.qb_legacy_order_template_lines where product_id = p_product_id)
    or exists (select 1 from public.qb_order_preparation_items where product_id = p_product_id)
    or exists (select 1 from public.qb_order_delivery_items where product_id = p_product_id)
    or exists (select 1 from public.qb_order_delivery_movements where product_id = p_product_id)
    or exists (select 1 from public.qb_merchandise_receipt_lines where product_id = p_product_id)
    or exists (select 1 from public.qb_merchandise_receipt_classification_results where output_product_id = p_product_id)
    or exists (select 1 from public.qb_merchandise_receipt_movements where product_id = p_product_id)
    or exists (select 1 from public.qb_product_classification_outputs where source_product_id = p_product_id or output_product_id = p_product_id)
    or exists (select 1 from public.qb_conversion_snapshots where product_id = p_product_id)
    or exists (select 1 from public.qb_receipt_lines where product_id = p_product_id) then
    raise exception 'El producto tiene referencias historicas; no se modifico.';
  end if;

  if exists (
    select 1 from public.qb_product_allowed_units allowed
    join public.qb_units unit on unit.id = allowed.unit_id
    where allowed.product_id = p_product_id and unit.dimension_id <> v_target_unit.dimension_id
  ) or exists (
    select 1 from public.qb_product_presentations presentation
    join public.qb_units base_unit on base_unit.id = presentation.base_unit_id
    join public.qb_units contained_unit on contained_unit.id = presentation.contained_unit_id
    where presentation.product_id = p_product_id
      and (base_unit.dimension_id <> v_target_unit.dimension_id
        or contained_unit.dimension_id <> base_unit.dimension_id)
  ) then
    raise exception 'El producto tiene unidades o presentaciones de otra dimension; revisa esas conversiones primero.';
  end if;

  update public.products set unit_id = v_legacy_unit_id where id = p_product_id;
  update public.qb_product_unit_settings
  set base_unit_id = p_unit_id,
      inventory_unit_id = p_unit_id,
      base_inventory_unit_id = p_unit_id,
      base_price_unit_id = p_unit_id,
      updated_by = v_user_id
  where product_id = p_product_id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    'set_qb_product_physical_unit',
    'product',
    p_product_id,
    jsonb_build_object(
      'old_base_unit_id', v_current_unit.id,
      'new_base_unit_id', p_unit_id,
      'legacy_unit_id', v_legacy_unit_id,
      'guarded_no_stock_or_history', true
    )
  );
  return p_product_id;
end;
$$;

revoke all on function public.set_qb_product_physical_unit_if_safe(uuid, uuid) from public, anon;
grant execute on function public.set_qb_product_physical_unit_if_safe(uuid, uuid) to authenticated;

commit;
