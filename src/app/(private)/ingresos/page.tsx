import Link from "next/link";

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
        eyebrow="Inventario"
        title="Ingresos"
        description="Registra la recepción de mercadería, sus cantidades y la clasificación de productos cuando corresponda."
      />
      {canManage ? <Link href="/ingresos/compras-almacen" className="inline-flex rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50">Abrir Hoja de Compras para Almacén</Link> : null}
      {data.error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar los ingresos</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      ) : null}
      <QbIngresosManagement {...data} canManage={canManage} />
    </div>
  );
}
