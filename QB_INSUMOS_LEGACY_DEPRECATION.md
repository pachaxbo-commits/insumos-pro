# QB Insumos - Deprecacion de legado

## Principio de deprecacion

Nada de esta lista debe borrarse todavia. Primero se debe crear el flujo QB completo, migrar o compatibilizar datos existentes, ocultar UI antigua y recien despues retirar tablas, RPCs, rutas o componentes.

## Contradicciones directas con QB Insumos

### Caja, pagos y finanzas

Tablas:

- `accounts_receivable`
- `accounts_payable`
- `payments`
- `cash_movements`

RPCs:

- `get_finance_status`
- `assert_finance_role`
- `register_customer_payment`
- `register_supplier_payment`
- `register_manual_cash_movement`

Server Actions:

- `registerReceivablePaymentAction`
- `registerPayablePaymentAction`
- `registerManualCashMovementAction`

Rutas/componentes:

- `src/app/(private)/finanzas/page.tsx`
- `src/components/finance/finance-management.tsx`

Motivo: el flujo oficial indica que el cobro se gestiona fuera del sistema y no se debe registrar efectivo, QR, pago mixto, caja, CxC ni CxP.

### Ventas POS/manuales

Tablas:

- `sales`
- `sale_items`

RPCs:

- `create_sale_draft`
- `confirm_sale`
- `cancel_sale_draft`
- `cancel_confirmed_sale`

Server Actions:

- `createSaleAction`
- `confirmSaleAction`
- `cancelSaleAction`
- `cancelConfirmedSaleAction`

Rutas/componentes:

- `src/app/(private)/ventas/page.tsx`
- `src/components/sales/sales-management.tsx`

Motivo: QB Insumos no crea ventas POS ni ventas al preparar. El documento comercial objetivo es un recibo acumulativo no fiscal generado despues de entrega.

### Cotizacion con token y confirmacion de precio por cliente

Tablas:

- `order_confirmation_tokens`
- `order_public_events`

RPCs:

- `issue_public_order_quote`
- `get_public_order_quote`
- `handle_public_order_quote`
- `revoke_public_order_quote`
- `confirm_public_order_manually`
- `adjust_public_order_item_price`

Server Actions:

- `loadPublicOrderQuoteAction`
- `confirmPublicOrderQuoteAction`
- `requestPublicOrderContactAction`
- `issuePublicOrderQuoteAction`
- `revokePublicOrderQuoteAction`
- `confirmPublicOrderManuallyAction`
- `adjustPublicOrderItemPriceAction`

Rutas/componentes:

- `src/app/pedido/confirmar/page.tsx`
- `src/components/orders/public-order-confirmation.tsx`

Motivo: el cliente navega y pide sin precios; no debe confirmar precio por token.

### Catalogo con precios y metodo de pago esperado

Tipos/campos/acciones:

- `PublicCatalogProduct.referencePrice`
- `PUBLIC_EXPECTED_PAYMENT_METHODS`
- `CustomerAccount.defaultPaymentMethod`
- `OrderExpectedPaymentMethod`
- `orders.expected_payment_method`
- `submitPublicOrderAction` cuando captura metodo de pago esperado.

Rutas/componentes:

- `src/app/catalogo/checkout/page.tsx`
- `src/components/catalog/public-checkout.tsx`
- `src/components/catalog/public-catalog.tsx`

Motivo: el catalogo objetivo no muestra precios ni solicita forma de pago.

### Fulfillment actual

Tabla:

- `order_fulfillments`

RPCs:

- `fulfill_confirmed_order`
- `internal_get_or_create_fulfillment`
- `internal_create_order_sale`
- `internal_post_order_sale_inventory`
- `internal_sync_order_sale_financials`
- `internal_register_order_sale_payments`
- `block_order_sale_cancellation_until_15f_f`

Server Action:

- `fulfillConfirmedOrderAction`

Tipos:

- `src/types/fulfillment.ts`

Motivo: el fulfillment actual enlaza pedido con venta, pagos, saldo y caja. QB requiere entrega fisica, descuento de stock por cantidad real y posterior recibo acumulativo sin cobro.

### Compras con pagos

Tablas/campos:

- `purchases.payment_status`
- `purchases.payment_method`
- `purchase_batches.payment_method` por linea
- `purchase_batch.child_purchase_ids` hacia compras clasicas

RPCs:

- `create_purchase_draft`
- `confirm_purchase`
- `cancel_confirmed_purchase`

Motivo: ingresos de mercaderia y costos son utiles, pero el flujo objetivo no debe mezclar costo con cobro ni finanzas operativas.

## Que no debe borrarse todavia

- Tablas historicas de ventas, compras, pagos, caja y cuentas.
- Migraciones existentes.
- `SUPABASE_SCHEMA.sql`, aunque no sea canonico.
- Componentes de UI legado.
- Server Actions y RPCs usadas por rutas existentes.
- Tipos compartidos que aun compilan rutas actuales.
- Datos de clientes, productos, inventario y compras existentes.

## Que debe reemplazarse despues

- Ventas y sale_items por recibos acumulativos no fiscales y lineas de recibo.
- Fulfillment actual por entrega operativa idempotente.
- CxC/CxP/pagos/caja por una referencia externa opcional no contable, solo si el negocio lo pide despues.
- Cotizacion con token por estado interno de preparacion/entrega/recibo.
- Catalogo con precio por catalogo sin precios.
- Compras con pago por ingreso de mercaderia con costo separado.

## Riesgos de compatibilidad

- Ocultar rutas sin reemplazo puede dejar usuarios sin tareas operativas diarias.
- `orders.sale_id` y `order_fulfillments.sale_id` pueden crear dependencias fuertes con ventas.
- `confirm_sale` y `fulfill_confirmed_order` pueden descontar stock en momentos incompatibles con QB.
- `payments` y `cash_movements` pueden estar usados por reportes y dashboard.
- `customers.current_balance`, `credit_limit` y `customer_type` pueden aparecer en filtros, validaciones o UI.
- `SUPABASE_SCHEMA.sql` contiene fases acumuladas y funciones redefinidas; aplicar fuera de orden puede pisar logica mas nueva o reactivar legado.
- Retirar columnas de precio de pedidos/catalogo sin plan puede romper checkout, confirmacion publica y portal cliente.

## Cierre QB-9

QB-9 no elimina legado. Lo deja clasificado para una fase posterior de archivo o retiro.

### Candidatos a eliminacion futura

| Archivo/modulo legacy | Estado QB-9 | Riesgo | Recomendacion |
| --- | --- | --- | --- |
| `src/components/sales/*` | Suspendido | Historicos comerciales pueden requerir consulta | Retirar solo tras archivo historico. |
| `src/lib/sales/*` | Suspendido | Contiene acciones/RPCs de venta y cliente legacy | No invocar desde QB; retirar con pruebas. |
| `src/components/finance/*` | Suspendido | Contiene caja, pagos, CxC y CxP | Mantener congelado hasta decision contable. |
| `src/lib/finance/*` | Suspendido | Puede mutar pagos/caja | Retirar solo con respaldo y aprobacion. |
| `src/components/purchases/*` | Suspendido | Compras mezclan recepcion con pagos/CxP | Reemplazado por ingresos QB. |
| `src/components/purchase-batches/*` | Suspendido | Clasificacion legacy puede crear compras hijas | No usar para QB; conservar historico. |
| `src/components/orders/*` | Suspendido | Pedido legacy usa precios, tokens y confirmacion publica | Reemplazado por pedidos QB. |
| `src/lib/orders/*` | Suspendido | Puede llamar confirmacion/venta legacy | No invocar desde QB. |
| `src/lib/customer-account/*` | Legacy | Conserva default payment/precios de cuenta antigua | El portal QB usa `src/lib/qb-catalog/*`; retirar despues de confirmar no dependencia. |
| `src/types/fulfillment.ts` | Suspendido | Modelo de venta/pagos contradice QB | Retirar cuando legacy compile sin dependencia. |
| `SUPABASE_MIGRATION_FASE_15F_B_FULFILLMENT_FOUNDATION.sql` | No aplicar para QB | Crea puente venta/pagos/caja | Mantener solo como historico. |
| `SUPABASE_MIGRATION_FASE_15F_C_FULFILL_CONFIRMED_ORDER.sql` | No aplicar para QB | `fulfill_confirmed_order` contradice entrega QB | Mantener suspendida. |

### Regla de retiro

Ningun modulo legacy debe eliminarse hasta que:

1. Staging haya sido aprobado.
2. Exista backup verificable.
3. Historicos requeridos esten archivados o accesibles en modo lectura.
4. No existan imports activos desde modulos QB.
5. El cliente apruebe el retiro.
