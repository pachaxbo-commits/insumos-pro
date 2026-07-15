import { PageHeader } from "@/components/layout/page-header";
import { QbOrdersManagement } from "@/components/qb-orders/qb-orders-management";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbInternalOrdersData } from "@/lib/qb-orders/data";

export default async function PedidosPage() {
  await requireRoleAccess("/pedidos");
  const data = await getQbInternalOrdersData();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Pedidos"
        description="Prepara los pedidos recibidos y confirma la entrega de las cantidades efectivamente despachadas."
      />
      <QbOrdersManagement {...data} />
    </div>
  );
}
