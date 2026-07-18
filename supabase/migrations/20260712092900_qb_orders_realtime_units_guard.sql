-- Operational order synchronization and immutable product base units after inventory history.

begin;

do $$
declare
  v_table_name text;
begin
  foreach v_table_name in array array[
    'qb_orders',
    'qb_order_items',
    'qb_order_preparations',
    'qb_order_preparation_items',
    'qb_order_delivery_movements'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table_name
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        v_table_name
      );
    end if;
  end loop;
end;
$$;

create or replace function public.prevent_product_base_unit_change_with_movements()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if old.unit_id is distinct from new.unit_id
    and exists (
      select 1
      from public.inventory_movements movement
      where movement.product_id = old.id
    )
  then
    raise exception 'No puedes cambiar la unidad base porque este producto ya tiene movimientos de inventario.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_product_base_unit_change_with_movements on public.products;
create trigger prevent_product_base_unit_change_with_movements
  before update of unit_id on public.products
  for each row
  execute function public.prevent_product_base_unit_change_with_movements();

create or replace function public.prevent_qb_product_base_unit_change_with_movements()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if (
    old.base_unit_id is distinct from new.base_unit_id
    or old.inventory_unit_id is distinct from new.inventory_unit_id
    or old.base_inventory_unit_id is distinct from new.base_inventory_unit_id
  ) and exists (
    select 1
    from public.inventory_movements movement
    where movement.product_id = old.product_id
  )
  then
    raise exception 'No puedes cambiar la unidad base porque este producto ya tiene movimientos de inventario.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_qb_product_base_unit_change_with_movements
  on public.qb_product_unit_settings;
create trigger prevent_qb_product_base_unit_change_with_movements
  before update of base_unit_id, inventory_unit_id, base_inventory_unit_id
  on public.qb_product_unit_settings
  for each row
  execute function public.prevent_qb_product_base_unit_change_with_movements();

comment on function public.prevent_product_base_unit_change_with_movements() is
  'Impide cambiar la unidad general de un producto que ya tiene movimientos de inventario.';
comment on function public.prevent_qb_product_base_unit_change_with_movements() is
  'Impide cambiar la unidad base operativa de un producto que ya tiene movimientos de inventario.';

create or replace function public.start_qb_order_preparation_versioned(
  p_order_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_updated_at timestamptz;
begin
  select profile.role into v_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;
  if v_user_id is null or v_role is null
    or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para modificar pedidos QB.';
  end if;

  select qb_order.updated_at
  into v_updated_at
  from public.qb_orders qb_order
  where qb_order.id = p_order_id
  for update;

  if not found or v_updated_at is distinct from p_expected_updated_at then
    raise exception 'El pedido cambió en otro dispositivo. Actualiza la vista antes de continuar.'
      using errcode = '40001';
  end if;

  return public.start_qb_order_preparation(p_order_id);
end;
$$;

create or replace function public.save_qb_order_preparation_versioned(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb,
  p_internal_notes text,
  p_mark_prepared boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_updated_at timestamptz;
begin
  select profile.role into v_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;
  if v_user_id is null or v_role is null
    or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para modificar pedidos QB.';
  end if;

  select qb_order.updated_at
  into v_updated_at
  from public.qb_orders qb_order
  where qb_order.id = p_order_id
  for update;

  if not found or v_updated_at is distinct from p_expected_updated_at then
    raise exception 'El pedido cambió en otro dispositivo. Actualiza la vista antes de continuar.'
      using errcode = '40001';
  end if;

  return public.save_qb_order_preparation(
    p_order_id,
    p_items,
    p_internal_notes,
    p_mark_prepared
  );
end;
$$;

create or replace function public.confirm_qb_order_delivery_versioned(
  p_order_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_updated_at timestamptz;
begin
  select profile.role into v_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;
  if v_user_id is null or v_role is null
    or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para modificar pedidos QB.';
  end if;

  select qb_order.updated_at
  into v_updated_at
  from public.qb_orders qb_order
  where qb_order.id = p_order_id
  for update;

  if not found or v_updated_at is distinct from p_expected_updated_at then
    raise exception 'El pedido cambió en otro dispositivo. Actualiza la vista antes de continuar.'
      using errcode = '40001';
  end if;

  return public.confirm_qb_order_delivery(p_order_id);
end;
$$;

create or replace function public.cancel_qb_order_before_delivery_versioned(
  p_order_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_updated_at timestamptz;
begin
  select profile.role into v_role
  from public.profiles profile
  where profile.id = v_user_id and profile.is_active = true;
  if v_user_id is null or v_role is null
    or v_role not in ('admin', 'administrador', 'inventario') then
    raise exception 'No tienes permisos para modificar pedidos QB.';
  end if;

  select qb_order.updated_at
  into v_updated_at
  from public.qb_orders qb_order
  where qb_order.id = p_order_id
  for update;

  if not found or v_updated_at is distinct from p_expected_updated_at then
    raise exception 'El pedido cambió en otro dispositivo. Actualiza la vista antes de continuar.'
      using errcode = '40001';
  end if;

  return public.cancel_qb_order_before_delivery(p_order_id, p_reason);
end;
$$;

revoke all on function public.start_qb_order_preparation_versioned(uuid, timestamptz)
  from public, anon;
grant execute on function public.start_qb_order_preparation_versioned(uuid, timestamptz)
  to authenticated;
revoke all on function public.save_qb_order_preparation_versioned(uuid, timestamptz, jsonb, text, boolean)
  from public, anon;
grant execute on function public.save_qb_order_preparation_versioned(uuid, timestamptz, jsonb, text, boolean)
  to authenticated;
revoke all on function public.confirm_qb_order_delivery_versioned(uuid, timestamptz)
  from public, anon;
grant execute on function public.confirm_qb_order_delivery_versioned(uuid, timestamptz)
  to authenticated;
revoke all on function public.cancel_qb_order_before_delivery_versioned(uuid, timestamptz, text)
  from public, anon;
grant execute on function public.cancel_qb_order_before_delivery_versioned(uuid, timestamptz, text)
  to authenticated;

create or replace function public.save_qb_product_with_units(
  p_product_id uuid,
  p_create boolean,
  p_name text,
  p_sku text,
  p_category_id uuid,
  p_base_unit_id uuid,
  p_inventory_unit_id uuid,
  p_price_unit_id uuid,
  p_stock_min numeric,
  p_supplier_name text,
  p_image_url text,
  p_requires_classification boolean,
  p_is_sellable boolean,
  p_catalog_description text,
  p_catalog_sort_order integer,
  p_catalog_min_quantity numeric,
  p_catalog_quantity_step numeric,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_base_unit public.qb_units%rowtype;
  v_inventory_unit public.qb_units%rowtype;
  v_price_unit public.qb_units%rowtype;
  v_legacy_unit_id uuid;
  v_existing_product_id uuid;
begin
  select profile.role
  into v_role
  from public.profiles profile
  where profile.id = v_user_id
    and profile.is_active = true;

  if v_user_id is null or v_role is null or v_role not in ('admin', 'administrador') then
    raise exception 'Solo un administrador puede configurar productos.';
  end if;

  select * into v_base_unit
  from public.qb_units unit
  where unit.id = p_base_unit_id and unit.is_active = true;
  select * into v_inventory_unit
  from public.qb_units unit
  where unit.id = p_inventory_unit_id and unit.is_active = true;
  select * into v_price_unit
  from public.qb_units unit
  where unit.id = p_price_unit_id and unit.is_active = true;

  if v_base_unit.id is null or v_inventory_unit.id is null or v_price_unit.id is null then
    raise exception 'Selecciona unidades operativas activas.';
  end if;
  if v_base_unit.dimension_id <> v_inventory_unit.dimension_id
    or v_base_unit.dimension_id <> v_price_unit.dimension_id then
    raise exception 'Las unidades base, de inventario y de precio deben pertenecer a la misma dimensión.';
  end if;

  if p_create then
    select legacy.id into v_legacy_unit_id
    from public.units_of_measure legacy
    where lower(legacy.abbreviation) in (lower(v_base_unit.symbol), lower(v_base_unit.code))
    order by legacy.is_active desc, legacy.id
    limit 1;

    insert into public.products (
      id, name, sku, category_id, unit_id, stock_current, stock_min,
      purchase_price, sale_price, supplier_name, image_url,
      requires_classification, is_sellable, catalog_description,
      catalog_sort_order, catalog_min_quantity, catalog_quantity_step, is_active
    ) values (
      p_product_id, trim(p_name), nullif(trim(coalesce(p_sku, '')), ''), p_category_id,
      v_legacy_unit_id, 0, p_stock_min, 0, 0,
      nullif(trim(coalesce(p_supplier_name, '')), ''), p_image_url,
      p_requires_classification, p_is_sellable,
      nullif(trim(coalesce(p_catalog_description, '')), ''),
      p_catalog_sort_order, p_catalog_min_quantity, p_catalog_quantity_step, p_is_active
    );
  else
    select product.id into v_existing_product_id
    from public.products product
    where product.id = p_product_id
    for update;
    if v_existing_product_id is null then
      raise exception 'Producto no encontrado.';
    end if;

    update public.products
    set name = trim(p_name),
        sku = nullif(trim(coalesce(p_sku, '')), ''),
        category_id = p_category_id,
        stock_min = p_stock_min,
        supplier_name = nullif(trim(coalesce(p_supplier_name, '')), ''),
        image_url = p_image_url,
        requires_classification = p_requires_classification,
        is_sellable = p_is_sellable,
        catalog_description = nullif(trim(coalesce(p_catalog_description, '')), ''),
        catalog_sort_order = p_catalog_sort_order,
        catalog_min_quantity = p_catalog_min_quantity,
        catalog_quantity_step = p_catalog_quantity_step,
        is_active = p_is_active
    where id = p_product_id;
  end if;

  insert into public.qb_product_unit_settings (
    product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id,
    base_price_unit_id, is_classifiable, classification_mode, is_qb_active,
    created_by, updated_by
  ) values (
    p_product_id, v_base_unit.id, v_inventory_unit.id, v_inventory_unit.id,
    v_price_unit.id, p_requires_classification,
    case when p_requires_classification then 'percentage' else 'none' end,
    true, v_user_id, v_user_id
  )
  on conflict (product_id) do update
  set base_unit_id = excluded.base_unit_id,
      inventory_unit_id = excluded.inventory_unit_id,
      base_inventory_unit_id = excluded.base_inventory_unit_id,
      base_price_unit_id = excluded.base_price_unit_id,
      is_classifiable = excluded.is_classifiable,
      classification_mode = excluded.classification_mode,
      is_qb_active = true,
      updated_by = v_user_id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (
    v_user_id,
    case when p_create then 'create_product' else 'update_product' end,
    'product',
    p_product_id,
    jsonb_build_object(
      'name', trim(p_name),
      'sku', nullif(trim(coalesce(p_sku, '')), ''),
      'is_sellable', p_is_sellable,
      'base_unit_id', v_base_unit.id,
      'inventory_unit_id', v_inventory_unit.id,
      'price_unit_id', v_price_unit.id
    )
  );

  return p_product_id;
end;
$$;

revoke all on function public.save_qb_product_with_units(
  uuid, boolean, text, text, uuid, uuid, uuid, uuid, numeric, text, text,
  boolean, boolean, text, integer, numeric, numeric, boolean
) from public, anon, authenticated;
grant execute on function public.save_qb_product_with_units(
  uuid, boolean, text, text, uuid, uuid, uuid, uuid, numeric, text, text,
  boolean, boolean, text, integer, numeric, numeric, boolean
) to authenticated;

commit;
