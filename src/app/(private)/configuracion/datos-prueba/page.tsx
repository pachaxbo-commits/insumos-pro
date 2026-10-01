import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { TestDataResetForm } from "@/components/settings/test-data-reset-form";
import { getTestDataResetPreview } from "@/lib/test-data-reset/actions";
import { testDataResetEnabled } from "@/lib/test-data-reset/config";

export default async function DatosPruebaPage() {
  const [receipts, orders] = await Promise.all([
    getTestDataResetPreview("receipts"), getTestDataResetPreview("orders"),
  ]);
  const error = receipts.error ?? orders.error;
  return <div className="space-y-4">
    <PageHeader eyebrow="Configuración" title="Datos de prueba" description="Revisa los conteos antes de limpiar operaciones de QA. Los datos maestros permanecen intactos." />
    <SettingsNav current="/configuracion/datos-prueba" />
    {error || !receipts.data || !orders.data ? <p role="alert" className="text-sm text-rose-700">{error ?? "No se pudo obtener la vista previa."}</p> :
      <TestDataResetForm previews={{ receipts: receipts.data, orders: orders.data }} enabled={testDataResetEnabled()} />}
  </div>;
}
