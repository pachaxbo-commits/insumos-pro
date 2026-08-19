begin;

create or replace function public.update_qb_product_pricing_v2(
  p_product_id uuid,
  p_price_unit_id uuid,
  p_new_price numeric,
  p_expected_price numeric,
  p_expected_price_unit_id uuid,
  p_remove_price boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_product public.products%rowtype;
  v_settings public.qb_product_unit_settings%rowtype;
  v_price_unit public.qb_units%rowtype;
  v_inventory_unit public.qb_units%rowtype;
  v_price_dimension_code text;
  v_effective_price numeric(18, 4);
  v_effective_price_unit_id uuid;
begin
  if v_user_id is null then
    raise exception 'QB_PRICE_AUTH_REQUIRED';
  end if;

  v_role := public.current_user_role();
  if v_role not in ('admin', 'administrador') then
    raise exception 'QB_PRICE_ADMIN_REQUIRED';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'QB_PRICE_PRODUCT_NOT_FOUND';
  end if;
  if not v_product.is_active then
    raise exception 'QB_PRICE_PRODUCT_INACTIVE';
  end if;

  select *
  into v_settings
  from public.qb_product_unit_settings
  where product_id = p_product_id
  for update;

  if not found then
    raise exception 'QB_PRICE_SETTINGS_NOT_FOUND';
  end if;
  if v_settings.base_sale_price is distinct from p_expected_price
    or v_settings.base_price_unit_id is distinct from p_expected_price_unit_id
  then
    raise exception 'QB_PRICE_CONCURRENT_CHANGE';
  end if;

  if p_remove_price then
    v_effective_price := null;
    v_effective_price_unit_id := v_settings.base_price_unit_id;
  else
    if p_new_price is null
      or p_new_price <= 0
      or p_new_price > 1000000
      or round(p_new_price, 2) <> p_new_price
    then
      raise exception 'QB_PRICE_INVALID';
    end if;

    select *
    into v_price_unit
    from public.qb_units
    where id = p_price_unit_id
      and is_active = true;

    select *
    into v_inventory_unit
    from public.qb_units
    where id = coalesce(
      v_settings.base_inventory_unit_id,
      v_settings.inventory_unit_id,
      v_settings.base_unit_id
    )
      and is_active = true;

    if v_price_unit.id is null or v_inventory_unit.id is null then
      raise exception 'QB_PRICE_UNIT_INVALID';
    end if;

    select dimension.code
    into v_price_dimension_code
    from public.qb_unit_dimensions dimension
    where dimension.id = v_price_unit.dimension_id
      and dimension.is_active = true;

    if v_price_unit.dimension_id <> v_inventory_unit.dimension_id
      and (
        not coalesce(v_product.controls_actual_weight, false)
        or v_price_dimension_code is distinct from 'peso'
      )
    then
      raise exception 'QB_WEIGHT_PRICE_REQUIRES_CONTROL';
    end if;

    v_effective_price := p_new_price;
    v_effective_price_unit_id := v_price_unit.id;
  end if;

  update public.qb_product_unit_settings
  set base_price_unit_id = v_effective_price_unit_id,
      base_sale_price = v_effective_price,
      updated_by = v_user_id
  where product_id = p_product_id;

  if v_settings.base_price_unit_id is distinct from v_effective_price_unit_id then
    insert into public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    ) values (
      v_user_id,
      'update_qb_product_price_unit',
      'product',
      p_product_id,
      jsonb_build_object(
        'previous_price_unit_id', v_settings.base_price_unit_id,
        'new_price_unit_id', v_effective_price_unit_id
      )
    );
  end if;

  return jsonb_build_object(
    'status', case when p_remove_price then 'removed' else 'updated' end,
    'price_unit_id', v_effective_price_unit_id,
    'base_sale_price', v_effective_price
  );
end;
$$;

revoke all on function public.update_qb_product_pricing_v2(
  uuid, uuid, numeric, numeric, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.update_qb_product_pricing_v2(
  uuid, uuid, numeric, numeric, uuid, boolean
) to authenticated;

comment on function public.update_qb_product_pricing_v2(
  uuid, uuid, numeric, numeric, uuid, boolean
) is
  'Actualiza unidad y precio base. Permite precio por peso con unidad comercial distinta únicamente cuando el producto controla peso real.';

commit;
