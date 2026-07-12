# QB Insumos - Plan de pruebas Staging

## Estado

No ejecutado en QB-9. Este documento prepara el uso futuro de Staging sin tocarlo todavia.

## Precondiciones

- Aprobacion explicita para usar Staging.
- Backup completo y restaurable tomado antes de cualquier migracion.
- Lista de migraciones ya aplicadas en Staging.
- Confirmacion de que Staging no apunta a Produccion.
- Rama/codigo local validado con `lint`, TypeScript y build.
- `SUPABASE_SCHEMA.sql` excluido del proceso.

## Backup previo

Antes de aplicar:

1. Tomar backup de base completa.
2. Guardar timestamp, proyecto, commit/branch local y responsable.
3. Validar que el backup pueda restaurarse en un entorno temporal.
4. Exportar lista de funciones/RPC existentes para comparar.
5. Exportar lista de tablas QB y legacy existentes.

## Orden de migraciones

Aplicar segun `QB_INSUMOS_MIGRACIONES_CANONICAS.md`.

Para flujo QB nuevo:

1. Confirmar baseline preexistente.
2. Confirmar `profiles`, `products`, `inventory_movements`, `customer_accounts` y funciones compartidas.
3. Aplicar QB-2: `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql`.
4. Aplicar QB-3: `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql`.
5. Aplicar QB-4: `SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql`.
6. Aplicar QB-5: `SUPABASE_MIGRATION_FASE_19_QB5_CUSTOMER_CATALOG_ORDERS.sql`.
7. Aplicar QB-6: `SUPABASE_MIGRATION_FASE_20_QB6_ORDER_PREPARATION_DELIVERY.sql`.
8. Aplicar QB-7: `SUPABASE_MIGRATION_FASE_21_QB7_ACCUMULATED_RECEIPTS.sql`.
9. QB-8/QB-9 no tienen SQL.

No aplicar 15F-B ni 15F-C para validar flujo QB, salvo que Staging ya las tenga como historico y queden visualmente suspendidas.

## Pruebas post-migracion

### Humo tecnico

- Consultar existencia de tablas QB-2 a QB-7.
- Consultar existencia de RPCs QB.
- Verificar RLS activado en tablas QB.
- Verificar grants de RPCs sensibles.
- Confirmar que funciones legacy fulfillment no se invocan desde UI QB.

### Flujo inventario

- Crear unidades y presentaciones.
- Configurar papa para clasificar.
- Registrar ingreso.
- Clasificar 60/20/20.
- Confirmar ingreso.
- Validar stock en productos resultado.
- Validar merma sin stock.

### Flujo cliente

- Crear cuenta cliente.
- Crear ubicacion.
- Abrir catalogo sin precios.
- Enviar pedido.
- Repetir pedido.
- Confirmar historial sin precios.

### Flujo preparacion y entrega

- Iniciar preparacion.
- Guardar completo/parcial/no disponible.
- Confirmar preparado.
- Confirmar entrega.
- Validar `inventory_movements` una sola vez.
- Reintentar entrega y esperar bloqueo.

### Flujo recibo

- Crear recibo de pedidos entregados.
- Aplicar factores 5/7/5/7.
- Editar precio base usado.
- Emitir recibo.
- Ver vista imprimible no fiscal.
- Anular recibo.
- Validar que stock no cambia.

### Reportes

- Abrir `/reportes`.
- Validar inventario, ingresos, pedidos, pendientes, recibos, frecuentes y auditoria.
- Exportar CSV.
- Confirmar ausencia de metodos de pago, caja, CxC y CxP.

## Criterios para aprobar Staging

- Todas las migraciones canonicas aplican sin error.
- No hay errores de RLS en flujos esperados.
- Catalogo y mi cuenta no muestran precios.
- Pedido QB no crea venta/pago/caja/CxC/CxP.
- Preparacion no mueve stock.
- Entrega mueve stock una sola vez.
- Recibo no mueve stock ni crea cobro.
- Reportes no mutan datos.
- Rutas suspendidas siguen suspendidas.

## Criterios para detener

- Cualquier error SQL no entendido.
- Cualquier indicio de conexion a Produccion.
- Catalogo muestra precios.
- Pedido crea venta/pago/caja.
- Preparacion mueve stock.
- Recibo mueve stock o crea cobro.
- Reportes muestran caja, pagos, CxC/CxP o metodos de pago.
- RLS permite lectura cruzada de clientes.

## Rollback o recuperacion

Opcion preferida:

1. Detener pruebas.
2. No aplicar migraciones adicionales.
3. Restaurar backup completo de Staging.
4. Repetir en copia local para reproducir.

Opcion controlada si no hay datos reales afectados:

1. Crear snapshot inmediatamente.
2. Documentar migracion exacta fallida.
3. Revertir solo mediante script revisado y probado localmente.
4. No borrar tablas ni datos manualmente desde consola.

## Evidencia requerida

- Fecha/hora de aplicacion.
- Lista de migraciones aplicadas.
- Capturas o logs de pruebas.
- Resultado de conteos de tablas QB.
- Resultado del checklist manual.
- Decision final: aprobado, aprobado con riesgos o rechazado.
