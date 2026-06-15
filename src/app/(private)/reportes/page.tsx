import { PageHeader } from "@/components/layout/page-header";
import { ReportsManagement } from "@/components/reports/reports-management";
import { requireRoleAccess } from "@/lib/auth/session";
import { getReportsData } from "@/lib/reports/data";
import { FINANCE_STATUSES, PAYMENT_METHODS_FINANCE } from "@/types/finance";
import { INVENTORY_MOVEMENT_TYPES } from "@/types/inventory";
import { PAYMENT_METHODS, PURCHASE_STATUSES } from "@/types/purchases";
import { CUSTOMER_TYPES, SALE_PAYMENT_TYPES, SALE_STATUSES } from "@/types/sales";
import type { ReportFilters } from "@/types/reports";

type ReportesPageProps = {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    customer?: string;
    salePaymentMethod?: string;
    saleStatus?: string;
    category?: string;
    product?: string;
    movementType?: string;
    customerType?: string;
    customerStatus?: string;
    debtStatus?: string;
    supplier?: string;
    purchaseStatus?: string;
    purchasePaymentMethod?: string;
    financePaymentMethod?: string;
    financeStatus?: string;
  }>;
};

function isOneOf<T extends readonly string[]>(value: string | undefined, options: T) {
  return value === "all" || options.includes(value ?? "");
}

function normalizeFilters(params: Awaited<ReportesPageProps["searchParams"]>): ReportFilters {
  return {
    startDate: params.startDate,
    endDate: params.endDate,
    customer: params.customer,
    salePaymentMethod: isOneOf(params.salePaymentMethod, SALE_PAYMENT_TYPES)
      ? (params.salePaymentMethod as ReportFilters["salePaymentMethod"])
      : "all",
    saleStatus: isOneOf(params.saleStatus, SALE_STATUSES)
      ? (params.saleStatus as ReportFilters["saleStatus"])
      : "all",
    category: params.category,
    product: params.product,
    movementType: isOneOf(params.movementType, INVENTORY_MOVEMENT_TYPES)
      ? (params.movementType as ReportFilters["movementType"])
      : "all",
    customerType: isOneOf(params.customerType, CUSTOMER_TYPES)
      ? (params.customerType as ReportFilters["customerType"])
      : "all",
    customerStatus:
      params.customerStatus === "active" || params.customerStatus === "inactive"
        ? params.customerStatus
        : "all",
    debtStatus:
      params.debtStatus === "with_debt" || params.debtStatus === "without_debt"
        ? params.debtStatus
        : "all",
    supplier: params.supplier,
    purchaseStatus: isOneOf(params.purchaseStatus, PURCHASE_STATUSES)
      ? (params.purchaseStatus as ReportFilters["purchaseStatus"])
      : "all",
    purchasePaymentMethod: isOneOf(params.purchasePaymentMethod, PAYMENT_METHODS)
      ? (params.purchasePaymentMethod as ReportFilters["purchasePaymentMethod"])
      : "all",
    financePaymentMethod: isOneOf(params.financePaymentMethod, PAYMENT_METHODS_FINANCE)
      ? (params.financePaymentMethod as ReportFilters["financePaymentMethod"])
      : "all",
    financeStatus: isOneOf(params.financeStatus, FINANCE_STATUSES)
      ? (params.financeStatus as ReportFilters["financeStatus"])
      : "all",
  };
}

export default async function ReportesPage({ searchParams }: ReportesPageProps) {
  const auth = await requireRoleAccess("/reportes");
  const filters = normalizeFilters(await searchParams);
  const data = await getReportsData(auth.user.role ?? "ventas", filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reportes"
        title="Reportes ejecutivos y operativos"
        description="Analiza ventas, inventario, clientes, compras, finanzas y exporta CSV segun los permisos de cada rol."
      />
      <ReportsManagement {...data} filters={filters} />
    </div>
  );
}
