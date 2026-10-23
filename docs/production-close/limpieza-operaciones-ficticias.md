# Cierre preoperativo: archivo de operaciones ficticias

El SQL histórico `scripts/production-close/cleanup-preview.sql` permanece como
consulta de solo lectura. No usar las RPC de **Configuración → Datos de prueba**
para el corte definitivo: la interfaz encadena grupos y después borra bitácoras
con llamadas separadas, mientras los resets históricos cubren pedidos o stock
por separado.

## Qué se archiva y elimina

La migración `20261022170000_qb_prepublication_fictitious_operations_archive.sql`
crea un registro de ejecución y una bóveda `private` con snapshots JSONB íntegros
y hash por fila. El ejecutor toma un snapshot completo de filas y contenido,
requiere que siga idéntico al aprobado, bloquea las tablas afectadas y realiza
archivo y borrado en una transacción.

Se archivan y se retiran de las tablas operativas pedidos QB y legacy, líneas,
preparaciones, entregas, confirmaciones, Recibos y sus eventos/líneas, compras y
recepciones, gastos operativos, movimientos, FIFO, conciliaciones, snapshots de
conversión, cuentas operativas legacy, lotes de importación y eventos de auditoría
ligados a esos registros. Se conserva en `audit_logs` la auditoría de seguridad,
administración, precios, regularización de unidades y eliminación de productos.
Las regularizaciones de unidad y auditorías de producto no se archivan ni borran.

Se conservan productos, categorías, unidades, configuraciones y precios de
productos, opciones de compra/pedido, presentaciones, clientes, ubicaciones,
perfiles y usuarios. Las plantillas de pedidos también se conservan como
configuración reutilizable.

La limpieza nunca cambia `stock_current` sin ledger: por cada producto con saldo
positivo crea un movimiento `ajuste` de cierre con saldo posterior cero y actor
administrador. Los movimientos y lotes ficticios previos quedan dentro del
archivo; el Kardex vivo muestra el ajuste de cierre, identificado por motivo y
lote de ejecución. El inventario queda en cero y sin lotes FIFO disponibles.
Saldos negativos, diferencia entre stock y último movimiento, o lote FIFO que no
cuadre detienen toda la transacción.

## Auditoría y restauración

Los eventos operativos que referencian operaciones eliminadas pasan juntos al
archivo. El registro conserva la fila completa, clave original, hash, lote y
clasificación. Las auditorías de seguridad, administrativas y de unidades siguen
en sus tablas activas. No se deshabilitan constraints ni se borran logs a ciegas.
Las filas archivadas pueden contener nombres, correos, teléfonos y otros datos
personales. La bóveda no está expuesta a PostgREST ni a `anon`, `authenticated`
o `service_role`; el acceso requiere una sesión directa de administrador de
PostgreSQL. Los respaldos y exportaciones de esa bóveda deben cifrarse, limitarse
a operadores autorizados y conservarse solo durante el plazo que apruebe el
propietario conforme a su política de retención. Ese plazo aún debe aprobarse.
La recuperación consiste en restaurar el respaldo verificado en una base
separada; no se promete reinsertar arbitrariamente snapshots en tablas activas
ya que podría reactivar operaciones de prueba.

## Ejecución controlada futura

1. Crear un respaldo lógico nuevo y restaurarlo en una base aislada.
2. Ejecutar `cleanup-preview.sql` y
   `cleanup-fictitious-operations-preview.sql`; revisar conteos, integridad y
   alcance completo sin mostrar datos personales en capturas.
3. Con aprobación expresa del propietario, guardar el JSON `reviewed_scope` y
   fijar un UUID nuevo de ejecución. El JSON detecta cualquier cambio en filas,
   logs o configuración desde la revisión.
4. Conectar directamente a la base autorizada como administrador de PostgreSQL
   y ejecutar `execute-fictitious-operations-cleanup.sql` pasando sus cinco
   variables `cleanup_*`. La frase requerida es
   `ARCHIVAR OPERACIONES FICTICIAS`.
5. Verificar lote, archivo, stock, ledger, FIFO, catálogo y conteos. Reintentar
   con el mismo UUID devuelve `already_completed` sin duplicar el ajuste.
6. Hacer el smoke test de compra, recepción, pedido, preparación, entrega,
   Recibo y reportes después del corte, siempre en copia antes de Production.

El ejecutor no debe correrse en Production hasta que el propietario apruebe el
alcance exacto de una vista previa reciente. Si aparece una fila nueva o editada,
la función rechaza el snapshot y exige repetir la revisión.

## Retiro de resets heredados

`/configuracion/datos-prueba` deja de mostrar formularios ni solicitar vistas
previas en Production. La acción de servidor comprueba el entorno, el dominio
productivo y el ref Supabase productivo antes de consultar o ejecutar RPC; la
bandera `ALLOW_TEST_DATA_RESET` no puede habilitarlo allí por accidente. La
migración `20261022180000_disable_legacy_test_resets.sql` revoca `EXECUTE` de
las dos RPC destructivas heredadas para todos los roles de aplicación, incluido
`service_role`. Las pruebas QA deben usar fixtures y transacciones con rollback;
la limpieza heredada queda retirada en todos los entornos.
La migración incremental `20261024130000_qb_cleanup_issued_receipt_archive_guard.sql`
mantiene la protección de recibos emitidos y permite su archivo solamente dentro
de la rutina autorizada de limpieza con sesión y propietario administrador de
PostgreSQL.
