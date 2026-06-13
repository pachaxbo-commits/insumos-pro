import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function ComprasPage() {
  await requireRoleAccess("/compras");

  return (
    <FeaturePlaceholder
      title="Compras"
      description="Espacio preparado para ordenes de compra, recepciones y seguimiento a proveedores."
    />
  );
}
