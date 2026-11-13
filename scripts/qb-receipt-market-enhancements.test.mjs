import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import ExcelJS from "exceljs";

import { baseQuantityAsRequestedUnit, buildMarketSheetModel } from "../src/lib/market-sheet/model.ts";
import { planMarketPreparationWrite } from "../src/lib/market-sheet/preparation-write.ts";
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
    quantityUnits: [{ id: "original", label: sourceLabel, sourceQuantity: 1 }],
    baseUnitId: "unit-kg",
    inventoryBaseUnitId: "unit-kg",
    baseUnitSymbol: "kg",
    priceUnitSymbol: "kg",
    hasWeightBasedPrice: true,
    requestedQuantity,
    requestedBaseQuantity: requestedQuantity * (sourceLabel === "arroba" ? 11.25 : 1),
    requestedConversionValid: true,
    requestedNote: "",
    requestedVersion: 1,
    preparedQuantity: 900,
    preparedBaseQuantity: 900,
    preparationDisplayUnitId: "original",
    preparationCheck: true,
    preparationActualWeightKg: null,
    preparationNote: "",
    preparationVersion: 1,
    preparedBy: null,
    preparedAt: null,
    externalQuantity: 800,
    deliveredQuantity: 0,
    deliveredBaseQuantity: 0,
    deliveryDisplayUnitId: "original",
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
  assert.deepEqual(model.rows[0]?.quantities, [6, 4], "Customer cells preserve their original commercial quantities");
  assert.equal(model.rows[0]?.total, 20.25);
  assert.equal(model.rows[0]?.pendingTotal, 20.25);
  assert.equal(model.rows[0]?.requestedTotal, 20.25);
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
  assert.equal(sheet.getCell("D4").value, "RESTAURANTE A");
  assert.equal(sheet.getCell("F4").value, "RESTAURANTE B");
  assert.equal(sheet.pageSetup.orientation, "landscape");
  assert.equal(sheet.pageSetup.fitToWidth, 0);
  assert.equal(sheet.pageSetup.fitToHeight, 0);
  assert.equal(sheet.pageSetup.printTitlesColumn, "A:C");
  assert.match(sheet.pageSetup.printArea, /^A1:N\d+$/);
  assert.equal(sheet.getCell("M4").value, "PESO / CANT. REAL");
  assert.equal(sheet.getCell("N4").value, "COSTO DE PROVISIÓN (Bs/UD)");
  assert.equal(sheet.getCell("N6").value, null);
  assert.equal(sheet.getCell("M6").value, 3600);
  assert.equal(sheet.getCell("M6").numFmt, '0.###" kg"');
  assert.match(String(sheet.getCell("D6").value), /Solicitado 2 kg · Entregado 0 kg · Pendiente 2 kg/);
  assert.equal(sheet.getCell("E6").value, null);
  assert.match(String(sheet.getCell("F6").value), /Solicitado 4 kg · Entregado 0 kg · Pendiente 4 kg/);
  assert.equal(sheet.getCell("G6").value, null);
  assert.equal(sheet.getCell("D7").value, 1);
  assert.equal(sheet.getCell("E7").value, null);
  assert.equal(sheet.getCell("F7").value, 1);
  assert.equal(sheet.getCell("G7").value, null);
  assert.equal(sheet.getCell("D7").value, 1);
  assert.equal(sheet.getCell("F7").value, 1);
  assert.equal(sheet.getCell("L6").value, 10.25);
  assert.ok(sheet.getCell("D6").border.right?.style);
  assert.ok(sheet.getCell("E6").border.left?.style);
  assert.equal(sheet.views[0].state, "frozen");
  assert.equal(sheet.views[0].xSplit, 3);
  assert.equal(sheet.views[0].ySplit, 5);
  assert.equal(sheet.getColumn(13).width, 16, "Actual measure column remains readable");
  assert.equal(sheet.getColumn(14).width, 20, "Cost column retains its existing width");
  const printStyles = await read("src/app/(private)/matriz-operativa/mercado/market-sheet-table.module.css");
  const tableView = await read("src/app/(private)/matriz-operativa/mercado/market-sheet-table.tsx");
  assert.match(printStyles, /size:\s*landscape/);
  assert.match(printStyles, /break-before:\s*page/);
  assert.match(tableView, /slice\(index \* 2, index \* 2 \+ 2\)/, "Browser print divides customers into readable horizontal pages");
  assert.match(tableView, /Peso real entregado/);
  assert.match(tableView, /Peso preparado/);
});

test("the provision sheet keeps fully delivered, partial, and pending lines for all customers", async () => {
  const multiCustomer = {
    ...data,
    orders: [
      order("day-a", "customer-a", "Cliente A", 1),
      order("day-b", "customer-b", "Cliente B", 2),
      order("day-c", "customer-c", "Cliente C", 3),
    ],
    lines: [
      { ...line("day-a", "UNIDAD", 10, "a"), productId: "tomate", productName: "Tomate", baseUnitId: "kg", inventoryBaseUnitId: "kg", stockCurrent: 4, requestedBaseQuantity: 10, deliveredQuantity: 10, deliveredBaseQuantity: 10 },
      { ...line("day-b", "CAJA", 2, "b"), productId: "tomate", productName: "Tomate", baseUnitId: "kg", inventoryBaseUnitId: "kg", stockCurrent: 4, requestedBaseQuantity: 20, deliveredQuantity: 0.8, deliveredBaseQuantity: 8, deliveryDisplayUnitId: "original" },
      { ...line("day-c", "KG", 5, "c"), productId: "tomate", productName: "Tomate", baseUnitId: "kg", inventoryBaseUnitId: "kg", stockCurrent: 4, requestedBaseQuantity: 5, deliveredQuantity: 0, deliveredBaseQuantity: 0 },
      { ...line("day-a", "KG", 4, "d"), productId: "cebolla", productName: "Cebolla", baseUnitId: "kg", inventoryBaseUnitId: "kg", stockCurrent: 0, requestedBaseQuantity: 4, deliveredQuantity: 4, deliveredBaseQuantity: 4 },
    ],
  };

  const model = buildMarketSheetModel(multiCustomer);
  const tomato = model.rows.find((row) => row.productId === "tomate");
  const onion = model.rows.find((row) => row.productId === "cebolla");
  assert.ok(tomato, "Tomate row remains visible");
  assert.equal(tomato.requestedTotal, 35);
  assert.equal(tomato.deliveredTotal, 18);
  assert.equal(tomato.pendingTotal, 17);
  assert.equal(tomato.toProvision, 13, "Only 17 pending minus 4 stock is provisioned");
  assert.match(tomato.customerLines[0][0].pendingBaseQuantity.toString(), /^0$/);
  assert.equal(tomato.customerLines[1][0].pendingBaseQuantity, 12);
  assert.equal(tomato.customerLines[2][0].pendingBaseQuantity, 5);
  assert.ok(onion, "Fully delivered product is not dropped");
  assert.equal(onion.requestedTotal, 4);
  assert.equal(onion.deliveredTotal, 4);
  assert.equal(onion.pendingTotal, 0);
  assert.equal(onion.toProvision, 0);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildMarketWorkbook(model));
  const sheet = workbook.getWorksheet("Provisiones");
  assert.ok(sheet);
  const onionRow = model.rows.findIndex((row) => row.productId === "cebolla") + 6;
  const summaryStart = 4 + model.customers.length * 2;
  assert.equal(sheet.getCell(onionRow, summaryStart).value, 4);
  assert.equal(sheet.getCell(onionRow, summaryStart + 1).value, 4);
  assert.equal(sheet.getCell(onionRow, summaryStart + 2).value, 0);
  assert.equal(sheet.getCell(onionRow, summaryStart + 4).value, 0);
  assert.match(String(sheet.getCell(`D${onionRow}`).value), /Pendiente 0 kg/);
});

test("different base-unit snapshots remain separate and never reuse the same stock balance", () => {
  const conflict = {
    ...data,
    orders: [
      order("legacy-a", "customer-a", "Cliente A", 1),
      order("legacy-b", "customer-b", "Cliente B", 2),
    ],
    lines: [
      { ...line("legacy-a", "KG", 10, "a"), productId: "mixed", productName: "Producto mixto", baseUnitId: "unit-kg", stockCurrent: 7, requestedBaseQuantity: 10 },
      { ...line("legacy-b", "CUARTILLA", 2, "b"), productId: "mixed", productName: "Producto mixto", baseUnitId: "unit-cuarter", inventoryBaseUnitId: "unit-kg", baseUnitSymbol: "CUARTILLA", stockCurrent: 7, requestedBaseQuantity: 2 },
    ],
  };
  const model = buildMarketSheetModel(conflict);
  const rows = model.rows.filter((row) => row.productId === "mixed");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.unitReviewRequired));
  assert.ok(rows.every((row) => row.stockAvailable === null && row.toProvision === null));
  assert.deepEqual(rows.map((row) => row.requestedTotal), [2, 10]);
});

test("base-unit edits are converted back to each line's captured request unit", () => {
  assert.equal(baseQuantityAsRequestedUnit(1, 0.5, 2), 0.25);
  assert.equal(baseQuantityAsRequestedUnit(2, 1, 2), 1);
  assert.equal(baseQuantityAsRequestedUnit(1, 1, 0), null);
});

test("delivery display units never relabel an original commercial quantity without a verified conversion", () => {
  const displayCases = {
    ...data,
    orders: [
      order("arroba-order", "customer-a", "Cliente A", 1),
      order("pepper-order", "customer-b", "Cliente B", 2),
      order("cuartilla-order", "customer-c", "Cliente C", 3),
    ],
    lines: [
      {
        ...line("arroba-order", "ARROBA", 2, "arroba"),
        productId: "papa",
        productName: "Papa",
        requestedBaseQuantity: 22.5,
        deliveredQuantity: 1,
        deliveredBaseQuantity: 11.25,
        deliveryDisplayUnitId: "unit:unit-kg",
        quantityUnits: [
          { id: "original", label: "ARROBA", sourceQuantity: 1 },
          { id: "unit:unit-kg", label: "KG", sourceQuantity: 1 / 11.25 },
        ],
      },
      {
        ...line("pepper-order", "UNIDAD", 8, "pepper"),
        productId: "pepper",
        productName: "Pimentón",
        controlsActualWeight: true,
        requestedBaseQuantity: 8,
        deliveredQuantity: 8,
        deliveredBaseQuantity: 8,
        deliveryActualWeightKg: 5.443104,
        deliveryActualWeightValue: 12,
        deliveryActualWeightUnitSymbol: "LB",
        deliveryDisplayUnitId: "unit:kg",
        quantityUnits: [
          { id: "original", label: "UNIDAD", sourceQuantity: 1 },
          { id: "unit:kg", label: "KG", sourceQuantity: 1 },
        ],
      },
      {
        ...line("cuartilla-order", "CUARTILLA", 1, "cuartilla"),
        productId: "potato-quarter",
        productName: "Papa por cuartilla",
        requestedBaseQuantity: 0,
        requestedConversionValid: false,
        deliveredQuantity: 0.5,
        deliveredBaseQuantity: 0,
        deliveryDisplayUnitId: "unit:kg-unverified",
      },
      {
        ...line("arroba-order", "ARROBA", 1, "stale-factor"),
        productId: "papa-stale",
        productName: "Papa equivalencia cambiada",
        requestedBaseQuantity: 11.25,
        deliveredQuantity: 1,
        deliveredBaseQuantity: 11.25,
        deliveryDisplayUnitId: "unit:unit-kg",
        quantityUnits: [
          { id: "original", label: "ARROBA", sourceQuantity: 1 },
          { id: "unit:unit-kg", label: "KG", sourceQuantity: 1 / 10 },
        ],
      },
    ],
  };

  const model = buildMarketSheetModel(displayCases);
  const potatoLine = model.rows.find((row) => row.productId === "papa")?.lines[0];
  const pepperLine = model.rows.find((row) => row.productId === "pepper")?.lines[0];
  const quarterLine = model.rows.find((row) => row.productId === "potato-quarter")?.lines[0];
  const staleFactorLine = model.rows.find((row) => row.productId === "papa-stale")?.lines[0];
  assert.ok(potatoLine && pepperLine && quarterLine && staleFactorLine);

  assert.equal(potatoLine.deliveredQuantity, 1, "Stored commercial quantity remains one arroba");
  assert.equal(potatoLine.deliveredDisplayQuantity, 1);
  assert.equal(potatoLine.deliveredUnitLabel, "ARROBA");
  assert.equal(potatoLine.deliveredDisplayWarning, null);
  assert.equal(potatoLine.deliveredBaseQuantity, 11.25);

  assert.equal(pepperLine.deliveredQuantity, 8, "Commercial units stay separate from measured weight");
  assert.equal(pepperLine.deliveredDisplayQuantity, 8);
  assert.equal(pepperLine.deliveredUnitLabel, "UNIDAD");
  assert.equal(pepperLine.deliveredWeightKg, 5.443104);
  assert.equal(pepperLine.deliveredWeightValue, 12);
  assert.equal(pepperLine.deliveredWeightUnitSymbol, "LB");
  assert.equal(pepperLine.deliveredDisplayWarning, null);

  assert.equal(quarterLine.deliveredDisplayQuantity, 0.5);
  assert.equal(quarterLine.deliveredUnitLabel, "CUARTILLA");
  assert.match(quarterLine.deliveredDisplayWarning, /Revisar equivalencia histórica/);
  assert.equal(staleFactorLine.deliveredDisplayQuantity, 1);
  assert.equal(staleFactorLine.deliveredUnitLabel, "ARROBA");
  assert.equal(staleFactorLine.deliveredDisplayWarning, null);

  const originalDisplay = buildMarketSheetModel({
    ...displayCases,
    lines: [{ ...displayCases.lines[0], deliveryDisplayUnitId: "original" }],
    orders: [displayCases.orders[0]],
  }).rows[0]?.lines[0];
  assert.ok(originalDisplay);
  assert.equal(originalDisplay.deliveredQuantity, potatoLine.deliveredQuantity);
  assert.equal(originalDisplay.deliveredBaseQuantity, potatoLine.deliveredBaseQuantity);
  assert.equal(originalDisplay.deliveredDisplayQuantity, 1);
  assert.equal(originalDisplay.deliveredUnitLabel, "ARROBA");

  const workbook = new ExcelJS.Workbook();
  return buildMarketWorkbook(model).then(async (buffer) => {
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Provisiones");
    assert.ok(sheet);
    assert.match(String(sheet.getCell("D6").value), /Entregado 1 ARROBA/);
    const quarterRow = model.rows.findIndex((row) => row.productId === "potato-quarter") + 6;
    assert.match(String(sheet.getCell(`H${quarterRow}`).value), /CUARTILLA/);
    assert.match(String(sheet.getCell(`H${quarterRow}`).value), /Revisar equivalencia histórica/);
    const pepperRow = model.rows.findIndex((row) => row.productId === "pepper") + 6;
    assert.match(String(sheet.getCell(`F${pepperRow}`).value), /Entregado 8 UNIDAD/);
    assert.match(String(sheet.getCell(`F${pepperRow}`).value), /Peso real entregado 12 LB/);
  });
});

test("the Excel actual measure column keeps measured weight separate and labels its unit", async () => {
  const weightData = {
    ...data,
    orders: [order("weight-order", "customer-a", "Cliente A", 1)],
    lines: [{
      ...line("weight-order", "UNIDAD", 8, "weight"),
      controlsActualWeight: true,
      preparationActualWeightKg: 5.443108,
      preparationActualWeightValue: 12,
      preparationActualWeightUnitSymbol: "LB",
      requestedBaseQuantity: 8,
      preparedBaseQuantity: 8,
      deliveredQuantity: 8,
      deliveredBaseQuantity: 8,
      deliveryActualWeightKg: 12,
      deliveryActualWeightValue: 26.455471,
      deliveryActualWeightUnitSymbol: "LB",
    }],
  };
  const model = buildMarketSheetModel(weightData);
  assert.equal(model.rows[0]?.lines[0]?.actualWeightValue, 12);
  assert.equal(model.rows[0]?.lines[0]?.actualWeightUnitSymbol, "LB");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildMarketWorkbook(model));
  const sheet = workbook.getWorksheet("Provisiones");
  assert.ok(sheet);
  assert.equal(sheet.getCell("K4").value, "PESO / CANT. REAL");
  assert.equal(sheet.getCell("K6").value, 5.443108);
  assert.equal(sheet.getCell("K6").numFmt, '0.###" KG normalizado"');
  assert.match(String(sheet.getCell("D6").value), /Peso preparado 12 LB/);
  assert.match(String(sheet.getCell("D6").value), /Peso real entregado 26,455 LB/);
  assert.equal(sheet.getCell("L6").value, null);
});

test("provision edits reject grouped writes and preserve a single preparation line's check, note, and version", async () => {
  const source = line("write-order", "UNIDAD", 8, "write");
  const writeLine = {
    orderItemId: source.orderItemId,
    preparationVersion: 7,
    requestedQuantity: 8,
    requestedBaseQuantity: 8,
    conversionValid: true,
    baseUnitId: "unit-kg",
    inventoryBaseUnitId: "unit-kg",
    preparationDisplayUnitId: "original",
    quantityUnits: [{ id: "original", label: "UNIDAD", sourceQuantity: 1 }],
    preparedQuantity: 8,
    preparationCheck: false,
    preparationNote: "Revisar tamaño antes de salir",
    originPlanConfirmed: false,
    plannedPendingBaseQuantity: 0,
    plannedExternalBaseQuantity: 0,
    plannedReviewBaseQuantity: 0,
  };

  for (const count of [2, 3]) {
    const grouped = Array.from({ length: count }, (_, index) => ({
      ...writeLine,
      orderItemId: `${writeLine.orderItemId}-${index}`,
    }));
    const plan = planMarketPreparationWrite(grouped, false, 4);
    assert.equal(plan.ok, false, `${count} lines are blocked before any RPC write`);
    if (!plan.ok) assert.match(plan.message, /Edita cada línea desde Preparación/);
  }

  const weightPlan = planMarketPreparationWrite([writeLine], true, 2.75);
  assert.equal(weightPlan.ok, false, "the Provision sheet cannot write weight without the original selected unit");
  if (!weightPlan.ok) assert.match(weightPlan.message, /unidad original del peso/);

  const selectedDisplayUnit = "presentation:00000000-0000-4000-8000-000000000111";
  const selectedUnitLine = {
    ...writeLine,
    preparationDisplayUnitId: selectedDisplayUnit,
    quantityUnits: [
      ...writeLine.quantityUnits,
      { id: selectedDisplayUnit, label: "CAJA", sourceQuantity: 4 },
    ],
  };
  const selectedUnitPlan = planMarketPreparationWrite([selectedUnitLine], false, 8);
  assert.equal(selectedUnitPlan.ok, true);
  if (selectedUnitPlan.ok) {
    assert.equal(selectedUnitPlan.params.p_display_unit_id, selectedDisplayUnit);
    assert.equal(selectedUnitPlan.params.p_actual_weight_value, null);
    assert.equal(selectedUnitPlan.params.p_clear_actual_weight, false);
    assert.equal(selectedUnitPlan.params.p_origin_plan_confirmed, writeLine.originPlanConfirmed);
    assert.equal(selectedUnitPlan.params.p_pending_base_quantity, writeLine.plannedPendingBaseQuantity);
    assert.equal(selectedUnitPlan.params.p_note, "Revisar tamaño antes de salir");

    const reloadedModel = buildMarketSheetModel({
      ...data,
      orders: [order("weight-order", "customer-a", "Cliente A", 1)],
      lines: [{
        ...line("weight-order", "UNIDAD", 8, "weight"),
        preparationDisplayUnitId: selectedUnitPlan.params.p_display_unit_id,
        quantityUnits: selectedUnitLine.quantityUnits,
        controlsActualWeight: true,
        preparationActualWeightKg: 2.75,
        preparationActualWeightValue: 12,
        preparationActualWeightUnitSymbol: "LB",
        requestedBaseQuantity: 8,
        preparedQuantity: writeLine.preparedQuantity,
        preparedBaseQuantity: 8,
        preparationCheck: writeLine.preparationCheck,
        preparationNote: writeLine.preparationNote,
      }],
    });
    assert.equal(
      reloadedModel.rows[0]?.lines[0]?.preparationDisplayUnitId,
      selectedDisplayUnit,
      "The selected display unit survives saving and reloading the provision model",
    );
  }

  const invalidDisplayUnitPlan = planMarketPreparationWrite([{
    ...writeLine,
    preparationDisplayUnitId: "presentation:missing-from-current-options",
  }], false, 8);
  assert.equal(invalidDisplayUnitPlan.ok, true);
  if (invalidDisplayUnitPlan.ok) assert.equal(invalidDisplayUnitPlan.params.p_display_unit_id, "original");

  const emptyQuantityPlan = planMarketPreparationWrite([writeLine], false, null);
  assert.equal(emptyQuantityPlan.ok, false, "blank commercial quantity is redirected to the per-line Preparation flow");
  const [action, table, matrixData] = await Promise.all([
    read("src/lib/market-sheet/actions.ts"),
    read("src/app/(private)/matriz-operativa/mercado/market-sheet-table.tsx"),
    read("src/lib/operational-matrix/data.ts"),
  ]);
  const matrixRpc = await read("supabase/migrations/20260723130100_qb_operational_matrix_workflows.sql");
  assert.match(action, /planMarketPreparationWrite\(lines \?\? \[\], controlsActualWeight, actualValue\)/);
  assert.match(action, /save_qb_matrix_preparation_with_check_reset/);
  const actualAction = action.slice(action.indexOf("export async function updateMarketSheetProductActualAction"));
  assert.ok(actualAction.indexOf("if (controlsActualWeight)") < actualAction.indexOf("supabase.rpc("), "weight writes are rejected server-side before RPC");
  assert.ok(actualAction.indexOf("planMarketPreparationWrite(lines ?? [], controlsActualWeight, actualValue)") < actualAction.indexOf("supabase.rpc("), "The grouped-write policy runs before the only RPC call");
  assert.doesNotMatch(actualAction, /for\s*\(/, "The product summary action cannot partially loop over RPC writes");
  assert.match(table, /row\.controlsActualWeight \? \(/);
  assert.match(table, /Edita el peso y su unidad original desde Preparación/);
  assert.match(table, /unidad original no registrada/);
  assert.match(table, /disabled=\{isSavingActual \|\| row\.unitReviewRequired \|\| row\.lines\.length > 1\}/);
  assert.match(table, /Fila agrupada: edita cada pedido desde Preparación/);
  assert.match(action, /\.\.\.plan\.params/);
  assert.match(matrixData, /preparationDisplayUnitId: String\(prep\?\.display_unit_id \?\? "original"\)/);
  assert.match(matrixRpc, /if v_item\.row_version <> p_expected_version then[\s\S]{0,180}QB_MATRIX_CONFLICT/);
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
  assert.match(deliveryNote, /formatReceiptCommercialQuantity\(line\)/);
  assert.match(deliveryNote, /formatReceiptDeliveredBaseQuantity\(line\)/);
  assert.match(deliveryNote, /formatReceiptActualWeight\(line\)/);
  assert.match(deliveryNote, /Documento sin precios/);
  assert.match(management, /function ReceiptCustomerSelector/);
  assert.match(management, /Buscar cliente\.\.\./);
  assert.match(management, /← Volver a clientes/);
  assert.match(management, /<CardTitle>Resumen mensual<\/CardTitle>/);
  assert.match(management, /renderReceipts\(customerReceipts\)/);
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
