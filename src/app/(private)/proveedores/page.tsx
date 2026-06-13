import { SupplierManagement } from "@/components/purchases/supplier-management";
import { PageHeader } from "@/components/layout/page-header";
import { requireRoleAccess } from "@/lib/auth/session";
import { getSuppliersData } from "@/lib/purchases/data";
import type { SupplierFilters } from "@/types/purchases";

type ProveedoresPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

function normalizeFilters(params: Awaited<ProveedoresPageProps["searchParams"]>): SupplierFilters {
  return {
    q: params.q,
    status:
      params.status === "active" || params.status === "inactive" || params.status === "all"
        ? params.status
        : "all",
  };
}

export default async function ProveedoresPage({ searchParams }: ProveedoresPageProps) {
  const auth = await requireRoleAccess("/proveedores");
  const filters = normalizeFilters(await searchParams);
  const data = await getSuppliersData(filters);
  const canManage =
    auth.user.role === "administrador" || auth.user.role === "inventario";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Abastecimiento"
        title="Proveedores"
        description="Administra proveedores activos, contactos y notas operativas para compras futuras."
      />
      <SupplierManagement {...data} filters={filters} canManage={canManage} />
    </div>
  );
}
