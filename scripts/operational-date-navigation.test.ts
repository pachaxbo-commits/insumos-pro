import assert from "node:assert/strict";
import { operationalDateHref, operationalPath, provisionPath, provisionExcelPath } from "../src/lib/operational-matrix/date-navigation";

const selectedDate = "2026-10-28";
const origin = "https://example.test";
let current = new URL(operationalPath + "?fecha=" + selectedDate, origin);
for (const mode of ["pedido", "preparacion", "entrega", "resumen"]) {
  current = new URL(operationalDateHref(current.pathname, selectedDate, current.searchParams, mode), origin);
  assert.equal(current.searchParams.get("mode"), mode);
  assert.equal(current.searchParams.get("date"), selectedDate);
  assert.equal(current.searchParams.has("fecha"), false);
}
const provision = new URL(operationalDateHref(provisionPath, selectedDate), origin);
for (const path of [operationalPath, provisionExcelPath]) {
  const destination = new URL(operationalDateHref(path, provision.searchParams.get("date")!), origin);
  assert.equal(destination.pathname, path);
  assert.equal(destination.searchParams.get("date"), selectedDate);
}
assert.equal(new URL(operationalDateHref(operationalPath, selectedDate, new URLSearchParams("allPending=1")), origin).searchParams.has("allPending"), false);
