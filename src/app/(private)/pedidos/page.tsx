import { PageHeader } from "@/components/layout/page-header";
import { StockControlBanner } from "@/components/inventory/stock-control-banner";
import { QbOrdersManagement } from "@/components/qb-orders/qb-orders-management";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbInternalOrdersData } from "@/lib/qb-orders/data";
import { getQbOperationalSettingsData } from "@/lib/operational-settings/data";

export default async function PedidosPage() {
  const auth = await requireRoleAccess("/pedidos");
  const canCreateOrder = auth.user.role === "administrador";
  const [data, settings] = await Promise.all([
    getQbInternalOrdersData(false),
    getQbOperationalSettingsData(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operación"
        title="Pedidos"
        description="Prepara los pedidos recibidos y confirma la entrega de las cantidades efectivamente despachadas."
      />
      <StockControlBanner settings={settings} />
      <QbOrdersManagement
        {...data}
        canCreateOrder={canCreateOrder}
        strictStockControl={settings.strictStockControl}
      />
    </div>
  );
}
