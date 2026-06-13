import { InventoryManagement } from "@/components/inventory/inventory-management";
import { PageHeader } from "@/components/layout/page-header";
import { getInventoryData } from "@/lib/inventory/data";
import { requireRoleAccess } from "@/lib/auth/session";
import { INVENTORY_MOVEMENT_TYPES, type InventoryFilters } from "@/types/inventory";

type InventarioPageProps = {
  searchParams: Promise<{
    product?: string;
    type?: string;
    date?: string;
  }>;
};

function normalizeFilters(params: Awaited<InventarioPageProps["searchParams"]>): InventoryFilters {
  const movementTypes: readonly string[] = INVENTORY_MOVEMENT_TYPES;

  return {
    product: params.product,
    type:
      params.type === "all" || movementTypes.includes(params.type ?? "")
        ? (params.type as InventoryFilters["type"])
        : "all",
    date: params.date,
  };
}

export default async function InventarioPage({ searchParams }: InventarioPageProps) {
  const auth = await requireRoleAccess("/inventario");
  const filters = normalizeFilters(await searchParams);
  const data = await getInventoryData(filters);
  const canManage =
    auth.user.role === "administrador" || auth.user.role === "inventario";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inventario"
        title="Movimientos reales de stock"
        description="Registra entradas, salidas, ajustes, mermas y devoluciones con trazabilidad de stock antes y despues."
      />
      <InventoryManagement {...data} filters={filters} canManage={canManage} />
    </div>
  );
}
