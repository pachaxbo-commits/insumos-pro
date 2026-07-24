import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  creator,
  creationActions,
  ordersManagement,
  matrix,
  matrixPage,
  roles,
  transitionPolicy,
  home,
  customersPage,
  customersDirectory,
] = await Promise.all([
  read("src/components/qb-orders/internal-order-creator.tsx"),
  read("src/lib/qb-orders/creation-actions.ts"),
  read("src/components/qb-orders/qb-orders-management.tsx"),
  read("src/components/operational-matrix/operational-matrix.tsx"),
  read("src/app/(private)/matriz-operativa/page.tsx"),
  read("src/lib/auth/roles.ts"),
  read("src/lib/qb-insumos/transition-policy.ts"),
  read("src/app/(private)/page.tsx"),
  read("src/app/(private)/clientes/page.tsx"),
  read("src/lib/customer-account/directory.ts"),
]);

// Repetir pedido: selección focalizada, fallback explícito y estado sin histórico.
assert.match(creator, /Último pedido/);
assert.match(creator, /Repetir último pedido/);
assert.match(creator, /todavía no tiene pedidos anteriores para\s+repetir/);
assert.match(creator, /proviene de otra ubicación/);
assert.match(creator, /ubicación seleccionada no cambiará/);
assert.match(creationActions, /\.eq\("customer_location_id", selection\.data\.locationId\)/);
assert.match(creationActions, /\.neq\("status", "cancelado"\)/);
assert.ok(
  (creationActions.match(/\.limit\(1\)/g) ?? []).length >= 2,
  "same-location and customer fallback queries are both limited",
);
assert.match(creationActions, /if \(!order\) return \{ success: true, order: null \}/);
assert.match(creationActions, /\.eq\("order_id", order\.id\)/);
assert.doesNotMatch(creationActions, /\.from\("qb_orders"\)[\s\S]{0,500}\.limit\(80\)/);

// Precarga sólo intención editable: cantidad, Bs, unidad/modalidad y nota.
for (const field of [
  "productId",
  "allowedUnitId",
  "inputMode",
  "quantity",
  "requestedAmountBs",
  "notes",
]) {
  assert.match(creator, new RegExp(field));
}
for (const forbidden of [
  "preparationStatus",
  "deliveryStatus",
  "receipt",
  "movement",
  "financialSnapshot",
]) {
  assert.doesNotMatch(creator, new RegExp(forbidden));
}
assert.match(creator, /repeatLoadingRef\.current/);
assert.match(creator, /repeatedOrderId === history\.id/);
assert.match(creator, /setLines\(repeatedLines\)/);
assert.doesNotMatch(creator.match(/function repeatLastOrder\(\)[\s\S]*?\n  \}/)?.[0] ?? "", /createQbInternalOrderAction/);
assert.match(creator, /Cancelar repetición/);
assert.match(creator, /Abrir en Matriz operativa/);

// Navegación principal y preservación de contexto.
assert.match(transitionPolicy, /id: "matriz-operativa"[\s\S]*visibleInNavigation: true/);
assert.match(roles, /inventario: \["\/", "\/ingresos", "\/matriz-operativa", "\/inventario"\]/);
assert.doesNotMatch(roles, /inventario: \[[^\]]*"\/pedidos"/);
assert.match(home, /auth\.user\.role === "inventario"[\s\S]*auth\.user\.role === "entregador"[\s\S]*redirect\("\/matriz-operativa"\)/);
assert.match(ordersManagement, /date=\$\{order\.operationalDate\}/);
assert.match(ordersManagement, /mode=\$\{[\s\S]*"entrega"[\s\S]*"preparacion"/);
assert.match(ordersManagement, /order=\$\{order\.id\}/);
assert.match(ordersManagement, /Ver detalle/);
assert.match(matrixPage, /requireRoleAccess\("\/matriz-operativa"\)/);
assert.match(matrixPage, /params\.date \?\? params\.fecha/);
assert.match(matrixPage, /initialOrderId=\{params\.order\}/);

// El directorio operativo usa las mismas cuentas y ubicaciones de los pedidos QB.
assert.match(customersDirectory, /\.from\("customer_accounts"\)/);
assert.match(customersDirectory, /qb_customer_locations/);
assert.match(customersPage, /getQbCustomerDirectory/);
assert.doesNotMatch(customersPage, /getCustomersData/);

// Una sola matriz continua en escritorio y móvil, sin selector ni filtrado.
assert.match(matrix, /data-matrix-layout="continuous-sheet"/);
assert.equal((matrix.match(/<table className=/g) ?? []).length, 1);
assert.doesNotMatch(matrix, /selectedMobileOrder|selectedOrder|selectedLines/);
assert.doesNotMatch(matrix, /MobileHeader|MobileRow/);
assert.doesNotMatch(matrix, /<select/);
assert.doesNotMatch(matrix, /orders\.filter/);
assert.match(matrix, /touch-pan-x[\s\S]*overflow-auto/);
assert.match(matrix, /customerGroups\.map\(\(group/);
assert.match(matrix, /data-customer-group=\{groupDomId\(group\.id\)\}/);
assert.match(matrix, /scrollIntoView/);
assert.match(matrix, /focusedCustomerId/);
assert.match(matrix, /function aggregateLines/);
assert.match(
  matrix,
  /requestedQuantity: sumLines\(lines, "requestedQuantity"\)/,
);
assert.match(matrix, /const moveCustomer/);
assert.match(matrix, /next\.flatMap\(\(group\) => group\.orders\)/);

// N°, DESCRIPCIÓN y UD permanecen sticky también a 390 px.
assert.match(matrix, /sticky left-0 top-0[\s\S]*N°/);
assert.match(matrix, /sticky left-9 top-0[\s\S]*DESCRIPCIÓN/);
assert.match(matrix, /sticky left-\[196px\] top-0[\s\S]*UD/);
assert.match(matrix, /sticky left-0 z-30/);
assert.match(matrix, /sticky left-9 z-30/);
assert.match(matrix, /sticky left-\[196px\] z-30/);
assert.match(matrix, /sticky top-\[86px\]/);
assert.match(matrix, /data-category-row=/);
assert.match(matrix, /TOTALES/);
assert.match(matrix, /TOTALES POR CLIENTE/);
assert.match(matrix, /Check bodega/);
assert.match(matrix, /Check entrega/);
assert.match(matrix, /Finalizar preparación/);
assert.match(matrix, /Confirmar entrega/);
assert.match(matrix, /Confirmación de Inventario/);
assert.match(matrix, /Confirmación del Entregador/);
assert.match(matrix, /disabled=\{!editable\}/);
assert.match(matrix, /preparationCheck/);
assert.match(matrix, /deliveryCheck/);
assert.doesNotMatch(matrix, /<Card/);
assert.match(
  matrix,
  /return \["CANT", "CHECK", "PESO REAL", "OBSERVACIÓN"\]/,
);
assert.doesNotMatch(matrix, /return \["CANT", "PREP\./);
assert.match(matrix, /formatQuantity\(line\.requestedQuantity\)/);
assert.match(matrix, /Peso real bodega/);
assert.match(matrix, /Peso real entrega/);
assert.match(matrix, /externalQuantity/);
assert.match(matrix, /preparedQuantity/);
assert.match(matrix, /deliveredQuantity/);

console.log("QB main-flow acceptance contracts: OK");
