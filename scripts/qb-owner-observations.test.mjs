import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { purchaseTotal, autoReferencePriceFromPurchaseUnit } from "../src/lib/warehouse-purchases/model.ts";
import { summarizeReceiptTracking } from "../src/lib/qb-receipts/line-pricing.ts";
import { costPerBaseUnitFromReference, costPerReferenceUnitFromBase } from "../src/lib/market-sheet/model.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const purchaseSheet = read("../src/app/(private)/ingresos/compras-almacen/warehouse-purchase-table.tsx");
const purchaseActions = read("../src/lib/qb-ingresos/actions.ts");
const warehousePurchaseActions = read("../src/lib/warehouse-purchases/actions.ts");
const creator = read("../src/components/qb-orders/internal-order-creator.tsx");
const provisionPage = read("../src/app/(private)/matriz-operativa/mercado/page.tsx");
const deliveryActions = read("../src/lib/operational-matrix/actions.ts");
const matrix = read("../src/components/operational-matrix/operational-matrix.tsx");
const receipts = read("../src/components/qb-receipts/qb-receipts-management.tsx");
const kardexData = read("../src/lib/inventory/kardex-data.ts");
const kardexView = read("../src/components/stock/stock-workspace.tsx");
const kardexExcel = read("../src/app/api/stock/kardex.xlsx/route.ts");

test("purchase by commercial CARGA keeps commercial total independent from measured stock", () => {
  assert.equal(purchaseTotal(5, 600), 3000);
  const measuredPhysicalKg = 75;
  assert.equal(measuredPhysicalKg, 75);
  assert.equal(autoReferencePriceFromPurchaseUnit(600, { label: "CARGA", dimensionId: "weight", factorToBase: 1 }, { dimensionId: "weight", factorToBase: 1 }), null);
  assert.match(purchaseSheet, /Presentación comercial sin equivalencia/);
  assert.match(purchaseSheet, /CARGA, SACO o CAJA/);
  assert.match(purchaseSheet, /Guardar borrador/);
  assert.match(purchaseSheet, /name="effective_quantity"/);
  assert.match(purchaseActions, /create_qb_warehouse_purchase_draft/);
  assert.match(warehousePurchaseActions, /confirm_qb_warehouse_purchase_draft/);
});

test("selected order products are a live alphabetical view of the submitted line state", () => {
  assert.match(creator, /Ver seleccionados/);
  assert.match(creator, /Dialog open=\{cartOpen\}/);
  assert.match(creator, /Carrito · Productos seleccionados/);
  assert.match(creator, /h-\[min\(82dvh,44rem\)\]/);
  assert.match(creator, /sm:w-\[min\(32rem,100vw\)\]/);
  assert.match(creator, /const selectedLinesAlphabetical = useMemo/);
  assert.match(creator, /localeCompare\([\s\S]*?"es"/);
  assert.match(creator, /selectedLinesAlphabetical\.map/);
  assert.match(creator, /lines\.map/);
  assert.match(creator, /onClick=\{\(\) => toggleProduct\(line\.productId\)\}/);
  assert.match(creator, /returnToSelectedProduct\(line\.productId\)/);
  assert.match(creator, /focusProductAfterCartCloseRef/);
  assert.match(creator, /onCloseAutoFocus=\{\(event\) =>/);
  assert.doesNotMatch(creator, /selected-order-products/);
  assert.match(creator, /onKeyDown=\{\(event\) => \{\s*if \(event\.key === "Enter"\) event\.preventDefault\(\);/);
});

test("provision link opens the date-specific sheet and route reports data failures", () => {
  const matrixPage = read("../src/app/(private)/matriz-operativa/page.tsx");
  const marketButton = read("../src/components/operational-matrix/market-sheet-actions.tsx");
  assert.match(matrixPage, /MarketSheetActions date=\{date\}/);
  assert.match(marketButton, /matriz-operativa\/mercado\?date=/);
  assert.match(provisionPage, /getOperationalMatrixData\(date, auth\.user\.role\)/);
  assert.match(provisionPage, /No se pudo cargar la Hoja de Provisión/);
  assert.match(provisionPage, /No hay pedidos solicitados para esta fecha/);
});

test("delivery denial reports product and available quantity while server stock guard remains", () => {
  assert.match(deliveryActions, /QB_STOCK_INSUFFICIENT/);
  assert.match(deliveryActions, /prepared_base_quantity_snapshot/);
  assert.match(deliveryActions, /stock_current/);
  assert.match(deliveryActions, /Stock insuficiente para/);
  assert.match(read("../supabase/migrations/20261007140000_qb_nonnegative_warehouse_delivery.sql"), /if v_stock_before < v_line\.prepared_base_quantity_snapshot/);
});

test("origin choices explain their inventory effect and same-day rule", () => {
  assert.match(matrix, /Origen de la mercadería · este pedido/);
  assert.match(matrix, /warehouse: "Todos los productos entregados en este pedido salen del almacén\. Al confirmar, se descuenta únicamente la cantidad realmente entregada/);
  assert.match(matrix, /pending: "La mercadería se entregó físicamente, pero su ingreso al almacén todavía no está registrado\./);
  assert.match(matrix, /external: "La mercadería se compró directamente por fuera para ese cliente\. Se registra la entrega normalmente, sin descontar inventario\./);
  assert.match(matrix, /<option value="warehouse">Desde almacén<\/option>/);
  assert.match(matrix, /<option value="pending">Ingreso pendiente de hoy<\/option>/);
  assert.match(matrix, /<option value="external">Venta externa<\/option>/);
  assert.match(matrix, /Origen mixto/);
  assert.match(matrix, /Antes de confirmar la entrega, indica de dónde salió la mercadería\./);
});

test("receipt summary counts sending and payment state without inventing ledger movements", () => {
  const counts = summarizeReceiptTracking([
    { receiptSentAt: "2026-10-01T12:00:00Z", paymentStatus: "pagado" },
    { receiptSentAt: null, paymentStatus: "pendiente" },
    { receiptSentAt: "2026-10-03T12:00:00Z", paymentStatus: "cobrado" },
  ]);
  assert.deepEqual(counts, { sent: 2, pendingSend: 1, paid: 2, pendingPayment: 1 });
  assert.match(receipts, /Enviados/);
  assert.match(receipts, /No enviados/);
  assert.match(receipts, /Pagados/);
  assert.match(receipts, /Pendientes de pago/);
  assert.match(receipts, /Control informativo y manual; no registra caja/);
  assert.match(receipts, /positive: "border-emerald-200 bg-emerald-50 text-emerald-800"/);
  assert.match(receipts, /negative: "border-rose-200 bg-rose-50 text-rose-800"/);
  assert.match(receipts, /pending: "border-amber-200 bg-amber-50 text-amber-900"/);
  assert.match(receipts, /"enviado", "enviados", "positive"/);
  assert.match(receipts, /"no enviado", "no enviados", "negative"/);
  assert.match(receipts, /"pagado", "pagados", "positive"/);
  assert.match(receipts, /"pendiente de pago", "pendientes de pago", "pending"/);
});

test("delivery exposes preparation review separately from physical delivery and confirms beside its order", () => {
  assert.match(matrix, /✓ Revisado en Preparación/);
  assert.match(matrix, /Entrega física verificada/);
  assert.match(matrix, /Confirmar entrega · \{order\.reference\}/);
  assert.match(matrix, /id="delivery-order-select"[\s\S]*Confirmar · \{selectedConfirmationOrder\.reference\}/);
  assert.match(matrix, /Origen · \{selectedConfirmationOrder\.customerName\} · \{selectedConfirmationOrder\.reference\}/);
  assert.match(matrix, /orderFormStatus\(order\)/);
  assert.match(matrix, /aria-label="Origen de la mercadería · este pedido"|Origen de la mercadería · este pedido/);
  assert.match(matrix, /checked=\{stage === "preparacion" \? line\.preparationCheck : line\.deliveryCheck\}/);
  assert.match(matrix, /else updateMissingDeliveryChecks\(\[line\], checked\)/);
  assert.match(matrix, /!line\.deliverySourceConfirmed \|\| line\.deliveryVersion === 0/);
  assert.match(matrix, /✓ Pedido entregado/);
  assert.match(matrix, /touch-pan-x overflow-x-auto overflow-y-clip overscroll-x-contain/);
  assert.match(matrix, /sticky top-0 z-40/);
  assert.match(matrix, /sticky left-0 z-30/);
});

test("provision cost input makes its physical base unit explicit", () => {
  const market = read("../src/app/(private)/matriz-operativa/mercado/market-sheet-table.tsx");
  assert.match(market, /COSTO DE PROVISIÓN POR UNIDAD FÍSICA/);
  assert.match(market, /se guarda por \{row\.unit\}/);
  assert.match(market, /Unidad de referencia del costo/);
  assert.match(market, /Costo de provisión en bolivianos por/);
  const perKg = costPerBaseUnitFromReference(760, 11.25, 1);
  assert.equal(perKg, 67.55555556);
  assert.ok(Math.abs(costPerReferenceUnitFromBase(perKg, 11.25, 1) - 760) < 0.000001);
});

test("WhatsApp fallback opens its final URL directly, without an about:blank placeholder", () => {
  const imageActions = read("../src/components/qb-receipts/receipt-image-actions.tsx");
  assert.doesNotMatch(imageActions, /window\.open\(["']about:blank/);
  assert.match(imageActions, /window\.open\(whatsappUrl, "_blank"\)/);
});

test("Kardex attributes real delivery movements to order snapshot customer in screen and Excel", () => {
  assert.match(kardexData, /qb_order_delivery_movements/);
  assert.match(kardexData, /customer_snapshot/);
  assert.match(kardexData, /customer_name:/);
  assert.match(kardexView, /Cliente \/ pedido/);
  assert.match(kardexView, /row\.attributions\.map/);
  assert.match(kardexView, /row\.attribution_ambiguous/);
  assert.match(kardexExcel, /Cliente \/ pedido/);
  assert.match(kardexExcel, /row\.attributions\.map/);
  assert.match(kardexExcel, /row\.attribution_ambiguous/);
  assert.doesNotMatch(kardexData, /responsible_name|customer_account_id/);
  assert.doesNotMatch(kardexData, /sale_price|purchase_price|profit|margin/);
});
