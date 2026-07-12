# QB Insumos - Plan de migracion funcional

## Advertencias obligatorias

- Esta fase es solo documental.
- No aplicar SQL remoto.
- No usar Supabase Staging ni Produccion.
- No hacer deploy.
- No hacer commits.
- No aplicar `SUPABASE_SCHEMA.sql` como esquema canonico.
- `SUPABASE_SCHEMA.sql` es un consolidado historico con fases mezcladas, funciones redefinidas y legado financiero; debe usarse solo como referencia de auditoria local.

## Fases QB-1 a QB-9

### QB-1 - Congelamiento y parametrizacion base

Objetivo: definir nombres, roles, modulos visibles y parametros base sin cambiar datos productivos.

Incluye:

- Definir marca `QB Insumos`.
- Definir roles objetivo.
- Definir estados canonicos de pedido, linea, entrega y recibo.
- Crear documento tecnico de equivalencias entre estados actuales y QB.
- Marcar rutas legado para ocultamiento futuro.

Dependencias: auditoria local terminada.

Riesgos: ocultar modulos antes de tener reemplazos operativos.

### QB-2 - Unidades, presentaciones y conversion snapshots

Objetivo: preparar modelo de unidades universales y presentaciones especificas.

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`

Incluye:

- kg, libra, arroba y cuartilla.
- Conversiones oficiales.
- Presentaciones por producto: carga, caja, saco, bandeja, bolsa u otras.
- Snapshot de conversion usada en ingresos, pedidos, preparacion, entrega y recibo.
- Minimo 3 decimales para cantidades fisicas.

Dependencias: decision de modelo de datos.

Riesgos: romper productos existentes que solo tienen `unit_id`.

Estado de aplicacion: no aplicada a PostgreSQL real desde esta fase. Debe revisarse y probarse primero en entorno local o base aislada.

Orden recomendado para QB-2:

1. Confirmar que migraciones previas requeridas por `products`, `profiles`, `current_user_role()` y `set_current_timestamp_updated_at()` existen en la base aislada.
2. Aplicar `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql` solo en local o base aislada.
3. Validar seeds de peso: kg, libra, arroba y cuartilla.
4. Validar RLS y permisos antes de cargar presentaciones reales.
5. No usar `SUPABASE_SCHEMA.sql` como esquema canonico ni como orden de aplicacion.

### QB-3 - Productos QB y configuracion de unidades permitidas

Objetivo: separar el producto QB operativo del producto legacy y terminar la configuracion por producto sin activar ingresos, pedidos ni stock.

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql`

Incluye:

- Definir productos QB con unidad base.
- Definir unidad base de inventario y unidad base de precio.
- Definir precio base de venta futuro para recibos QB-7.
- Configurar unidades permitidas por producto y contexto.
- Validar presentaciones activas/inactivas.
- Definir visibilidad futura en catalogo sin precios.
- Definir productos clasificables y productos resultado de clasificacion.
- Preparar vistas de lectura para conversiones por producto.
- Mantener productos legacy disponibles solo como base transitoria.
- No convertir inventario existente.

Dependencias: QB-2.

Riesgos: usar unidades permitidas como si ya fueran flujo operativo de compras, pedidos o stock.

Estado de aplicacion: no aplicada a PostgreSQL real desde esta fase. Debe aplicarse solo despues de QB-2 en entorno local o base aislada.

Orden recomendado para QB-3:

1. Aplicar y validar `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`.
2. Aplicar `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql` solo en local o base aislada.
3. Configurar productos QB sin modificar `products.stock_current`, precios historicos ni ventas.
4. Validar unidades permitidas para `pedido`, `recepcion`, `recibo` e `inventario`.
5. Validar relaciones de clasificacion futura sin ejecutar clasificacion real.
6. No usar `SUPABASE_SCHEMA.sql` como esquema canonico ni como orden de aplicacion.

### QB-4 - Ingresos de mercaderia y clasificacion

Objetivo: convertir lotes de compra en ingresos de mercaderia.

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql`

Incluye:

- Ingreso por caja, saco, carga u otra presentacion.
- Costo separado de precios de venta.
- Clasificacion opcional por producto.
- Merma.
- Stock solo en productos resultado cuando hay clasificacion.
- Validaciones para evitar duplicar stock del producto base.
- Snapshots de conversion de la presentacion recibida.

Dependencias: QB-2 y QB-3.

Riesgos: `confirm_purchase_batch` actual puede crear compras hijas y mezclar pagos/costos.

Estado de aplicacion: no aplicada a PostgreSQL real desde esta fase. Debe aplicarse solo despues de QB-2 y QB-3 en entorno local o base aislada.

Orden recomendado para QB-4:

1. Aplicar y validar `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`.
2. Aplicar y validar `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql`.
3. Aplicar `SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql` solo en local o base aislada.
4. Configurar unidades permitidas de `recepcion` para los productos usados.
5. Crear ingresos QB desde `/ingresos`, sin reactivar `/compras` ni `/compras/multiple`.
6. Validar que ingresos clasificados solo aumenten stock de productos resultado.
7. Validar que la merma no aumente stock y quede trazada.

### QB-5 - Cuenta cliente, ubicaciones, catalogo sin precios y pedidos

Objetivo: adaptar experiencia cliente y construir pedidos QB sin precios.

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_19_QB5_CUSTOMER_CATALOG_ORDERS.sql`

Incluye:

- Cliente con nombre, telefono y multiples ubicaciones.
- Catalogo sin `referencePrice`.
- Carrito con producto, unidad y cantidad.
- Sin metodo de pago esperado.
- Sin confirmacion de precio.
- Pedido sin precios.
- Productos frecuentes por historial.
- Repetir ultimo pedido con cantidades editables.
- Estados QB desde borrador cliente hasta enviado.
- Snapshots de unidad solicitada y conversion parametrica.

Dependencias: QB-3 y QB-4.

Riesgos: checkout actual depende de campos de precio/pago y reutilizar `orders.estimated_total/final_total` puede reintroducir precios en el flujo cliente.

Estado de aplicacion: no aplicada a PostgreSQL real desde esta fase. Debe aplicarse solo despues de QB-2, QB-3 y QB-4 en entorno local o base aislada.

Orden recomendado para QB-5:

1. Aplicar y validar `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`.
2. Aplicar y validar `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql`.
3. Aplicar y validar `SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql`.
4. Aplicar `SUPABASE_MIGRATION_FASE_19_QB5_CUSTOMER_CATALOG_ORDERS.sql` solo en local o base aislada.
5. Configurar productos visibles en `is_visible_in_qb_catalog` y unidades permitidas con contexto `pedido`.
6. Crear cuenta cliente y ubicaciones.
7. Enviar pedido desde `/catalogo/checkout` y validar que queda en `qb_orders.status = 'pendiente_preparacion'`.
8. Validar que no se crean ventas, pagos, caja, CxC, CxP, recibos, fulfillment ni movimientos de inventario.
9. Mantener `/pedido/confirmar` suspendido.

### QB-6 - Preparacion y entrega idempotente

Objetivo: separar preparacion de entrega y descuento de stock.

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_20_QB6_ORDER_PREPARATION_DELIVERY.sql`

Incluye:

- Preparacion por linea: solicitado, real entregado, unidad, estado, observacion.
- Estados completo, parcial y no disponible.
- Entrega fisica descuenta stock solo por cantidad real entregada.
- Proteccion contra doble descuento.
- Pedido queda entregado pendiente de recibo.
- Cancelacion solo antes de entrega.
- Producto de merma marcado con `products.is_qb_loss_product` queda fuera de catalogo, preparacion y entrega.

Dependencias: QB-4 y QB-5.

Riesgos: `confirm_prepared_order`, `fulfill_confirmed_order`, `confirm_sale` e inventario actual pueden descontar stock en momentos distintos.

Estado de aplicacion: no aplicada a PostgreSQL real desde esta fase. Debe aplicarse solo despues de QB-2, QB-3, QB-4 y QB-5 en entorno local o base aislada.

Orden recomendado para QB-6:

1. Aplicar y validar `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`.
2. Aplicar y validar `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql`.
3. Aplicar y validar `SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql`.
4. Aplicar y validar `SUPABASE_MIGRATION_FASE_19_QB5_CUSTOMER_CATALOG_ORDERS.sql`.
5. Aplicar `SUPABASE_MIGRATION_FASE_20_QB6_ORDER_PREPARATION_DELIVERY.sql` solo en local o base aislada.
6. Crear pedido QB desde catalogo sin precios.
7. Iniciar preparacion en `/pedidos`, guardar cantidades reales y confirmar preparado.
8. Confirmar entrega y validar un solo descuento por item en `inventory_movements`.
9. Reintentar entrega y validar bloqueo anti doble descuento.
10. Confirmar que el pedido queda `entregado_pendiente_recibo` para QB-7.

### QB-7 - Recibos acumulativos

Objetivo: reemplazar ventas por recibos digitales no fiscales.

Migracion local preparada:

- `SUPABASE_MIGRATION_FASE_21_QB7_ACCUMULATED_RECEIPTS.sql`

Incluye:

- Seleccion de varios pedidos entregados de un mismo cliente.
- Recibo en borrador.
- Precio base vigente por producto al crear borrador.
- Edicion de precio base por linea.
- Opcion de aplicar solo al recibo o guardar como nuevo precio base.
- Factores compuestos: distancia, exigencia, clima y extraordinario.
- Emision no fiscal.
- Sin cobro, caja, CxC o CxP.
- Anulacion sin devolucion de stock.
- Pedidos bloqueados en borrador y liberados al anular.

Dependencias: QB-6.

Riesgos: reportes y dashboard actuales dependen de `sales`, `payments` y `accounts_receivable`.

Estado de aplicacion: no aplicada a PostgreSQL real desde esta fase. Debe aplicarse solo despues de QB-2 a QB-6 en entorno local o base aislada.

Orden recomendado para QB-7:

1. Aplicar y validar migraciones QB-2 a QB-6 en orden.
2. Aplicar `SUPABASE_MIGRATION_FASE_21_QB7_ACCUMULATED_RECEIPTS.sql` solo en local o base aislada.
3. Crear pedidos QB, prepararlos y entregarlos hasta `entregado_pendiente_recibo`.
4. Crear recibo en borrador desde `/recibos`.
5. Validar factores compuestos y edicion de precio base por linea.
6. Emitir recibo y validar pedidos en `recibo_emitido`.
7. Anular recibo emitido con motivo y validar pedidos liberados a `entregado_pendiente_recibo`.
8. Confirmar que no se crean ventas, pagos, caja, CxC, CxP, fulfillment ni movimientos de inventario.

### QB-8 - Reportes simples y auditoria operativa

Objetivo: reemplazar reportes legacy por supervision QB de solo lectura.

Migracion local preparada:

- No hubo migracion nueva. QB-8 usa consultas sobre tablas QB-2 a QB-7 existentes.

Incluye:

- Reactivar `/reportes` como Reportes QB.
- Inicio operativo QB sin metricas financieras legacy.
- Reporte de inventario actual.
- Reporte de ingresos de mercaderia QB-4.
- Reporte de pedidos y preparacion QB-5/QB-6.
- Reporte de entregas pendientes de recibo.
- Reporte de recibos acumulativos QB-7.
- Reporte de clientes y productos frecuentes.
- Auditoria operativa basica usando timestamps y eventos existentes.
- CSV simple para inventario, pedidos, pendientes de recibo y recibos.

Dependencias: QB-2 a QB-7.

Riesgos: si las migraciones QB no estan aplicadas en la base local conectada, las consultas de `/reportes` fallaran de forma segura.

Orden recomendado para QB-8:

1. Aplicar y validar migraciones QB-2 a QB-7 en PostgreSQL local o base aislada.
2. Abrir `/reportes` con rol `administrador`.
3. Validar que no se consultan ventas, pagos, caja, CxC, CxP, compras legacy ni fulfillment.
4. Validar reportes de inventario, ingresos, pedidos, pendientes de recibo, recibos y auditoria.
5. Validar que CSV no exporta metodos de pago ni caja.
6. Validar que clientes externos no acceden a `/reportes`.

### QB-9 - Cierre tecnico, migraciones canonicas y preparacion de Staging

Objetivo: cerrar tecnicamente QB Insumos antes de cualquier uso de Staging.

Migracion local preparada:

- No hubo migracion nueva. QB-9 es auditoria, documentacion y plan de pruebas.

Documentos creados:

- `QB_INSUMOS_QB9_CIERRE_TECNICO.md`
- `QB_INSUMOS_MIGRACIONES_CANONICAS.md`
- `QB_INSUMOS_PLAN_PRUEBAS_STAGING.md`
- `QB_INSUMOS_CHECKLIST_ENTREGA_CLIENTE.md`

Incluye:

- Auditoria de modulos activos y suspendidos.
- Auditoria de rutas y permisos visuales.
- Inventario canonico de migraciones.
- Orden recomendado para PostgreSQL local y Staging.
- Lista de migraciones legacy que no deben aplicarse para QB.
- Plan de prueba local con PostgreSQL/Supabase local.
- Checklist manual end-to-end.
- Plan de Staging y rollback.
- Lista de candidatos legacy para eliminacion futura.

Dependencias: QB-1 a QB-8 completas.

Riesgos:

- No se ejecuto PostgreSQL local porque `.env.local` apunta a Supabase remoto.
- Staging no debe tocarse hasta validar en base local/aislada.
- Legacy financiero sigue existiendo en codigo y migraciones, aunque suspendido visualmente.

## Migraciones actuales que no deben aplicarse fuera de orden

- `SUPABASE_MIGRATION_FASE_12A_SECURITY.sql`
- `SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql`
- `SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql`
- `SUPABASE_MIGRATION_FASE_13_ORDERS.sql`
- `SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql`
- `SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql`
- `SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql`
- `SUPABASE_MIGRATION_FASE_14D_1_PRECISION_INTEGRITY.sql`
- `SUPABASE_MIGRATION_FASE_15B_PUBLIC_CATALOG.sql`
- `SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql`
- `SUPABASE_MIGRATION_FASE_15D_SECURE_ORDER_CONFIRMATION.sql`
- `SUPABASE_MIGRATION_FASE_15E_CUSTOMER_ACCOUNTS.sql`
- `SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql`
- `SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql`
- `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`
- `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql`
- `SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql`
- `SUPABASE_MIGRATION_FASE_19_QB5_CUSTOMER_CATALOG_ORDERS.sql`
- `SUPABASE_MIGRATION_FASE_20_QB6_ORDER_PREPARATION_DELIVERY.sql`
- `SUPABASE_MIGRATION_FASE_21_QB7_ACCUMULATED_RECEIPTS.sql`

Razon: varias migraciones alteran las mismas tablas o redefinen funciones (`confirm_sale`, `confirm_purchase`, `prepare_order_item`, `confirm_prepared_order`, `confirm_purchase_batch`). Aplicarlas fuera de secuencia puede dejar contratos inconsistentes.

## Orden recomendado

1. Cerrar auditoria documental.
2. Crear especificacion de datos QB-1/QB-2 sin SQL remoto.
3. Crear migraciones nuevas solo para QB, revisadas y numeradas.
4. Probar en entorno local o base aislada.
5. Adaptar UI detras de flags o rutas nuevas.
6. Migrar flujo cliente/pedido/preparacion/entrega.
7. Crear recibos acumulativos.
8. Migrar reportes y auditoria.
9. Ejecutar cierre tecnico QB-9.
10. Probar migraciones en PostgreSQL local o Supabase local aislado.
11. Preparar Staging con backup y rollback.
12. Retirar legado solo despues de validacion, respaldo y aprobacion explicita.
