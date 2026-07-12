import { PageHeader } from "@/components/layout/page-header";
import { QbReceiptsManagement } from "@/components/qb-receipts/qb-receipts-management";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbReceiptsData } from "@/lib/qb-receipts/data";

export default async function RecibosPage() {
  await requireRoleAccess("/recibos");
  const data = await getQbReceiptsData();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="QB-7"
        title="Recibos"
        description="Recibos acumulativos no fiscales de pedidos entregados, sin cobros, caja ni cuentas por cobrar."
      />
      <QbReceiptsManagement {...data} />
    </div>
  );
}
