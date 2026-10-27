import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolveKardexAttribution } from "../src/lib/inventory/kardex-attribution.ts";

const workspace = readFileSync(new URL("../src/components/stock/stock-workspace.tsx", import.meta.url), "utf8");
const exportRoute = readFileSync(new URL("../src/app/api/stock/kardex.xlsx/route.ts", import.meta.url), "utf8");

test("Kardex keeps delivery and reconciliation links instead of overwriting one by movement id", () => {
  const result = resolveKardexAttribution([
    { source: "delivery", orderId: "order-a", orderReference: "QB-A", customerName: "Cliente A", quantity: 3, occurredAt: "2026-10-27T10:00:00Z" },
    { source: "reconciliation", orderId: "order-b", orderReference: "QB-B", customerName: "Cliente B", quantity: 2, occurredAt: "2026-10-27T11:00:00Z" },
  ], 5);

  assert.equal(result.attributions.length, 2);
  assert.deepEqual(result.attributions.map(({ customerName, orderReference, quantity, source }) => ({ customerName, orderReference, quantity, source })), [
    { customerName: "Cliente A", orderReference: "QB-A", quantity: 3, source: "delivery" },
    { customerName: "Cliente B", orderReference: "QB-B", quantity: 2, source: "reconciliation" },
  ]);
  assert.equal(result.ambiguous, true);
  assert.equal(result.totalLinkedQuantity, 5);
});

test("Kardex marks a link quantity that cannot be reconciled with the movement", () => {
  const result = resolveKardexAttribution([
    { source: "delivery", orderId: "order-a", orderReference: "QB-A", customerName: "Cliente A", quantity: 4, occurredAt: null },
    { source: "reconciliation", orderId: "order-b", orderReference: "QB-B", customerName: "Cliente B", quantity: 2, occurredAt: null },
  ], 5);

  assert.equal(result.attributions.length, 2);
  assert.equal(result.totalLinkedQuantity, 6);
  assert.equal(result.ambiguous, true);
});

test("a single matching delivery link remains unambiguous", () => {
  const result = resolveKardexAttribution([
    { source: "delivery", orderId: "order-a", orderReference: "QB-A", customerName: "Cliente A", quantity: 5, occurredAt: null },
  ], 5);

  assert.equal(result.ambiguous, false);
});

test("screen and Excel render every association and flag ambiguous movements", () => {
  assert.match(workspace, /row\.attributions\.map/);
  assert.match(workspace, /row\.attribution_ambiguous/);
  assert.match(exportRoute, /row\.attributions\.map/);
  assert.match(exportRoute, /row\.attribution_ambiguous/);
});
