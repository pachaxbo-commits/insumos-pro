import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { TestDataResetForm } from "@/components/settings/test-data-reset-form";
import { getTestDataResetPreview } from "@/lib/test-data-reset/actions";
import { requireRoleAccess } from "@/lib/auth/session";

export default async function DatosPruebaPage() {
  await requireRoleAccess("/configuracion/datos-prueba");
  const [receipts, orders, stock, ordersStock] = await Promise.all([
    getTestDataResetPreview("receipts"), getTestDataResetPreview("orders"),
    getTestDataResetPreview("stock"), getTestDataResetPreview("orders_stock"),
  ]);
  return <div className="space-y-4">
    <PageHeader eyebrow="Configuración" title="Datos de prueba" description="Revisa el alcance antes de borrar operaciones de prueba." />
    <SettingsNav current="/configuracion/datos-prueba" />
    {receipts.data && orders.data && stock.data && ordersStock.data
      ? <TestDataResetForm key={receipts.data.revision + orders.data.revision + stock.data.revision + ordersStock.data.revision}
          previews={{ receipts: receipts.data, orders: orders.data, stock: stock.data, orders_stock: ordersStock.data }} />
      : <p role="alert">{receipts.error ?? orders.error ?? stock.error ?? ordersStock.error ?? "No se pudo obtener la vista previa."}</p>}
  </div>;
}
