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

test("la proyección de Compras oculta totales a empleados y el Excel es administrativo", () => {
  const migration = read("../supabase/migrations/20261103180000_qb_supervisor_purchase_cost_projection.sql");
  const data = read("../src/lib/warehouse-purchases/data.ts");
  const table = read("../src/app/(private)/ingresos/compras-almacen/warehouse-purchase-table.tsx");
  const excel = read("../src/app/api/ingresos/compras-almacen.xlsx/route.ts");

  assert.match(migration, /current_user_role\(\) in \('admin', 'administrador'\)[\s\S]*then line\.total_cost[\s\S]*else null::numeric/);
  assert.match(migration, /current_user_role\(\) in \('admin', 'administrador', 'supervisor'\)[\s\S]*then line\.unit_cost/);
  assert.match(data, /if \(role !== "administrador"\)[\s\S]*from\("qb_operational_warehouse_purchases"\)/);
  assert.match(data, /total: null/);
  assert.match(table, /showExpenses \? <th[^\n]*Total Bs/);
  assert.match(table, /showFinancialTotals \? <td[^\n]*row\.total/);
  assert.match(excel, /auth\.user\.role !== "administrador"[\s\S]*status: 403/);
});

test("Supervisor solo consulta compras y no puede ejecutar mutaciones financieras", () => {
  const page = read("../src/app/(private)/ingresos/compras-almacen/page.tsx");
  const table = read("../src/app/(private)/ingresos/compras-almacen/warehouse-purchase-table.tsx");
  const actions = read("../src/lib/warehouse-purchases/actions.ts");
  const receipts = read("../src/lib/qb-ingresos/actions.ts");
  assert.match(page, /canManage=\{auth\.user\.role === "administrador" \|\| auth\.user\.role === "inventario"\}/);
  assert.match(table, /canManage: boolean/);
  for (const action of ["editar compras", "registrar cantidad física", "confirmar ingresos de almacén", "anular compras"]) {
    assert.ok(actions.includes(`No tienes permiso para ${action}.`), `debe proteger ${action}`);
  }
  assert.match(receipts, /if \(access\.role === "supervisor"\)\s*\{\s*return \{ success: false, message: "Supervisor puede consultar costos unitarios autorizados, pero no crear ni editar compras\." \};/);
});

test("la contraseña inicial solo se envía a Supabase Auth y nunca a perfil ni auditoría", () => {
  const actions = read("../src/lib/admin-users/actions.ts");
  const form = read("../src/components/admin/user-management.tsx");
  assert.match(actions, /initial_password: z\.string\(\)\.max\(128\)\.optional\(\)/);
  assert.match(actions, /parsed\.delivery_method === "password"\s*\? \{ password: parsed\.initial_password \}/);
  assert.match(actions, /password\.length < 14/);
  assert.match(actions, /password !== \(value\.confirm_password \?\? ""\)/);
  assert.match(actions, /email,\s*role: parsed\.role,\s*is_active: true,/);
  assert.doesNotMatch(actions, /metadata:\s*\{[\s\S]{0,200}initial_password/);
  assert.match(form, /type="password" autoComplete="new-password"/);
  assert.match(form, /delivery_method/);
  assert.match(form, /DialogTitle>Crear usuario/);
  assert.match(form, /Completa el perfil y elige si la persona recibirá un enlace o una contraseña inicial/);
  assert.match(form, /<UserPlus className="size-4" \/>\s*Crear usuario/);
});

test("los resets heredados permanecen bloqueados y su acción no puede borrar datos", () => {
  const config = read("../src/lib/test-data-reset/config.ts");
  const actions = read("../src/lib/test-data-reset/actions.ts");
  assert.match(config, /return false/);
  assert.match(actions, /if \(!testDataResetEnabled\(\)\) return/);
  assert.match(actions, /if \(!testDataResetEnabled\(\)\) return \{ success: false/);
});
