import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function ProductosPage() {
  await requireRoleAccess("/productos");

  return (
    <FeaturePlaceholder
      title="Productos"
      description="Base preparada para catalogo, precios, presentaciones y control de costos."
    />
  );
}
