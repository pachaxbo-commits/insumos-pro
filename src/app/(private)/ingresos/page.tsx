import { QbIngresosManagement } from "@/components/qb-ingresos/qb-ingresos-management";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRoleAccess } from "@/lib/auth/session";
import { getQbIngresosData } from "@/lib/qb-ingresos/data";

export default async function IngresosPage() {
  const auth = await requireRoleAccess("/ingresos");
  const data = await getQbIngresosData();
  const canManage = auth.user.role === "administrador" || auth.user.role === "inventario";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="QB-4"
        title="Ingresos"
        description="Recepcion fisica de mercaderia con conversiones, clasificacion opcional y trazabilidad de stock."
      />
      {data.error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar ingresos</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      ) : null}
      <QbIngresosManagement {...data} canManage={canManage} />
    </div>
  );
}
