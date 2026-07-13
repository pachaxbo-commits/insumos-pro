# QB-9.10.1 - Repeticion controlada del E2E de Staging

Fecha/hora de cierre: 2026-07-12 22:31:47 -04:00

## Veredicto

**E2E FALLO, LIMPIEZA COMPLETA.**

El nuevo arnes corrigio la clasificacion de rechazos esperados y completo RLS, parametrizacion, ingreso, catalogo, pedidos, preparacion, entrega, recibo, emision y anulacion. Se detuvo despues al intentar contar directamente `sales` mediante la sesion autenticada del administrador. PostgREST denego o no pudo resolver esa lectura y devolvio un error sin mensaje: `count sales: `.

No se corrigio ni repitio el run. Se ejecuto inmediatamente la limpieza completa. La comprobacion administrativa final confirma que `sales`, pagos, caja y CxC siguen en cero; la limpieza no borro ninguna fila legacy, por lo que el flujo QB no creo efectos financieros.

## Preflight

- Proyecto: `qb-insumos-staging-v2`.
- Project ref: `tekfwbhvqtojpfqusosg`.
- Rama: `main`.
- Git previo: limpio.
- Migraciones: 14 local / 14 remoto.
- Dry-run inicial: `Remote database is up to date`.
- Usuarios y datos operativos iniciales: 0.
- Dimensiones/unidades canonicas iniciales: 2/5.
- Residuos de QB-9.10: ninguno.

## Run

- Run ID: `qb9_10_1_20260712_222247_8ff383b0`.
- Usuarios Auth ficticios: 5.
- Contrasenas y claves: solo en memoria.
- Manifiesto: fuera del repositorio y sin secretos.
- Checks aprobados antes del bloqueo: 53.
- Filas registradas y eliminadas: 59.

## RLS y roles

### Cliente A/B

- Cliente A leyo su cuenta y no la cuenta de B.
- Cliente B no leyo la ubicacion de A.
- Clientes no leyeron preparacion ni recibos internos.
- Clientes no leyeron `products`, precios legacy ni configuracion QB interna.
- Se crearon pedidos separados A/B.
- Cliente A no leyo el pedido de B y Cliente B no leyo el pedido de A.

### Usuario sin cuenta

- Catalogo publico permitido.
- Pedido rechazado con `missing_customer`.
- Sin pedido, item, snapshot ni cambio de stock parcial.

### Administrador

- Parametrizacion, productos, ingreso, recibo, emision y anulacion aprobados.
- La lectura directa de `sales` por PostgREST no estuvo disponible; este fue el primer error inesperado.

### Inventario

- Preparacion y entrega aprobadas.
- Emision de recibo rechazada por rol.
- El recibo permanecio en borrador y el stock no cambio.

## Parametrizacion e ingreso

- Carga: 112.5 kg.
- 10 cargas: 1125 kg.
- Papa grande: 675 kg.
- Papa mediana: 225 kg.
- Papa pequena: 225 kg.
- Producto base: 0 kg.
- Merma: 0 kg.
- Snapshots y movimientos: correctos.
- Doble confirmacion de ingreso: rechazada.

## Catalogo y pedidos

- Solo Papa grande visible.
- Sin precios, costos, totales ni factores.
- Pedido Cliente A: 2 arrobas = 22.5 kg.
- Idempotencia: devolvio el mismo pedido.
- Creacion de pedido no movio stock.

| Prueba negativa | Resultado | Validacion adicional |
| --- | --- | --- |
| Producto merma | `EXPECTED_REJECTION` | Sin pedido/item adicional ni stock |
| Ubicacion ajena | `EXPECTED_REJECTION` | `invalid_location`, sin mutacion |
| Usuario sin cuenta | `EXPECTED_REJECTION` | `missing_customer`, sin mutacion |

## Preparacion y entrega

- Preparacion iniciada con inventario.
- Linea parcial: 1.5 arrobas.
- Conversion real: 16.875 kg.
- Estado preparado no movio stock.
- Antes de entregar: 675 kg y cero movimientos de salida.
- Entrega: una salida de 16.875 kg.
- Stock final antes de limpieza: 658.125 kg.
- Estado: `entregado_pendiente_recibo`.
- Doble entrega: `EXPECTED_REJECTION`.
- Tras el rechazo permanecieron una salida y 658.125 kg.

## Recibo

- Precio base: 100.
- Factores: 5/7/5/7.
- Precio matematico: 126.225225.
- Precio almacenado: 126.2252.
- Precio presentado: 126.23.
- Total: 2130.05.
- Leyenda no fiscal: presente.
- Emision por inventario: `EXPECTED_REJECTION`.
- Segundo recibo activo: `EXPECTED_REJECTION`.
- Emision por administrador: aprobada.
- Doble emision: `EXPECTED_REJECTION`.
- Anulacion: aprobada.
- Pedido liberado a `entregado_pendiente_recibo`.
- Stock despues de emision/anulacion: 658.125 kg.

## Error inesperado

```text
count sales:
```

Causa tecnica: el arnes intento usar la sesion de aplicacion del administrador para verificar una tabla legacy suspendida que no forma parte de sus lecturas operativas permitidas. La comprobacion debio usar el canal administrativo read-only de conteos ya autorizado, no PostgREST autenticado.

Consecuencia: por la regla de parada no se ejecutaron reportes QB, CSV, aplicacion local, lint, TypeScript ni build.

La verificacion final administrativa demuestra:

- `sales = 0`;
- `payments = 0`;
- `cash_movements = 0`;
- `accounts_receivable = 0`.

La limpieza no incluyo DELETE sobre esas tablas.

## Limpieza

La limpieza uso UUID exactos, conteos previos y una sola transaccion SQL. No uso `TRUNCATE`, comodines, nombres ni rangos temporales.

| Tabla | Filas eliminadas |
| --- | ---: |
| `audit_logs` | 2 |
| `customer_accounts` | 2 |
| `inventory_movements` | 4 |
| `product_categories` | 1 |
| `products` | 5 |
| `profiles` | 2 |
| `qb_conversion_snapshots` | 4 |
| `qb_customer_locations` | 2 |
| `qb_merchandise_receipt_classification_results` | 4 |
| `qb_merchandise_receipt_lines` | 1 |
| `qb_merchandise_receipt_movements` | 4 |
| `qb_merchandise_receipts` | 1 |
| `qb_order_delivery_movements` | 1 |
| `qb_order_items` | 2 |
| `qb_order_preparation_items` | 1 |
| `qb_order_preparations` | 1 |
| `qb_orders` | 2 |
| `qb_product_allowed_units` | 2 |
| `qb_product_classification_outputs` | 4 |
| `qb_product_presentations` | 1 |
| `qb_product_unit_settings` | 5 |
| `qb_receipt_events` | 4 |
| `qb_receipt_lines` | 1 |
| `qb_receipt_orders` | 1 |
| `qb_receipts` | 1 |
| `units_of_measure` | 1 |
| **Total** | **59** |

Usuarios Auth eliminados: 5/5.

## Estado final

Los conteos iniciales y finales coinciden:

- Auth users, perfiles y cuentas: 0;
- categorias, unidades legacy y productos: 0;
- configuracion QB no canonica: 0;
- ingresos, movimientos y snapshots: 0;
- pedidos, preparaciones y entregas: 0;
- recibos, lineas y eventos: 0;
- auditoria: 0;
- ventas, pagos, caja y CxC legacy: 0;
- dimensiones/unidades canonicas: 2/5;
- migraciones local/remoto: 14/14;
- dry-run final: base actualizada;
- residuos: ninguno.

## Confirmaciones

- Migraciones nuevas: no.
- Codigo o migraciones modificados: no.
- Esquema/RLS/grants alterados: no.
- Configuracion Auth modificada permanentemente: no.
- Secretos modificados, impresos o guardados: no.
- `.env.local` modificado: no.
- Deploy: no.
- Produccion o proyectos legacy accedidos: no.
- Commit: no.

## Riesgos y siguiente paso

El flujo de negocio QB-2 a QB-7 ya fue validado en Staging con sesiones reales y rechazos tipados. Siguen pendientes reportes, CSV, UI y verificaciones de codigo por la parada obligatoria.

Siguiente paso exacto: solicitar autorizacion para **QB-9.10.2**, con un run nuevo, reemplazando exclusivamente la comprobacion PostgREST de tablas legacy por conteos administrativos read-only antes/despues. Mantener sin cambios el resto del arnes, la clasificacion de rechazos y la limpieza por UUID. No preparar deploy hasta completar reportes, UI, lint, TypeScript y build.
