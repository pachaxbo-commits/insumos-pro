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
        eyebrow="Cierre de entregas"
        title="Recibos acumulativos"
        description="Agrupa las entregas confirmadas de cada cliente usando exactamente la cantidad real registrada por el entregador."
      />
      <QbReceiptsManagement {...data} />
    </div>
  );
}
