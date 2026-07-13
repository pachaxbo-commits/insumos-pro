# QB-9.10.2 - Validacion final focalizada de Staging

Fecha: 2026-07-12

## Veredicto

**E2E FALLO, LIMPIEZA COMPLETA.**

La validacion completo el fixture minimo, las consultas focalizadas de reportes y las cuatro exportaciones CSV. Se detuvo al intentar iniciar Next.js desde el proceso Node del arnes: Windows devolvio `spawn EINVAL` antes de que existiera un servidor o se solicitara una ruta UI.

No se reintento ni se cambio el mecanismo durante el run. Se ejecuto inmediatamente la limpieza completa. UI, lint, TypeScript y build no se ejecutaron por la regla de parada.

## Preflight

- Proyecto: `qb-insumos-staging-v2`.
- Project ref: `tekfwbhvqtojpfqusosg`.
- Rama: `main`.
- Git: limpio.
- Migraciones: 14 local / 14 remoto.
- Dry-run: `Remote database is up to date`.
- Datos operativos iniciales: 0.
- Usuarios Auth iniciales: 0.
- Dimensiones/unidades canonicas: 2/5.

## Run

- Run ID: `qb9_10_2_20260712_224033_a1455249`.
- Usuarios ficticios: administrador, inventario y cliente.
- Datos: exclusivamente ficticios e identificados por run ID.
- Recibo usado para reportes: emitido y despues anulado.
- Estado final del pedido durante el fixture: `entregado_pendiente_recibo`.
- Stock Papa grande durante el fixture: 658.125 kg.

## Fixture

Resultado: **PASS**.

- ingreso: 10 cargas = 1125 kg;
- clasificacion: 675/225/225 kg;
- pedido: 2 arrobas = 22.5 kg;
- preparacion parcial: 1.5 arrobas = 16.875 kg;
- entrega: 16.875 kg;
- stock posterior: 658.125 kg;
- recibo: base 100 y factores 5/7/5/7;
- precio almacenado: 126.2252;
- recibo emitido y anulado para conservar historico y pendiente de recibo.

## Legacy read-only

Se uso exclusivamente el canal administrativo con:

- `BEGIN READ ONLY`;
- `statement_timeout = 10s`;
- `lock_timeout = 2s`;
- consultas agregadas `COUNT(*)`;
- `ROLLBACK`.

Conteos iniciales y finales:

| Modulo legacy | Inicial | Final |
| --- | ---: | ---: |
| Ventas | 0 | 0 |
| Pagos | 0 | 0 |
| Caja | 0 | 0 |
| CxC | 0 | 0 |
| CxP | 0 | 0 |

La limpieza no ejecuto DELETE sobre esos modulos. El fixture no produjo efectos legacy.

## Reportes

Las consultas focalizadas con sesion real de administrador devolvieron datos del run sin errores de columnas:

| Reporte | Resultado | Filas |
| --- | --- | ---: |
| Resumen | PASS | 4 |
| Inventario | PASS | 4 |
| Ingresos | PASS | 1 |
| Pedidos | PASS | 1 |
| Preparacion | PASS | 1 |
| Entregas | PASS | 1 |
| Pendientes de recibo | PASS | 1 |
| Recibos | PASS | 1 |
| Productos frecuentes | PASS | 1 |
| Auditoria | PASS | 2 |

Nivel de evidencia: consultas de tablas y columnas utilizadas por el modulo. La ruta real `/reportes` no pudo validarse porque Next no llego a iniciar. Por ello no se declara aprobada la representacion visual de los reportes.

## CSV

Se generaron temporalmente las cuatro exportaciones existentes en `buildExports`:

| CSV | Resultado | Filas |
| --- | --- | ---: |
| Inventario | PASS | 4 |
| Pedidos | PASS | 1 |
| Pendientes de recibo | PASS | 1 |
| Recibos | PASS | 1 |

Se validaron los encabezados canonicos, UTF-8 con BOM, cantidades, estados, run ID y ausencia de claves, tokens, contrasenas, efectivo, metodos de pago, QR, caja, CxC y CxP.

Nivel de evidencia: contenido generado con los encabezados y registros definidos por el modulo. No se acciono el boton del navegador porque la UI no inicio.

## UI

Resultado: **UNEXPECTED_FAILURE antes de la primera ruta**.

```text
spawn EINVAL
```

El error fue local al intentar crear `npx.cmd` mediante `child_process.spawn` desde Node en Windows. No hubo servidor Next, exposicion de claves, peticiones de navegador ni proceso residual.

No validados:

- login/logout;
- middleware y redirecciones;
- rutas de administrador;
- rutas de inventario;
- rutas de cliente;
- `/reportes` real;
- navegacion movil;
- presentacion visual y ausencia de errores visibles.

## Verificaciones de codigo

Por la parada obligatoria:

- lint: no ejecutado;
- TypeScript: no ejecutado;
- build: no ejecutado.

## Limpieza

La limpieza uso UUID exactos, conteos previos y una sola transaccion. No uso `TRUNCATE`, comodines ni filtros por nombre/fecha.

| Tabla | Filas eliminadas |
| --- | ---: |
| `audit_logs` | 2 |
| `customer_accounts` | 1 |
| `inventory_movements` | 4 |
| `product_categories` | 1 |
| `products` | 4 |
| `profiles` | 2 |
| `qb_conversion_snapshots` | 3 |
| `qb_customer_locations` | 1 |
| `qb_merchandise_receipt_classification_results` | 4 |
| `qb_merchandise_receipt_lines` | 1 |
| `qb_merchandise_receipt_movements` | 4 |
| `qb_merchandise_receipts` | 1 |
| `qb_order_delivery_movements` | 1 |
| `qb_order_items` | 1 |
| `qb_order_preparation_items` | 1 |
| `qb_order_preparations` | 1 |
| `qb_orders` | 1 |
| `qb_product_allowed_units` | 2 |
| `qb_product_classification_outputs` | 4 |
| `qb_product_presentations` | 1 |
| `qb_product_unit_settings` | 4 |
| `qb_receipt_events` | 4 |
| `qb_receipt_lines` | 1 |
| `qb_receipt_orders` | 1 |
| `qb_receipts` | 1 |
| `units_of_measure` | 1 |
| **Total** | **52** |

Usuarios Auth eliminados: 3/3.

## Estado final

- usuarios Auth: 0;
- perfiles, cuentas, productos y configuracion no canonica: 0;
- ingresos, movimientos y snapshots: 0;
- pedidos, preparaciones y entregas: 0;
- recibos, lineas y eventos: 0;
- auditoria: 0;
- legacy financiero: 0;
- dimensiones/unidades canonicas: 2/5;
- dry-run final: base actualizada;
- residuos: ninguno.

## Confirmaciones

- Codigo o migraciones modificados: no.
- Migraciones nuevas: no.
- Esquema, RLS o grants alterados: no.
- Auth permanente modificado: no.
- Secretos modificados, impresos o guardados: no.
- Archivos `.env` modificados: no.
- Deploy: no.
- Proyectos legacy accedidos: no.
- Commit: no.

## Recomendacion

Solicitar una autorizacion final **QB-9.10.3**, limitada a UI y verificaciones de codigo. El servidor Next debe iniciarse desde PowerShell con variables de proceso antes del verificador Node, evitando `child_process.spawn` de `npx.cmd`. El run debera recrear solo el fixture necesario para rutas, limpiar al terminar y ejecutar lint, TypeScript y build si la UI pasa.

No preparar deploy hasta completar esa evidencia.
