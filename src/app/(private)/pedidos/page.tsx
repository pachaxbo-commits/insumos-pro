import { PageHeader } from "@/components/layout/page-header";
import { OrderCreationWorkspace } from "@/components/qb-orders/order-creation-workspace";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbInternalOrdersData } from "@/lib/qb-orders/data";

export default async function PedidosPage() {
  await requireRoleAccess("/pedidos");
  const data = await getQbInternalOrdersData(false);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={undefined}
        title="Crear pedidos"
        description=""
      />
      <OrderCreationWorkspace {...data} />
    </div>
  );
}
