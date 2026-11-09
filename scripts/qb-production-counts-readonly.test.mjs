import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("scripts/production-close/production-readonly-counts.sql", "utf8");
assert.match(sql, /\bwith targets\(section, schema_name, table_name\) as \(/i);
assert.match(sql, /query_to_xml\(format\('select count\(\*\) as n from %I\.%I'/i);
assert.match(sql, /select jsonb_build_object\(/i);
assert.doesNotMatch(sql, /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|call|do)\b/i);
assert.doesNotMatch(sql, /\b(select|returning)\s+(email|phone|password|encrypted_password|token|name)\b/i);
assert.match(sql, /'auth','users'/);
console.log("PASS: preflight de conteos solo lee agregados y no selecciona datos personales");
