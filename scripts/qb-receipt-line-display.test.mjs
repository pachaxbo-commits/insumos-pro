import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildReceiptWorkbook } from "../src/lib/qb-receipts/workbook.ts";

import {
  formatReceiptActualWeight,
  formatReceiptCommercialQuantity,
  formatReceiptDeliveredBaseQuantity,
} from "../src/lib/qb-receipts/line-display.ts";

const line = (overrides = {}) => ({
  deliveredBaseQuantity: 8,
  baseUnitSymbol: "KG",
  commercialQuantitySnapshot: 8,
  commercialUnitLabelSnapshot: "UNIDADES",
  actualWeightValue: null,
  actualWeightUnitSymbol: null,
  actualWeightKilograms: null,
  ...overrides,
});

test("el recibo conserva unidades comerciales y peso original conocido", () => {
  assert.equal(formatReceiptCommercialQuantity(line()), "8 UNIDADES");
  assert.equal(formatReceiptDeliveredBaseQuantity(line()), "8 KG");
  assert.equal(formatReceiptActualWeight(line({
    actualWeightValue: 12,
    actualWeightUnitSymbol: "LB",
    actualWeightKilograms: 5.443108,
  })), "12 LB");
});

test("un recibo histórico no inventa unidad comercial ni unidad original de peso", () => {
  assert.equal(formatReceiptCommercialQuantity(line({
    commercialQuantitySnapshot: null,
    commercialUnitLabelSnapshot: null,
  })), "No registrada en este recibo histórico");
  assert.equal(formatReceiptActualWeight(line({
    actualWeightKilograms: 5.443108,
  })), "5,443108 KG (normalizado; unidad original no registrada)");
  assert.equal(formatReceiptActualWeight(line()), "No registrado");
});

test("documentos imprimibles usan las mismas columnas descriptivas", async () => {
  const [source, printStyles] = await Promise.all([
    readFile(new URL("../src/components/qb-receipts/receipt-document.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /Cantidad comercial/);
  assert.match(source, /Entregado \(base\)/);
  assert.match(source, /Peso real/);
  assert.match(source, /formatReceiptCommercialQuantity\(line\)/);
  assert.match(source, /formatReceiptDeliveredBaseQuantity\(line\)/);
  assert.match(source, /formatReceiptActualWeight\(line\)/);
  assert.match(printStyles, /@page qb-receipt-page\s*\{\s*size:\s*A4 landscape;/);
});

test("la copia imprimible con costos exige Administración y la exportación del cliente conserva su vista", async () => {
  const detail = await readFile(
    new URL("../src/app/(private)/recibos/[id]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(detail, /if \(auth\.user\.role === "administrador" && impresion === "interna"\)[\s\S]*?variant="admin"/);
  assert.match(detail, /id=\{receiptTargetId\}[\s\S]*?variant="customer-export"/);
});

test("el Excel conserva snapshots y reserva costo y margen para la copia interna", async () => {
  const receipt = {
    number: "QA-1", status: "emitido", customerName: "Cliente QA",
    periodStart: "2026-11-12", periodEnd: "2026-11-12", totalAmount: 80,
    lines: [{
      productName: "Pimentón QA", commercialQuantitySnapshot: 8,
      commercialUnitLabelSnapshot: "UNIDAD", deliveredBaseQuantity: 8,
      baseUnitSymbol: "UNIDAD", actualWeightValue: 12, actualWeightUnitSymbol: "LIBRA",
      actualWeightKilograms: 5.443108, inputMode: "quantity", finalUnitPrice: 10,
      lineTotal: 80, costTotalPrecise: "54.43108", profitTotalPrecise: "25.56892",
    }],
  };
  for (const internal of [true, false]) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildReceiptWorkbook(receipt, internal));
    const sheet = workbook.worksheets[0];
    assert.deepEqual(sheet.getRow(5).values.slice(1, 11), [
      "Pimentón QA", 8, "UNIDAD", 8, "UNIDAD", 12, "LIBRA", 5.443108, 10, 80,
    ]);
    assert.equal(sheet.getCell("K4").value, internal ? "Costo total (Bs)" : null);
    assert.equal(sheet.getCell("L4").value, internal ? "Margen total (Bs)" : null);
    assert.equal(sheet.getCell("K5").value, internal ? 54.43108 : null);
    assert.equal(sheet.getCell("L5").value, internal ? 25.56892 : null);
  }
});
