import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Decimal from "decimal.js";
import { calculateConfiguredCost, calculateIndependentSale } from "../src/lib/qb-receipts/cost-basis.ts";

const commercial = calculateConfiguredCost({ basis: "commercial_unit", rateAmount: "12.50",
  commercialQuantity: "8", deliveredBaseQuantity: "8" });
assert.equal(commercial.status, "ready");
assert.equal(commercial.referenceQuantity, "8.00000000");
assert.equal(commercial.totalCost, "100.00000000");

// 12 LB are normalized to KG by the verified unit factor; the receipt keeps 8 commercial units.
const pepperWeightKg = new Decimal("12").times("0.45359237").toDecimalPlaces(6).toString();
const byWeight = calculateConfiguredCost({ basis: "actual_weight", rateAmount: "10",
  actualWeightKg: pepperWeightKg, referenceUnitFactorToKg: "1", deliveredBaseQuantity: "8" });
assert.equal(byWeight.status, "ready");
assert.equal(byWeight.referenceQuantity, "5.44310800");
assert.equal(byWeight.totalCost, "54.43108000");
assert.equal(byWeight.averageCostPerDeliveredBaseUnit, "6.80388500");

const missingWeight = calculateConfiguredCost({ basis: "actual_weight", rateAmount: "10",
  actualWeightKg: null, referenceUnitFactorToKg: "1", deliveredBaseQuantity: "8" });
assert.equal(missingWeight.status, "pending_weight");
const ambiguousReference = calculateConfiguredCost({ basis: "actual_weight", rateAmount: "95",
  actualWeightKg: "5", referenceUnitFactorToKg: null, deliveredBaseQuantity: "5" });
assert.equal(ambiguousReference.status, "invalid_reference");

// A valid commercial arroba rate remains per arroba; no kg factor is inferred here.
const perArroba = calculateConfiguredCost({ basis: "commercial_unit", rateAmount: "95",
  commercialQuantity: "5", deliveredBaseQuantity: "5" });
assert.equal(perArroba.totalCost, "475.00000000");

const sale = calculateIndependentSale({ quantity: "8", baseUnitPrice: "3.5",
  factorsPercent: ["5", "0", "0", "0"] });
assert.equal(sale.unitSale, "3.6750");
assert.equal(sale.saleTotalPrecise, "29.40000000");

const migrationUrl = new URL("../supabase/migrations/20261109110000_qb_explicit_receipt_cost_basis.sql", import.meta.url);
const migration = readFileSync(fileURLToPath(migrationUrl), "utf8");
assert.match(migration, /p_cost_basis not in \('commercial_unit', 'actual_weight'\)/);
assert.match(migration, /v_role not in \('admin', 'administrador'\)/);
assert.match(migration, /and dimension\.code='peso' and upper\(trim\(dimension\.base_unit_code\)\)='KG'/);
assert.match(migration, /create trigger zzz_snapshot_qb_receipt_cost_rule\s+before insert on public\.qb_receipt_lines/);
assert.match(migration, /new\.cost_source := 'configured_rule'/);
assert.match(migration, /QB_LINE_PRICING_COST_PENDING/);
assert.match(migration, /security_barrier=true/);
assert.doesNotMatch(migration.slice(migration.indexOf("create or replace view public.qb_supervisor_receipt_lines")),
  /profit_total_precise|profit_unit_precise/);

console.log("PASS: decimal cost bases, LB normalization, pending/ambiguous cost guards, independent sale, and migration security contract");
