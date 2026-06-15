import { FinanceManagement } from "@/components/finance/finance-management";
import { PageHeader } from "@/components/layout/page-header";
import { requireRoleAccess } from "@/lib/auth/session";
import { getFinanceData } from "@/lib/finance/data";
import { FINANCE_STATUSES, type FinanceFilters } from "@/types/finance";

type FinanzasPageProps = {
  searchParams: Promise<{
    arCustomer?: string;
    arStatus?: string;
    arDate?: string;
    apSupplier?: string;
    apStatus?: string;
    apDate?: string;
  }>;
};

function normalizeFilters(params: Awaited<FinanzasPageProps["searchParams"]>): FinanceFilters {
  const statuses: readonly string[] = FINANCE_STATUSES;

  return {
    arCustomer: params.arCustomer,
    arStatus:
      params.arStatus === "all" || statuses.includes(params.arStatus ?? "")
        ? (params.arStatus as FinanceFilters["arStatus"])
        : "all",
    arDate: params.arDate,
    apSupplier: params.apSupplier,
    apStatus:
      params.apStatus === "all" || statuses.includes(params.apStatus ?? "")
        ? (params.apStatus as FinanceFilters["apStatus"])
        : "all",
    apDate: params.apDate,
  };
}

export default async function FinanzasPage({ searchParams }: FinanzasPageProps) {
  const auth = await requireRoleAccess("/finanzas");
  const filters = normalizeFilters(await searchParams);
  const data = await getFinanceData(filters);
  const canManage =
    auth.user.role === "administrador" || auth.user.role === "finanzas";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Finanzas"
        title="Caja, pagos y cuentas"
        description="Controla cuentas por cobrar, cuentas por pagar, pagos, caja diaria e ingresos o gastos manuales."
      />
      <FinanceManagement {...data} filters={filters} canManage={canManage} />
    </div>
  );
}
