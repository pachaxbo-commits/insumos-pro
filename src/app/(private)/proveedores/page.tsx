import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function ProveedoresPage() {
  await requireRoleAccess("/proveedores");

  return (
    <FeaturePlaceholder
      title="Proveedores"
      description="Base visual lista para acuerdos de compra, abastecimiento y seguimiento de entregas."
    />
  );
}
