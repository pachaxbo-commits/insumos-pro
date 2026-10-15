import Link from "next/link";

import { requireRoleAccess } from "@/lib/auth/session";
import { todayInBolivia } from "@/lib/date-time";
import { getWarehousePurchases } from "@/lib/warehouse-purchases/data";

import { WarehousePurchaseTable } from "./warehouse-purchase-table";

export default async function WarehousePurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const auth = await requireRoleAccess("/ingresos/compras-almacen");
  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
    ? params.date : todayInBolivia();
  const data = await getWarehousePurchases(date);
  return (
    <main className="qb-warehouse-purchase-print-page space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Almacén · Compras reales</p>
          <h1 className="text-2xl font-semibold">Hoja de Compras para Almacén</h1>
          <p className="mt-1 text-sm text-muted-foreground">Registra lo comprado y escribe el costo referencial útil. El ingreso físico se confirma una sola vez.</p>
        </div>
        <Link href="/ingresos" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Ver ingresos</Link>
      </div>
      {data.error ? <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{data.error}</p> : null}
      <WarehousePurchaseTable
        date={date}
        rows={data.rows}
        expenses={data.expenses}
        products={data.catalog.products.map((product) => {
          const settings = data.catalog.qbProductUnitSettings.find((item) => item.product_id === product.id);
          const baseUnitId = settings?.base_inventory_unit_id ?? settings?.inventory_unit_id ?? settings?.base_unit_id;
          const baseUnit = data.catalog.qbUnits.find((unit) => unit.id === baseUnitId);
          return { id: product.id, name: product.name, matrixColor: product.matrix_color ?? null, baseDimensionId: baseUnit?.dimension_id ?? null };
        })}
        units={data.catalog.qbUnits.map((unit) => ({ id: unit.id, name: unit.name, symbol: unit.symbol,
          dimensionId: unit.dimension_id, factorToBase: Number(unit.conversion_factor_to_base), isActive: unit.is_active }))}
        allowedUnits={data.catalog.qbProductAllowedUnits.map((unit) => ({
          id: unit.id, productId: unit.product_id, context: unit.usage_context,
          unitId: unit.unit_id, presentationId: unit.presentation_id, isActive: unit.is_active,
        }))}
        presentations={data.catalog.qbProductPresentations.map((presentation) => ({
          id: presentation.id, productId: presentation.product_id, name: presentation.name, symbol: presentation.symbol,
          baseUnitId: presentation.base_unit_id, isActive: presentation.is_active, allowPurchase: presentation.allow_purchase,
        }))}
        canManage={auth.user.role === "administrador" || auth.user.role === "inventario"}
        canConfigureUnits={auth.user.role === "administrador"}
      />
    </main>
  );
}
