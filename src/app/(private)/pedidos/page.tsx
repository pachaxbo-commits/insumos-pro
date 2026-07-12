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
        eyebrow="QB-6"
        title="Pedidos"
        description="Preparacion y entrega fisica de pedidos QB; descuenta stock solo al entregar, sin ventas, cobros ni recibos."
      />
      <QbOrdersManagement {...data} />
    </div>
  );
}
