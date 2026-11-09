import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("scripts/production-close/production-readonly-counts.sql", "utf8");
assert.match(sql, /begin transaction read only;/i);
assert.match(sql, /current_setting\('transaction_read_only'\) = 'on'/i);
assert.match(sql, /\bcommit;/i);
assert.match(sql, /\bwith targets\(section, schema_name, table_name\) as \(/i);
assert.match(sql, /has_schema_privilege\(current_user,n\.oid,'USAGE'\)/i);
assert.match(sql, /has_table_privilege\(current_user,c\.oid,'SELECT'\)/i);
assert.match(sql, /'NO_ACCESIBLE'/);
assert.match(sql, /'auth','users'/);
assert.match(sql, /'soporte','private','qb_guest_order_idempotency'/);
assert.match(sql, /query_to_xml\(\s*format\('select count\(\*\) as n from %I\.%I'/i);
assert.doesNotMatch(sql, /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|call|do)\b/i);
assert.doesNotMatch(sql, /\b(select|returning)\s+(email|phone|password|encrypted_password|token)\b/i);
assert.match(sql, /CASE WHEN readable THEN[\s\S]*query_to_xml/);
console.log("PASS: conteos read-only con estado explícito de acceso por esquema/tabla y sin datos personales");
