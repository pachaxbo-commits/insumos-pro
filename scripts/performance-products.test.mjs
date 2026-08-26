import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const sources = {
  page: await read("src/app/(private)/productos/page.tsx"),
  privateLayout: await read("src/app/(private)/layout.tsx"),
  loading: await read("src/app/(private)/loading.tsx"),
  management: await read("src/components/products/product-management.tsx"),
  createDialog: await read("src/components/products/new-product-dialog.tsx"),
  filters: await read("src/components/products/product-filters-bar.tsx"),
  lazyClassification: await read(
    "src/components/products/lazy-product-classification-configuration.tsx",
  ),
  classificationAction: await read(
    "src/lib/products/classification-actions.ts",
  ),
  productsData: await read("src/lib/products/data.ts"),
  inventoryData: await read("src/lib/inventory/data.ts"),
  ordersData: await read("src/lib/qb-orders/data.ts"),
  ordersPage: await read("src/app/(private)/pedidos/page.tsx"),
  ordersManagement: await read(
    "src/components/qb-orders/qb-orders-management.tsx",
  ),
  lazyOrderCreator: await read(
    "src/components/qb-orders/lazy-internal-order-creator.tsx",
  ),
  orderCreationAction: await read("src/lib/qb-orders/creation-actions.ts"),
  internalOrderCreator: await read(
    "src/components/qb-orders/internal-order-creator.tsx",
  ),
  ordersSync: await read(
    "src/components/qb-orders/use-qb-orders-synchronization.ts",
  ),
};

test("Nuevo producto is an independent client boundary", () => {
  assert.match(sources.page, /<NewProductDialog/);
  assert.match(sources.page, /<Suspense[\s\S]*?<ProductPageActions/);
  assert.doesNotMatch(sources.management, />\s*Nuevo producto\s*</);
});

test("the create dialog keeps the atomic server action and immediate basic fields", () => {
  assert.match(sources.createDialog, /createProductAction/);
  assert.match(sources.createDialog, /name="name"/);
  assert.match(sources.createDialog, /name="category_id"/);
  assert.match(sources.createDialog, /name="base_unit_id"/);
  assert.match(sources.createDialog, /data-performance-target="new-product"/);
});

test("products use server pagination with a 25-row first page", () => {
  assert.match(sources.productsData, /PRODUCTS_PAGE_SIZE = 25/);
  assert.match(
    sources.productsData,
    /productsQuery\.range\(from, from \+ pageSize - 1\)/,
  );
  assert.match(sources.page, /pageSize: PRODUCTS_PAGE_SIZE/);
});

test("product search is debounced and accent-normalized on the server", () => {
  assert.match(sources.filters, /window\.setTimeout\([\s\S]*?350/);
  assert.match(sources.productsData, /normalize\("NFD"\)/);
  assert.match(sources.productsData, /\\u0300-\\u036f/);
});

test("the first product screen limits QB relations to visible products", () => {
  assert.match(sources.page, /parametrizationScope: "list"/);
  assert.match(sources.productsData, /\.in\("product_id", productIds\)/);
  assert.match(sources.productsData, /scope === "full" && productIds\.length/);
});

test("classification data loads only when the edit dialog needs it", () => {
  assert.match(
    sources.lazyClassification,
    /getProductClassificationEditorDataAction/,
  );
  assert.match(sources.lazyClassification, /dynamic\(\(\) =>/);
  assert.match(sources.classificationAction, /Promise\.all\(/);
});

test("product thumbnails use the image optimizer with fixed dimensions", () => {
  assert.match(sources.management, /from "next\/image"/);
  assert.match(sources.management, /sizes="44px"/);
  assert.match(sources.management, /className="object-cover"/);
});

test("private module navigation has an immediate loading shell", () => {
  assert.match(sources.loading, /Cargando módulo/);
  assert.match(sources.loading, /animate-pulse/);
  assert.match(
    sources.privateLayout,
    /<Suspense fallback={<PrivateLayoutFallback/,
  );
  assert.match(sources.privateLayout, /await requireAuthenticatedUser\(\)/);
});

test("inventory starts independent queries in one Promise.all", () => {
  assert.match(
    sources.inventoryData,
    /Promise\.all\(\[\s*productsQuery,\s*movementsQuery,/,
  );
});

test("order items and preparations load in parallel", () => {
  assert.match(
    sources.ordersData,
    /const \[itemsResult, preparationResult\] = await Promise\.all/,
  );
  assert.match(
    sources.ordersData,
    /const \[preparationItemsResult, allowedUnitsByProduct\] = await Promise\.all/,
  );
});

test("the internal order catalog stays out of the initial payload and opens automatically", () => {
  assert.match(sources.ordersPage, /getQbInternalOrdersData\(false\)/);
  assert.match(sources.ordersManagement, /<LazyInternalOrderCreator/);
  assert.match(
    sources.lazyOrderCreator,
    /getInternalOrderCreationDataAction\(\)/,
  );
  assert.match(sources.lazyOrderCreator, /dynamic\(/);
  assert.match(
    sources.lazyOrderCreator,
    /import\("@\/components\/qb-orders\/internal-order-creator"\)/,
  );
  assert.match(sources.lazyOrderCreator, /Cargando formulario…/);
  assert.match(sources.lazyOrderCreator, /if \(data \|\| error\) return/);
  assert.match(sources.orderCreationAction, /requireRoleAccess\("\/pedidos"\)/);
  assert.match(sources.orderCreationAction, /role !== "administrador"/);
  assert.match(sources.internalOrderCreator, /initiallyOpen = false/);
});

test("order polling is stopped while the tab is hidden", () => {
  assert.match(sources.ordersSync, /stopPolling/);
  assert.match(
    sources.ordersSync,
    /document\.visibilityState === "visible"[\s\S]*?window\.setInterval/,
  );
});

test("optimized data access keeps explicit column selections", () => {
  for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /\.select\(\s*["'`]\*["'`]\s*\)/, name);
  }
});
