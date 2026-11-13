import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { TestDataResetForm } from "@/components/settings/test-data-reset-form";
import { getTestDataResetPreview } from "@/lib/test-data-reset/actions";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function DatosPruebaPage() {
  await requireRoleAccess("/configuracion/datos-prueba");
  const [receipts, orders] = await Promise.all([
    getTestDataResetPreview("receipts"), getTestDataResetPreview("orders"),
  ]);
  return <div className="space-y-4">
    <PageHeader eyebrow="Configuración" title="Datos de prueba" description="Revisa el alcance antes de borrar operaciones de prueba." />
    <SettingsNav current="/configuracion/datos-prueba" />
    {receipts.data && orders.data
      ? <TestDataResetForm key={receipts.data.revision + orders.data.revision}
          previews={{ receipts: receipts.data, orders: orders.data }} />
      : <p role="alert">{receipts.error ?? orders.error ?? "No se pudo obtener la vista previa."}</p>}
  </div>;
}
