import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { calculateReceiptLine, sumReceiptAmounts, summarizeReceipts } from
  "../src/lib/qb-receipts/line-pricing.ts";
import { resolveReceiptCostSnapshot } from "../src/lib/qb-receipts/cost-source.ts";

const factors = (distance, exigency, weather, extraordinary) =>
  ({ distance, exigency, weather, extraordinary });

test("cada producto calcula costo, precio, venta y utilidad independientes", () => {
  const a = calculateReceiptLine({ quantity: 2, costBaseUnit: 100,
    factors: factors(3, 5, 2, 0) });
  const b = calculateReceiptLine({ quantity: 2, costBaseUnit: 100,
    factors: factors(6, 5, 0, 4) });
  assert.equal(a.factorTotalPct, "10");
  assert.equal(a.unitProfit, "10.00000000");
  assert.equal(a.unitSale, "110.00000000");
  assert.equal(a.costTotal, "200.00000000");
  assert.equal(a.saleTotal, "220.00000000");
  assert.equal(a.profitTotal, "20.00000000");
  assert.equal(b.saleTotal, "230.00000000");
  assert.equal(b.profitTotal, "30.00000000");
  const changedA = calculateReceiptLine({ quantity: 2, costBaseUnit: 100,
    factors: factors(3, 15, 2, 0) });
  assert.equal(changedA.saleTotal, "240.00000000");
  assert.equal(b.saleTotal, "230.00000000");
  assert.equal(sumReceiptAmounts([a,b]).saleTotal, "450.00000000");
});

test("decimales, periódicos, cero y valores inválidos", () => {
  const line = calculateReceiptLine({ quantity: "0.5", costBaseUnit: "6.66666667",
    factors: factors("3.25", "5.5", "2.25", 0) });
  assert.equal(line.factorTotalPct, "11");
  assert.equal(line.costTotal, "3.33333334");
  assert.equal(line.saleTotal, "3.70000000");
  const zero = calculateReceiptLine({ quantity: 0, costBaseUnit: 0,
    factors: factors(0,0,0,0) });
  assert.equal(zero.saleTotal, "0.00000000");
  assert.throws(() => calculateReceiptLine({ quantity: -1, costBaseUnit: 1,
    factors: factors(0,0,0,0) }));
  assert.throws(() => calculateReceiptLine({ quantity: 1, costBaseUnit: Infinity,
    factors: factors(0,0,0,0) }));
  assert.throws(() => calculateReceiptLine({ quantity: 1, costBaseUnit: 1,
    factors: factors(NaN,0,0,0) }));
});

test("pedido por Bs conserva la venta fija y calcula utilidad desde costo", () => {
  const line = calculateReceiptLine({ quantity: "2.5", costBaseUnit: "8",
    factors: factors(0,0,0,0), fixedSaleTotal: "30" });
  assert.equal(line.costTotal, "20.00000000");
  assert.equal(line.saleTotal, "30.00000000");
  assert.equal(line.profitTotal, "10.00000000");
});

test("el punto de entrada de costo conserva total efectivo y costo unitario", () => {
  const current = resolveReceiptCostSnapshot({ deliveredQuantity: "3", purchaseCostTotal: "10" });
  assert.equal(current.costTotal, "10.00000000");
  assert.equal(current.costBaseUnit, "3.33333333");
  assert.equal(current.source, "purchase_snapshot");
  const future = resolveReceiptCostSnapshot({ deliveredQuantity: "3", purchaseCostTotal: "10",
    effectiveCostTotal: "12.25" });
  assert.equal(future.costTotal, "12.25000000");
  assert.equal(future.source, "fifo");
  assert.equal(resolveReceiptCostSnapshot({ deliveredQuantity: 1 }), null);
});

test("resumen mensual y general: ratio de sumas, aislamiento de clientes", () => {
  const fixture = [
    { customerId: "P2", date: "2026-07-03", status: "emitido", costTotal: "63.5", saleTotal: "129.5" },
    { customerId: "P2", date: "2026-07-07", status: "emitido", costTotal: "165.2093333333", saleTotal: "197.9093333333" },
    { customerId: "P2", date: "2026-07-10", status: "emitido", costTotal: "167.0053333333", saleTotal: "227.3553333333" },
    { customerId: "P4", date: "2026-07-03", status: "emitido", costTotal: "1855.8449494949", saleTotal: "2127.3249494949" },
    { customerId: "P4", date: "2026-08-01", status: "emitido", costTotal: 1, saleTotal: 2 },
    { customerId: "P4", date: "2026-07-03", status: "anulado", costTotal: 0, saleTotal: 999 },
  ];
  const july = summarizeReceipts(fixture, { year: 2026, month: 7 });
  const p2 = july.customers.find((row) => row.customerId === "P2");
  const p4 = july.customers.find((row) => row.customerId === "P4");
  assert.equal(p2.profitTotal, "159.05000000");
  assert.equal(p2.saleTotal, "554.76466667");
  assert.ok(Math.abs(Number(p2.marginPercent) - 28.669814) < 0.00001);
  assert.equal(p4.profitTotal, "271.48000000");
  assert.ok(Math.abs(Number(p4.marginPercent) - 12.761567) < 0.00001);
  assert.equal(july.selected.length, 4);
  const changed = [...fixture];
  changed[0] = { ...changed[0], saleTotal: "139.5" };
  const after = summarizeReceipts(changed, { year: 2026, month: 7 });
  assert.equal(after.customers.find((row) => row.customerId === "P4").saleTotal, p4.saleTotal);
  assert.equal(after.customers.find((row) => row.customerId === "P2").saleTotal, "564.76466667");
});

test("dos clientes y dos pedidos: cambiar exigencia afecta solo su producto", () => {
  const calculate = (exigency) => calculateReceiptLine({ quantity: 2, costBaseUnit: 100,
    factors: factors(3, exigency, 2, 0) });
  const a1 = calculate(5);
  const a2 = calculateReceiptLine({ quantity: 1.5, costBaseUnit: 20,
    factors: factors(6,5,0,4) });
  const aOtherOrder = calculateReceiptLine({ quantity: 3, costBaseUnit: 10,
    factors: factors(0,0,0,0) });
  const b1 = calculateReceiptLine({ quantity: 2, costBaseUnit: 8,
    factors: factors(2,1,0,0) });
  const b2 = calculateReceiptLine({ quantity: 1, costBaseUnit: 30,
    factors: factors(0,4,0,0) });
  const fixtures = (first) => [
    { customerId: "A", date: "2026-07-02", status: "emitido", ...sumReceiptAmounts([first,a2]) },
    { customerId: "A", date: "2026-07-05", status: "emitido", ...sumReceiptAmounts([aOtherOrder]) },
    { customerId: "B", date: "2026-07-04", status: "emitido", ...sumReceiptAmounts([b1,b2]) },
  ];
  const before = summarizeReceipts(fixtures(a1));
  const after = summarizeReceipts(fixtures(calculate(15)));
  assert.equal(Number(after.total.saleTotal) - Number(before.total.saleTotal), 20);
  assert.equal(after.customers.find((row) => row.customerId === "B").saleTotal,
    before.customers.find((row) => row.customerId === "B").saleTotal);
  assert.equal(fixtures(a1)[1].saleTotal, fixtures(calculate(15))[1].saleTotal);
  assert.equal(a2.saleTotal, "34.50000000");
});

test("migración conserva modo histórico, factores por línea y RPCs con rol", () => {
  const sql = readFileSync("supabase/migrations/20260928010000_qb_receipt_line_pricing.sql", "utf8");
  assert.match(sql, /pricing_mode in \('legacy', 'line_cost_markup'\)/);
  assert.match(sql, /recalculate_qb_receipt_totals_legacy/);
  assert.match(sql, /update_qb_receipt_draft_legacy/);
  assert.match(sql, /QB_LINE_PRICING_USE_LINE_RPC/);
  assert.match(sql, /set_qb_receipt_line_pricing/);
  assert.match(sql, /current_user_role\(\)/);
  assert.match(sql, /line\.distance_factor_percent \+ line\.exigency_factor_percent/);
  assert.match(sql, /cost_base_unit_snapshot is null or cost_total_precise is null/);
  assert.match(sql, /QB_AMOUNT_RECEIPT_FIXED_SALE/);
  assert.match(sql, /sum\(cost_total_precise\), sum\(sale_total_precise\), sum\(profit_total_precise\)/);
  assert.match(sql, /on public\.qb_receipt_lines for select\s+using \(public\.current_user_role\(\) in \('admin','administrador','inventario'\)\)/);
});
