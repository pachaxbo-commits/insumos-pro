import { unstable_noStore as noStore } from "next/cache";

import { calculateMarginPercentage, getStockStatus } from "@/lib/products/utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/auth";
import type {
  AccountPayable,
  AccountReceivableFinance,
  CashMovement,
  Payment,
} from "@/types/finance";
import type { InventoryMovement } from "@/types/inventory";
import type { Product, ProductCategory, ProductWithRelations, UnitOfMeasure } from "@/types/products";
import type { Purchase, PurchaseItem, Supplier } from "@/types/purchases";
import type { Customer, Sale, SaleItem } from "@/types/sales";
import type {
  CsvRecord,
  InventoryMovementReportRow,
  InventoryProductRow,
  RankingRow,
  ReportExportKey,
  ReportFilters,
  ReportOption,
  ReportsData,
  ReportsExportData,
  ReportsPermissions,
  SalesReportRow,
} from "@/types/reports";

const customerSelect =
  "id, name, business_name, nit, phone, email, address, customer_type, credit_limit, current_balance, is_active, created_at, updated_at";
const supplierSelect =
  "id, name, contact_name, phone, address, notes, is_active, created_at, updated_at";
const productSelect =
  "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, is_active, created_at, updated_at, category:product_categories(id, name, description, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)";

type ProductQueryRow = Product & {
  category: ProductCategory | ProductCategory[] | null;
  unit: UnitOfMeasure | UnitOfMeasure[] | null;
};

type QueryBundle = {
  customers: Customer[];
  suppliers: Supplier[];
  products: ProductWithRelations[];
  categories: ProductCategory[];
  sales: Sale[];
  saleItems: SaleItem[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  movements: InventoryMovement[];
  receivables: AccountReceivableFinance[];
  payables: AccountPayable[];
  payments: Payment[];
  cashMovements: CashMovement[];
};

const emptyPermissions: ReportsPermissions = {
  role: "ventas",
  tabs: ["ventas", "clientes", "inventario", "exportaciones"],
  exports: ["ventas", "clientes", "inventario", "productos"],
};

const emptyReports: ReportsData = {
  permissions: emptyPermissions,
  lookups: {
    customers: [],
    suppliers: [],
    products: [],
    categories: [],
  },
  sales: {
    summary: {
      totalSold: 0,
      salesCount: 0,
      averageTicket: 0,
      confirmedCount: 0,
      draftCount: 0,
      canceledCount: 0,
    },
    rows: [],
    byPaymentMethod: [],
    byStatus: [],
    topProducts: [],
    topCustomers: [],
  },
  inventory: {
    summary: {
      totalProducts: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
      purchaseValue: 0,
      saleValue: 0,
      entries: 0,
      outputs: 0,
      shrinkage: 0,
      returns: 0,
      adjustments: 0,
    },
    products: [],
    movements: [],
    highestOutputProducts: [],
  },
  customers: {
    summary: {
      activeCustomers: 0,
      customersWithDebt: 0,
      totalDebt: 0,
      availableCredit: 0,
    },
    rows: [],
    topBuyers: [],
    topDebtors: [],
  },
  purchases: {
    summary: {
      totalPurchased: 0,
      purchasesCount: 0,
      pendingCount: 0,
      confirmedCount: 0,
    },
    rows: [],
    bySupplier: [],
    topProducts: [],
    averageCostByProduct: [],
  },
  finance: {
    summary: {
      salesIncome: 0,
      customerPayments: 0,
      supplierPayments: 0,
      manualExpenses: 0,
      netCash: 0,
      pendingReceivable: 0,
      pendingPayable: 0,
      overdueReceivable: 0,
      overduePayable: 0,
      estimatedProfit: 0,
    },
    cashRows: [],
    receivableRows: [],
    payableRows: [],
  },
  exports: {
    ventas: [],
    productos: [],
    inventario: [],
    clientes: [],
    compras: [],
    cuentas_por_cobrar: [],
    cuentas_por_pagar: [],
    caja: [],
  },
};

function getReportsPermissions(role: UserRole): ReportsPermissions {
  if (role === "administrador" || role === "finanzas") {
    return {
      role,
      tabs: ["ventas", "inventario", "clientes", "compras", "finanzas", "exportaciones"],
      exports: [
        "ventas",
        "productos",
        "inventario",
        "clientes",
        "compras",
        "cuentas_por_cobrar",
        "cuentas_por_pagar",
        "caja",
      ],
    };
  }

  if (role === "inventario") {
    return {
      role,
      tabs: ["inventario", "compras", "exportaciones"],
      exports: ["productos", "inventario", "compras"],
    };
  }

  return {
    role,
    tabs: ["ventas", "inventario", "clientes", "exportaciones"],
    exports: ["ventas", "productos", "inventario", "clientes"],
  };
}

function cloneEmptyData(permissions: ReportsPermissions): ReportsData {
  return {
    ...emptyReports,
    permissions,
    lookups: { customers: [], suppliers: [], products: [], categories: [] },
    sales: { ...emptyReports.sales, rows: [], byPaymentMethod: [], byStatus: [], topProducts: [], topCustomers: [] },
    inventory: { ...emptyReports.inventory, products: [], movements: [], highestOutputProducts: [] },
    customers: { ...emptyReports.customers, rows: [], topBuyers: [], topDebtors: [] },
    purchases: { ...emptyReports.purchases, rows: [], bySupplier: [], topProducts: [], averageCostByProduct: [] },
    finance: { ...emptyReports.finance, cashRows: [], receivableRows: [], payableRows: [] },
    exports: {
      ventas: [],
      productos: [],
      inventario: [],
      clientes: [],
      compras: [],
      cuentas_por_cobrar: [],
      cuentas_por_pagar: [],
      caja: [],
    },
  };
}

function normalizeProduct(product: ProductQueryRow): ProductWithRelations {
  const category = Array.isArray(product.category) ? product.category[0] ?? null : product.category;
  const unit = Array.isArray(product.unit) ? product.unit[0] ?? null : product.unit;

  return {
    ...product,
    category,
    unit,
    margin_percentage: calculateMarginPercentage(
      Number(product.purchase_price),
      Number(product.sale_price),
    ),
    stock_status: getStockStatus(product),
  };
}

function toOptions<T extends { id: string; name: string }>(items: T[]): ReportOption[] {
  return items.map((item) => ({ id: item.id, label: item.name }));
}

function byId<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

function groupByKey<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return groups;
}

function inDateRange(value: string | null | undefined, filters: ReportFilters) {
  if (!value) return false;
  const date = value.slice(0, 10);

  if (filters.startDate && date < filters.startDate) return false;
  if (filters.endDate && date > filters.endDate) return false;

  return true;
}

function applyDateRange<T>(
  query: T,
  column: string,
  filters: ReportFilters,
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

function addRanking(
  map: Map<string, RankingRow>,
  key: string,
  name: string,
  amount: number,
  quantity = 0,
  extra?: string,
) {
  const current = map.get(key);

  if (current) {
    current.amount += amount;
    current.quantity = (current.quantity ?? 0) + quantity;
    return;
  }

  map.set(key, { id: key, name, amount, quantity, extra });
}

function topRows(rows: Map<string, RankingRow>, limit = 8) {
  return Array.from(rows.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

async function fetchReportBundle(filters: ReportFilters): Promise<QueryBundle | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const [customersResult, suppliersResult, categoriesResult, productsResult] = await Promise.all([
    supabase.from("customers").select(customerSelect).order("name", { ascending: true }),
    supabase.from("suppliers").select(supplierSelect).order("name", { ascending: true }),
    supabase
      .from("product_categories")
      .select("id, name, description, is_active, created_at, updated_at")
      .order("name", { ascending: true }),
    supabase.from("products").select(productSelect).order("name", { ascending: true }),
  ]);

  if (
    customersResult.error ||
    suppliersResult.error ||
    categoriesResult.error ||
    productsResult.error
  ) {
    return null;
  }

  let salesQuery = supabase
    .from("sales")
    .select("id, customer_id, sale_date, subtotal, discount, total, payment_type, status, notes, created_by, created_at")
    .order("sale_date", { ascending: false })
    .limit(400);

  salesQuery = applyDateRange(salesQuery, "sale_date", filters);
  if (filters.customer && filters.customer !== "all") salesQuery = salesQuery.eq("customer_id", filters.customer);
  if (filters.salePaymentMethod && filters.salePaymentMethod !== "all") {
    salesQuery = salesQuery.eq("payment_type", filters.salePaymentMethod);
  }
  if (filters.saleStatus && filters.saleStatus !== "all") salesQuery = salesQuery.eq("status", filters.saleStatus);

  let purchasesQuery = supabase
    .from("purchases")
    .select("id, supplier_id, purchase_date, status, payment_status, payment_method, subtotal, total, notes, created_by, created_at, updated_at")
    .order("purchase_date", { ascending: false })
    .limit(400);

  purchasesQuery = applyDateRange(purchasesQuery, "purchase_date", filters);
  if (filters.supplier && filters.supplier !== "all") purchasesQuery = purchasesQuery.eq("supplier_id", filters.supplier);
  if (filters.purchaseStatus && filters.purchaseStatus !== "all") {
    purchasesQuery = purchasesQuery.eq("status", filters.purchaseStatus);
  }
  if (filters.purchasePaymentMethod && filters.purchasePaymentMethod !== "all") {
    purchasesQuery = purchasesQuery.eq("payment_method", filters.purchasePaymentMethod);
  }

  let movementsQuery = supabase
    .from("inventory_movements")
    .select("id, product_id, movement_type, quantity, stock_before, stock_after, reason, notes, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  movementsQuery = applyDateRange(movementsQuery, "created_at", filters);
  if (filters.product && filters.product !== "all") movementsQuery = movementsQuery.eq("product_id", filters.product);
  if (filters.movementType && filters.movementType !== "all") {
    movementsQuery = movementsQuery.eq("movement_type", filters.movementType);
  }

  const [salesResult, purchasesResult, movementsResult, receivablesResult, payablesResult, paymentsResult, cashResult] =
    await Promise.all([
      salesQuery,
      purchasesQuery,
      movementsQuery,
      supabase
        .from("accounts_receivable")
        .select("id, customer_id, sale_id, amount, paid_amount, balance, due_date, status, notes, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(400),
      supabase
        .from("accounts_payable")
        .select("id, supplier_id, purchase_id, amount, paid_amount, balance, due_date, status, notes, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(400),
      supabase
        .from("payments")
        .select("id, payment_type, customer_id, supplier_id, sale_id, purchase_id, accounts_receivable_id, accounts_payable_id, amount, payment_method, payment_date, notes, created_by, created_at")
        .order("payment_date", { ascending: false })
        .limit(500),
      supabase
        .from("cash_movements")
        .select("id, movement_type, source_type, source_id, amount, payment_method, movement_date, notes, created_by, created_at")
        .order("movement_date", { ascending: false })
        .limit(500),
    ]);

  if (
    salesResult.error ||
    purchasesResult.error ||
    movementsResult.error ||
    receivablesResult.error ||
    payablesResult.error ||
    paymentsResult.error ||
    cashResult.error
  ) {
    return null;
  }

  const saleIds = (salesResult.data ?? []).map((sale) => sale.id);
  const purchaseIds = (purchasesResult.data ?? []).map((purchase) => purchase.id);

  const [saleItemsResult, purchaseItemsResult] = await Promise.all([
    saleIds.length
      ? supabase
          .from("sale_items")
          .select("id, sale_id, product_id, quantity, unit_price, subtotal")
          .in("sale_id", saleIds)
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
    purchaseIds.length
      ? supabase
          .from("purchase_items")
          .select("id, purchase_id, product_id, quantity, unit_cost, subtotal, created_at")
          .in("purchase_id", purchaseIds)
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (saleItemsResult.error || purchaseItemsResult.error) return null;

  const customers = (customersResult.data ?? []) as Customer[];
  const suppliers = (suppliersResult.data ?? []) as Supplier[];
  const products = ((productsResult.data ?? []) as unknown as ProductQueryRow[]).map(normalizeProduct);

  return {
    customers,
    suppliers,
    products,
    categories: (categoriesResult.data ?? []) as ProductCategory[],
    sales: (salesResult.data ?? []) as Sale[],
    saleItems: (saleItemsResult.data ?? []) as SaleItem[],
    purchases: (purchasesResult.data ?? []) as Purchase[],
    purchaseItems: (purchaseItemsResult.data ?? []) as PurchaseItem[],
    movements: (movementsResult.data ?? []) as InventoryMovement[],
    receivables: (receivablesResult.data ?? []) as AccountReceivableFinance[],
    payables: (payablesResult.data ?? []) as AccountPayable[],
    payments: (paymentsResult.data ?? []) as Payment[],
    cashMovements: (cashResult.data ?? []) as CashMovement[],
  };
}

function buildSalesReport(bundle: QueryBundle) {
  const customersById = byId(bundle.customers);
  const productsById = byId(bundle.products);
  const topProducts = new Map<string, RankingRow>();
  const topCustomers = new Map<string, RankingRow>();
  const byPaymentMethod = new Map<string, RankingRow>();
  const byStatus = new Map<string, RankingRow>();
  const confirmedSales = bundle.sales.filter((sale) => sale.status === "confirmada");
  const saleItemsBySale = groupByKey(bundle.saleItems, (item) => item.sale_id);

  for (const sale of bundle.sales) {
    addRanking(byStatus, sale.status, sale.status, 1, 1);
    addRanking(byPaymentMethod, sale.payment_type, sale.payment_type, Number(sale.total), 1);
  }

  for (const sale of confirmedSales) {
    const customer = customersById.get(sale.customer_id);
    addRanking(topCustomers, sale.customer_id, customer?.name ?? "Cliente no disponible", Number(sale.total), 1);

    for (const item of saleItemsBySale.get(sale.id) ?? []) {
      const product = productsById.get(item.product_id);
      addRanking(
        topProducts,
        item.product_id,
        product?.name ?? "Producto no disponible",
        Number(item.subtotal),
        Number(item.quantity),
        product?.sku ?? undefined,
      );
    }
  }

  const totalSold = confirmedSales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const rows: SalesReportRow[] = bundle.sales.map((sale) => ({
    id: sale.id,
    date: sale.sale_date,
    customer: customersById.get(sale.customer_id)?.name ?? "Cliente no disponible",
    total: Number(sale.total),
    paymentType: sale.payment_type,
    status: sale.status,
  }));

  return {
    summary: {
      totalSold,
      salesCount: bundle.sales.length,
      averageTicket: confirmedSales.length ? totalSold / confirmedSales.length : 0,
      confirmedCount: confirmedSales.length,
      draftCount: bundle.sales.filter((sale) => sale.status === "borrador").length,
      canceledCount: bundle.sales.filter((sale) => sale.status === "anulada").length,
    },
    rows,
    byPaymentMethod: topRows(byPaymentMethod),
    byStatus: topRows(byStatus),
    topProducts: topRows(topProducts),
    topCustomers: topRows(topCustomers),
  };
}

function buildInventoryReport(bundle: QueryBundle, filters: ReportFilters) {
  const productsById = byId(bundle.products);
  const products = bundle.products
    .filter((product) => (filters.category && filters.category !== "all" ? product.category_id === filters.category : true))
    .filter((product) => (filters.product && filters.product !== "all" ? product.id === filters.product : true));
  const productIds = new Set(products.map((product) => product.id));
  const movements = bundle.movements.filter((movement) => productIds.has(movement.product_id));
  const outputProducts = new Map<string, RankingRow>();

  for (const movement of movements) {
    if (movement.movement_type !== "salida" && movement.movement_type !== "merma") continue;
    const product = productsById.get(movement.product_id);
    addRanking(
      outputProducts,
      movement.product_id,
      product?.name ?? "Producto no disponible",
      Number(movement.quantity),
      Number(movement.quantity),
      movement.movement_type,
    );
  }

  const productRows: InventoryProductRow[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku ?? "Sin SKU",
    category: product.category?.name ?? "Sin categoria",
    unit: product.unit?.abbreviation ?? product.unit?.name ?? "N/A",
    stockCurrent: Number(product.stock_current),
    stockMin: Number(product.stock_min),
    purchaseValue: Number(product.stock_current) * Number(product.purchase_price),
    saleValue: Number(product.stock_current) * Number(product.sale_price),
    status: product.stock_status,
  }));

  const movementRows: InventoryMovementReportRow[] = movements.map((movement) => ({
    id: movement.id,
    date: movement.created_at,
    product: productsById.get(movement.product_id)?.name ?? "Producto no disponible",
    type: movement.movement_type,
    quantity: Number(movement.quantity),
    stockBefore: Number(movement.stock_before),
    stockAfter: Number(movement.stock_after),
    reason: movement.reason,
  }));

  return {
    summary: {
      totalProducts: products.length,
      lowStockProducts: products.filter((product) => product.stock_status === "stock_bajo").length,
      outOfStockProducts: products.filter((product) => product.stock_status === "sin_stock").length,
      purchaseValue: productRows.reduce((sum, product) => sum + product.purchaseValue, 0),
      saleValue: productRows.reduce((sum, product) => sum + product.saleValue, 0),
      entries: movements.filter((movement) => movement.movement_type === "entrada").length,
      outputs: movements.filter((movement) => movement.movement_type === "salida").length,
      shrinkage: movements.filter((movement) => movement.movement_type === "merma").length,
      returns: movements.filter((movement) => movement.movement_type === "devolucion").length,
      adjustments: movements.filter((movement) => movement.movement_type === "ajuste").length,
    },
    products: productRows,
    movements: movementRows,
    highestOutputProducts: topRows(outputProducts),
  };
}

function buildCustomersReport(bundle: QueryBundle, filters: ReportFilters) {
  const confirmedSales = bundle.sales.filter((sale) => sale.status === "confirmada");
  const salesByCustomer = new Map<string, number>();

  for (const sale of confirmedSales) {
    salesByCustomer.set(sale.customer_id, (salesByCustomer.get(sale.customer_id) ?? 0) + Number(sale.total));
  }

  const rows = bundle.customers
    .filter((customer) => (filters.customerType && filters.customerType !== "all" ? customer.customer_type === filters.customerType : true))
    .filter((customer) => {
      if (filters.customerStatus === "active") return customer.is_active;
      if (filters.customerStatus === "inactive") return !customer.is_active;
      return true;
    })
    .filter((customer) => {
      if (filters.debtStatus === "with_debt") return Number(customer.current_balance) > 0;
      if (filters.debtStatus === "without_debt") return Number(customer.current_balance) <= 0;
      return true;
    })
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      type: customer.customer_type,
      status: customer.is_active ? ("activo" as const) : ("inactivo" as const),
      purchasedAmount: salesByCustomer.get(customer.id) ?? 0,
      currentBalance: Number(customer.current_balance),
      creditLimit: Number(customer.credit_limit),
      availableCredit: Math.max(Number(customer.credit_limit) - Number(customer.current_balance), 0),
    }));

  return {
    summary: {
      activeCustomers: rows.filter((customer) => customer.status === "activo").length,
      customersWithDebt: rows.filter((customer) => customer.currentBalance > 0).length,
      totalDebt: rows.reduce((sum, customer) => sum + customer.currentBalance, 0),
      availableCredit: rows.reduce((sum, customer) => sum + customer.availableCredit, 0),
    },
    rows,
    topBuyers: rows
      .map((customer) => ({ id: customer.id, name: customer.name, amount: customer.purchasedAmount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8),
    topDebtors: rows
      .map((customer) => ({ id: customer.id, name: customer.name, amount: customer.currentBalance }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8),
  };
}

function buildPurchasesReport(bundle: QueryBundle) {
  const suppliersById = byId(bundle.suppliers);
  const productsById = byId(bundle.products);
  const confirmedPurchases = bundle.purchases.filter((purchase) => purchase.status === "confirmada");
  const bySupplier = new Map<string, RankingRow>();
  const topProducts = new Map<string, RankingRow>();
  const averageCost = new Map<string, { id: string; name: string; totalCost: number; quantity: number }>();
  const purchaseItemsByPurchase = groupByKey(bundle.purchaseItems, (item) => item.purchase_id);

  for (const purchase of confirmedPurchases) {
    const supplier = purchase.supplier_id ? suppliersById.get(purchase.supplier_id) : null;
    addRanking(bySupplier, purchase.supplier_id ?? "sin-proveedor", supplier?.name ?? "Sin proveedor", Number(purchase.total), 1);

    for (const item of purchaseItemsByPurchase.get(purchase.id) ?? []) {
      const product = productsById.get(item.product_id);
      addRanking(
        topProducts,
        item.product_id,
        product?.name ?? "Producto no disponible",
        Number(item.subtotal),
        Number(item.quantity),
      );
      const current = averageCost.get(item.product_id);
      if (current) {
        current.totalCost += Number(item.subtotal);
        current.quantity += Number(item.quantity);
      } else {
        averageCost.set(item.product_id, {
          id: item.product_id,
          name: product?.name ?? "Producto no disponible",
          totalCost: Number(item.subtotal),
          quantity: Number(item.quantity),
        });
      }
    }
  }

  return {
    summary: {
      totalPurchased: confirmedPurchases.reduce((sum, purchase) => sum + Number(purchase.total), 0),
      purchasesCount: bundle.purchases.length,
      pendingCount: bundle.purchases.filter((purchase) => purchase.payment_status !== "pagada").length,
      confirmedCount: confirmedPurchases.length,
    },
    rows: bundle.purchases.map((purchase) => ({
      id: purchase.id,
      date: purchase.purchase_date,
      supplier: purchase.supplier_id ? suppliersById.get(purchase.supplier_id)?.name ?? "Sin proveedor" : "Sin proveedor",
      total: Number(purchase.total),
      status: purchase.status,
      paymentStatus: purchase.payment_status,
      paymentMethod: purchase.payment_method,
    })),
    bySupplier: topRows(bySupplier),
    topProducts: topRows(topProducts),
    averageCostByProduct: Array.from(averageCost.values())
      .map((item) => ({
        id: item.id,
        name: item.name,
        amount: item.quantity ? item.totalCost / item.quantity : 0,
        quantity: item.quantity,
      }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8),
  };
}

function buildFinanceReport(bundle: QueryBundle, filters: ReportFilters) {
  const customersById = byId(bundle.customers);
  const suppliersById = byId(bundle.suppliers);
  const productsById = byId(bundle.products);
  const saleItemsBySale = groupByKey(bundle.saleItems, (item) => item.sale_id);
  const confirmedSales = bundle.sales.filter((sale) => sale.status === "confirmada");
  const filteredPayments = bundle.payments.filter((payment) => {
    if (!inDateRange(payment.payment_date, filters)) return false;
    if (filters.financePaymentMethod && filters.financePaymentMethod !== "all") {
      return payment.payment_method === filters.financePaymentMethod;
    }
    return true;
  });
  const filteredCash = bundle.cashMovements.filter((movement) => {
    if (!inDateRange(movement.movement_date, filters)) return false;
    if (filters.financePaymentMethod && filters.financePaymentMethod !== "all") {
      return movement.payment_method === filters.financePaymentMethod;
    }
    return true;
  });
  const receivables = bundle.receivables.filter((item) =>
    filters.financeStatus && filters.financeStatus !== "all" ? item.status === filters.financeStatus : true,
  );
  const payables = bundle.payables.filter((item) =>
    filters.financeStatus && filters.financeStatus !== "all" ? item.status === filters.financeStatus : true,
  );
  const estimatedCost = confirmedSales.reduce((sum, sale) => {
    const items = saleItemsBySale.get(sale.id) ?? [];
    return (
      sum +
      items.reduce((itemsSum, item) => {
        const product = productsById.get(item.product_id);
        return itemsSum + Number(item.quantity) * Number(product?.purchase_price ?? 0);
      }, 0)
    );
  }, 0);
  const salesIncome = confirmedSales.reduce((sum, sale) => sum + Number(sale.total), 0);

  return {
    summary: {
      salesIncome,
      customerPayments: filteredPayments
        .filter((payment) => payment.payment_type === "cobro_cliente")
        .reduce((sum, payment) => sum + Number(payment.amount), 0),
      supplierPayments: filteredPayments
        .filter((payment) => payment.payment_type === "pago_proveedor")
        .reduce((sum, payment) => sum + Number(payment.amount), 0),
      manualExpenses: filteredCash
        .filter((movement) => movement.source_type === "gasto_manual")
        .reduce((sum, movement) => sum + Number(movement.amount), 0),
      netCash:
        filteredCash
          .filter((movement) => movement.movement_type === "ingreso")
          .reduce((sum, movement) => sum + Number(movement.amount), 0) -
        filteredCash
          .filter((movement) => movement.movement_type === "egreso")
          .reduce((sum, movement) => sum + Number(movement.amount), 0),
      pendingReceivable: receivables.reduce((sum, item) => sum + Number(item.balance), 0),
      pendingPayable: payables.reduce((sum, item) => sum + Number(item.balance), 0),
      overdueReceivable: receivables.filter((item) => item.status === "vencida").length,
      overduePayable: payables.filter((item) => item.status === "vencida").length,
      estimatedProfit: salesIncome - estimatedCost,
    },
    cashRows: filteredCash.map((movement) => ({
      id: movement.id,
      date: movement.movement_date,
      type: movement.movement_type,
      source: movement.source_type,
      method: movement.payment_method,
      amount: Number(movement.amount),
      notes: movement.notes ?? "",
    })),
    receivableRows: receivables.map((item) => ({
      id: item.id,
      customer: customersById.get(item.customer_id)?.name ?? "Cliente no disponible",
      amount: Number(item.amount),
      paidAmount: Number(item.paid_amount),
      balance: Number(item.balance),
      dueDate: item.due_date ?? "",
      status: item.status,
    })),
    payableRows: payables.map((item) => ({
      id: item.id,
      supplier: item.supplier_id ? suppliersById.get(item.supplier_id)?.name ?? "Proveedor no disponible" : "Sin proveedor",
      amount: Number(item.amount),
      paidAmount: Number(item.paid_amount),
      balance: Number(item.balance),
      dueDate: item.due_date ?? "",
      status: item.status,
    })),
  };
}

function buildExports(
  bundle: QueryBundle,
  salesRows: SalesReportRow[],
  inventoryRows: InventoryProductRow[],
  movementRows: InventoryMovementReportRow[],
  purchaseRows: ReturnType<typeof buildPurchasesReport>["rows"],
  customerRows: ReturnType<typeof buildCustomersReport>["rows"],
  finance: ReportsData["finance"],
): ReportsExportData {
  const exports: ReportsExportData = {
    ventas: salesRows.map((sale) => ({
      id: sale.id,
      fecha: sale.date,
      cliente: sale.customer,
      total: sale.total,
      metodo_pago: sale.paymentType,
      estado: sale.status,
    })),
    productos: bundle.products.map((product) => ({
      id: product.id,
      nombre: product.name,
      sku: product.sku ?? "",
      categoria: product.category?.name ?? "",
      unidad: product.unit?.abbreviation ?? product.unit?.name ?? "",
      stock_actual: Number(product.stock_current),
      stock_minimo: Number(product.stock_min),
      precio_compra: Number(product.purchase_price),
      precio_venta: Number(product.sale_price),
      margen_porcentaje: Number(product.margin_percentage),
      estado: product.is_active ? "activo" : "inactivo",
    })),
    inventario: [
      ...inventoryRows.map((product) => ({
        tipo_registro: "producto",
        id: product.id,
        fecha: "",
        producto: product.name,
        categoria: product.category,
        stock_actual: product.stockCurrent,
        stock_minimo: product.stockMin,
        movimiento: "",
        cantidad: "",
        motivo: "",
      })),
      ...movementRows.map((movement) => ({
        tipo_registro: "movimiento",
        id: movement.id,
        fecha: movement.date,
        producto: movement.product,
        categoria: "",
        stock_actual: movement.stockAfter,
        stock_minimo: "",
        movimiento: movement.type,
        cantidad: movement.quantity,
        motivo: movement.reason,
      })),
    ] as CsvRecord[],
    clientes: customerRows.map((customer) => ({
      id: customer.id,
      nombre: customer.name,
      tipo: customer.type,
      estado: customer.status,
      monto_comprado: customer.purchasedAmount,
      saldo_actual: customer.currentBalance,
      limite_credito: customer.creditLimit,
      credito_disponible: customer.availableCredit,
    })),
    compras: purchaseRows.map((purchase) => ({
      id: purchase.id,
      fecha: purchase.date,
      proveedor: purchase.supplier,
      total: purchase.total,
      estado: purchase.status,
      estado_pago: purchase.paymentStatus,
      metodo_pago: purchase.paymentMethod,
    })),
    cuentas_por_cobrar: finance.receivableRows.map((item) => ({
      id: item.id,
      cliente: item.customer,
      monto: item.amount,
      pagado: item.paidAmount,
      saldo: item.balance,
      vencimiento: item.dueDate,
      estado: item.status,
    })),
    cuentas_por_pagar: finance.payableRows.map((item) => ({
      id: item.id,
      proveedor: item.supplier,
      monto: item.amount,
      pagado: item.paidAmount,
      saldo: item.balance,
      vencimiento: item.dueDate,
      estado: item.status,
    })),
    caja: finance.cashRows.map((item) => ({
      id: item.id,
      fecha: item.date,
      tipo: item.type,
      origen: item.source,
      metodo: item.method,
      monto: item.amount,
      notas: item.notes,
    })),
  };

  return exports;
}

export async function getReportsData(
  role: UserRole,
  filters: ReportFilters = {},
): Promise<ReportsData> {
  noStore();

  const permissions = getReportsPermissions(role);
  const empty = cloneEmptyData(permissions);
  const bundle = await fetchReportBundle(filters);
  if (!bundle) return empty;

  const sales = permissions.tabs.includes("ventas") || permissions.tabs.includes("finanzas")
    ? buildSalesReport(bundle)
    : empty.sales;
  const inventory = permissions.tabs.includes("inventario")
    ? buildInventoryReport(bundle, filters)
    : empty.inventory;
  const customers = permissions.tabs.includes("clientes")
    ? buildCustomersReport(bundle, filters)
    : empty.customers;
  const purchases = permissions.tabs.includes("compras")
    ? buildPurchasesReport(bundle)
    : empty.purchases;
  const finance = permissions.tabs.includes("finanzas")
    ? buildFinanceReport(bundle, filters)
    : empty.finance;
  const exports = buildExports(
    bundle,
    sales.rows,
    inventory.products,
    inventory.movements,
    purchases.rows,
    customers.rows,
    finance,
  );

  const filteredExports = Object.fromEntries(
    Object.entries(exports).map(([key, value]) => [
      key,
      permissions.exports.includes(key as ReportExportKey) ? value : [],
    ]),
  ) as ReportsExportData;

  return {
    permissions,
    lookups: {
      customers: toOptions(bundle.customers),
      suppliers: toOptions(bundle.suppliers),
      products: toOptions(bundle.products),
      categories: toOptions(bundle.categories),
    },
    sales,
    inventory,
    customers,
    purchases,
    finance,
    exports: filteredExports,
  };
}
