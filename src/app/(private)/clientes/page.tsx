import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function ClientesPage() {
  await requireRoleAccess("/clientes");

  return (
    <FeaturePlaceholder
      title="Clientes"
      description="Vista inicial para cartera comercial, creditos, contactos y segmentacion."
    />
  );
}
