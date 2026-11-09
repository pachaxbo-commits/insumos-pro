import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const preflight = await readFile(
  new URL("./production-close/qb-measurement-snapshot-preflight.sql", import.meta.url),
  "utf8",
);

const v1 = "public.save_qb_matrix_delivery_item_with_weight_v1(uuid,integer,numeric,numeric,boolean,numeric,text,text)";
const v2 = "public.save_qb_matrix_delivery_item_with_weight_v2(uuid,integer,numeric,numeric,boolean,numeric,text,text)";
const base = "save_qb_matrix_delivery_item";

assert.match(preflight, /begin read only;/i);
assert.match(preflight.trimEnd(), /commit;$/i);
assert.match(preflight, /'20260725010000'/);

const matrixStart = preflight.indexOf("), function_expected(signature,delegate_name) as (values");
const matrixEnd = preflight.indexOf("), function_state as (", matrixStart);
assert.notEqual(matrixStart, -1, "compatibility matrix must enumerate delegated RPCs");
assert.notEqual(matrixEnd, -1, "compatibility matrix function state must follow expected delegates");
const functionContract = preflight.slice(matrixStart, matrixEnd);
assert.ok(functionContract.includes(`('${v1}','${base}')`), "v1 must delegate to the base RPC");
assert.ok(functionContract.includes(`('${v2}','save_qb_matrix_delivery_item_with_weight_v1')`), "v2 must delegate to v1");
assert.ok(!functionContract.includes(`('${v2}','${base}')`), "v2 must not skip v1 in the preflight contract");

assert.ok(preflight.split(v1).length - 1 >= 3,
  "v1 signature must be inspected in definitions, grants, and delegated-function checks");
assert.match(preflight, /has_function_privilege\('authenticated',p\.oid,'execute'\)/);
assert.match(preflight, /has_function_privilege\('anon',p\.oid,'execute'\)/);
assert.match(preflight, /x\.grantee=0 and x\.privilege_type='EXECUTE'/, "PUBLIC EXECUTE must be checked from ACL metadata");

console.log("measurement snapshot preflight RPC chain contract: PASS");
