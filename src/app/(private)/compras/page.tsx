import { PurchaseManagement } from "@/components/purchases/purchase-management";
import { PageHeader } from "@/components/layout/page-header";
import { requireRoleAccess } from "@/lib/auth/session";
import { getPurchasesData } from "@/lib/purchases/data";
import { PURCHASE_STATUSES, type PurchaseFilters } from "@/types/purchases";

type ComprasPageProps = {
  searchParams: Promise<{
    supplier?: string;
    status?: string;
    date?: string;
  }>;
};

function normalizeFilters(params: Awaited<ComprasPageProps["searchParams"]>): PurchaseFilters {
  const statuses: readonly string[] = PURCHASE_STATUSES;

  return {
    supplier: params.supplier,
    status:
      params.status === "all" || statuses.includes(params.status ?? "")
        ? (params.status as PurchaseFilters["status"])
        : "all",
    date: params.date,
  };
}

export default async function ComprasPage({ searchParams }: ComprasPageProps) {
  const auth = await requireRoleAccess("/compras");
  const filters = normalizeFilters(await searchParams);
  const data = await getPurchasesData(filters);
  const canManage =
    auth.user.role === "administrador" || auth.user.role === "inventario";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Abastecimiento"
        title="Compras conectadas al inventario"
        description="Crea borradores, confirma recepciones y genera entradas automaticas de stock con trazabilidad completa."
      />
      <PurchaseManagement {...data} filters={filters} canManage={canManage} />
    </div>
  );
}
