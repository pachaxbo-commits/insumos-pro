import { ReportsManagement } from "@/components/reports/reports-management";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbReportsData } from "@/lib/reports/data";
import type { QbReportFilters } from "@/types/reports";

type ReportesPageProps = {
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    q?: string;
    category?: string;
    customer?: string;
    product?: string;
    orderStatus?: string;
    receiptStatus?: string;
    inventoryStatus?: string;
    qbCatalog?: string;
    qbActive?: string;
  }>;
};

function normalizeFilters(params: Awaited<ReportesPageProps["searchParams"]>): QbReportFilters {
  return {
    startDate: params.startDate,
    endDate: params.endDate,
    q: params.q,
    category: params.category && params.category !== "all" ? params.category : "all",
    customer: params.customer && params.customer !== "all" ? params.customer : "all",
    product: params.product && params.product !== "all" ? params.product : "all",
    orderStatus: params.orderStatus && params.orderStatus !== "all" ? params.orderStatus : "all",
    receiptStatus: params.receiptStatus && params.receiptStatus !== "all" ? params.receiptStatus : "all",
    inventoryStatus:
      params.inventoryStatus === "low" || params.inventoryStatus === "out"
        ? params.inventoryStatus
        : "all",
    qbCatalog:
      params.qbCatalog === "visible" || params.qbCatalog === "hidden"
        ? params.qbCatalog
        : "all",
    qbActive:
      params.qbActive === "active" || params.qbActive === "inactive"
        ? params.qbActive
        : "all",
  };
}

export default async function ReportesPage({ searchParams }: ReportesPageProps) {
  const auth = await requireRoleAccess("/reportes");
  const filters = normalizeFilters(await searchParams);
  const data = await getQbReportsData(auth.user.role!, filters);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Auditoria operativa"
        title="Reportes QB"
        description="Supervision de inventario, ingresos, pedidos, entregas y recibos acumulativos sin reportes financieros legacy."
      />

      {data.error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar reportes QB</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      ) : null}

      <ReportsManagement {...data} filters={filters} />
    </div>
  );
}
