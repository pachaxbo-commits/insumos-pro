-- Activa la captura de peso real en el catálogo fresco variable existente.
-- No cambia unidades ni precios: el peso solo afectará el recibo cuando el
-- administrador configure una tarifa por una unidad de peso reconocida.

begin;

update public.products product
set controls_actual_weight = true
from public.product_categories category
where category.id = product.category_id
  and upper(trim(category.name)) in ('FRUTAS FRESCAS', 'VERDURAS')
  and product.is_active
  and coalesce(product.is_sellable, true)
  and not product.controls_actual_weight;

commit;
