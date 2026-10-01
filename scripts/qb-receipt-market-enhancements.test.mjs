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
    stockCurrent: 10,
    productColor: "#D1FAE5",
    controlsActualWeight: false,
    categoryName: "Verduras",
    sourceLabel,
    baseUnitSymbol: "kg",
    priceUnitSymbol: "kg",
    hasWeightBasedPrice: true,
    requestedQuantity,
    requestedBaseQuantity: requestedQuantity * (sourceLabel === "arroba" ? 11.25 : 1),
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
    deliveredQuantity: 0,
    deliveredBaseQuantity: 0,
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

test("the provision sheet consolidates presentations in base units", () => {
  const model = buildMarketSheetModel(data);

  assert.deepEqual(
    model.customers.map((customer) => customer.name),
    ["Restaurante A", "Restaurante B"],
  );
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0]?.unit, "kg");
  assert.deepEqual(model.rows[0]?.quantities, [16.25, 4]);
  assert.equal(model.rows[0]?.total, 20.25);
  assert.equal(model.rows[0]?.stockCurrent, 10);
  assert.equal(model.rows[0]?.reserved, 20.25);
  assert.deepEqual(model.customerLineCounts, [1, 1]);
  assert.equal(model.totalLineCount, 2);
});

test("the generated file is a real printable Excel workbook", async () => {
  const model = buildMarketSheetModel(data);
  const buffer = await buildMarketWorkbook(model);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet("Provisiones");
  assert.ok(sheet);
  assert.equal(sheet.getCell("A1").value, "QB INSUMOS · HOJA DE PROVISIÓN");
  assert.equal(sheet.getCell("D5").value, "RESTAURANTE A");
  assert.equal(sheet.getCell("E5").value, "RESTAURANTE B");
  assert.equal(sheet.pageSetup.orientation, "landscape");
  assert.equal(sheet.pageSetup.fitToWidth, 1);
  assert.match(sheet.pageSetup.printArea, /^A1:K\d+$/);
  assert.equal(sheet.getCell("K5").value, "PRECIO COMPRA (Bs/UD)");
  assert.equal(sheet.getCell("K6").value, null);
  assert.equal(sheet.getCell("D7").value, 1);
  assert.equal(sheet.getCell("E7").value, 1);
  assert.equal(sheet.getCell("F7").value, 2);
  assert.equal(sheet.getCell("J6").value, 10.25);
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
  assert.match(management, /Tabla solicitada · Costos de compra y utilidad/);
  assert.match(management, /Último costo compra/);
  assert.doesNotMatch(management, /Las 2 tablas solicitadas|Tabla 1 ·|Tabla 2 ·/);
  assert.match(management, /TabsTrigger value="costos"/);
  assert.match(management, /No es un error de precio: falta definir la unidad/);
  assert.match(management, /Primero corrige la unidad del producto/);
  assert.doesNotMatch(management, /<summary[^>]*>Agregar notas/);
  assert.doesNotMatch(management, /<summary[^>]*>[\s\S]*Ajustes porcentuales del recibo/);
  assert.ok(
    management.indexOf("Ajustes porcentuales del recibo") <
      management.indexOf("Define cuánto se cobrará"),
  );
  assert.ok(
    management.indexOf("Define cuánto se cobrará") <
      management.indexOf("Notas del recibo"),
  );
});

test("actual-weight receipt lines keep their pricing unit without becoming amount orders", async () => {
  const [amountContract, weightPricing, compatibilityFix] = await Promise.all([
    read("supabase/migrations/20260712093100_qb_pilot_stock_amount_contract.sql"),
    read("supabase/migrations/20260812010000_qb_actual_weight_unit_and_pricing.sql"),
    read("supabase/migrations/20260819010000_qb_receipt_actual_weight_unit_contract.sql"),
  ]);

  assert.match(weightPricing, /new\.pricing_unit_id := v_price_unit_id/);
  assert.match(
    amountContract,
    /order_input_mode = 'quantity'[\s\S]*pricing_unit_id is null/,
  );
  assert.match(
    compatibilityFix,
    /order_input_mode = 'quantity'[\s\S]*requested_amount_bs is null[\s\S]*currency_snapshot is null[\s\S]*estimated_base_quantity is null[\s\S]*fixed_line_amount is null/,
  );
  const quantityBranch = compatibilityFix.match(
    /order_input_mode = 'quantity'[\s\S]*?\)\s*or/,
  )?.[0];
  assert.ok(quantityBranch);
  assert.doesNotMatch(quantityBranch, /pricing_unit_id is null/);
  assert.match(
    compatibilityFix,
    /order_input_mode = 'amount_bs'[\s\S]*pricing_unit_id is not null/,
  );
  assert.match(compatibilityFix, /no debe violar el contrato monetario/i);
});
