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
        eyebrow="Paso 1 de 3 · Administrador"
        title="Crear pedidos"
        description="Esta es la única tarea habilitada para administración durante esta etapa."
      />
      <OrderCreationWorkspace {...data} />
    </div>
  );
}
