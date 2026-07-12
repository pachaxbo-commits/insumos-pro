# QB-9.3 - Grants SQL y referencias de reportes

## Veredicto

La correccion de grants y de las tres referencias QB-8 queda validada localmente. El sistema completo **requiere una nueva correccion antes de preparar Staging** porque el baseline local vacio no contiene otras columnas base que la aplicacion ya esperaba antes de QB-9.3.

## GRANT y RLS

`GRANT` habilita una operacion SQL sobre una tabla o funcion. RLS decide despues que filas puede usar ese rol. Una politica RLS sin el `GRANT` correspondiente no permite consultar; un `GRANT` sin una politica adecuada puede exponer o mutar datos.

La migracion Fase 23 revoca primero los defaults heredados `TRUNCATE`, `TRIGGER` y `REFERENCES` de `anon`/`authenticated`, y concede solo operaciones requeridas. RLS permanece habilitado en las 21 tablas QB.

## Auditoria y matriz final

`qb_dimensions` no existe en el esquema: el nombre canonico es `qb_unit_dimensions`.

| Objeto | Tipo | Rol | Antes | Final requerido | RLS/politica | Accion Fase 23 |
| --- | --- | --- | --- | --- | --- | --- |
| `qb_unit_dimensions` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE | interno | conceder y restringir SELECT |
| `qb_units` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE | interno | conceder y restringir SELECT |
| `qb_product_unit_settings` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE | interno | conceder; ocultar precio a cliente |
| `qb_product_presentations` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE | interno | conceder y restringir SELECT |
| `qb_product_allowed_units` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE | interno | conceder y restringir SELECT |
| `qb_product_classification_outputs` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE | interno | conceder y restringir SELECT |
| `qb_conversion_snapshots` | tabla | authenticated | sin DML util | SELECT/INSERT | interno | conceder; no UPDATE/DELETE |
| `qb_merchandise_receipts` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE | interno/borrador | conceder |
| `qb_merchandise_receipt_lines` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE | interno/borrador | conceder |
| `qb_merchandise_receipt_classification_results` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE/DELETE | interno/borrador | conceder para Server Action existente |
| `qb_merchandise_receipt_movements` | tabla | authenticated | sin SELECT | SELECT | interno | conceder; insercion queda en RPC |
| `qb_customer_locations` | tabla | authenticated | sin DML util | SELECT/INSERT/UPDATE | propia o interno | conceder segun diseno vigente |
| `qb_orders` | tabla | authenticated | sin SELECT | SELECT | propia o interno | conceder; sin mutacion directa |
| `qb_order_items` | tabla | authenticated | sin SELECT | SELECT | pedido propio o interno | conceder; sin mutacion directa |
| `qb_order_preparations` | tabla | authenticated | sin SELECT | SELECT | interno | conceder; mutacion por RPC |
| `qb_order_preparation_items` | tabla | authenticated | sin SELECT | SELECT | interno | conceder; mutacion por RPC |
| `qb_order_delivery_movements` | tabla | authenticated | sin SELECT | SELECT | interno | conceder; mutacion por RPC |
| `qb_receipts` | tabla | authenticated | sin SELECT | SELECT | interno | conceder; mutacion por RPC |
| `qb_receipt_orders` | tabla | authenticated | sin SELECT | SELECT | interno | conceder; mutacion por RPC |
| `qb_receipt_lines` | tabla | authenticated | sin SELECT | SELECT | interno | conceder; mutacion por RPC |
| `qb_receipt_events` | tabla | authenticated | sin SELECT | SELECT | interno | conceder; mutacion por RPC |
| RPC catalogo | funcion | anon/authenticated | EXECUTE | EXECUTE | SECURITY DEFINER | reafirmar contrato |
| RPC cliente | funcion | authenticated | EXECUTE | EXECUTE | SECURITY DEFINER | reafirmar contrato |
| RPC QB-4/QB-6/QB-7 | funcion | authenticated | EXECUTE | EXECUTE | rol validado en backend | reafirmar contrato |

`service_role` no se modifico: no lo usan los flujos QB normales y las RPC `SECURITY DEFINER` pertenecen a `postgres`, tienen `search_path = public` y validan identidad/rol. No existen secuencias QB.

Se revoco todo acceso `anon/authenticated` a los placeholders legacy de compras, ventas, pagos, caja, CxC y CxP. No se concedio `ALL` ni mutacion directa sobre pedidos, preparacion, entrega o recibos.

## Correcciones QB-8

En `src/lib/reports/data.ts`:

- `location_id` se reemplazo por `customer_location_id` en SELECT y lookup.
- `result_type` se reemplazo por `output_type` en SELECT y filtros.
- `output_label` se reemplazo por `label` en SELECT y presentacion.

Las consultas HTTP locales con esos nombres canonicos respondieron correctamente.

## Validacion

- `db reset`: OK, 12 migraciones desde base vacia.
- E2E QB-2 a QB-7: OK sin ninguna sentencia GRANT temporal.
- Cliente A/B: aislamiento de pedidos e items OK; tablas internas y snapshots ocultos.
- Usuario sin customer account: catalogo OK, pedido bloqueado.
- Inventario: lectura QB-4/QB-5/QB-6 OK; ventas/pagos/caja HTTP 403; emision de recibo bloqueada.
- Administrador: parametrizacion, ingresos, pedidos, clientes y recibos legibles.
- Lint, TypeScript y build: OK.

## Bloqueo nuevo

La consulta real de reportes falla antes de llegar a las referencias corregidas porque el baseline local no define `products.sku`; tampoco define `products.stock_min`, `products.is_catalog_visible` ni `product_categories.is_catalog_visible`, que ya usan reportes, productos e ingresos. `/ingresos` muestra el error de categoria y `/reportes` devuelve su estado seguro.

No se corrigieron esas columnas en QB-9.3 porque la fase autorizaba exclusivamente grants y tres referencias QB-8. CSV real y todas las pestanas de reportes quedan pendientes de un baseline canonico completo.

Adicionalmente, el baseline concede `SELECT` de `products` a cualquier autenticado con una politica `USING (true)`. Como la tabla contiene `purchase_price` y `sale_price`, un cliente puede consultar precios legacy directamente aunque el catalogo QB use una RPC curada. Resolverlo requiere separar la lectura publica de nombres/productos de la lectura interna de costos, sin romper el join de items del portal; queda fuera de la correccion minima QB-9.3.

Al terminar, Docker Desktop dejo de responder. Esto ocurrio despues de `db reset`, E2E, pruebas HTTP/UI y checks de codigo; no se intento reiniciarlo ni cambiar su configuracion.

## Resolucion en QB-9.4

Fase 24 completo el baseline verificado y sustituyo la politica abierta de `products` por politicas limitadas a `admin`, `administrador` e `inventario`. Los clientes externos conservan catalogo por RPC, pero no ven filas ni precios legacy de la tabla.

Las referencias activas a visibilidad 15B se retiraron. Los errores agregados restantes de QB-4/QB-8 se corrigieron contra el esquema real: FK truncada de resultados clasificados y unidad base tomada del snapshot de preparacion. Reset, E2E, reportes, CSV y UI finalizaron OK.
