import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeVisibleProductChecks } from "../src/lib/operational-matrix/visible-check-counts.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const twoProducts = [
  { product: "papa", order: "a", preparation: true, delivery: false },
  { product: "tomate", order: "a", preparation: true, delivery: true },
];
assert.deepEqual(summarizeVisibleProductChecks(twoProducts, (line) => line.product, (line) => line.product, (line) => line.preparation), { products: 2, checks: 2 });
assert.deepEqual(summarizeVisibleProductChecks(twoProducts.map((line, index) => ({ ...line, preparation: index === 0 })), (line) => line.product, (line) => line.product, (line) => line.preparation), { products: 2, checks: 1 });

const repeatedProduct = [
  { product: "papa", order: "a", preparation: true, delivery: false },
  { product: "papa", order: "b", preparation: false, delivery: true },
];
assert.deepEqual(summarizeVisibleProductChecks(repeatedProduct, (line) => line.product, (line) => line.product, (line) => line.preparation), { products: 1, checks: 0 });
assert.deepEqual(summarizeVisibleProductChecks(repeatedProduct, (line) => line.product, (line) => line.product, (line) => line.delivery), { products: 1, checks: 0 });
assert.deepEqual(summarizeVisibleProductChecks(repeatedProduct.map((line) => ({ ...line, preparation: true })), (line) => line.product, (line) => line.product, (line) => line.preparation), { products: 1, checks: 1 });

const [matrix, receiptDocument, marketSheet, purchaseSheet, expenseComponent, expenseAction, expenseMigration, fifoCostMigration, excelRoute] = await Promise.all([
  read("src/components/operational-matrix/operational-matrix.tsx"),
  read("src/components/qb-receipts/receipt-document.tsx"),
  read("src/app/(private)/matriz-operativa/mercado/market-sheet-table.tsx"),
  read("src/app/(private)/ingresos/compras-almacen/warehouse-purchase-table.tsx"),
  read("src/app/(private)/ingresos/compras-almacen/warehouse-expense-section.tsx"),
  read("src/lib/warehouse-purchases/actions.ts"),
  read("supabase/migrations/20261014100000_qb_warehouse_operating_expenses.sql"),
  read("supabase/migrations/20261014110000_qb_fifo_inventory_only_receipt_cost.sql"),
  read("src/app/api/ingresos/compras-almacen.xlsx/route.ts"),
]);

assert.match(matrix, /summarizeVisibleProductChecks/);
assert.doesNotMatch(matrix, /\{customerLines\.length\} líneas|\{rows\.length\} líneas/);
assert.match(receiptDocument, /Fecha de entrega[\s\S]*text-2xl font-bold/);
assert.match(receiptDocument, /Periodo[\s\S]*formatBoliviaDate\(receipt\.periodStart\)/);
assert.match(marketSheet, /-handwritten/);
assert.match(marketSheet, /print:table-cell/);
assert.match(purchaseSheet, /matrixColor/);
assert.match(purchaseSheet, /no tiene una unidad física habilitada para recepción/);
assert.match(purchaseSheet, /Guardar fila/);
assert.match(expenseComponent, /Guardar gastos/);
assert.match(expenseComponent, /TOTAL EGRESOS/);
assert.match(expenseComponent, /No generan|sin movimiento de inventario/);
assert.match(expenseAction, /save_qb_warehouse_operating_expenses/);
assert.match(expenseMigration, /deleted_at timestamptz/);
assert.match(expenseMigration, /audit_logs/);
assert.match(expenseMigration, /current_user_role\(\) in \('admin', 'administrador', 'inventario'\)/);
assert.match(expenseMigration, /QB_EXPENSE_ROW_CONFLICT/);
assert.doesNotMatch(expenseMigration, /inventory_movements|stock_current|qb_receipt_lines/);
assert.match(fifoCostMigration, /drop trigger if exists qb_snapshot_fifo_cost_on_new_receipt_line/);
assert.match(fifoCostMigration, /FIFO is inventory-only/);
assert.match(excelRoute, /GASTOS OPERATIVOS/);
assert.match(excelRoute, /TOTAL EGRESOS/);

console.log("QB customer meeting interface and expense contract tests passed.");
