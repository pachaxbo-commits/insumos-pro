import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, action, matrix] = await Promise.all([
  readFile("supabase/migrations/20261108130000_qb_atomic_grouped_order_correction.sql", "utf8"),
  readFile("src/lib/operational-matrix/actions.ts", "utf8"),
  readFile("src/components/operational-matrix/operational-matrix.tsx", "utf8"),
]);

assert.match(migration, /create or replace function public\.admin_update_qb_requested_quantities/);
assert.match(migration, /for update/);
assert.match(migration, /request_payload <> v_request/);
assert.match(migration, /response_payload is not null[\s\S]*?replayed', true/);
assert.match(migration, /order by \(change\.value ->> 'orderItemId'\)::uuid/);
assert.match(migration, /public\.admin_update_qb_requested_quantity\(/);
assert.match(migration, /revoke all[\s\S]*?from public, anon, authenticated/);
assert.match(migration, /grant execute[\s\S]*?to authenticated/);
assert.match(action, /correctGroupedMatrixRequestAction[\s\S]*?admin_update_qb_requested_quantities/);
assert.match(matrix, /correctGroupedMatrixRequestAction\(\{[\s\S]*?changes: groupedLines\.map/);

const correction = matrix.slice(matrix.indexOf("const correctGroupedRequest"), matrix.indexOf("const moveCustomer"));
assert.doesNotMatch(correction, /Promise\.all/);

console.log("PASS: las correcciones agrupadas utilizan una sola RPC transaccional y versionada");
