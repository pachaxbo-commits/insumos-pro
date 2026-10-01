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
  customerManager,
  customerAdminActions,
  matrixData,
  orderActions,
  orderInput,
  legacyTemplateMigration,
  bsQuantityMigration,
  serviceRoleReadMigration,
  deliveryConfirmationMigration,
  clientTrialReadinessMigration,
  forceDeleteCustomerMigration,
  customerDeleteCompatibilityMigration,
  deliveryDateMigration,
  legacyHistoryMigration,
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
  read("src/components/customers/customer-directory-manager.tsx"),
  read("src/lib/customer-account/admin-actions.ts"),
  read("src/lib/operational-matrix/data.ts"),
  read("src/lib/qb-orders/actions.ts"),
  read("src/lib/qb-orders/internal-order-input.ts"),
  read(
    "supabase/migrations/20260725010300_qb_legacy_repeatable_order_templates.sql",
  ),
  read("supabase/migrations/20260725010400_qb_bs_as_quantity_unit.sql"),
  read(
    "supabase/migrations/20260725010600_qb_service_role_operational_read.sql",
  ),
  read(
    "supabase/migrations/20260725010700_qb_delivery_confirmation_current_version.sql",
  ),
  read(
    "supabase/migrations/20260926010000_qb_client_trial_readiness.sql",
  ),
  read("supabase/migrations/20260725010800_qb_admin_force_delete_customer.sql"),
  read(
    "supabase/migrations/20260725010900_qb_customer_delete_snapshot_compatibility.sql",
  ),
  read(
    "supabase/migrations/20260729010000_qb_internal_order_delivery_date.sql",
  ),
  read(
    "supabase/migrations/20260729010100_qb_legacy_last_eight_order_templates.sql",
  ),
]);

const [appSidebar, navigation] = await Promise.all([
  read("src/components/layout/app-sidebar.tsx"),
  read("src/lib/navigation.ts"),
]);

// Sugerencia de pedido: promedio editable de hasta ocho pedidos.
assert.match(creator, /Promedio de los últimos 8 pedidos/);
assert.match(creator, /Historial cargado autom/);
assert.doesNotMatch(creator, /Usar promedio/);
assert.match(creator, /checked=\{selected\}/);
assert.match(creator, /todavía no tiene pedidos anteriores para\s+calcular un promedio/);
assert.match(creator, /promedio incluye pedidos de otras ubicaciones/);
assert.match(creator, /ubicación\s+seleccionada no cambiará/);
assert.match(
  creationActions,
  /\.eq\("customer_location_id", selection\.data\.locationId\)/,
);
assert.match(creationActions, /\.neq\("status", "cancelado"\)/);
assert.match(creationActions, /const ORDER_AVERAGE_SIZE = 8/);
assert.ok(
  (creationActions.match(/\.limit\(ORDER_AVERAGE_SIZE\)/g) ?? []).length >= 3,
  "current and legacy history queries are limited to eight",
);
assert.match(
  creationActions,
  /if \(!samples\.length\) return \{ success: true, order: null \}/,
);
assert.match(creationActions, /\.in\("order_id", selectedCurrentIds\)/);
assert.doesNotMatch(
  creationActions,
  /\.from\("qb_orders"\)[\s\S]{0,500}\.limit\(80\)/,
);
assert.match(creationActions, /\.from\("qb_legacy_order_templates"\)/);
assert.match(creationActions, /\.from\("qb_legacy_order_template_lines"\)/);
assert.match(creationActions, /source: "average"/);
assert.match(creationActions, /item\.totalBaseQuantity \/ samples\.length/);
assert.match(creator, /consideran como cero/);
assert.match(legacyTemplateMigration, /activeCustomers/);
assert.match(legacyTemplateMigration, /source_order_id/);
assert.match(legacyTemplateMigration, /template_count <> 38/);
assert.match(legacyTemplateMigration, /line_count <> 330/);
assert.match(legacyHistoryMigration, /últimos 8 pedidos confirmados/);
assert.match(legacyHistoryMigration, /template_count <> 274/);
assert.match(legacyHistoryMigration, /line_count <> 2211/);
assert.match(bsQuantityMigration, /QB_BS_QUANTITY_GUARD_NOT_FOUND/);

// Una plantilla grande se divide de forma idempotente sin perder productos.
assert.match(orderInput, /\.max\(100,/);
assert.match(orderActions, /INTERNAL_ORDER_BATCH_SIZE = 30/);
assert.match(orderActions, /Math\.ceil\(parsed\.data\.items\.length/);
assert.match(orderActions, /String\(index \+ 1\)\.padStart\(2, "0"\)/);
assert.match(orderActions, /Pedido creado en \$\{batches\.length\} partes/);

// Precarga sólo intención editable: cantidad, unidad y nota.
for (const field of [
  "productId",
  "allowedUnitId",
  "inputMode",
  "quantity",
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
assert.match(creator, /historyRequestRef\.current/);
assert.match(creator, /const suggestion = history\?\.lines\.find/);
assert.match(creator, /checked=\{selected\}/);
assert.doesNotMatch(creator, /setLines\(repeatedLines\)/);
assert.doesNotMatch(
  creator.match(/function applyAverageOrder\(\)[\s\S]*?\n  \}/)?.[0] ?? "",
  /createQbInternalOrderAction/,
);
assert.doesNotMatch(creator, /Quitar promedio/);
assert.doesNotMatch(creator, /Abrir en Matriz operativa/);

// Navegación principal y preservación de contexto.
assert.match(
  transitionPolicy,
  /id: "matriz-operativa"[\s\S]*visibleInNavigation: true/,
);
assert.match(
  roles,
  /administrador: \[[\s\S]*"\/pedidos"[\s\S]*"\/matriz-operativa"/,
);
assert.match(roles, /inventario: \["\/", "\/matriz-operativa", "\/stock"\]/);
assert.match(roles, /entregador: \["\/", "\/matriz-operativa"\]/);
assert.doesNotMatch(roles, /inventario: \[[^\]]*"\/pedidos"/);
assert.match(home, /requireRoleAccess\("\/"\)/);
assert.match(home, /sections\.filter\(\(section\) =>/);
assert.match(home, /section\.href !== "\/matriz-operativa\/mercado" \|\| auth\.user\.role === "administrador"/);
assert.match(home, /title="Inicio"/);
assert.match(ordersManagement, /date=\$\{order\.operationalDate\}/);
assert.match(ordersManagement, /mode=\$\{[\s\S]*"entrega"[\s\S]*"preparacion"/);
assert.match(ordersManagement, /order=\$\{order\.id\}/);
assert.match(ordersManagement, /Ver detalle/);
assert.match(matrixPage, /requireRoleAccess\("\/matriz-operativa"\)/);
assert.match(matrixPage, /params\.date \?\? params\.fecha/);
assert.match(matrixPage, /initialOrderId=\{params\.order\}/);
assert.match(matrixData, /\.neq\("status", "cancelado"\)/);

// El directorio operativo usa las mismas cuentas y ubicaciones de los pedidos QB.
assert.match(customersDirectory, /\.from\("customer_accounts"\)/);
assert.match(customersDirectory, /qb_customer_locations/);
assert.match(customersPage, /getQbCustomerDirectory/);
assert.doesNotMatch(customersPage, /getCustomersData/);
assert.match(customerManager, /Eliminar cliente/);
assert.match(customerAdminActions, /deleteCustomerAdminAction/);
assert.match(customerAdminActions, /admin_force_delete_qb_customer/);
assert.match(customerAdminActions, /admin_update_qb_customer_directory/);
assert.match(
  customerManager,
  /Elimina definitivamente al cliente y todo su historial asociado/,
);
assert.match(forceDeleteCustomerMigration, /delete from public\.qb_receipts/);
assert.match(forceDeleteCustomerMigration, /delete from public\.qb_orders/);
assert.match(forceDeleteCustomerMigration, /delete from public\.orders/);
assert.match(forceDeleteCustomerMigration, /delete from auth\.users/);
assert.match(
  customerDeleteCompatibilityMigration,
  /from private\.qb_order_amount_snapshots/,
);
assert.match(
  serviceRoleReadMigration,
  /grant select on table public\.qb_order_items to service_role/,
);

// La vista Tabla sigue siendo una matriz continua; Formulario sí permite elegir un pedido.
assert.match(matrix, /data-matrix-layout="continuous-sheet"/);
assert.equal((matrix.match(/<table className=/g) ?? []).length, 1);
assert.doesNotMatch(matrix, /selectedMobileOrder|MobileRow/);
assert.doesNotMatch(matrix, /MobileHeader|MobileRow/);
assert.match(matrix, /Unidad de \$\{label\.toLowerCase\(\)\}/);
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
assert.match(matrix, /Check de Inventario/);
assert.match(matrix, /Check de Entrega faltante/);
assert.match(matrix, /groupedLines\.every\(hasDeliveryCheck\)/);
assert.doesNotMatch(matrix, /Finalizar preparación/);
assert.match(matrix, /Confirmar entrega/);
assert.match(matrix, /Deshacer entrega/);
assert.match(matrix, /\["administrador", "entregador"\]\.includes\(data\.role\)/);
assert.match(
  matrix,
  /Guardando cantidades reales y confirmando la entrega/,
);
assert.doesNotMatch(
  matrix,
  /Hay cambios de este cliente guardándose/,
);
assert.match(matrix, /Confirmación de Inventario/);
assert.match(matrix, /Confirmación del Entregador/);
assert.match(matrix, /disabled=\{!editable\}/);
assert.match(matrix, /preparationCheck/);
assert.match(matrix, /deliveryCheck/);
assert.doesNotMatch(matrix, /<Card/);
assert.match(
  matrix,
  /"CHECK INV\.\/ENT\.",\s+"PREPARADO",\s+"ENTREGADO REAL"/,
);
assert.match(matrix, /function PreparedMeasurementDisplay/);
assert.match(
  matrix,
  /"CANT\. REAL ENTREGADA",\s+"PESO REAL ENTREGADO"/,
);
assert.match(matrix, /formatQuantity\(line\.deliveredQuantity\)/);
assert.match(
  appSidebar,
  /adminAvailablePaths[\s\S]*"\/matriz-operativa"/,
);
assert.match(appSidebar, /adminAvailablePaths[\s\S]*"\/stock"/);
assert.match(appSidebar, /adminAvailablePaths[\s\S]*"\/configuracion"/);
assert.match(appSidebar, /adminAvailablePaths[\s\S]*"\/clientes"/);
assert.match(appSidebar, /adminAvailablePaths[\s\S]*"\/recibos"/);
assert.match(navigation, /title: "Abrir preparación y entregas"/);
assert.match(navigation, /href: "\/matriz-operativa"/);
assert.doesNotMatch(matrix, /return \["CANT", "PREP\./);
assert.match(matrix, /formatQuantity\(line\.requestedQuantity\)/);
assert.match(matrix, /quantityValue=\{line\.deliveredQuantity\}/);
assert.doesNotMatch(matrix, /Peso real bodega/);
assert.match(matrix, /Peso real entrega/);
assert.match(matrix, /applyAutomaticDeliveryValues/);
assert.match(matrix, /mergeServerLines/);
assert.match(matrix, /Valor inicial de Inventario · editable/);
assert.match(matrix, /const deliveryDisabled = !editable/);
assert.doesNotMatch(
  matrix,
  /disabled=\{deliveryDisabled \|\| !needsDeliveryReview\}/,
);
assert.match(matrix, /inputMode="decimal"/);
assert.match(matrix, /replace\(",", "\."\)/);
assert.doesNotMatch(matrix, /step="0\.5"/);
assert.match(matrix, /externalQuantity/);
assert.match(matrix, /preparedQuantity/);
assert.match(matrix, /deliveredQuantity/);
assert.match(
  clientTrialReadinessMigration,
  /confirm_qb_matrix_delivery_v2\([\s\S]*p_expected_updated_at/,
);
assert.match(deliveryConfirmationMigration, /confirm_qb_matrix_delivery_v2/);
const matrixActions = await read("src/lib/operational-matrix/actions.ts");
assert.match(matrixActions, /Number\.isFinite\(Date\.parse\(value\)\)/);
assert.doesNotMatch(matrixActions, /expectedUpdatedAt: z\.string\(\)\.datetime\(\)/);
assert.doesNotMatch(matrixActions, /firstAttempt|currentOrder/);
assert.match(matrixActions, /p_expected_updated_at: parsed\.data\.expectedUpdatedAt/);

// Fecha de entrega elegida y sincronizada con la matriz.
assert.match(creator, /name="operational_date"/);
assert.match(creator, /type="date"/);
assert.match(orderInput, /operationalDate/);
assert.match(orderActions, /p_operational_date: parsed\.data\.operationalDate/);
assert.match(
  orderActions,
  /create_qb17_internal_catalog_order_with_date/,
);
assert.match(deliveryDateMigration, /p_operational_date date/);
assert.match(
  deliveryDateMigration,
  /update public\.qb_operational_day_orders/,
);
assert.match(deliveryDateMigration, /update public\.qb_orders/);
assert.match(
  matrixActions,
  /\["administrador", "inventario"\]/,
);
assert.match(
  matrixActions,
  /\["administrador", "entregador"\]/,
);

console.log("QB main-flow acceptance contracts: OK");
