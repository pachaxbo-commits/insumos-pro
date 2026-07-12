import type { UserRole } from "@/types/auth";

export type QbReportTab =
  | "resumen"
  | "inventario"
  | "ingresos"
  | "pedidos"
  | "pendientes_recibo"
  | "recibos"
  | "frecuentes"
  | "auditoria"
  | "exportaciones";

export type QbReportExportKey =
  | "inventario"
  | "pedidos"
  | "pendientes_recibo"
  | "recibos";

export type QbReportFilters = {
  startDate?: string;
  endDate?: string;
  q?: string;
  category?: string;
  customer?: string;
  product?: string;
  orderStatus?: string;
  receiptStatus?: string;
  inventoryStatus?: "all" | "low" | "out";
  qbCatalog?: "all" | "visible" | "hidden";
  qbActive?: "all" | "active" | "inactive";
};

export type QbReportOption = {
  id: string;
  label: string;
};

export type QbReportsPermissions = {
  role: UserRole;
  tabs: QbReportTab[];
  exports: QbReportExportKey[];
};

export type QbReportsLookups = {
  categories: QbReportOption[];
  customers: QbReportOption[];
  products: QbReportOption[];
};

export type QbReportsSummary = {
  pendingPreparation: number;
  inPreparation: number;
  prepared: number;
  deliveredPendingReceipt: number;
  draftReceipts: number;
  issuedReceiptsInPeriod: number;
  issuedReceiptTotalInPeriod: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  recentMerchandiseReceipts: number;
  recentOrders: number;
};

export type QbInventoryReportRow = {
  id: string;
  product: string;
  sku: string;
  category: string;
  stockCurrent: number;
  stockMin: number;
  baseUnit: string;
  qbStatus: "activo" | "inactivo" | "sin_configuracion";
  catalogVisible: boolean;
  stockStatus: "ok" | "stock_bajo" | "sin_stock";
  isClassifiable: boolean;
  isClassificationResult: boolean;
  isLossProduct: boolean;
  lastMovementAt: string | null;
};

export type QbMerchandiseReceiptReportRow = {
  id: string;
  date: string;
  reference: string;
  supplierOrOrigin: string;
  product: string;
  sourceQuantity: number;
  sourceLabel: string;
  baseQuantity: number;
  baseUnit: string;
  isClassified: boolean;
  resultProducts: string;
  lossQuantity: number;
  status: string;
  confirmedBy: string;
  confirmedAt: string | null;
  informativeCost: number;
};

export type QbOrderReportRow = {
  id: string;
  reference: string;
  date: string;
  customer: string;
  phone: string;
  location: string;
  status: string;
  requestedProducts: string;
  preparedProducts: string;
  preparationStatus: string;
  preparedAt: string | null;
  deliveredAt: string | null;
};

export type QbPendingReceiptReportRow = {
  customerId: string;
  customer: string;
  phone: string;
  pendingOrders: number;
  lastDeliveredAt: string | null;
  deliveredProducts: string;
  location: string;
};

export type QbReceiptReportRow = {
  id: string;
  number: string;
  customer: string;
  status: string;
  issuedAt: string | null;
  totalAmount: number;
  factors: string;
  includedOrders: number;
  issuedBy: string;
  voidReason: string;
};

export type QbRankingRow = {
  id: string;
  name: string;
  quantity: number;
  detail?: string;
};

export type QbAuditReportRow = {
  id: string;
  date: string;
  event: string;
  entity: string;
  detail: string;
  actor: string;
};

export type CsvRecord = Record<string, string | number | boolean | null>;

export type QbReportsExportData = Record<QbReportExportKey, CsvRecord[]>;

export type QbReportsData = {
  permissions: QbReportsPermissions;
  lookups: QbReportsLookups;
  summary: QbReportsSummary;
  inventory: QbInventoryReportRow[];
  merchandiseReceipts: QbMerchandiseReceiptReportRow[];
  orders: QbOrderReportRow[];
  pendingReceipts: QbPendingReceiptReportRow[];
  receipts: QbReceiptReportRow[];
  frequentCustomers: QbRankingRow[];
  customersPendingReceipt: QbRankingRow[];
  mostRequestedProducts: QbRankingRow[];
  mostDeliveredProducts: QbRankingRow[];
  mostMissingProducts: QbRankingRow[];
  mostUsedUnits: QbRankingRow[];
  auditEvents: QbAuditReportRow[];
  exports: QbReportsExportData;
  error?: string;
};
