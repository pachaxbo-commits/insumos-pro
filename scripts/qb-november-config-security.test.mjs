import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { canAccessPath } from "../src/lib/auth/roles.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("General de Configuración reutiliza gestión de usuarios protegida por Admin", () => {
  const page = read("../src/app/(private)/configuracion/page.tsx");
  const loader = read("../src/lib/admin-users/data.ts");
  const actions = read("../src/lib/admin-users/actions.ts");
  assert.match(page, /requireRoleAccess\("\/configuracion"\)/);
  assert.match(page, /getAdminUsersData\(\)/);
  assert.match(page, /<UserManagement/);
  assert.match(loader, /auth\.user\.role !== "administrador"/);
  assert.match(actions, /Solo un administrador puede gestionar usuarios/);
  assert.match(actions, /createUser\(/);
  assert.match(actions, /resetPasswordForEmail/);
  assert.match(actions, /No se puede dejar el sistema sin al menos un administrador activo/);
  assert.doesNotMatch(page, /getAuditLogsData|StockControlSettings|Bitácora de actividad|Desactivar control estricto/);
});

test("Configuración General no amplía el acceso de otros perfiles", () => {
  assert.equal(canAccessPath("administrador", "/configuracion"), true);
  assert.equal(canAccessPath("supervisor", "/configuracion"), false);
  assert.equal(canAccessPath("inventario", "/configuracion"), false);
  assert.equal(canAccessPath("entregador", "/configuracion"), false);
});

test("Supervisor recibe campos operativos y costo base permitido, sin precios de venta", () => {
  const orders = read("../src/lib/qb-orders/data.ts");
  const matrix = read("../src/lib/operational-matrix/data.ts");
  const operationalReceiptPage = read("../src/app/(private)/recibos/operativo/page.tsx");
  assert.match(orders, /role === "supervisor"[\s\S]*qb_operational_order_items/);
  assert.match(orders, /requested_amount_bs: role === "supervisor" \? null/);
  assert.match(matrix, /role === "administrador" && productIds\.length/);
  assert.match(matrix, /qb_operational_preparation_costs/);
  assert.match(operationalReceiptPage, /requireRoleAccess\("\/recibos\/operativo"\)/);
  assert.match(operationalReceiptPage, /cost_base_unit/);
  assert.doesNotMatch(operationalReceiptPage, /sale_price|base_sale_price|profit|margin|total_amount/);
});

test("los resets heredados permanecen bloqueados y su acción no puede borrar datos", () => {
  const config = read("../src/lib/test-data-reset/config.ts");
  const actions = read("../src/lib/test-data-reset/actions.ts");
  assert.match(config, /return false/);
  assert.match(actions, /if \(!testDataResetEnabled\(\)\) return/);
  assert.match(actions, /if \(!testDataResetEnabled\(\)\) return \{ success: false/);
});
