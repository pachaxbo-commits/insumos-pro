import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/auth";
import type {
  CsvRecord,
  QbAuditReportRow,
  QbInventoryReportRow,
  QbMerchandiseReceiptReportRow,
  QbOrderReportRow,
  QbPendingReceiptReportRow,
  QbRankingRow,
  QbReceiptReportRow,
  QbReportExportKey,
  QbReportFilters,
  QbReportsData,
  QbReportsPermissions,
  QbReportsSummary,
} from "@/types/reports";

type Row = Record<string, unknown>;

type Bundle = {
  products: Row[];
  categories: Row[];
  qbUnits: Row[];
  productSettings: Row[];
  classificationOutputs: Row[];
  inventoryMovements: Row[];
  customers: Row[];
  locations: Row[];
  merchandiseReceipts: Row[];
  merchandiseLines: Row[];
  classificationResults: Row[];
  orders: Row[];
  orderItems: Row[];
  preparations: Row[];
  preparationItems: Row[];
  deliveryMovements: Row[];
  receipts: Row[];
  receiptOrders: Row[];
  receiptLines: Row[];
  receiptEvents: Row[];
  profiles: Row[];
};

const emptySummary: QbReportsSummary = {
  pendingPreparation: 0,
  inPreparation: 0,
  prepared: 0,
  deliveredPendingReceipt: 0,
  draftReceipts: 0,
  issuedReceiptsInPeriod: 0,
  issuedReceiptTotalInPeriod: 0,
  lowStockProducts: 0,
  outOfStockProducts: 0,
  recentMerchandiseReceipts: 0,
  recentOrders: 0,
};

const emptyExports: Record<QbReportExportKey, CsvRecord[]> = {
  inventario: [],
  pedidos: [],
  pendientes_recibo: [],
  recibos: [],
};

function getReportsPermissions(role: UserRole): QbReportsPermissions {
  if (role === "administrador") {
    return {
      role,
      tabs: [
        "resumen",
        "inventario",
        "ingresos",
        "pedidos",
        "pendientes_recibo",
        "recibos",
        "frecuentes",
        "auditoria",
        "exportaciones",
      ],
      exports: ["inventario", "pedidos", "pendientes_recibo", "recibos"],
    };
  }

  if (role === "inventario") {
    return {
      role,
      tabs: [
        "resumen",
        "inventario",
        "ingresos",
        "pedidos",
        "pendientes_recibo",
        "frecuentes",
        "auditoria",
        "exportaciones",
      ],
      exports: ["inventario", "pedidos", "pendientes_recibo"],
    };
  }

  return { role, tabs: [], exports: [] };
}

function emptyData(permissions: QbReportsPermissions, error?: string): QbReportsData {
  return {
    permissions,
    lookups: { categories: [], customers: [], products: [] },
    summary: emptySummary,
    inventory: [],
    merchandiseReceipts: [],
    orders: [],
    pendingReceipts: [],
    receipts: [],
    frequentCustomers: [],
    customersPendingReceipt: [],
    mostRequestedProducts: [],
    mostDeliveredProducts: [],
    mostMissingProducts: [],
    mostUsedUnits: [],
    auditEvents: [],
    exports: emptyExports,
    error,
  };
}

function str(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function nullableStr(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value: unknown) {
  return value === true;
}

function getId(value: unknown) {
  return str(value);
}

function inDateRange(value: unknown, filters: QbReportFilters) {
  const date = nullableStr(value)?.slice(0, 10);
  if (!date) return false;
  if (filters.startDate && date < filters.startDate) return false;
  if (filters.endDate && date > filters.endDate) return false;
  return true;
}

function applyDateRange<T>(
  query: T,
  column: string,
  filters: QbReportFilters,
): T {
  const withRange = query as T & {
    gte: (field: string, value: string) => T;
    lte: (field: string, value: string) => T;
  };

  let next = query;
  if (filters.startDate) next = withRange.gte(column, filters.startDate);
  if (filters.endDate) next = (next as typeof withRange).lte(column, filters.endDate);
  return next;
}

function firstById(rows: Row[]) {
  return new Map(rows.map((row) => [getId(row.id), row]));
}

function groupBy(rows: Row[], key: string) {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const id = getId(row[key]);
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }

  return groups;
}

function addRanking(
  rows: Map<string, QbRankingRow>,
  id: string,
  name: string,
  quantity = 1,
  detail?: string,
) {
  if (!id) return;
  const current = rows.get(id);

  if (current) {
    current.quantity += quantity;
    return;
  }

  rows.set(id, { id, name, quantity, detail });
}

function topRows(rows: Map<string, QbRankingRow>, limit = 8) {
  return Array.from(rows.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

function includesText(value: string, search?: string) {
  if (!search?.trim()) return true;
  return value.toLowerCase().includes(search.trim().toLowerCase());
}

function userName(profiles: Map<string, Row>, id: unknown) {
  const profile = profiles.get(getId(id));
  return str(profile?.full_name, str(profile?.email, "No registrado"));
}

async function fetchBundle(filters: QbReportFilters): Promise<Bundle | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const productsQuery = supabase
    .from("products")
    .select("id, name, sku, category_id, unit_id, stock_current, stock_min, is_active, requires_classification, is_sellable, is_qb_loss_product, created_at, updated_at")
    .order("name", { ascending: true });

  const [
    productsResult,
    categoriesResult,
    qbUnitsResult,
    productSettingsResult,
    classificationOutputsResult,
    inventoryMovementsResult,
    customersResult,
    locationsResult,
  ] = await Promise.all([
    productsQuery,
    supabase.from("product_categories").select("id, name, is_active").order("name", { ascending: true }),
    supabase.from("qb_units").select("id, symbol, name").order("sort_order", { ascending: true }),
    supabase
      .from("qb_product_unit_settings")
      .select("product_id, base_unit_id, base_inventory_unit_id, base_price_unit_id, is_visible_in_qb_catalog, is_classifiable, classification_mode, is_qb_active"),
    supabase
      .from("qb_product_classification_outputs")
      .select("id, source_product_id, output_product_id, output_type, label, is_active"),
    supabase
      .from("inventory_movements")
      .select("id, product_id, movement_type, quantity, reason, created_by, created_at")
      .order("created_at", { ascending: false })
      .limit(1500),
    supabase
      .from("customer_accounts")
      .select("id, email, full_name, phone, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(800),
    supabase
      .from("qb_customer_locations")
      .select("id, customer_account_id, label, address, reference, is_primary, is_active")
      .limit(1200),
  ]);

  if (
    productsResult.error ||
    categoriesResult.error ||
    qbUnitsResult.error ||
    productSettingsResult.error ||
    classificationOutputsResult.error ||
    inventoryMovementsResult.error ||
    customersResult.error ||
    locationsResult.error
  ) {
    return null;
  }

  let merchandiseReceiptsQuery = supabase
    .from("qb_merchandise_receipts")
    .select("id, receipt_date, reference_code, supplier_name, status, confirmed_by, confirmed_at, created_by, created_at")
    .order("receipt_date", { ascending: false })
    .limit(500);
  merchandiseReceiptsQuery = applyDateRange(merchandiseReceiptsQuery, "receipt_date", filters);

  let ordersQuery = supabase
    .from("qb_orders")
    .select("id, public_reference, customer_account_id, customer_location_id, status, submitted_at, delivered_at, customer_snapshot, location_snapshot, customer_notes, preparation_started_by, preparation_started_at, prepared_by, prepared_at, delivered_by")
    .order("submitted_at", { ascending: false })
    .limit(700);
  ordersQuery = applyDateRange(ordersQuery, "submitted_at", filters);

  let receiptsQuery = supabase
    .from("qb_receipts")
    .select("id, receipt_number, customer_account_id, status, period_start, period_end, distance_factor_percent, exigency_factor_percent, weather_factor_percent, extraordinary_factor_percent, total_amount, issued_by, issued_at, voided_by, voided_at, void_reason, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  receiptsQuery = applyDateRange(receiptsQuery, "created_at", filters);

  const [merchandiseReceiptsResult, ordersResult, receiptsResult, profilesResult] = await Promise.all([
    merchandiseReceiptsQuery,
    ordersQuery,
    receiptsQuery,
    supabase.from("profiles").select("id, full_name, email").limit(1000),
  ]);

  if (
    merchandiseReceiptsResult.error ||
    ordersResult.error ||
    receiptsResult.error ||
    profilesResult.error
  ) {
    return null;
  }

  const merchandiseReceiptIds = (merchandiseReceiptsResult.data ?? []).map((row) => getId(row.id));
  const orderIds = (ordersResult.data ?? []).map((row) => getId(row.id));
  const receiptIds = (receiptsResult.data ?? []).map((row) => getId(row.id));

  const [
    merchandiseLinesResult,
    classificationResultsResult,
    orderItemsResult,
    preparationsResult,
    deliveryMovementsResult,
    receiptOrdersResult,
    receiptLinesResult,
    receiptEventsResult,
  ] = await Promise.all([
    merchandiseReceiptIds.length
      ? supabase
          .from("qb_merchandise_receipt_lines")
          .select("id, receipt_id, product_id, source_label, source_quantity, base_quantity, base_unit_symbol, total_cost")
          .in("receipt_id", merchandiseReceiptIds)
          .limit(1500)
      : Promise.resolve({ data: [], error: null }),
    merchandiseReceiptIds.length
      ? supabase
          .from("qb_merchandise_receipt_classification_results")
          .select("id, line_id, output_type, output_product_id, label, base_quantity, assigned_cost")
          .limit(1500)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from("qb_order_items")
          .select("id, order_id, product_id, source_label, requested_quantity, base_quantity, base_unit_symbol, customer_notes")
          .in("order_id", orderIds)
          .limit(2500)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from("qb_order_preparations")
          .select("id, order_id, status, started_at, prepared_at, started_by, prepared_by, internal_notes")
          .in("order_id", orderIds)
          .limit(900)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length
      ? supabase
          .from("qb_order_delivery_movements")
          .select("id, order_id, preparation_id, preparation_item_id, product_id, delivered_base_quantity, delivered_by, delivered_at")
          .in("order_id", orderIds)
          .limit(2500)
      : Promise.resolve({ data: [], error: null }),
    receiptIds.length
      ? supabase
          .from("qb_receipt_orders")
          .select("id, receipt_id, order_id, customer_account_id, inclusion_status, included_at")
          .in("receipt_id", receiptIds)
          .limit(1500)
      : Promise.resolve({ data: [], error: null }),
    receiptIds.length
      ? supabase
          .from("qb_receipt_lines")
          .select("id, receipt_id, order_id, product_id, product_name_snapshot, delivered_base_quantity, base_unit_symbol, visible_unit_label, base_price_used, final_unit_price, line_total")
          .in("receipt_id", receiptIds)
          .limit(2500)
      : Promise.resolve({ data: [], error: null }),
    receiptIds.length
      ? supabase
          .from("qb_receipt_events")
          .select("id, receipt_id, event_type, metadata, created_by, created_at")
          .in("receipt_id", receiptIds)
          .limit(1500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (
    merchandiseLinesResult.error ||
    classificationResultsResult.error ||
    orderItemsResult.error ||
    preparationsResult.error ||
    deliveryMovementsResult.error ||
    receiptOrdersResult.error ||
    receiptLinesResult.error ||
    receiptEventsResult.error
  ) {
    return null;
  }

  const preparationIds = ((preparationsResult.data ?? []) as Row[]).map((row) => getId(row.id));
  const preparationItemsResult = preparationIds.length
    ? await supabase
        .from("qb_order_preparation_items")
        .select("id, preparation_id, order_item_id, product_id, status, requested_quantity, requested_source_label, actual_quantity, actual_source_label, actual_base_quantity, actual_base_unit_symbol, notes")
        .in("preparation_id", preparationIds)
        .limit(2500)
    : { data: [], error: null };

  if (preparationItemsResult.error) return null;

  const preparationItems = (preparationItemsResult.data ?? []) as Row[];
  const preparationItemsById = firstById(preparationItems);
  const deliveryMovements = ((deliveryMovementsResult.data ?? []) as Row[]).map((movement) => ({
    ...movement,
    base_unit_symbol: str(
      preparationItemsById.get(getId(movement.preparation_item_id))?.actual_base_unit_symbol,
      "N/A",
    ),
  }));

  return {
    products: (productsResult.data ?? []) as Row[],
    categories: (categoriesResult.data ?? []) as Row[],
    qbUnits: (qbUnitsResult.data ?? []) as Row[],
    productSettings: (productSettingsResult.data ?? []) as Row[],
    classificationOutputs: (classificationOutputsResult.data ?? []) as Row[],
    inventoryMovements: (inventoryMovementsResult.data ?? []) as Row[],
    customers: (customersResult.data ?? []) as Row[],
    locations: (locationsResult.data ?? []) as Row[],
    merchandiseReceipts: (merchandiseReceiptsResult.data ?? []) as Row[],
    merchandiseLines: (merchandiseLinesResult.data ?? []) as Row[],
    classificationResults: (classificationResultsResult.data ?? []) as Row[],
    orders: (ordersResult.data ?? []) as Row[],
    orderItems: (orderItemsResult.data ?? []) as Row[],
    preparations: (preparationsResult.data ?? []) as Row[],
    preparationItems,
    deliveryMovements,
    receipts: (receiptsResult.data ?? []) as Row[],
    receiptOrders: (receiptOrdersResult.data ?? []) as Row[],
    receiptLines: (receiptLinesResult.data ?? []) as Row[],
    receiptEvents: (receiptEventsResult.data ?? []) as Row[],
    profiles: (profilesResult.data ?? []) as Row[],
  };
}

function buildInventory(bundle: Bundle, filters: QbReportFilters): QbInventoryReportRow[] {
  const categories = firstById(bundle.categories);
  const units = firstById(bundle.qbUnits);
  const settingsByProduct = firstById(
    bundle.productSettings.map((settings) => ({ ...settings, id: settings.product_id })),
  );
  const outputProducts = new Set(
    bundle.classificationOutputs
      .filter((row) => getId(row.output_product_id))
      .map((row) => getId(row.output_product_id)),
  );
  const movementsByProduct = groupBy(bundle.inventoryMovements, "product_id");

  return bundle.products
    .map((product) => {
      const settings = settingsByProduct.get(getId(product.id));
      const stockCurrent = num(product.stock_current);
      const stockMin = num(product.stock_min);
      const stockStatus =
        stockCurrent <= 0 ? "sin_stock" : stockCurrent <= stockMin ? "stock_bajo" : "ok";
      const baseUnitId = getId(settings?.base_inventory_unit_id) || getId(settings?.base_unit_id);
      const row: QbInventoryReportRow = {
        id: getId(product.id),
        product: str(product.name, "Producto sin nombre"),
        sku: str(product.sku, "Sin SKU"),
        category: str(categories.get(getId(product.category_id))?.name, "Sin categoria"),
        stockCurrent,
        stockMin,
        baseUnit: str(units.get(baseUnitId)?.symbol, "N/A"),
        qbStatus: !settings ? "sin_configuracion" : bool(settings.is_qb_active) ? "activo" : "inactivo",
        catalogVisible: bool(settings?.is_visible_in_qb_catalog),
        stockStatus,
        isClassifiable: bool(settings?.is_classifiable) || bool(product.requires_classification),
        isClassificationResult: outputProducts.has(getId(product.id)),
        isLossProduct: bool(product.is_qb_loss_product),
        lastMovementAt: nullableStr(movementsByProduct.get(getId(product.id))?.[0]?.created_at),
      };

      return row;
    })
    .filter((row) => (filters.category && filters.category !== "all" ? row.category === str(categories.get(filters.category)?.name) : true))
    .filter((row) => (filters.product && filters.product !== "all" ? row.id === filters.product : true))
    .filter((row) => includesText(`${row.product} ${row.sku}`, filters.q))
    .filter((row) => (filters.inventoryStatus === "low" ? row.stockStatus === "stock_bajo" : true))
    .filter((row) => (filters.inventoryStatus === "out" ? row.stockStatus === "sin_stock" : true))
    .filter((row) => (filters.qbCatalog === "visible" ? row.catalogVisible : true))
    .filter((row) => (filters.qbCatalog === "hidden" ? !row.catalogVisible : true))
    .filter((row) => (filters.qbActive === "active" ? row.qbStatus === "activo" : true))
    .filter((row) => (filters.qbActive === "inactive" ? row.qbStatus !== "activo" : true));
}

function buildMerchandiseReceipts(bundle: Bundle, filters: QbReportFilters): QbMerchandiseReceiptReportRow[] {
  const products = firstById(bundle.products);
  const profiles = firstById(bundle.profiles);
  const linesByReceipt = groupBy(bundle.merchandiseLines, "receipt_id");
  const resultsByLine = groupBy(bundle.classificationResults, "line_id");

  return bundle.merchandiseReceipts
    .map((receipt) => {
      const lines = linesByReceipt.get(getId(receipt.id)) ?? [];
      const firstLine = lines[0];
      const lineResults = lines.flatMap((line) => resultsByLine.get(getId(line.id)) ?? []);
      const resultProducts = lineResults
        .filter((row) => str(row.output_type) === "product")
        .map((row) => str(row.label, str(products.get(getId(row.output_product_id))?.name, "Resultado")))
        .join(", ");

      return {
        id: getId(receipt.id),
        date: str(receipt.receipt_date, str(receipt.created_at)),
        reference: str(receipt.reference_code, getId(receipt.id).slice(0, 8)),
        supplierOrOrigin: str(receipt.supplier_name, "Sin origen"),
        product: firstLine ? str(products.get(getId(firstLine.product_id))?.name, "Producto no disponible") : "Sin lineas",
        sourceQuantity: num(firstLine?.source_quantity),
        sourceLabel: str(firstLine?.source_label, "N/A"),
        baseQuantity: lines.reduce((sum, line) => sum + num(line.base_quantity), 0),
        baseUnit: str(firstLine?.base_unit_symbol, "N/A"),
        isClassified: lineResults.length > 0,
        resultProducts: resultProducts || "Sin clasificacion",
        lossQuantity: lineResults
          .filter((row) => str(row.output_type) === "loss")
          .reduce((sum, row) => sum + num(row.base_quantity), 0),
        status: str(receipt.status, "sin_estado"),
        confirmedBy: userName(profiles, receipt.confirmed_by),
        confirmedAt: nullableStr(receipt.confirmed_at),
        informativeCost: lines.reduce((sum, line) => sum + num(line.total_cost), 0),
      } satisfies QbMerchandiseReceiptReportRow;
    })
    .filter((row) => (filters.product && filters.product !== "all" ? linesByReceipt.get(row.id)?.some((line) => getId(line.product_id) === filters.product) : true))
    .filter((row) => includesText(`${row.reference} ${row.supplierOrOrigin} ${row.product}`, filters.q));
}

function locationLabel(order: Row, locations: Map<string, Row>) {
  const location = locations.get(getId(order.customer_location_id));
  const snapshot = order.location_snapshot as Row | null;
  return str(location?.label, str(snapshot?.label, str(snapshot?.address, "Sin ubicacion")));
}

function customerLabel(customer: Row | undefined) {
  return str(customer?.full_name, str(customer?.email, "Cliente no disponible"));
}

function buildOrders(bundle: Bundle, filters: QbReportFilters): QbOrderReportRow[] {
  const customers = firstById(bundle.customers);
  const locations = firstById(bundle.locations);
  const products = firstById(bundle.products);
  const itemsByOrder = groupBy(bundle.orderItems, "order_id");
  const preparationsByOrder = groupBy(bundle.preparations, "order_id");
  const preparationItemsByPreparation = groupBy(bundle.preparationItems, "preparation_id");

  return bundle.orders
    .map((order) => {
      const customer = customers.get(getId(order.customer_account_id));
      const preparation = preparationsByOrder.get(getId(order.id))?.[0];
      const prepItems = preparation ? preparationItemsByPreparation.get(getId(preparation.id)) ?? [] : [];
      const requestedProducts = (itemsByOrder.get(getId(order.id)) ?? [])
        .map((item) => {
          const product = products.get(getId(item.product_id));
          return `${str(product?.name, "Producto")} ${num(item.requested_quantity)} ${str(item.source_label)}`;
        })
        .join(", ");
      const preparedProducts = prepItems
        .map((item) => {
          const product = products.get(getId(item.product_id));
          return `${str(product?.name, "Producto")} ${num(item.actual_quantity)} ${str(item.actual_source_label, str(item.actual_base_unit_symbol))} (${str(item.status)})`;
        })
        .join(", ");

      return {
        id: getId(order.id),
        reference: str(order.public_reference, getId(order.id).slice(0, 8)),
        date: str(order.submitted_at),
        customer: customerLabel(customer),
        phone: str(customer?.phone, "Sin telefono"),
        location: locationLabel(order, locations),
        status: str(order.status, "sin_estado"),
        requestedProducts,
        preparedProducts: preparedProducts || "Sin preparacion",
        preparationStatus: str(preparation?.status, "sin_preparacion"),
        preparedAt: nullableStr(preparation?.prepared_at) ?? nullableStr(order.prepared_at),
        deliveredAt: nullableStr(order.delivered_at),
      } satisfies QbOrderReportRow;
    })
    .filter((row) => (filters.customer && filters.customer !== "all" ? bundle.orders.find((order) => getId(order.id) === row.id)?.customer_account_id === filters.customer : true))
    .filter((row) => (filters.orderStatus && filters.orderStatus !== "all" ? row.status === filters.orderStatus : true))
    .filter((row) => includesText(`${row.reference} ${row.customer} ${row.requestedProducts}`, filters.q));
}

function buildPendingReceipts(bundle: Bundle, filters: QbReportFilters): QbPendingReceiptReportRow[] {
  const customers = firstById(bundle.customers);
  const locations = firstById(bundle.locations);
  const products = firstById(bundle.products);
  const deliveryByOrder = groupBy(bundle.deliveryMovements, "order_id");
  const pendingOrders = bundle.orders.filter((order) => str(order.status) === "entregado_pendiente_recibo");
  const groups = new Map<string, Row[]>();

  for (const order of pendingOrders) {
    const customerId = getId(order.customer_account_id);
    groups.set(customerId, [...(groups.get(customerId) ?? []), order]);
  }

  return Array.from(groups.entries())
    .map(([customerId, orders]) => {
      const customer = customers.get(customerId);
      const deliveredProducts = orders
        .flatMap((order) => deliveryByOrder.get(getId(order.id)) ?? [])
        .map((movement) => `${str(products.get(getId(movement.product_id))?.name, "Producto")} ${num(movement.delivered_base_quantity)} ${str(movement.base_unit_symbol)}`)
        .join(", ");
      const lastOrder = orders
        .slice()
        .sort((a, b) => str(b.delivered_at).localeCompare(str(a.delivered_at)))[0];

      return {
        customerId,
        customer: customerLabel(customer),
        phone: str(customer?.phone, "Sin telefono"),
        pendingOrders: orders.length,
        lastDeliveredAt: nullableStr(lastOrder?.delivered_at),
        deliveredProducts: deliveredProducts || "Sin movimientos enlazados",
        location: lastOrder ? locationLabel(lastOrder, locations) : "Sin ubicacion",
      } satisfies QbPendingReceiptReportRow;
    })
    .filter((row) => (filters.customer && filters.customer !== "all" ? row.customerId === filters.customer : true))
    .filter((row) => includesText(`${row.customer} ${row.deliveredProducts}`, filters.q));
}

function buildReceipts(bundle: Bundle, filters: QbReportFilters): QbReceiptReportRow[] {
  const customers = firstById(bundle.customers);
  const profiles = firstById(bundle.profiles);
  const ordersByReceipt = groupBy(bundle.receiptOrders, "receipt_id");

  return bundle.receipts
    .map((receipt) => ({
      id: getId(receipt.id),
      number: str(receipt.receipt_number, getId(receipt.id).slice(0, 8)),
      customer: customerLabel(customers.get(getId(receipt.customer_account_id))),
      status: str(receipt.status, "sin_estado"),
      issuedAt: nullableStr(receipt.issued_at),
      totalAmount: num(receipt.total_amount),
      factors: `Dist. ${num(receipt.distance_factor_percent)}% / Exig. ${num(receipt.exigency_factor_percent)}% / Clima ${num(receipt.weather_factor_percent)}% / Ext. ${num(receipt.extraordinary_factor_percent)}%`,
      includedOrders: ordersByReceipt.get(getId(receipt.id))?.length ?? 0,
      issuedBy: userName(profiles, receipt.issued_by),
      voidReason: str(receipt.void_reason, "N/A"),
    }))
    .filter((row) => (filters.customer && filters.customer !== "all" ? bundle.receipts.find((receipt) => getId(receipt.id) === row.id)?.customer_account_id === filters.customer : true))
    .filter((row) => (filters.receiptStatus && filters.receiptStatus !== "all" ? row.status === filters.receiptStatus : true))
    .filter((row) => includesText(`${row.number} ${row.customer}`, filters.q));
}

function buildFrequencies(bundle: Bundle) {
  const customers = firstById(bundle.customers);
  const products = firstById(bundle.products);
  const frequentCustomers = new Map<string, QbRankingRow>();
  const customersPendingReceipt = new Map<string, QbRankingRow>();
  const requestedProducts = new Map<string, QbRankingRow>();
  const deliveredProducts = new Map<string, QbRankingRow>();
  const missingProducts = new Map<string, QbRankingRow>();
  const usedUnits = new Map<string, QbRankingRow>();

  for (const order of bundle.orders) {
    const customerId = getId(order.customer_account_id);
    addRanking(frequentCustomers, customerId, customerLabel(customers.get(customerId)), 1, "pedidos");
    if (str(order.status) === "entregado_pendiente_recibo") {
      addRanking(customersPendingReceipt, customerId, customerLabel(customers.get(customerId)), 1, "pedidos pendientes");
    }
  }

  for (const item of bundle.orderItems) {
    const productId = getId(item.product_id);
    addRanking(requestedProducts, productId, str(products.get(productId)?.name, "Producto"), num(item.requested_quantity), str(item.source_label));
    addRanking(usedUnits, str(item.source_label), str(item.source_label, "Unidad"), 1, "solicitudes");
  }

  for (const movement of bundle.deliveryMovements) {
    const productId = getId(movement.product_id);
    addRanking(deliveredProducts, productId, str(products.get(productId)?.name, "Producto"), num(movement.delivered_base_quantity), str(movement.base_unit_symbol));
  }

  for (const item of bundle.preparationItems) {
    if (str(item.status) !== "no_disponible") continue;
    const productId = getId(item.product_id);
    addRanking(missingProducts, productId, str(products.get(productId)?.name, "Producto"), 1, "faltantes");
  }

  return {
    frequentCustomers: topRows(frequentCustomers),
    customersPendingReceipt: topRows(customersPendingReceipt),
    mostRequestedProducts: topRows(requestedProducts),
    mostDeliveredProducts: topRows(deliveredProducts),
    mostMissingProducts: topRows(missingProducts),
    mostUsedUnits: topRows(usedUnits),
  };
}

function buildAudit(bundle: Bundle, filters: QbReportFilters): QbAuditReportRow[] {
  const profiles = firstById(bundle.profiles);
  const receiptById = firstById(bundle.receipts);
  const events: QbAuditReportRow[] = [];

  for (const receipt of bundle.merchandiseReceipts) {
    events.push({
      id: `ingreso-${getId(receipt.id)}`,
      date: str(receipt.created_at, str(receipt.receipt_date)),
      event: "ingreso_creado",
      entity: str(receipt.reference_code, getId(receipt.id).slice(0, 8)),
      detail: str(receipt.supplier_name, "Ingreso QB"),
      actor: userName(profiles, receipt.created_by),
    });
    if (receipt.confirmed_at) {
      events.push({
        id: `ingreso-confirmado-${getId(receipt.id)}`,
        date: str(receipt.confirmed_at),
        event: "ingreso_confirmado",
        entity: str(receipt.reference_code, getId(receipt.id).slice(0, 8)),
        detail: "Ingreso confirmado con movimiento QB-4",
        actor: userName(profiles, receipt.confirmed_by),
      });
    }
  }

  for (const order of bundle.orders) {
    events.push({
      id: `pedido-${getId(order.id)}`,
      date: str(order.submitted_at),
      event: "pedido_recibido",
      entity: str(order.public_reference, getId(order.id).slice(0, 8)),
      detail: str(order.status),
      actor: "Cliente QB",
    });
    if (order.delivered_at) {
      events.push({
        id: `pedido-entregado-${getId(order.id)}`,
        date: str(order.delivered_at),
        event: "pedido_entregado",
        entity: str(order.public_reference, getId(order.id).slice(0, 8)),
        detail: "Entrega fisica QB-6 confirmada",
        actor: userName(profiles, order.delivered_by),
      });
    }
  }

  for (const preparation of bundle.preparations) {
    events.push({
      id: `preparacion-${getId(preparation.id)}`,
      date: str(preparation.prepared_at, str(preparation.started_at)),
      event: "preparacion_guardada",
      entity: getId(preparation.order_id).slice(0, 8),
      detail: str(preparation.status),
      actor: userName(profiles, preparation.prepared_by),
    });
  }

  for (const event of bundle.receiptEvents) {
    const receipt = receiptById.get(getId(event.receipt_id));
    events.push({
      id: getId(event.id),
      date: str(event.created_at),
      event: str(event.event_type),
      entity: str(receipt?.receipt_number, getId(event.receipt_id).slice(0, 8)),
      detail: "Evento de recibo acumulativo QB-7",
      actor: userName(profiles, event.created_by),
    });
  }

  return events
    .filter((event) => inDateRange(event.date, filters))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 120);
}

function buildSummary(bundle: Bundle, inventory: QbInventoryReportRow[], filters: QbReportFilters): QbReportsSummary {
  const receiptPeriodRows = bundle.receipts.filter(
    (receipt) => str(receipt.status) === "emitido" && inDateRange(str(receipt.issued_at, str(receipt.created_at)), filters),
  );

  return {
    pendingPreparation: bundle.orders.filter((order) => str(order.status) === "pendiente_preparacion").length,
    inPreparation: bundle.orders.filter((order) => str(order.status) === "en_preparacion").length,
    prepared: bundle.orders.filter((order) => str(order.status) === "preparado").length,
    deliveredPendingReceipt: bundle.orders.filter((order) => str(order.status) === "entregado_pendiente_recibo").length,
    draftReceipts: bundle.receipts.filter((receipt) => str(receipt.status) === "borrador").length,
    issuedReceiptsInPeriod: receiptPeriodRows.length,
    issuedReceiptTotalInPeriod: receiptPeriodRows.reduce((sum, receipt) => sum + num(receipt.total_amount), 0),
    lowStockProducts: inventory.filter((row) => row.stockStatus === "stock_bajo").length,
    outOfStockProducts: inventory.filter((row) => row.stockStatus === "sin_stock").length,
    recentMerchandiseReceipts: bundle.merchandiseReceipts.length,
    recentOrders: bundle.orders.length,
  };
}

function buildExports(
  inventory: QbInventoryReportRow[],
  orders: QbOrderReportRow[],
  pendingReceipts: QbPendingReceiptReportRow[],
  receipts: QbReceiptReportRow[],
  permissions: QbReportsPermissions,
): Record<QbReportExportKey, CsvRecord[]> {
  const allExports = {
    inventario: inventory.map((row) => ({
      producto: row.product,
      sku: row.sku,
      categoria: row.category,
      stock_actual: row.stockCurrent,
      unidad_base: row.baseUnit,
      estado_qb: row.qbStatus,
      visible_catalogo_qb: row.catalogVisible,
      estado_stock: row.stockStatus,
      clasificable: row.isClassifiable,
      resultado_clasificacion: row.isClassificationResult,
      merma_loss: row.isLossProduct,
      ultimo_movimiento: row.lastMovementAt,
    })),
    pedidos: orders.map((row) => ({
      referencia: row.reference,
      fecha: row.date,
      cliente: row.customer,
      telefono: row.phone,
      ubicacion: row.location,
      estado: row.status,
      productos_solicitados: row.requestedProducts,
      productos_preparados: row.preparedProducts,
      estado_preparacion: row.preparationStatus,
      preparado_en: row.preparedAt,
      entregado_en: row.deliveredAt,
    })),
    pendientes_recibo: pendingReceipts.map((row) => ({
      cliente: row.customer,
      telefono: row.phone,
      pedidos_pendientes: row.pendingOrders,
      ultima_entrega: row.lastDeliveredAt,
      productos_entregados: row.deliveredProducts,
      ubicacion: row.location,
    })),
    recibos: receipts.map((row) => ({
      numero: row.number,
      cliente: row.customer,
      estado: row.status,
      fecha_emision: row.issuedAt,
      total_recibo: row.totalAmount,
      factores: row.factors,
      pedidos_incluidos: row.includedOrders,
      emisor: row.issuedBy,
      motivo_anulacion: row.voidReason,
    })),
  };

  return {
    inventario: permissions.exports.includes("inventario") ? allExports.inventario : [],
    pedidos: permissions.exports.includes("pedidos") ? allExports.pedidos : [],
    pendientes_recibo: permissions.exports.includes("pendientes_recibo") ? allExports.pendientes_recibo : [],
    recibos: permissions.exports.includes("recibos") ? allExports.recibos : [],
  };
}

export async function getQbReportsData(
  role: UserRole,
  filters: QbReportFilters = {},
): Promise<QbReportsData> {
  noStore();

  const permissions = getReportsPermissions(role);
  if (!permissions.tabs.length) {
    return emptyData(permissions, "El rol actual no tiene acceso a reportes QB.");
  }

  const bundle = await fetchBundle(filters);
  if (!bundle) {
    return emptyData(
      permissions,
      "No se pudieron cargar reportes QB. Revisa que las migraciones QB-2 a QB-7 existan en la base local conectada y que RLS permita lectura.",
    );
  }

  const inventory = buildInventory(bundle, filters);
  const merchandiseReceipts = buildMerchandiseReceipts(bundle, filters);
  const orders = buildOrders(bundle, filters);
  const pendingReceipts = buildPendingReceipts(bundle, filters);
  const receipts = buildReceipts(bundle, filters);
  const frequencies = buildFrequencies(bundle);
  const auditEvents = buildAudit(bundle, filters);
  const summary = buildSummary(bundle, inventory, filters);
  const exports = buildExports(inventory, orders, pendingReceipts, receipts, permissions);

  return {
    permissions,
    lookups: {
      categories: bundle.categories.map((category) => ({
        id: getId(category.id),
        label: str(category.name, "Sin categoria"),
      })),
      customers: bundle.customers.map((customer) => ({
        id: getId(customer.id),
        label: customerLabel(customer),
      })),
      products: bundle.products.map((product) => ({
        id: getId(product.id),
        label: str(product.name, "Producto"),
      })),
    },
    summary,
    inventory,
    merchandiseReceipts,
    orders,
    pendingReceipts,
    receipts: permissions.tabs.includes("recibos") ? receipts : [],
    ...frequencies,
    auditEvents,
    exports,
  };
}
