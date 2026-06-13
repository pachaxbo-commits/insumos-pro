import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function ReportesPage() {
  await requireRoleAccess("/reportes");

  return (
    <FeaturePlaceholder
      title="Reportes"
      description="Espacio reservado para analitica operativa, rentabilidad y reportes descargables."
    />
  );
}
