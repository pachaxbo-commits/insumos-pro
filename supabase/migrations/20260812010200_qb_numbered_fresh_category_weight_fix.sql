-- Corrige los nombres reales importados del Excel, que incluyen un prefijo
-- numérico como "08 FRUTAS FRESCAS" y "10 VERDURAS".

begin;

update public.products product
set controls_actual_weight = true
from public.product_categories category
where category.id = product.category_id
  and regexp_replace(
        upper(trim(category.name)),
        '^[0-9]+[[:space:]]+',
        ''
      ) in ('FRUTAS FRESCAS', 'VERDURAS')
  and product.is_active
  and coalesce(product.is_sellable, true)
  and not product.controls_actual_weight;

commit;
