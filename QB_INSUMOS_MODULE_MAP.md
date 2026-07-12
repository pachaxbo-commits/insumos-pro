# QB Insumos - Mapa de modulos actuales

## Criterios

- `Conservar`: puede sostener el diseno objetivo con ajustes menores o de rotulo.
- `Redisenar`: tiene base util, pero su contrato funcional contradice o queda corto para QB Insumos.
- `Ocultar`: no debe estar visible en la experiencia objetivo, aunque pueda mantenerse por compatibilidad.
- `Retirar al final`: candidato a eliminacion cuando datos, dependencias y reemplazos esten listos.

## Mapa de rutas y componentes

| Modulo actual | Rutas/componentes | Decision | Motivo |
| --- | --- | --- | --- |
| Inicio QB | `src/app/(private)/page.tsx`, `src/components/qb-insumos/qb-transition-home.tsx`, `src/lib/reports/data.ts` | Conservar | QB-8 muestra resumen operativo de pedidos, preparacion, entregas pendientes de recibo, recibos, ingresos e inventario sin ventas, pagos, caja ni CxC/CxP. |
| Productos | `src/app/(private)/productos/page.tsx`, `src/app/(private)/parametrizacion/page.tsx`, `src/components/products/*`, `src/lib/products/*`, `src/types/products.ts` | Conservar/redisenar | Base util para catalogo, precio base y clasificacion; QB-2/QB-3 separa parametrizacion, unidades universales, presentaciones, precio base QB y clasificacion futura sin activar operaciones. |
| Ingresos QB | `src/app/(private)/ingresos/page.tsx`, `src/components/qb-ingresos/*`, `src/lib/qb-ingresos/*`, `src/types/qb-ingresos.ts` | Conservar | Modulo QB-4 nuevo para recepcion fisica y clasificacion opcional separado de compras, pagos, CxP y finanzas. |
| Inventario | `src/app/(private)/inventario/page.tsx`, `src/components/inventory/inventory-management.tsx`, `src/lib/inventory/*`, `src/types/inventory.ts` | Conservar/redisenar | Ya registra movimientos y 3 decimales; QB-4 lo actualiza con entradas de ingresos QB y QB-6 con salidas por entrega fisica. |
| Compras | `src/app/(private)/compras/page.tsx`, `src/components/purchases/*`, `src/lib/purchases/*`, `src/types/purchases.ts` | Redisenar | Gestiona proveedor, pago y compra clasica; QB necesita ingresos de mercaderia sin mezclar costo con recibos o cobros. |
| Lotes de compra | `src/app/(private)/compras/multiple/page.tsx`, `src/components/purchase-batches/*`, `src/lib/purchase-batches/*`, `src/types/purchase-batches.ts` | Conservar/redisenar | Es la base mas cercana para ingresos y clasificacion opcional; debe incorporar unidades/presentaciones/snapshots y reglas anti duplicacion. |
| Clientes | `src/app/(private)/clientes/page.tsx`, `src/components/sales/customer-management.tsx`, `src/lib/sales/actions.ts`, `src/types/sales.ts` | Redisenar | Reutilizable para datos de cliente; contiene tipo credito, saldo y deuda que no pertenecen al flujo QB. |
| Cuenta cliente QB | `src/app/mi-cuenta/*`, `src/components/customer-account/*`, `src/lib/qb-catalog/*`, `src/types/qb-catalog.ts` | Conservar | QB-5 reutiliza autenticacion/customer_accounts y agrega ubicaciones, historial, repeticion y frecuentes sin pagos ni precios. |
| Catalogo QB | `src/app/catalogo/*`, `src/components/catalog/*`, `src/lib/qb-catalog/*`, `src/types/qb-catalog.ts` | Conservar | QB-5 reemplaza la pantalla suspendida por catalogo sin precios, usando RPC publica curada y unidades permitidas para `pedido`. |
| Pedidos QB | `src/app/(private)/pedidos/page.tsx`, `src/components/qb-orders/*`, `src/lib/qb-orders/*`, `src/types/qb-orders.ts` | Conservar | QB-6 opera preparacion y entrega fisica de pedidos QB, con descuento de stock solo al entregar y sin venta, cobro, recibo ni fulfillment. |
| Recibos QB | `src/app/(private)/recibos/page.tsx`, `src/app/(private)/recibos/[id]/page.tsx`, `src/components/qb-receipts/*`, `src/lib/qb-receipts/*`, `src/types/qb-receipts.ts` | Conservar | QB-7 emite recibos acumulativos no fiscales posteriores a entrega, sin cobro, caja, CxC/CxP, venta ni movimiento de stock. |
| Pedidos legacy | `src/components/orders/orders-management.tsx`, `src/lib/orders/*`, `src/types/orders.ts` | Ocultar/redisenar | Mantiene cotizacion, precio visible, pago esperado, confirmacion cliente y fulfillment; no se usa en QB-5. |
| Confirmacion publica de pedido | `src/app/pedido/confirmar/page.tsx`, `src/components/orders/public-order-confirmation.tsx`, `src/lib/orders/public-actions.ts` | Ocultar/retirar al final | Corresponde a cotizacion con token y confirmacion de precio, modulo marcado como legado. |
| Fulfillment actual | `src/types/fulfillment.ts`, RPCs 15F, acciones `fulfillConfirmedOrderAction` | Ocultar/redisenar | Crea venta, pagos y sincronizacion financiera antes del momento correcto para QB. |
| Ventas POS/manuales | `src/app/(private)/ventas/page.tsx`, `src/components/sales/sales-management.tsx`, `src/lib/sales/*`, `src/types/sales.ts` | Ocultar/retirar al final | El flujo objetivo no registra ventas POS ni venta antes de recibo acumulativo. |
| Finanzas | `src/app/(private)/finanzas/page.tsx`, `src/components/finance/finance-management.tsx`, `src/lib/finance/*`, `src/types/finance.ts` | Ocultar/retirar al final | Gestiona CxC, CxP, pagos y caja; todo queda fuera del flujo QB. |
| Proveedores | `src/app/(private)/proveedores/page.tsx`, `src/components/purchases/supplier-management.tsx` | Conservar/redisenar | Puede apoyar ingresos de mercaderia, pero no debe conducir a pagos/CxP. |
| Reportes QB | `src/app/(private)/reportes/page.tsx`, `src/components/reports/*`, `src/lib/reports/*`, `src/types/reports.ts` | Conservar | QB-8 reemplaza reportes legacy por inventario, ingresos, pedidos/preparacion, pendientes de recibo, recibos, frecuentes y auditoria operativa sin ventas, pagos, caja, CxC/CxP, compras legacy ni fulfillment. |
| Cierre tecnico QB-9 | `QB_INSUMOS_QB9_CIERRE_TECNICO.md`, `QB_INSUMOS_MIGRACIONES_CANONICAS.md`, `QB_INSUMOS_PLAN_PRUEBAS_STAGING.md`, `QB_INSUMOS_CHECKLIST_ENTREGA_CLIENTE.md` | Solo documentacion | Cierra auditoria local, orden canonico, plan de pruebas local/Staging y checklist cliente sin agregar funcionalidad ni SQL. |
| Configuracion/admin usuarios | `src/app/(private)/configuracion/page.tsx`, `src/components/admin/*`, `src/lib/admin-users/*`, `src/lib/auth/*` | Conservar/redisenar | Base util para parametros, usuarios y roles; los roles deben alinearse a QB. |
| Auditoria | `src/lib/audit/*`, `src/types/audit.ts` | Conservar | Necesaria para trazabilidad de descuentos, recibos, precios y conversiones. |

## Mapa de base de datos local

| Area | Tablas/RPCs actuales | Decision |
| --- | --- | --- |
| Autenticacion y perfiles | `profiles`, `customer_accounts`, `admin_update_profile`, `update_own_customer_account`, `get_my_customer_orders` | Conservar/redisenar para roles QB y multiples ubicaciones. |
| Productos/catalogo | `product_categories`, `units_of_measure`, `products`, `qb_units`, `qb_product_unit_settings`, `qb_product_presentations`, `qb_product_allowed_units`, `qb_product_classification_outputs`, `get_public_catalog` | Redisenar para catalogo sin precios; QB-2/QB-3 ya prepara unidades universales, presentaciones, precio base y clasificacion futura sin exponer catalogo. |
| Ingresos QB | `qb_merchandise_receipts`, `qb_merchandise_receipt_lines`, `qb_merchandise_receipt_classification_results`, `qb_merchandise_receipt_movements`, `confirm_qb_merchandise_receipt` | Conservar | QB-4 registra ingresos fisicos con snapshots, clasificacion opcional y movimientos de inventario sin compras legacy ni pagos. |
| Inventario | `inventory_movements`, `register_inventory_movement` | Conservar/redisenar con idempotencia de entrega y snapshots de conversion. |
| Compras clasicas | `suppliers`, `purchases`, `purchase_items`, `create_purchase_draft`, `confirm_purchase`, `cancel_purchase_draft` | Redisenar hacia ingresos de mercaderia; aislar pago/costo. |
| Lotes/clasificacion | `purchase_batches`, `purchase_batch_lines`, `purchase_batch_line_classifications`, `purchase_batch_classification_results`, `save_purchase_batch_line_classification`, `confirm_purchase_batch` | Conservar/redisenar como base de ingreso y clasificacion opcional. |
| Clientes | `customers` | Conservar/redisenar; retirar saldos, credito y campos financieros del flujo principal. |
| Pedidos QB | `qb_orders`, `qb_order_items`, `qb_customer_locations`, `qb_order_preparations`, `qb_order_preparation_items`, `qb_order_delivery_movements`, `create_qb_catalog_order`, `get_qb_public_catalog`, `start_qb_order_preparation`, `save_qb_order_preparation`, `confirm_qb_order_delivery`, `cancel_qb_order_before_delivery` | Conservar | QB-6 guarda preparacion real y entrega idempotente sin precios, ventas, pagos, recibos ni fulfillment. |
| Recibos QB | `qb_receipts`, `qb_receipt_orders`, `qb_receipt_lines`, `qb_receipt_events`, `create_qb_receipt_draft`, `update_qb_receipt_draft`, `emit_qb_receipt`, `void_qb_receipt` | Conservar | QB-7 agrupa pedidos entregados en recibos no fiscales, con factores compuestos y sin cobro, caja, CxC/CxP, venta ni stock. |
| Reportes QB | `products`, `inventory_movements`, `qb_merchandise_*`, `qb_orders`, `qb_order_items`, `qb_order_preparations`, `qb_order_preparation_items`, `qb_order_delivery_movements`, `qb_receipts`, `qb_receipt_orders`, `qb_receipt_lines`, `qb_receipt_events` | Conservar | QB-8 consulta tablas operativas QB existentes en modo solo lectura. No crea vistas, tablas ni funciones nuevas. |
| Pedidos legacy | `orders`, `order_items`, `create_order`, `prepare_order_item`, `confirm_prepared_order`, `cancel_order` | Ocultar/redisenar | Estados, precios, pagos/cotizaciones y preparacion legacy no se usan en QB-5. |
| Catalogo checkout legacy | `public_order_submission_attempts`, `create_public_catalog_order`, `link_public_order_customer` | Ocultar/redisenar | Evitar precio visible, metodo de pago y flujo invitado anterior. |
| Cotizacion token | `order_confirmation_tokens`, `order_public_events`, `issue_public_order_quote`, `get_public_order_quote`, `handle_public_order_quote`, `revoke_public_order_quote` | Ocultar/retirar al final. |
| Fulfillment venta | `order_fulfillments`, `fulfill_confirmed_order`, `internal_create_order_sale`, `internal_post_order_sale_inventory`, `internal_sync_order_sale_financials`, `internal_register_order_sale_payments` | Redisenar/reemplazar; contradice QB. |
| Ventas | `sales`, `sale_items`, `create_sale_draft`, `confirm_sale`, `cancel_sale_draft`, `cancel_confirmed_sale` | Ocultar/retirar al final; reemplazar por recibos acumulativos no fiscales. |
| Finanzas/caja | `accounts_receivable`, `accounts_payable`, `payments`, `cash_movements`, `register_customer_payment`, `register_supplier_payment`, `register_manual_cash_movement`, `get_finance_status` | Ocultar/retirar al final. |
| Auditoria | `audit_logs` | Conservar y ampliar. |

## Dependencias tecnicas relevantes

- `src/lib/navigation.ts` muestra modulos que deberan ocultarse o reordenarse: Ventas, Finanzas, Proveedores, Reportes.
- `src/types/catalog.ts` contiene `referencePrice` y `PUBLIC_EXPECTED_PAYMENT_METHODS`; ambos contradicen el catalogo sin precios.
- `src/types/orders.ts` contiene `payment_type`, `estimated_total`, `final_total`, `expected_payment_method`, `quote_version` y confirmacion cliente; deben salir del flujo cliente QB.
- `src/types/fulfillment.ts` modela venta y pagos dentro de fulfillment; debe reemplazarse por entrega y recibo acumulativo.
- `SUPABASE_SCHEMA.sql` es un agregado historico con funciones repetidas y fases mezcladas; no debe tratarse como esquema canonico.
