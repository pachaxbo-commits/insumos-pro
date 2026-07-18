# Activación operativa de precios, recepción y stock

Estas plantillas preparan datos para revisión; no ejecutan importaciones ni modifican saldos.

## Precios para pedidos por Bs

1. Abra `qb_product_prices_template.csv` y complete únicamente `new_base_price` y, opcionalmente, `notes`.
2. Use BOB/Bs, con un valor mayor a cero y máximo dos decimales.
3. No cambie `product_id`, nombre, categoría, unidad de precio, precio actual ni respaldo del catálogo.
4. Revise cada ID y nombre contra Productos antes de cargar el valor individualmente.
5. Un precio positivo habilita “Pedido por Bs” solo si el producto respaldado tiene una unidad de precio activa y permitida para pedidos.

El precio base es interno y no se publica en el catálogo. Cambiarlo no altera pedidos ni snapshots históricos; los pedidos posteriores utilizan el precio vigente al crearse.

No se incluye un importador masivo en el piloto. La edición individual con confirmación, control concurrente y auditoría reduce el riesgo mientras se reciben solo 31 precios.

## Conversiones de recepción

`qb_receiving_conversions_template.csv` enumera los 197 productos publicados y los 119 pendientes del catálogo maestro. Actualmente no hay relaciones activas de recepción: los publicados quedan en **C: requiere confirmación del cliente**; entre los pendientes, 1 queda en C y 118 en **D: presentación ambigua**. Los pendientes no tienen ID ni unidad base inventados y no son utilizables en el piloto actual.

Complete la unidad o presentación de recepción y el factor únicamente cuando el cliente lo confirme. No deduzca equivalencias por el nombre del producto, prácticas comerciales o conocimiento general. Después, configure cada relación desde Parametrización y verifique que la unidad base coincida.

## Stock inicial

En `qb_initial_stock_template.csv`, complete `initial_quantity` y `cutoff_date` solo con el conteo aprobado por el cliente. La cantidad debe expresarse en la unidad base indicada.

El stock inicial debe registrarse como un **ingreso de apertura trazable** desde Ingresos. Nunca edite directamente el saldo del producto. Revise el borrador, sus unidades y cantidades antes de confirmarlo.

## Datos pendientes del cliente

- 31 precios reales en BOB/Bs.
- Unidades, presentaciones y factores reales de recepción.
- Cantidades iniciales y fecha de corte.
