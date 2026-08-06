import { PageHeader } from "@/components/layout/page-header";
import { OrderCreationWorkspace } from "@/components/qb-orders/order-creation-workspace";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbInternalOrdersData } from "@/lib/qb-orders/data";

export default async function PedidosPage() {
  await requireRoleAccess("/pedidos");
  const data = await getQbInternalOrdersData(false);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación de pedidos · Administrador"
        title="Crear pedidos"
        description="Crea pedidos con fecha de entrega y continúa directamente con su preparación o entrega."
      />
      <OrderCreationWorkspace {...data} />
    </div>
  );
}
