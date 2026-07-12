# QB Insumos - Migraciones canonicas

## Advertencia

`SUPABASE_SCHEMA.sql` no es esquema canonico. Es un consolidado historico con fases mezcladas, funciones redefinidas y legado financiero. No debe aplicarse como orden de migracion para QB Insumos.

QB-9 no aplico SQL. Este documento define el orden recomendado para PostgreSQL local aislado y, luego de validacion, Staging.

## Precondicion obligatoria

Antes de aplicar cualquier migracion QB debe existir un baseline real y consistente del sistema actual con:

- `profiles`;
- `products`;
- `product_categories`;
- `units_of_measure`;
- `inventory_movements`;
- `customers`;
- tablas financieras legacy si se conservaran historicos;
- funciones compartidas como `set_current_timestamp_updated_at()`.

Ese baseline debe provenir de migraciones originales verificadas o backup controlado, no de `SUPABASE_SCHEMA.sql` aplicado a ciegas.

## Orden canonico recomendado

| Orden | Archivo | Fase | Estado | Depende de | Redefine funciones | Riesgo si se aplica fuera de orden | Aplicar en Staging |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 0 | Baseline verificado pre-12A | Base | Requerido | Proyecto actual | Si | Sin baseline faltan tablas base. | Si, ya existente o restaurado. |
| 1 | `SUPABASE_MIGRATION_FASE_12A_SECURITY.sql` | 12A | Base seguridad | Baseline | `current_user_role`, `admin_update_profile` | Roles/RLS pueden fallar. | Si falta en Staging. |
| 2 | `SUPABASE_MIGRATION_FASE_12C_USERS_AUDIT.sql` | 12C | Base auditoria | 12A | `admin_update_profile` | Puede pisar version previa. | Si falta en Staging. |
| 3 | `SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql` | 12D | Legacy historico | ventas/compras/finanzas | `cancel_confirmed_sale`, `cancel_confirmed_purchase` | No aplicar despues de 14D.1 si revierte precision. | Solo si Staging requiere historico legacy y antes de 14D.1. |
| 4 | `SUPABASE_MIGRATION_FASE_13_ORDERS.sql` | 13 | Legacy pedidos | ventas/inventario | `create_order`, `prepare_order_item`, `confirm_prepared_order`, `cancel_order` | No aplicar despues de 15D; pisa seguridad de pedidos. | Solo si falta base legacy. |
| 5 | `SUPABASE_MIGRATION_FASE_14B_PURCHASE_BATCHES.sql` | 14B | Legacy lotes | productos/compras | No relevante | Base de lotes legacy. | Solo si falta base legacy. |
| 6 | `SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql` | 14C | Legacy confirmacion lotes | 14B | `confirm_purchase_batch` | No aplicar despues de 14D/14D.1; pisa clasificacion. | No si ya se usara 14D.1. |
| 7 | `SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql` | 14D | Legacy clasificacion compras | 14B/14C | `save_purchase_batch_line_classification`, `confirm_purchase_batch` | No aplicar despues de 14D.1; pierde precision/endurecimiento. | No si se aplica 14D.1. |
| 8 | `SUPABASE_MIGRATION_FASE_14D_1_PRECISION_INTEGRITY.sql` | 14D.1 | Ultima version legacy precision | 14D | `register_inventory_movement`, `create_purchase_draft`, `create_sale_draft`, `confirm_sale`, cancelaciones, clasificacion, `confirm_purchase_batch` | Debe ir despues de 12D/14C/14D. | Solo si se conserva legacy base y antes de QB. |
| 9 | `SUPABASE_MIGRATION_FASE_15B_PUBLIC_CATALOG.sql` | 15B | Legacy catalogo | productos | `get_public_catalog` | Catalogo legacy con referencias de precio; no usar para QB. | Solo si falta dependencia historica. |
| 10 | `SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql` | 15C | Legacy checkout | 13/15B | `create_public_catalog_order`, `link_public_order_customer` | No aplicar despues de 15D; pisa seguridad. | No para flujo QB nuevo. |
| 11 | `SUPABASE_MIGRATION_FASE_15D_SECURE_ORDER_CONFIRMATION.sql` | 15D | Legacy cotizacion segura | 15C | `prepare_order_item`, `confirm_prepared_order`, `handle_public_order_quote`, `cancel_order` | Debe ir despues de 15C si se conserva; contradice QB cliente. | Solo historico; no activar UI. |
| 12 | `SUPABASE_MIGRATION_FASE_15E_CUSTOMER_ACCOUNTS.sql` | 15E | Cuenta cliente base | 15C/15D opcional | `handle_new_user`, `update_own_customer_account`, `get_my_customer_orders` | Necesaria para `customer_accounts`; contiene elementos legacy. | Si falta `customer_accounts`. |
| 13 | `SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql` | 15F-B | Fulfillment legacy | 13/15D/ventas | `internal_*fulfillment*`, pagos/caja | Contradice QB; crea base venta/pago/caja. | **No aplicar para QB** salvo historico aislado. |
| 14 | `SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql` | 15F-C | Fulfillment legacy | 15F-B | `fulfill_confirmed_order` | Contradice QB: venta, inventario, pagos y caja desde fulfillment. | **No aplicar para QB**. |
| 15 | `SUPABASE_MIGRATION_FASE_16_QB2_UNITS_PRESENTATIONS.sql` | QB-2 | Canonico QB | baseline + profiles/products | No | Base de unidades/snapshots. | Si. |
| 16 | `SUPABASE_MIGRATION_FASE_17_QB3_PRODUCT_CONFIGURATION.sql` | QB-3 | Canonico QB | QB-2 | No | Requiere `qb_product_unit_settings`. | Si. |
| 17 | `SUPABASE_MIGRATION_FASE_18_QB4_MERCHANDISE_RECEIPTS.sql` | QB-4 | Canonico QB | QB-2/QB-3/inventory | `confirm_qb_merchandise_receipt` | Requiere unidades permitidas recepcion. | Si. |
| 18 | `SUPABASE_MIGRATION_FASE_19_QB5_CUSTOMER_CATALOG_ORDERS.sql` | QB-5 | Canonico QB | QB-3/customer_accounts | `update_qb_customer_profile`, `create_qb_catalog_order`, `get_qb_public_catalog` | Debe ir antes de QB-6; crea `qb_orders`. | Si. |
| 19 | `SUPABASE_MIGRATION_FASE_20_QB6_ORDER_PREPARATION_DELIVERY.sql` | QB-6 | Canonico QB | QB-5/QB-4 | Redefine `get_qb_public_catalog`, crea preparacion/entrega RPCs | Debe ir despues de QB-5 para excluir merma/loss. | Si. |
| 20 | `SUPABASE_MIGRATION_FASE_21_QB7_ACCUMULATED_RECEIPTS.sql` | QB-7 | Canonico QB | QB-6 | `qb_compound_unit_price`, `create_qb_receipt_draft`, `update_qb_receipt_draft`, `emit_qb_receipt`, `void_qb_receipt` | Debe ir despues de QB-6 por estados y entregas. | Si. |
| 21 | Sin migracion | QB-8 | UI/consultas | QB-2 a QB-7 | No | Reportes fallan si tablas QB no existen o si sus consultas no coinciden con el esquema. | No aplica. |
| 22 | `SUPABASE_MIGRATION_FASE_22_QB9_2_SNAPSHOT_ACTOR_FIX.sql` | QB-9.2 | Canonico QB | QB-2/QB-5/QB-6 | `set_qb_conversion_snapshot_actor` | Debe ir despues de todos los creadores actuales de snapshots. | Solo despues de corregir grants/reportes y repetir local. |
| 23 | `SUPABASE_MIGRATION_FASE_23_QB9_3_GRANTS_REPORT_FIX.sql` | QB-9.3 | Canonico QB | QB-2 a QB-9.2 | No | Debe ir despues de crear todos los objetos QB; fija grants minimos y endurece lectura. | Solo despues de completar baseline local. |
| 24 | Sin migracion | QB-9 | Cierre tecnico | QB-8/QB-9.3 | No | Documental; no altera DB. | No aplica. |

## Migraciones que NO deben aplicarse ahora

- `SUPABASE_SCHEMA.sql`: nunca como canonico.
- `SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql`: crea estructura de fulfillment legacy que enlaza ventas, pagos, caja y CxC.
- `SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql`: `fulfill_confirmed_order` contradice QB porque puede crear venta, pago, caja y movimientos fuera de entrega QB.
- `SUPABASE_MIGRATION_FASE_15C_PUBLIC_CHECKOUT.sql` despues de 15D: puede sobrescribir seguridad de pedidos publicos.
- `SUPABASE_MIGRATION_FASE_13_ORDERS.sql` despues de 15D: puede reponer RPCs de pedido legacy sin seguridad posterior.
- `SUPABASE_MIGRATION_FASE_14C_CONFIRM_PURCHASE_BATCHES.sql` o `SUPABASE_MIGRATION_FASE_14D_PURCHASE_CLASSIFICATION.sql` despues de 14D.1: pueden pisar precision e integridad.
- `SUPABASE_MIGRATION_FASE_12D_SAFE_CANCELLATIONS.sql` despues de 14D.1: puede dejar cancelaciones/constraints en version anterior.

## Dependencias QB-2 a QB-7

```text
QB-2 unidades/snapshots
-> QB-3 productos QB y unidades permitidas
-> QB-4 ingresos y clasificacion
-> QB-5 catalogo, cuenta cliente y pedidos QB
-> QB-6 preparacion, entrega y stock
-> QB-7 recibos acumulativos
-> QB-8 reportes de solo lectura
-> QB-9.2 actor dual de snapshots
-> QB-9.3 grants minimos y referencias QB-8
```

## Hallazgos QB-9.2 pendientes

- Las migraciones QB crean politicas RLS, pero no conceden los privilegios SQL operativos correspondientes a `authenticated`; en la base local `qb_orders` carece de `SELECT`, por lo que el portal no puede leer pedidos propios aunque la politica RLS sea correcta.
- `src/lib/reports/data.ts` consulta `qb_orders.location_id`, pero el esquema define `customer_location_id`.
- El mismo reporte consulta `result_type` y `output_label`, pero QB-4 define `output_type` y `label`.
- Estos defectos deben corregirse mediante una migracion aditiva de grants y un bugfix QB-8 revisado antes de preparar Staging.

## Resultado QB-9.3

Fase 23 corrige los grants y las referencias `customer_location_id`, `output_type` y `label`. El E2E pasa sin grants temporales. Staging sigue bloqueado porque el baseline local vacio no incluye otras columnas base usadas por la aplicacion (`products.sku`, `stock_min`, `is_catalog_visible` y `product_categories.is_catalog_visible`).

## Plan para Staging

1. Congelar rama y artefactos locales.
2. Hacer backup verificable de Staging.
3. Confirmar migraciones ya aplicadas en Staging.
4. No aplicar `SUPABASE_SCHEMA.sql`.
5. Aplicar solo diferencias canonicas en orden.
6. Detener ante primer error SQL.
7. Ejecutar pruebas de humo y checklist manual.
8. Si falla, restaurar backup o revertir por snapshot, no improvisar parches sobre datos reales.

## Criterio de aprobacion

Staging solo se considera aprobado cuando:

- migraciones QB-2 a QB-7 aplican sin error;
- catalogo no muestra precios;
- pedido no crea venta/pago/caja;
- preparacion no mueve stock;
- entrega descuenta stock una sola vez;
- recibo no mueve stock ni crea cobro;
- reportes no mutan datos;
- modulos legacy permanecen suspendidos.

## Resultado QB-9.4

Se agrega como migracion canonica numero 13:

`20260712091300_qb9_4_baseline_product_access_fix.sql`

La migracion:

- agrega solo campos base verificados de producto y auditoria;
- no agrega las columnas de visibilidad del catalogo legacy 15B;
- restringe lectura de productos/categorias/unidades a roles internos mediante RLS;
- mantiene el catalogo externo exclusivamente en `get_qb_public_catalog()`;
- no concede mutacion directa de inventario ni toca modulos financieros legacy.

El reset desde base vacia y el E2E completo pasaron. El set local queda listo para preparar el diff de Staging, sujeto a backup e inventario de migraciones aplicadas.

## Resultado QB-9.5

Se agrega como migracion canonica numero 14:

`20260712091400_qb9_5_service_role_contract.sql`

Contrato final:

- `profiles`: service role `SELECT, INSERT`;
- `audit_logs`: service role `INSERT`;
- `customer_accounts`: service role `INSERT`;
- ningun privilegio de tabla service role fuera de esos objetos;
- RPC legacy de vinculacion publica sin `EXECUTE`;
- RLS y grants de `anon/authenticated` sin cambios.

`db reset`, E2E y prueba REST/Admin Auth pasaron localmente. El orden canonico queda preparado para comparacion, no para aplicacion ciega sobre Staging.
