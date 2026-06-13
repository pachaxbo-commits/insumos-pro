import { FeaturePlaceholder } from "@/components/shared/feature-placeholder";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function VentasPage() {
  await requireRoleAccess("/ventas");

  return (
    <FeaturePlaceholder
      title="Ventas"
      description="Modulo reservado para flujo comercial, facturacion y cuentas por cobrar en la siguiente fase."
    />
  );
}
