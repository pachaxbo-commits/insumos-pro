import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function InventarioPage() {
  await requireRoleAccess("/inventario");

  return (
    <FeaturePlaceholder
      title="Inventario"
      description="Seccion lista para movimientos reales, stock por almacen y ajustes operativos."
    />
  );
}
