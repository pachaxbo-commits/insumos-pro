begin;

alter table public.products
  add column if not exists controls_actual_weight boolean not null default false;

comment on column public.products.controls_actual_weight is
  'Habilita captura manual de peso real en kg para este producto dentro de la matriz operativa.';

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
  p_is_active boolean,
  p_matrix_color text,
  p_controls_actual_weight boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
  v_old_control boolean;
begin
  if not p_create then
    select controls_actual_weight
    into v_old_control
    from public.products
    where id = p_product_id;
  end if;

  v_product_id := public.save_qb_product_with_units(
    p_product_id,
    p_create,
    p_name,
    p_sku,
    p_category_id,
    p_base_unit_id,
    p_inventory_unit_id,
    p_price_unit_id,
    p_stock_min,
    p_supplier_name,
    p_image_url,
    p_requires_classification,
    p_is_sellable,
    p_catalog_description,
    p_catalog_sort_order,
    p_catalog_min_quantity,
    p_catalog_quantity_step,
    p_is_active,
    p_matrix_color
  );

  update public.products
  set controls_actual_weight = coalesce(p_controls_actual_weight, false)
  where id = v_product_id;

  if p_create
    or v_old_control is distinct from coalesce(p_controls_actual_weight, false)
  then
    insert into public.audit_logs (
      user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    values (
      auth.uid(),
      'set_qb_product_actual_weight_control',
      'product',
      v_product_id,
      jsonb_build_object(
        'old_value', v_old_control,
        'new_value', coalesce(p_controls_actual_weight, false)
      )
    );
  end if;

  return v_product_id;
end;
$$;

create or replace function public.enforce_qb_product_actual_weight_control()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_controls_actual_weight boolean;
begin
  if new.actual_weight_kg is null then
    return new;
  end if;

  select controls_actual_weight
  into v_controls_actual_weight
  from public.products
  where id = new.product_id;

  if not coalesce(v_controls_actual_weight, false) then
    raise exception 'Este producto no tiene habilitado el control de peso real.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_qb_preparation_actual_weight_insert
  on public.qb_order_preparation_items;
create trigger enforce_qb_preparation_actual_weight_insert
  before insert on public.qb_order_preparation_items
  for each row
  execute function public.enforce_qb_product_actual_weight_control();

drop trigger if exists enforce_qb_preparation_actual_weight_update
  on public.qb_order_preparation_items;
create trigger enforce_qb_preparation_actual_weight_update
  before update of actual_weight_kg on public.qb_order_preparation_items
  for each row
  execute function public.enforce_qb_product_actual_weight_control();

drop trigger if exists enforce_qb_delivery_actual_weight_insert
  on public.qb_order_delivery_items;
create trigger enforce_qb_delivery_actual_weight_insert
  before insert on public.qb_order_delivery_items
  for each row
  execute function public.enforce_qb_product_actual_weight_control();

drop trigger if exists enforce_qb_delivery_actual_weight_update
  on public.qb_order_delivery_items;
create trigger enforce_qb_delivery_actual_weight_update
  before update of actual_weight_kg on public.qb_order_delivery_items
  for each row
  execute function public.enforce_qb_product_actual_weight_control();

revoke all on function public.save_qb_product_with_units(
  uuid,
  boolean,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  text,
  boolean,
  boolean,
  text,
  integer,
  numeric,
  numeric,
  boolean,
  text,
  boolean
) from public, anon, authenticated;

grant execute on function public.save_qb_product_with_units(
  uuid,
  boolean,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  text,
  boolean,
  boolean,
  text,
  integer,
  numeric,
  numeric,
  boolean,
  text,
  boolean
) to authenticated;

revoke all on function public.enforce_qb_product_actual_weight_control()
  from public, anon, authenticated;

commit;
