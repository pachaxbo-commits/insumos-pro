# QB Insumos - QB-3 Productos QB y unidades permitidas

## Estado de la fase

QB-3 prepara la configuracion de productos para el flujo objetivo de QB Insumos. Es una fase local y parametrica: no mueve stock, no crea pedidos, no genera recibos, no habilita catalogo publico y no activa compras ni ingresos de mercaderia.

Ruta privada usada:

- `/productos`

Ruta relacionada:

- `/parametrizacion`, solo para reglas generales QB-2 de unidades, conversiones y presentaciones.

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql`

La migracion no fue aplicada a PostgreSQL real desde esta sesion. `SUPABASE_SCHEMA.sql` no es fuente canonica.

## Auditoria inicial del modelo actual

La tabla legacy `products` ya contiene:

- nombre y SKU;
- categoria via `category_id`;
- unidad legacy via `unit_id`;
- `stock_current` y `stock_min`;
- `purchase_price` y `sale_price` legacy;
- proveedor e imagen;
- activo/inactivo;
- flags previos de clasificacion, venta y catalogo.

QB-3 no modifica esos campos ni migra su stock o precios historicos.

Las tablas QB-2 reutilizadas son:

- `qb_units`;
- `qb_product_unit_settings`;
- `qb_product_presentations`;
- `qb_product_allowed_units`;
- `qb_conversion_snapshots`.

## Configuracion QB por producto

QB-3 completa `qb_product_unit_settings` con:

- `base_inventory_unit_id`;
- `base_price_unit_id`;
- `base_sale_price`;
- `is_visible_in_qb_catalog`;
- `is_classifiable`;
- `classification_mode`;
- `is_qb_active`;
- `internal_notes`.

El precio base es el precio de venta base futuro para recibos acumulativos QB-7. No modifica ventas historicas ni `products.sale_price`.

La visibilidad futura en catalogo no habilita el catalogo publico. Solo prepara el dato para QB-5.

## Unidades permitidas por contexto

QB-3 usa `qb_product_allowed_units` para configurar unidades o presentaciones permitidas en contextos futuros:

- `pedido`;
- `recepcion`;
- `recibo`;
- `inventario`.

Ejemplos objetivo:

- Papa grande: pedido en kg, arroba o cuartilla; inventario y recibo en kg.
- Tomate: pedido en kg o caja; recepcion por caja; inventario en kg.
- Vaina: pedido en kg o saco; recepcion por saco; inventario en kg.

La UI QB-3 no crea contexto de venta. Si una base local antigua contiene `venta`, la migracion lo conserva solo como compatibilidad tecnica, sin habilitar ventas.

## Clasificacion futura

QB-3 agrega `qb_product_classification_outputs` para definir relaciones futuras como:

```text
Papa para clasificar
-> Papa grande
-> Papa mediana
-> Papa pequena
-> Merma
```

Reglas:

- Una salida puede ser producto resultado o merma.
- La merma no apunta a producto resultado.
- El producto resultado no puede ser el mismo producto origen.
- Se puede guardar porcentaje esperado opcional.
- La tabla no crea stock, movimientos ni clasificacion real.

## Interfaz

La ruta `/productos` concentra la configuracion QB especifica por producto:

- productos QB;
- categoria y datos base heredados;
- unidades base de inventario y precio;
- precio base QB futuro;
- visibilidad futura en catalogo;
- estado QB e indicadores de configuracion pendiente;
- unidades permitidas por contexto;
- clasificacion futura;
- notas internas.

La ruta `/parametrizacion` queda reservada para reglas generales de unidades, conversiones y presentaciones por producto. No debe ser el centro visual de precio base, catalogo futuro, unidades permitidas por contexto ni clasificacion futura.

## Seguridad

Permisos actuales:

- lectura: usuarios autenticados;
- creacion/edicion: `admin`, `administrador`, `inventario`;
- desactivacion: edicion de `is_active` o `is_qb_active`;
- borrado: sin politica RLS de borrado para tablas QB.

No se cambiaron Auth, roles reales ni RLS legacy.

## Fuera de alcance

QB-3 no implementa:

- ingresos de mercaderia;
- clasificacion real;
- catalogo publico operativo;
- pedidos;
- preparacion;
- entrega;
- descuento de stock;
- recibos acumulativos;
- ventas;
- pagos;
- caja;
- CxC;
- CxP;
- fulfillment.

## Siguiente fase recomendada

QB-4: Ingresos de mercaderia y clasificacion real, usando configuracion QB-2/QB-3 sin duplicar stock base.
