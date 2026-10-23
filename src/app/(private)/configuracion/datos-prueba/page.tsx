import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { TestDataResetForm } from "@/components/settings/test-data-reset-form";
import { getTestDataResetPreview } from "@/lib/test-data-reset/actions";
import { testDataResetEnabled } from "@/lib/test-data-reset/config";

export default async function DatosPruebaPage() {
  const enabled = testDataResetEnabled();
  if (!enabled) return <div className="space-y-4">
    <PageHeader eyebrow="Configuración" title="Datos de prueba" description="La limpieza antigua de grupos de prueba fue retirada para proteger las operaciones y auditorías." />
    <SettingsNav current="/configuracion/datos-prueba" />
    <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      Este mecanismo heredado está retirado. QA debe usar fixtures transaccionales; el corte preoperativo requiere el procedimiento separado, su vista previa y autorización explícita.
    </p>
  </div>;

  const [receipts, orders, stock] = await Promise.all([
    getTestDataResetPreview("receipts"), getTestDataResetPreview("orders"), getTestDataResetPreview("stock"),
  ]);
  const error = receipts.error ?? orders.error ?? stock.error;
  return <div className="space-y-4">
    <PageHeader eyebrow="Configuración" title="Datos de prueba" description="Revisa los conteos antes de limpiar operaciones de QA. Los datos maestros permanecen intactos." />
    <SettingsNav current="/configuracion/datos-prueba" />
    {error || !receipts.data || !orders.data || !stock.data ? <p role="alert" className="text-sm text-rose-700">{error ?? "No se pudo obtener la vista previa."}</p> :
      <TestDataResetForm previews={{ receipts: receipts.data, orders: orders.data, stock: stock.data }} enabled={enabled} />}
  </div>;
}
