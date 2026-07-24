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
] = await Promise.all([
  read("src/components/qb-orders/internal-order-creator.tsx"),
  read("src/lib/qb-orders/creation-actions.ts"),
  read("src/components/qb-orders/qb-orders-management.tsx"),
  read("src/components/operational-matrix/operational-matrix.tsx"),
  read("src/app/(private)/matriz-operativa/page.tsx"),
  read("src/lib/auth/roles.ts"),
  read("src/lib/qb-insumos/transition-policy.ts"),
  read("src/app/(private)/page.tsx"),
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

// Matriz tabular real en escritorio y tabla compacta móvil.
assert.match(matrix, /data-matrix-layout="desktop-table"/);
assert.match(matrix, /data-matrix-layout="mobile-table"/);
assert.ok((matrix.match(/<table className=/g) ?? []).length >= 2);
assert.match(matrix, /overflow-x-auto/);
assert.match(matrix, /sticky left-0/);
assert.match(matrix, /Categoría/);
assert.match(matrix, /Producto/);
assert.match(matrix, /Unidad/);
assert.match(matrix, /Totales por producto/);
assert.match(matrix, /Totales por cliente/);
assert.match(matrix, /Check bodega/);
assert.match(matrix, /Check entrega/);
assert.match(matrix, /preparationCheck/);
assert.match(matrix, /deliveryCheck/);
assert.doesNotMatch(
  matrix.match(/data-matrix-layout="mobile-table"[\s\S]*$/)?.[0] ?? "",
  /<Card/,
);
for (const mobileInventoryColumn of [
  "Producto",
  "Solicitado",
  "Preparado",
  "Check",
  "Faltante",
  "Nota",
]) {
  assert.match(matrix, new RegExp(`"${mobileInventoryColumn}"`));
}
for (const mobileDeliveryColumn of [
  "Producto",
  "Preparado",
  "Externo",
  "Entregado",
  "Check",
  "Nota",
]) {
  assert.match(matrix, new RegExp(`"${mobileDeliveryColumn}"`));
}

console.log("QB main-flow acceptance contracts: OK");
