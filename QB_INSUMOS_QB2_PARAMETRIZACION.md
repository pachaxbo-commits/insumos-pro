# QB Insumos - QB-2 Parametrizacion de unidades y conversiones

## Estado de la fase

QB-2 queda preparada localmente como base de parametrizacion. No fue aplicada a PostgreSQL real desde esta sesion y no debe considerarse ejecutada en Supabase Staging ni Produccion.

Ruta privada de administracion:

- `/parametrizacion`

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`

`SUPABASE_SCHEMA.sql` no es fuente canonica para esta fase.

## Modelo de unidades universales

Las unidades universales viven en `qb_units` y pertenecen a una dimension global en `qb_unit_dimensions`.

Cada unidad define:

- nombre;
- simbolo;
- dimension;
- factor hacia la unidad base de esa dimension;
- estado activo/inactivo;
- orden visual;
- timestamps;
- usuario creador/modificador cuando la operacion se ejecuta desde la aplicacion.

Dimension inicial de peso:

| Unidad | Simbolo | Factor a kg |
| --- | --- | ---: |
| Kilogramo | kg | 1 |
| Libra | lb | 0.453592 |
| Arroba | @ | 11.25 |
| Cuartilla | cuartilla | 2.7 |

Reglas:

- `kg` es la unidad base de peso.
- `1 arroba = 11.25 kg`.
- `1 cuartilla = 2.7 kg`.
- Las cantidades soportan precision decimal suficiente para cantidades fisicas de al menos 3 decimales.
- Caja, saco, carga, bolsa, bandeja y atado no son unidades universales; son presentaciones por producto.

Tambien se deja preparada la dimension `unidad` para casos como huevos por unidad o bandeja, sin convertir presentaciones comerciales en unidades globales.

## Modelo de presentaciones por producto

Las presentaciones viven en `qb_product_presentations`.

Cada presentacion:

- pertenece a un producto;
- tiene nombre y simbolo propios;
- define cantidad contenida y unidad contenida;
- define equivalencia en unidad base del producto;
- guarda un factor parametrico;
- puede marcarse como permitida para recepcion, pedido, recibo futuro o inventario futuro;
- tiene estado activo/inactivo.

Ejemplos soportados por el modelo:

| Producto | Presentacion | Equivalencia parametrica |
| --- | --- | --- |
| Papa | carga | 1 carga = 10 arrobas = 112.5 kg |
| Tomate | caja | 1 caja = 18 kg |
| Vaina | saco | 1 saco = 25 kg |

La configuracion de unidad base por producto vive en `qb_product_unit_settings`, pero su edicion visual corresponde a `/productos` desde QB-3.

Las unidades o presentaciones permitidas por contexto viven en `qb_product_allowed_units`, con contextos:

- `pedido`;
- `recepcion`;
- `recibo`;
- `inventario`.

Estos contextos son preparatorios, se administran desde `/productos` en QB-3 y no activan flujos operativos.

## Conversion snapshots

La tabla `qb_conversion_snapshots` queda preparada para congelar la conversion usada en una operacion futura.

Uso previsto:

- QB-4: ingresos de mercaderia y clasificacion podran guardar snapshot de presentacion recibida, unidad base y factor usado.
- QB-5: pedidos QB podran congelar la unidad solicitada sin exponer precios.
- QB-6: preparacion y entrega podran conservar unidad solicitada y cantidad real entregada antes de descontar stock.
- QB-7: recibos acumulativos podran auditar cantidades reales, unidades y conversiones usadas al emitir el recibo no fiscal.

En QB-2 la tabla queda creada como estructura futura; no se inserta ni consume desde flujos reales.

## Que se implemento

- Ruta privada `/parametrizacion`.
- Panel de administracion para dimensiones, unidades universales, conversiones y presentaciones por producto.
- Acciones de servidor para crear y actualizar parametrizacion QB-2.
- Carga de datos tolerante cuando la migracion local aun no esta aplicada en la base conectada.
- Navegacion temporal QB con Parametrizacion como modulo activo.
- Documentacion y acceptance tests actualizados para la fase.

## Que no se implemento todavia

- No se conecto parametrizacion con compras.
- No se conecto parametrizacion con ingresos de mercaderia.
- No se conecto parametrizacion con clasificacion real.
- No se conecto parametrizacion con pedidos, catalogo, checkout ni cuenta cliente.
- No se conecto parametrizacion con recibos.
- No se modifico stock.
- No se convirtio inventario existente.
- No se modificaron precios historicos.
- No se modificaron pagos, caja, CxC, CxP ni fulfillment.

## Limitaciones actuales

- La migracion QB-2 esta preparada como archivo local y debe aplicarse solo en entorno local o base aislada cuando se decida probar datos reales.
- El panel muestra aviso si las tablas QB-2 no existen en la base conectada.
- Los roles reales y RLS existentes no fueron redisenados.
- Las Server Actions de QB-2 dependen de que la migracion exista en la base conectada.
- La desactivacion es logica mediante `is_active`; QB-2 no agrega borrado.

## Permisos actuales

Segun la migracion local QB-2:

- Lectura: usuarios autenticados.
- Creacion: roles `admin`, `administrador` o `inventario`.
- Edicion: roles `admin`, `administrador` o `inventario`.
- Desactivacion: mediante edicion de `is_active`, roles `admin`, `administrador` o `inventario`.
- Borrado: sin politica RLS de borrado en QB-2.

Recomendacion pendiente antes de operacion real:

- Opcion A: solo `administrador` puede editar parametrizacion.
- Opcion B: `administrador` e `inventario` pueden editar parametrizacion.

QB-2 mantiene por ahora la opcion B, porque coincide con las Server Actions implementadas y no modifica RLS en esta correccion.

## Siguiente fase recomendada

QB-3: Productos QB y configuracion de unidades permitidas.
