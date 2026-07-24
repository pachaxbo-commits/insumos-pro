-- Guarda el color de matriz en la misma transacción que el producto y sus unidades.

begin;

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
  p_matrix_color text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_product_id uuid;
  v_matrix_color text := upper(trim(coalesce(p_matrix_color, '')));
begin
  if v_matrix_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Selecciona un color hexadecimal válido.';
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
    p_is_active
  );

  update public.products
  set matrix_color = v_matrix_color
  where id = v_product_id;

  return v_product_id;
end;
$$;

revoke all on function public.save_qb_product_with_units(
  uuid, boolean, text, text, uuid, uuid, uuid, uuid, numeric, text, text,
  boolean, boolean, text, integer, numeric, numeric, boolean, text
) from public, anon, authenticated;
grant execute on function public.save_qb_product_with_units(
  uuid, boolean, text, text, uuid, uuid, uuid, uuid, numeric, text, text,
  boolean, boolean, text, integer, numeric, numeric, boolean, text
) to authenticated;

commit;
