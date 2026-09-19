import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  receiptFactorTotal,
  receiptLineTotal,
  receiptTotals,
  receiptUnitPrice,
} from "../src/lib/qb-receipts/calculations.ts";

const sql = readFileSync(
  "supabase/migrations/20260729010200_qb_custom_receipt_factors.sql",
  "utf8",
);

test("los cuatro porcentajes se suman una sola vez", () => {
  const factors = [5, 5, 5, 5];
  assert.equal(receiptFactorTotal(factors), 20);
  assert.equal(receiptUnitPrice(10, factors), 12);
  assert.equal(receiptLineTotal(2.5, 10, factors), 30);
  assert.doesNotMatch(sql, /\*\s*\(1\s*\+[^;]*\*\s*\(1\s*\+/s);
  assert.match(sql, /v_factor_total :=[\s\S]*distance_factor_percent[\s\S]*\+ v_receipt\.extraordinary_factor_percent/);
});

test("subtotal, recargo y total mantienen la identidad contable", () => {
  const result = receiptTotals(
    [{ quantity: 2.5, basePrice: 10 }, { quantity: 3, basePrice: 4.25 }],
    [5, 5, 5, 5],
  );
  assert.deepEqual(result, { subtotal: 37.75, surcharge: 7.55, total: 45.3 });
  assert.equal(result.subtotal + result.surcharge, result.total);
  assert.match(sql, /surcharge_amount = round\(v_total - v_subtotal, 2\)/);
});

test("pedidos por importe aplican el porcentaje al importe fijo", () => {
  assert.equal(receiptLineTotal(1, 12, [20, 0, 0, 0]), 14.4);
  assert.match(sql, /fixed_line_amount \* \(1 \+ v_factor_total \/ 100\)/);
});

test("los totales se redondean como moneda a dos decimales", () => {
  assert.equal(receiptLineTotal(3, 3.3333, [5, 0, 0, 0]), 10.5);
  assert.deepEqual(receiptTotals([{ quantity: 3, basePrice: 3.3333 }], [5, 0, 0, 0]), {
    subtotal: 10,
    surcharge: 0.5,
    total: 10.5,
  });
});
