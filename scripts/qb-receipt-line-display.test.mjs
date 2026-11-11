import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
