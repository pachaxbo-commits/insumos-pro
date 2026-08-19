import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ExcelJS from "exceljs";

import { buildMarketSheetModel } from "../src/lib/market-sheet/model.ts";
import { buildMarketWorkbook } from "../src/lib/market-sheet/workbook.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function order(id, customerKey, customerName, position, status = "solicitado") {
  return {
    id,
    customerKey,
    reference: id.toUpperCase(),
    customerName,
    locationLabel: null,
    customerNotes: "",
    status,
    updatedAt: "2026-08-14T12:00:00.000Z",
    position,
    positionVersion: 1,
    preparationStatus: null,
    deliveryStatus: null,
  };
}

function line(orderId, sourceLabel, requestedQuantity, suffix) {
  return {
    orderItemId: `${orderId}-${suffix}`,
    orderId,
    productId: "lechuga",
    productName: "Lechuga",
    productColor: "#D1FAE5",
    controlsActualWeight: false,
    categoryName: "Verduras",
    sourceLabel,
    baseUnitSymbol: "kg",
    priceUnitSymbol: "kg",
    hasWeightBasedPrice: true,
    requestedQuantity,
    requestedBaseQuantity: requestedQuantity,
    requestedNote: "",
    requestedVersion: 1,
    preparedQuantity: 900,
    preparedBaseQuantity: 900,
    preparationCheck: true,
    preparationActualWeightKg: null,
    preparationNote: "",
    preparationVersion: 1,
    preparedBy: null,
    preparedAt: null,
    externalQuantity: 800,
    deliveredQuantity: 700,
    deliveredBaseQuantity: 700,
    deliveryCheck: true,
    deliveryActualWeightKg: null,
    deliveryNote: "",
    deliveryVersion: 1,
    deliveredBy: null,
    deliveredAt: null,
  };
}

const data = {
  operationalDate: "2026-08-14",
  role: "admin",
  weightUnits: [],
  orders: [
    order("order-a1", "customer-a", "Restaurante A", 1),
    order("order-a2", "customer-a", "Restaurante A", 2),
    order("order-b1", "customer-b", "Restaurante B", 3),
    order("order-cancelled", "customer-c", "Cancelado", 4, "cancelado"),
  ],
  lines: [
    line("order-a1", "kg", 2, "1"),
    line("order-a2", "kg", 3, "2"),
    line("order-a2", "arroba", 1, "3"),
    line("order-b1", "kg", 4, "4"),
    line("order-cancelled", "kg", 99, "5"),
  ],
};

test("the market sheet sums repeated active requests by customer without mixing units", () => {
  const model = buildMarketSheetModel(data);

  assert.deepEqual(
    model.customers.map((customer) => customer.name),
    ["Restaurante A", "Restaurante B"],
  );
  assert.equal(model.rows.length, 2);

  const kilograms = model.rows.find((row) => row.unit === "kg");
  const arrobas = model.rows.find((row) => row.unit === "arroba");
  assert.deepEqual(kilograms?.quantities, [5, 4]);
  assert.equal(kilograms?.total, 9);
  assert.deepEqual(arrobas?.quantities, [1, 0]);
  assert.equal(arrobas?.total, 1);
});

test("the generated file is a real printable Excel workbook", async () => {
  const model = buildMarketSheetModel(data);
  const buffer = await buildMarketWorkbook(model);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet("Compras mercado");
  assert.ok(sheet);
  assert.equal(sheet.getCell("A1").value, "QB INSUMOS · HOJA DE COMPRAS DE MERCADO");
  assert.equal(sheet.getCell("D5").value, "RESTAURANTE A");
  assert.equal(sheet.getCell("E5").value, "RESTAURANTE B");
  assert.equal(sheet.pageSetup.orientation, "landscape");
  assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.match(sheet.pageSetup.printArea, /^A1:F\d+$/);
  assert.equal(sheet.views[0].state, "frozen");
});

test("receipt enhancements stay manual and do not alter order state", async () => {
  const [migration, purchaseCostMigration, actions, deliveryNote, management] = await Promise.all([
    read("supabase/migrations/20260814010000_qb_receipt_manual_tracking.sql"),
    read("supabase/migrations/20260818010000_qb_receipt_purchase_costs.sql"),
    read("src/lib/qb-receipts/actions.ts"),
    read("src/components/qb-receipts/receipt-document.tsx"),
    read("src/components/qb-receipts/qb-receipts-management.tsx"),
  ]);

  assert.match(migration, /payment_status.*pendiente.*pagado/s);
  assert.match(migration, /no crea caja, cobros, pagos ni movimientos financieros/i);
  assert.match(actions, /set_qb_receipt_manual_tracking/);
  assert.match(actions, /set_qb_receipt_purchase_costs/);
  assert.doesNotMatch(actions, /update.*orders|orders.*update/s);
  assert.match(purchaseCostMigration, /purchase_cost_total/);
  assert.match(purchaseCostMigration, /dimension\.code = 'peso'/);
  assert.match(purchaseCostMigration, /no modifica pedidos, entregas, precios de venta ni inventario/i);
  assert.match(deliveryNote, /delivery-note/);
  assert.match(deliveryNote, /line\.deliveredBaseQuantity/);
  assert.match(deliveryNote, /Documento sin precios/);
  assert.match(management, /Historial mensual por cliente/);
  assert.match(management, /Precio base equivalente/);
  assert.match(management, /Precio base anterior/);
  assert.match(management, /Costos de compra y utilidad · solo administración/);
  assert.match(management, /Último costo compra/);
});
