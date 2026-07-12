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
| 21 | Sin migracion | QB-8 | UI/consultas | QB-2 a QB-7 | No | Reportes fallan si tablas QB no existen. | No aplica. |
| 22 | Sin migracion | QB-9 | Cierre tecnico | QB-8 | No | Documental; no altera DB. | No aplica. |

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
```

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
