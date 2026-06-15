import { PageHeader } from "@/components/layout/page-header";
import { SalesManagement } from "@/components/sales/sales-management";
import { requireRoleAccess } from "@/lib/auth/session";
import { getSalesData } from "@/lib/sales/data";
import { SALE_STATUSES, type SaleFilters } from "@/types/sales";

type VentasPageProps = {
  searchParams: Promise<{
    customer?: string;
    status?: string;
    date?: string;
  }>;
};

function normalizeFilters(params: Awaited<VentasPageProps["searchParams"]>): SaleFilters {
  const statuses: readonly string[] = SALE_STATUSES;

  return {
    customer: params.customer,
    status:
      params.status === "all" || statuses.includes(params.status ?? "")
        ? (params.status as SaleFilters["status"])
        : "all",
    date: params.date,
  };
}

export default async function VentasPage({ searchParams }: VentasPageProps) {
  const auth = await requireRoleAccess("/ventas");
  const filters = normalizeFilters(await searchParams);
  const data = await getSalesData(filters);
  const canManage =
    auth.user.role === "administrador" || auth.user.role === "ventas";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ventas"
        title="Ventas conectadas al inventario"
        description="Registra borradores, confirma ventas, descuenta stock y controla credito sin permitir saldos fuera de limite."
      />
      <SalesManagement {...data} filters={filters} canManage={canManage} />
    </div>
  );
}
