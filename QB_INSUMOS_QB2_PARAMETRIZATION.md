# QB Insumos - QB-2 Parametrizacion de unidades y presentaciones

> Documento historico. El documento oficial de cierre QB-2 es `QB_INSUMOS_QB2_PARAMETRIZACION.md`.

## Alcance

QB-2 agrega una base local de parametrizacion para unidades universales, conversiones y presentaciones especificas por producto. No ejecuta movimientos, no convierte inventario existente y no habilita compras, recepcion, catalogo, pedidos ni checkout.

## Migracion local preparada

Archivo:

- `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`

La migracion crea tablas nuevas:

- `qb_unit_dimensions`
- `qb_units`
- `qb_product_unit_settings`
- `qb_product_presentations`
- `qb_product_allowed_units`
- `qb_conversion_snapshots`

Tambien prepara datos base para peso:

| Unidad | Simbolo | Factor a kg |
|---|---|---:|
| Kilogramo | kg | 1 |
| Libra | lb | 0.453592 |
| Arroba | @ | 11.25 |
| Cuartilla | cuartilla | 2.7 |

Se incluye la dimension `unidad` con la unidad base `unidad` para soportar presentaciones como bandejas de huevos sin tratar caja, saco, carga, bolsa, bandeja o atado como unidades universales.

## Modelo funcional

Las unidades universales viven en `qb_units` y siempre pertenecen a una dimension. El factor de conversion expresa cuanto equivale una unidad en la unidad base de esa dimension.

Las presentaciones especificas viven en `qb_product_presentations`. Una presentacion pertenece a un producto y congela su equivalencia parametrica, por ejemplo:

- Papa: carga = 10 arrobas = 112.5 kg.
- Tomate: caja = 18 kg.
- Vaina: saco = 25 kg.
- Huevos: bandeja = 30 unidades.

Las unidades permitidas por contexto viven en `qb_product_allowed_units` y separan los usos futuros:

- `pedido`
- `recibo`
- `recepcion`
- `inventario`

## Seguridad

Todas las tablas nuevas tienen RLS habilitado. Las politicas permiten lectura a usuarios autenticados e insercion/actualizacion a roles de administracion o inventario. QB-2 no agrega politicas de borrado.

## Interfaz

La ruta privada `/parametrizacion` integra el panel `QB-2 Parametrizacion de unidades y presentaciones` para gestionar:

- dimensiones;
- unidades universales;
- unidad base por producto;
- presentaciones por producto;
- unidades o presentaciones permitidas por contexto.

Si la migracion no esta aplicada en la base conectada, la pantalla muestra un aviso sin romper la navegacion privada.

## Fuera de alcance

QB-2 no modifica:

- stock actual;
- inventario historico;
- precios historicos;
- compras;
- pedidos;
- preparacion;
- entrega;
- recibos;
- ventas;
- pagos;
- caja;
- CxC;
- CxP;
- fulfillment;
- roles reales existentes;
- flujos de catalogo o checkout.

## Siguiente fase recomendada

QB-3: Productos QB y configuracion de unidades permitidas.
