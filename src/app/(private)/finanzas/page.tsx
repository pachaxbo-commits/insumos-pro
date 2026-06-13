import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function FinanzasPage() {
  await requireRoleAccess("/finanzas");

  return (
    <FeaturePlaceholder
      title="Finanzas"
      description="Panel pensado para caja, cobranzas, pagos y conciliacion en fases posteriores."
    />
  );
}
