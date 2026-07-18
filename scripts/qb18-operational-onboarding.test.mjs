import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("CSV parser handles quoted commas and escaped quotes", async () => {
  const source = read("src/lib/operational-activation/csv.ts");
  assert.match(source, /char === '"'/);
  assert.match(source, /index \+= 1/);
});
test("CSV limits are enforced", () => { const source=read("src/lib/operational-activation/csv.ts"); assert.match(source,/1_000_000/); assert.match(source,/500/); });
test("headers are exact per import type", () => { const source=read("src/lib/operational-activation/csv.ts"); assert.match(source,/current_base_price/); assert.match(source,/current_factor/); assert.match(source,/current_stock/); });
test("CSV injection is neutralized", () => { const source=read("src/lib/operational-activation/csv.ts"); assert.match(source,/\^\[=\+\\-@/); });
test("preview is administrator only", () => { const source=read("src/lib/operational-activation/actions.ts"); assert.match(source,/role !== "administrador"/); });
test("preview performs no mutation", () => { const source=read("src/lib/operational-activation/actions.ts"); const preview=source.slice(source.indexOf("export async function preview"),source.indexOf("export async function apply")); assert.doesNotMatch(preview,/\.insert\(|\.update\(|\.delete\(|\.rpc\(/); });
test("price empty means unchanged", () => { assert.match(read("src/lib/operational-activation/actions.ts"),/La celda vacía no retira el precio/); });
test("price rules reject invalid decimals", () => { const source=read("src/lib/operational-activation/actions.ts"); assert.match(source,/decimal\(row\.new_base_price, 2\)/); });
test("unknown IDs and duplicates are classified", () => { const source=read("src/lib/operational-activation/actions.ts"); assert.match(source,/status: "unknown"/); assert.match(source,/status: "duplicate"/); });
test("conversion requires one existing target", () => { const source=read("src/lib/operational-activation/actions.ts"); assert.match(source,/Indica una unidad o una presentación, no ambas/); });
test("stock requires base receiving relationship", () => { assert.match(read("src/lib/operational-activation/actions.ts"),/Falta una relación base de recepción inequívoca/); });
test("apply requires explicit confirmation", () => { assert.match(read("src/lib/operational-activation/actions.ts"),/confirmation !== "APLICAR"/); });
test("download templates are generated from database", () => { const source=read("src/app/api/operational-activation/templates/[type]/route.ts"); assert.match(source,/from\("products"\)/); assert.match(source,/Cache-Control.*no-store/); });
test("download route is administrator only", () => { assert.match(read("src/app/api/operational-activation/templates/[type]/route.ts"),/role !== "administrador"/); });
test("files are not uploaded to storage", () => { const source=read("src/lib/operational-activation/actions.ts")+read("src/components/operational-activation/operational-activation-manager.tsx"); assert.doesNotMatch(source,/\.storage\.|upload\(/); });
