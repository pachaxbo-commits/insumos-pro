import assert from "node:assert/strict";
import { getPhysicalCorrectionUnits } from "../src/lib/products/physical-unit-correction-units.ts";

const dimensions = [
  { id: "weight", code: "peso" },
  { id: "legacy", code: "legacy_dump" },
  { id: "money", code: "moneda" },
];
const qbUnits = [
  { id: "kg", dimension_id: "weight", code: "kg", symbol: "KG", is_active: true, conversion_factor_to_base: 1 },
  { id: "lb", dimension_id: "weight", code: "lb", symbol: "LB", is_active: true, conversion_factor_to_base: 0.453592 },
  { id: "legacy-kg", dimension_id: "legacy", code: "legacy_kg", symbol: "KG_LEGACY", is_active: true, conversion_factor_to_base: 1 },
  { id: "bs", dimension_id: "money", code: "bs", symbol: "BS", is_active: true, conversion_factor_to_base: 1 },
  { id: "zero", dimension_id: "weight", code: "zero", symbol: "ZERO", is_active: true, conversion_factor_to_base: 0 },
  { id: "ambiguous", dimension_id: "weight", code: "amb", symbol: "AMB", is_active: true, conversion_factor_to_base: 1 },
];
const legacyUnits = [
  { id: "kg-canonical", name: "KG", abbreviation: "KG", is_active: true },
  { id: "kg-qa-duplicate", name: "Kilogramo QA", abbreviation: "KG", is_active: true },
  { id: "lb", name: "Libra", abbreviation: "LB", is_active: true },
  { id: "amb-1", name: "Ambiguo uno", abbreviation: "AMB", is_active: true },
  { id: "amb-2", name: "Ambiguo dos", abbreviation: "AMB", is_active: true },
];

const available = getPhysicalCorrectionUnits(qbUnits, dimensions, legacyUnits);
assert.deepEqual(available.map((unit) => unit.id), ["kg", "lb"]);
assert.equal(available.find((unit) => unit.id === "kg")?.symbol, "KG");
console.log("OK: KG stays available despite a duplicate legacy label; legacy, currency, invalid-factor and ambiguous units are excluded.");
