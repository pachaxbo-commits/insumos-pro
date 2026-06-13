import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function ConfiguracionPage() {
  await requireRoleAccess("/configuracion");

  return (
    <FeaturePlaceholder
      title="Configuracion"
      description="Seccion inicial para parametros de empresa, usuarios y reglas del sistema."
    />
  );
}
