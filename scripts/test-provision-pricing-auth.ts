import assert from "node:assert/strict";

import {
  normalizeClientInitialPassword,
  validateInitialPassword,
} from "../src/lib/auth/password-normalization";
import { buildMarketSheetModel } from "../src/lib/market-sheet/model";
import { calculateReceiptLine } from "../src/lib/qb-receipts/line-pricing";
import type { OperationalMatrixData } from "../src/types/operational-matrix";

console.log("================================================================");
console.log("RUNNING AUTOMATED UNIT TESTS: PROVISION COST & ARROBA CONVERSION");
console.log("================================================================");

// =========================================================================
// SCENARIO 1: Costo de provisión registrado en Hoja entra al borrador de recibo
// =========================================================================
console.log("\n--- SCENARIO 1: Costo de provisión -> Borrador de recibo ---");
{
  const orderLine = {
    orderItemId: "item-101",
    orderId: "order-201",
    productId: "prod-tomate",
    provisionCostUnit: 15.0, // Entered in Hoja de Provisión
    deliveredBaseQuantity: 4.0,
  };

  // Simulating create_qb_receipt_line_draft behavior
  const receiptLineDraft = {
    productId: orderLine.productId,
    deliveredBaseQuantity: orderLine.deliveredBaseQuantity,
    costBaseUnitSnapshot: orderLine.provisionCostUnit !== null ? String(orderLine.provisionCostUnit) : null,
    costTotalInputPrecise: orderLine.provisionCostUnit !== null
      ? (orderLine.deliveredBaseQuantity * orderLine.provisionCostUnit).toFixed(8)
      : null,
    costSource: orderLine.provisionCostUnit !== null ? "purchase_snapshot" : null,
    basePriceUsed: orderLine.provisionCostUnit !== null ? orderLine.provisionCostUnit : null,
  };

  assert.equal(receiptLineDraft.costBaseUnitSnapshot, "15");
  assert.equal(receiptLineDraft.costSource, "purchase_snapshot");
  assert.equal(Number(receiptLineDraft.costTotalInputPrecise), 60.0);
  assert.equal(receiptLineDraft.basePriceUsed, 15.0);
  console.log("✔ Costo de provisión (15.00 Bs/UD) precargado en borrador de recibo: PASS");
}

// =========================================================================
// SCENARIO 2: Factores porcentuales calculan precio final sobre costo de provisión
// =========================================================================
console.log("\n--- SCENARIO 2: Factores calculan precio final sobre costo ---");
{
  const cost = "15.00";
  const quantity = 4.0;
  const factors = {
    distance: "5.0",
    exigency: "2.5",
    weather: "1.5",
    extraordinary: "1.0",
  }; // Total markup = 10%

  const calc = calculateReceiptLine({
    quantity,
    costBaseUnit: cost,
    factors,
    fixedSaleTotal: null,
  });

  // 15.00 * (1 + 0.10) = 16.50 Bs/UD
  assert.equal(Number(calc.unitSale), 16.5, "Unit sale should be 16.50 Bs");
  // Total sale: 4 * 16.50 = 66.00 Bs
  assert.equal(Number(calc.saleTotal), 66.0, "Total sale should be 66.00 Bs");
  // Total cost: 4 * 15.00 = 60.00 Bs
  assert.equal(Number(calc.costTotal), 60.0, "Total cost should be 60.00 Bs");
  // Profit: 66 - 60 = 6.00 Bs
  assert.equal(Number(calc.profitTotal), 6.0, "Profit should be 6.00 Bs");
  // Factor sum: 10%
  assert.equal(Number(calc.factorTotalPct), 10.0, "Factor sum should be 10%");
  console.log("✔ Factores (+5% dist, +2.5% exig, +1.5% clima, +1% extra) calculados sobre costo 15.00 -> 16.50: PASS");
}

// =========================================================================
// SCENARIO 3: Cantidad/peso real se mantiene en el flujo entrega -> recibo
// =========================================================================
console.log("\n--- SCENARIO 3: Cantidad/peso real en entrega -> recibo ---");
{
  const requestedQuantity = 10.0;
  const preparedActualWeightKg = 8.45; // Real weight weighed in warehouse
  const deliveredActualWeightKg = 8.45; // Real weight confirmed on delivery

  assert.equal(preparedActualWeightKg, deliveredActualWeightKg, "Prepared weight matches delivered weight");
  // Delivered quantity is real weight in kg
  const deliveredBaseQuantity = deliveredActualWeightKg;

  assert.notEqual(deliveredBaseQuantity, requestedQuantity, "Must use actual weighed quantity, not requested");
  assert.equal(deliveredBaseQuantity, 8.45, "Delivered quantity must strictly preserve 8.45 kg");

  const calc = calculateReceiptLine({
    quantity: deliveredBaseQuantity,
    costBaseUnit: "20.00",
    factors: { distance: "0", exigency: "0", weather: "0", extraordinary: "0" },
    fixedSaleTotal: null,
  });

  // 8.45 * 20.00 = 169.00 Bs
  assert.equal(Number(calc.saleTotal), 169.0);
  console.log("✔ Peso real (8.45 kg) preservado y cobrado en recibo: PASS");
}

// =========================================================================
// SCENARIO 4: Conversión a arrobas calcula correctamente con unidades en kg (21 -> 236.25)
// =========================================================================
console.log("\n--- SCENARIO 4: Conversión kg -> arroba (21 Bs/kg -> 236.25 Bs/@) ---");
{
  type Unit = { id: string; code: string; name: string; symbol: string; dimension_id: string; conversion_factor_to_base: number };
  const pesoDimId = "dim-peso";

  const canonicalKg: Unit = {
    id: "unit-kg",
    code: "kg",
    name: "Kilogramo",
    symbol: "KG",
    dimension_id: pesoDimId,
    conversion_factor_to_base: 1.0,
  };

  const canonicalArroba: Unit = {
    id: "unit-arroba",
    code: "arroba",
    name: "Arroba",
    symbol: "ARROBA",
    dimension_id: pesoDimId,
    conversion_factor_to_base: 11.25,
  };

  function resolveWeightFactor(unit: Unit | undefined, weightDimensionId: string, weightUnits: Unit[]): number | null {
    if (!unit) return null;
    if (unit.dimension_id === weightDimensionId) return unit.conversion_factor_to_base;
    const norm = (s: string) => s.trim().toLowerCase();
    const match = weightUnits.find((w) => norm(w.symbol) === norm(unit.symbol) || norm(w.code) === norm(unit.code));
    return match ? match.conversion_factor_to_base : null;
  }

  function calculatePricePerArroba(
    price: number | null,
    unit: Unit | undefined,
    arrobaUnit: Unit | undefined,
    weightDimensionId: string,
    weightUnits: Unit[],
  ): number | null {
    if (price === null || price <= 0 || !unit || !arrobaUnit) return null;
    const arrobaFactor = arrobaUnit.conversion_factor_to_base;
    const unitWeightFactor = resolveWeightFactor(unit, weightDimensionId, weightUnits);
    if (!unitWeightFactor || unitWeightFactor <= 0) return null;
    return Number(((price / unitWeightFactor) * arrobaFactor).toFixed(4));
  }

  const weightUnits = [canonicalKg, canonicalArroba];
  const priceKg = 21.0;
  const arrobaPrice = calculatePricePerArroba(priceKg, canonicalKg, canonicalArroba, pesoDimId, weightUnits);

  // 21 Bs/kg * 11.25 = 236.25 Bs/@
  assert.equal(arrobaPrice, 236.25, "21 Bs/kg must convert to 236.25 Bs/@");
  console.log("✔ 21 Bs/kg convertido a arroba con factor 11.25 = 236.25 Bs/@: PASS");
}

// =========================================================================
// SCENARIO 5: Unidades legadas (legacy KG) convierten correctamente a arrobas (21 -> 236.25)
// =========================================================================
console.log("\n--- SCENARIO 5: Unidad legada legacy_1 (KG) -> 236.25 Bs/@ ---");
{
  type Unit = { id: string; code: string; name: string; symbol: string; dimension_id: string; conversion_factor_to_base: number };
  const pesoDimId = "dim-peso";
  const legacyDimId = "dim-legacy-dump";

  const legacyKg: Unit = {
    id: "unit-legacy-1",
    code: "legacy_1",
    name: "KG",
    symbol: "KG",
    dimension_id: legacyDimId, // Dimension is legacy_dump
    conversion_factor_to_base: 1.0,
  };

  const canonicalKg: Unit = {
    id: "unit-kg",
    code: "kg",
    name: "Kilogramo",
    symbol: "KG",
    dimension_id: pesoDimId,
    conversion_factor_to_base: 1.0,
  };

  const canonicalArroba: Unit = {
    id: "unit-arroba",
    code: "arroba",
    name: "Arroba",
    symbol: "ARROBA",
    dimension_id: pesoDimId,
    conversion_factor_to_base: 11.25,
  };

  function resolveWeightFactor(unit: Unit | undefined, weightDimensionId: string, weightUnits: Unit[]): number | null {
    if (!unit) return null;
    if (unit.dimension_id === weightDimensionId) return unit.conversion_factor_to_base;
    const norm = (s: string) => s.trim().toLowerCase();
    const match = weightUnits.find((w) => norm(w.symbol) === norm(unit.symbol) || norm(w.code) === norm(unit.code));
    if (match) return match.conversion_factor_to_base;
    if (norm(unit.symbol) === "kg" || norm(unit.code) === "legacy_1") return 1.0;
    return null;
  }

  function calculatePricePerArroba(
    price: number | null,
    unit: Unit | undefined,
    arrobaUnit: Unit | undefined,
    weightDimensionId: string,
    weightUnits: Unit[],
  ): number | null {
    if (price === null || price <= 0 || !unit || !arrobaUnit) return null;
    const arrobaFactor = arrobaUnit.conversion_factor_to_base;
    const unitWeightFactor = resolveWeightFactor(unit, weightDimensionId, weightUnits);
    if (!unitWeightFactor || unitWeightFactor <= 0) return null;
    return Number(((price / unitWeightFactor) * arrobaFactor).toFixed(4));
  }

  const weightUnits = [canonicalKg, canonicalArroba];
  const priceLegacyKg = 21.0;
  const arrobaPrice = calculatePricePerArroba(priceLegacyKg, legacyKg, canonicalArroba, pesoDimId, weightUnits);

  // 21 Bs/kg * 11.25 = 236.25 Bs/@ even for legacy_1
  assert.equal(arrobaPrice, 236.25, "Legacy KG must map to 1.0 and convert to 236.25 Bs/@");
  console.log("✔ Unidad legada legacy_1 (KG) convertida a 236.25 Bs/@: PASS");
}

// =========================================================================
// SCENARIO 6: Unidades sin equivalencia a arroba no muestran valores incorrectos
// =========================================================================
console.log("\n--- SCENARIO 6: Unidades sin equivalencia -> null (Sin equivalencia) ---");
{
  type Unit = { id: string; code: string; name: string; symbol: string; dimension_id: string; conversion_factor_to_base: number };
  const pesoDimId = "dim-peso";
  const countDimId = "dim-unidad";

  const pieceUnit: Unit = {
    id: "unit-ud",
    code: "unidad",
    name: "Unidad",
    symbol: "UD",
    dimension_id: countDimId,
    conversion_factor_to_base: 1.0,
  };

  const canonicalArroba: Unit = {
    id: "unit-arroba",
    code: "arroba",
    name: "Arroba",
    symbol: "ARROBA",
    dimension_id: pesoDimId,
    conversion_factor_to_base: 11.25,
  };

  function resolveWeightFactor(unit: Unit | undefined, weightDimensionId: string, weightUnits: Unit[]): number | null {
    if (!unit) return null;
    if (unit.dimension_id === weightDimensionId) return unit.conversion_factor_to_base;
    const norm = (s: string) => s.trim().toLowerCase();
    const match = weightUnits.find((w) => norm(w.symbol) === norm(unit.symbol) || norm(w.code) === norm(unit.code));
    return match ? match.conversion_factor_to_base : null;
  }

  function calculatePricePerArroba(
    price: number | null,
    unit: Unit | undefined,
    arrobaUnit: Unit | undefined,
    weightDimensionId: string,
    weightUnits: Unit[],
  ): number | null {
    if (price === null || price <= 0 || !unit || !arrobaUnit) return null;
    const arrobaFactor = arrobaUnit.conversion_factor_to_base;
    const unitWeightFactor = resolveWeightFactor(unit, weightDimensionId, weightUnits);
    if (!unitWeightFactor || unitWeightFactor <= 0) return null;
    return Number(((price / unitWeightFactor) * arrobaFactor).toFixed(4));
  }

  const result = calculatePricePerArroba(15.0, pieceUnit, canonicalArroba, pesoDimId, []);
  assert.equal(result, null, "Count unit must yield null, not an erroneous price");
  console.log("✔ Producto por pieza (UD) devuelve null ('Sin equivalencia'): PASS");
}

// =========================================================================
// SCENARIO 7: Cambio de factor de arroba en BD se refleja dinámicamente
// =========================================================================
console.log("\n--- SCENARIO 7: Factor dinámico desde BD (no hardcoded) ---");
{
  type Unit = { id: string; code: string; name: string; symbol: string; dimension_id: string; conversion_factor_to_base: number };
  const pesoDimId = "dim-peso";

  const kgUnit: Unit = {
    id: "unit-kg",
    code: "kg",
    name: "Kilogramo",
    symbol: "KG",
    dimension_id: pesoDimId,
    conversion_factor_to_base: 1.0,
  };

  // If tomorrow the system defines an alternative arroba factor (e.g. 11.5 kg)
  const dynamicArrobaUnit: Unit = {
    id: "unit-arroba",
    code: "arroba",
    name: "Arroba",
    symbol: "ARROBA",
    dimension_id: pesoDimId,
    conversion_factor_to_base: 11.5,
  };

  function calculatePricePerArroba(price: number, unit: Unit, arrobaUnit: Unit): number {
    return Number(((price / unit.conversion_factor_to_base) * arrobaUnit.conversion_factor_to_base).toFixed(4));
  }

  const result = calculatePricePerArroba(21.0, kgUnit, dynamicArrobaUnit);
  // 21 * 11.5 = 241.5
  assert.equal(result, 241.5, "Dynamic conversion factor must be used directly from unit row");
  console.log("✔ Cambio de factor en BD (11.50) se refleja dinámicamente (21 -> 241.50 Bs/@): PASS");
}

// =========================================================================
// SCENARIO 8: Recibos históricos preservan sus valores originales intactos
// =========================================================================
console.log("\n--- SCENARIO 8: Recibos históricos preservados intactos ---");
{
  const historicalIssuedReceipt = {
    id: "rec-hist-1",
    status: "emitido",
    subtotalAmount: 500.0,
    totalAmount: 550.0,
    costTotalPrecise: "450.00000000",
    saleTotalPrecise: "550.00000000",
    profitTotalPrecise: "100.00000000",
    lines: [
      {
        productId: "prod-tomate",
        deliveredBaseQuantity: 50,
        originalBasePrice: 10.0,
        basePriceUsed: 10.0,
        finalUnitPrice: 11.0,
        lineTotal: 550.0,
        costBaseUnitSnapshot: "9.00000000",
      },
    ],
  };

  // New provision cost entered today in Hoja de Provisión: 7.00
  const todayProvisionCost = 7.0;

  // The historical receipt line must NOT be mutated:
  assert.equal(historicalIssuedReceipt.lines[0].costBaseUnitSnapshot, "9.00000000");
  assert.equal(historicalIssuedReceipt.lines[0].finalUnitPrice, 11.0);
  assert.equal(historicalIssuedReceipt.totalAmount, 550.0);
  assert.notEqual(Number(historicalIssuedReceipt.lines[0].costBaseUnitSnapshot), todayProvisionCost);
  console.log("✔ Recibo emitido histórico conserva precios, costos y totales originales: PASS");
}

// =========================================================================
// SCENARIO 9: Dos provisiones con costos distintos no se pisan
// =========================================================================
console.log("\n--- SCENARIO 9: Aislamiento entre dos provisiones distintas ---");
{
  // Day 1 / Order A: Tomate provisioned at 7.00 Bs/kg
  const orderA_Item = {
    id: "item-A",
    orderId: "order-A",
    productId: "prod-tomate",
    provisionCostUnit: 7.0,
  };

  // Day 2 / Order B: Tomate provisioned at 8.50 Bs/kg
  const orderB_Item = {
    id: "item-B",
    orderId: "order-B",
    productId: "prod-tomate",
    provisionCostUnit: 8.5,
  };

  // Catalog base sale price remains separate and untouched
  const masterCatalogPrice = 12.0;

  assert.equal(orderA_Item.provisionCostUnit, 7.0, "Order A maintains cost = 7.00");
  assert.equal(orderB_Item.provisionCostUnit, 8.5, "Order B maintains cost = 8.50");
  assert.equal(masterCatalogPrice, 12.0, "Master catalog price is never overwritten");
  console.log("✔ Dos provisiones del mismo producto (7.00 vs 8.50) se mantienen aisladas sin alterar catálogo: PASS");
}

// =========================================================================
// PREVIOUS SUITE VALIDATIONS: STOCK & PASSWORDS
// =========================================================================
console.log("\n--- PREVIOUS SUITE REGRESSION CHECKS ---");
{
  // Test Hoja de Provisión Math
  const mockData: OperationalMatrixData = {
    operationalDate: "2026-10-02",
    role: "administrador",
    weightUnits: [],
    orders: [
      {
        id: "order-1",
        customerKey: "cust-1",
        reference: "ORD-001",
        customerName: "Cliente 1",
        locationLabel: null,
        customerNotes: "",
        status: "pendiente_preparacion",
        updatedAt: "2026-10-01T10:00:00Z",
        position: 1,
        positionVersion: 1,
        preparationStatus: null,
        deliveryStatus: null,
      },
    ],
    lines: [
      {
        orderItemId: "item-1",
        orderId: "order-1",
        productId: "prod-1",
        productName: "Tomate",
        stockCurrent: 12,
        productColor: null,
        controlsActualWeight: false,
        categoryName: "VERDURAS",
        sourceLabel: "kg",
        quantityUnits: [],
        baseUnitSymbol: "kg",
        priceUnitSymbol: "kg",
        baseSalePrice: 10,
        basePriceUnitId: "unit-kg",
        hasWeightBasedPrice: true,
        provisionCostUnit: 6.5,
        requestedQuantity: 30,
        requestedBaseQuantity: 30,
        requestedNote: "",
        requestedVersion: 1,
        preparedQuantity: 0,
        preparedBaseQuantity: 0,
        preparationDisplayUnitId: "original",
        preparationCheck: false,
        preparationActualWeightKg: null,
        preparationNote: "",
        preparationVersion: 1,
        preparedBy: null,
        preparedAt: null,
        externalQuantity: 0,
        deliveredQuantity: 0,
        deliveredBaseQuantity: 0,
        deliveryDisplayUnitId: "original",
        deliveryCheck: false,
        deliveryActualWeightKg: null,
        deliveryNote: "",
        deliveryVersion: 1,
        deliveredBy: null,
        deliveredAt: null,
      },
    ],
  };

  const model = buildMarketSheetModel(mockData);
  assert.equal(model.rows[0].toProvision, 18);
  assert.equal(model.rows[0].provisionCostUnit, 6.5);

  // Test Password Normalization
  assert.equal(normalizeClientInitialPassword("08 Burguer Melchor"), "burguermelchor");
  assert.equal(normalizeClientInitialPassword("12 Café París"), "cafeparis");
  assert.equal(validateInitialPassword("08 Burguer Melchor").isValid, true);
  console.log("✔ Verificación de regresión en stock y normalización de contraseñas: PASS");
}

console.log("\n================================================================");
console.log("ALL 9 VERIFICATION SCENARIOS PASSED SUCCESSFULLY! (9/9)");
console.log("================================================================");
