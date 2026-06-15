import { PageHeader } from "@/components/layout/page-header";
import { CustomerManagement } from "@/components/sales/customer-management";
import { requireRoleAccess } from "@/lib/auth/session";
import { getCustomersData } from "@/lib/sales/data";
import { CUSTOMER_TYPES, type CustomerFilters } from "@/types/sales";

type ClientesPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    type?: string;
  }>;
};

function normalizeFilters(params: Awaited<ClientesPageProps["searchParams"]>): CustomerFilters {
  const customerTypes: readonly string[] = CUSTOMER_TYPES;

  return {
    q: params.q,
    status:
      params.status === "active" || params.status === "inactive" || params.status === "all"
        ? params.status
        : "all",
    type:
      params.type === "all" || customerTypes.includes(params.type ?? "")
        ? (params.type as CustomerFilters["type"])
        : "all",
  };
}

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  const auth = await requireRoleAccess("/clientes");
  const filters = normalizeFilters(await searchParams);
  const data = await getCustomersData(filters);
  const canManage =
    auth.user.role === "administrador" || auth.user.role === "ventas";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cartera comercial"
        title="Clientes y credito"
        description="Gestiona clientes de contado y credito, limites comerciales y saldos por cobrar."
      />
      <CustomerManagement {...data} filters={filters} canManage={canManage} />
    </div>
  );
}
