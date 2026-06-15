import type { UserRole } from "@/types/auth";
import type { FinancePaymentMethod, FinanceStatus } from "@/types/finance";
import type { InventoryMovementType } from "@/types/inventory";
import type { PaymentMethod, PaymentStatus, PurchaseStatus } from "@/types/purchases";
import type { CustomerType, SalePaymentType, SaleStatus } from "@/types/sales";

export type ReportTab =
  | "ventas"
  | "inventario"
  | "clientes"
  | "compras"
  | "finanzas"
  | "exportaciones";

export type ReportFilters = {
  startDate?: string;
  endDate?: string;
  customer?: string;
  salePaymentMethod?: SalePaymentType | "all";
  saleStatus?: SaleStatus | "all";
  category?: string;
  product?: string;
  movementType?: InventoryMovementType | "all";
  customerType?: CustomerType | "all";
  customerStatus?: "all" | "active" | "inactive";
  debtStatus?: "all" | "with_debt" | "without_debt";
  supplier?: string;
  purchaseStatus?: PurchaseStatus | "all";
  purchasePaymentMethod?: PaymentMethod | "all";
  financePaymentMethod?: FinancePaymentMethod | "all";
  financeStatus?: FinanceStatus | PaymentStatus | "all";
};

export type ReportsPermissions = {
  role: UserRole;
  tabs: ReportTab[];
  exports: ReportExportKey[];
};

export type ReportOption = {
  id: string;
  label: string;
};

export type ReportsLookups = {
  customers: ReportOption[];
  suppliers: ReportOption[];
  products: ReportOption[];
  categories: ReportOption[];
};

export type SalesReportSummary = {
  totalSold: number;
  salesCount: number;
  averageTicket: number;
  confirmedCount: number;
  draftCount: number;
  canceledCount: number;
};

export type SalesReportRow = {
  id: string;
  date: string;
  customer: string;
  total: number;
  paymentType: string;
  status: SaleStatus;
};

export type RankingRow = {
  id: string;
  name: string;
  quantity?: number;
  amount: number;
  extra?: string;
};

export type SalesReportData = {
  summary: SalesReportSummary;
  rows: SalesReportRow[];
  byPaymentMethod: RankingRow[];
  byStatus: RankingRow[];
  topProducts: RankingRow[];
  topCustomers: RankingRow[];
};

export type InventoryReportSummary = {
  totalProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  purchaseValue: number;
  saleValue: number;
  entries: number;
  outputs: number;
  shrinkage: number;
  returns: number;
  adjustments: number;
};

export type InventoryProductRow = {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  stockCurrent: number;
  stockMin: number;
  purchaseValue: number;
  saleValue: number;
  status: "ok" | "stock_bajo" | "sin_stock";
};

export type InventoryMovementReportRow = {
  id: string;
  date: string;
  product: string;
  type: InventoryMovementType;
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  reason: string;
};

export type InventoryReportData = {
  summary: InventoryReportSummary;
  products: InventoryProductRow[];
  movements: InventoryMovementReportRow[];
  highestOutputProducts: RankingRow[];
};

export type CustomersReportSummary = {
  activeCustomers: number;
  customersWithDebt: number;
  totalDebt: number;
  availableCredit: number;
};

export type CustomerReportRow = {
  id: string;
  name: string;
  type: CustomerType;
  status: "activo" | "inactivo";
  purchasedAmount: number;
  currentBalance: number;
  creditLimit: number;
  availableCredit: number;
};

export type CustomersReportData = {
  summary: CustomersReportSummary;
  rows: CustomerReportRow[];
  topBuyers: RankingRow[];
  topDebtors: RankingRow[];
};

export type PurchasesReportSummary = {
  totalPurchased: number;
  purchasesCount: number;
  pendingCount: number;
  confirmedCount: number;
};

export type PurchaseReportRow = {
  id: string;
  date: string;
  supplier: string;
  total: number;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
};

export type PurchasesReportData = {
  summary: PurchasesReportSummary;
  rows: PurchaseReportRow[];
  bySupplier: RankingRow[];
  topProducts: RankingRow[];
  averageCostByProduct: RankingRow[];
};

export type FinanceReportSummary = {
  salesIncome: number;
  customerPayments: number;
  supplierPayments: number;
  manualExpenses: number;
  netCash: number;
  pendingReceivable: number;
  pendingPayable: number;
  overdueReceivable: number;
  overduePayable: number;
  estimatedProfit: number;
};

export type FinanceReportData = {
  summary: FinanceReportSummary;
  cashRows: Array<{
    id: string;
    date: string;
    type: string;
    source: string;
    method: string;
    amount: number;
    notes: string;
  }>;
  receivableRows: Array<{
    id: string;
    customer: string;
    amount: number;
    paidAmount: number;
    balance: number;
    dueDate: string;
    status: FinanceStatus;
  }>;
  payableRows: Array<{
    id: string;
    supplier: string;
    amount: number;
    paidAmount: number;
    balance: number;
    dueDate: string;
    status: FinanceStatus;
  }>;
};

export type ReportExportKey =
  | "ventas"
  | "productos"
  | "inventario"
  | "clientes"
  | "compras"
  | "cuentas_por_cobrar"
  | "cuentas_por_pagar"
  | "caja";

export type CsvRecord = Record<string, string | number | boolean | null>;

export type ReportsExportData = Record<ReportExportKey, CsvRecord[]>;

export type ReportsData = {
  permissions: ReportsPermissions;
  lookups: ReportsLookups;
  sales: SalesReportData;
  inventory: InventoryReportData;
  customers: CustomersReportData;
  purchases: PurchasesReportData;
  finance: FinanceReportData;
  exports: ReportsExportData;
};
