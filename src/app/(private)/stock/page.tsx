import Link from "next/link";

import { StockAdjustmentDialog } from "@/components/products/product-management";
import { PageHeader } from "@/components/layout/page-header";
import { requireRoleAccess } from "@/lib/auth/session";
import { getProductsCatalogData } from "@/lib/products/data";

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function StockPage({ searchParams }: Props) {
  const auth = await requireRoleAccess("/stock");
  const params = await searchParams;
  const page = Math.max(1, Number.isSafeInteger(Number(params.page)) ? Number(params.page) : 1);
  const data = await getProductsCatalogData(
    { q: params.q, status: "active", stock: "all" },
    { page, pageSize: 50, includeQbParametrization: true, includeSummary: true, parametrizationScope: "list" },
  );
  const units = new Map(data.qbUnits.map((unit) => [unit.id, unit.symbol]));
  const settings = new Map(data.qbProductUnitSettings.map((item) => [item.product_id, item]));
  const queryFor = (target: number) => `/stock?page=${target}&q=${encodeURIComponent(params.q ?? "")}`;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Operación" title="Stock" description="Consulta existencias, alertas y movimientos registrados." />
      <form className="flex gap-2" action="/stock">
        <input name="q" defaultValue={params.q ?? ""} placeholder="Buscar producto" className="h-10 w-full max-w-sm rounded-md border bg-white px-3 text-sm" />
        <button className="h-10 rounded-md bg-emerald-900 px-4 text-sm text-white">Buscar</button>
      </form>
      {data.error ? <p role="alert" className="text-sm text-rose-700">{data.error}</p> : null}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-100 text-left"><tr>
            <th className="p-3">Producto</th><th className="p-3 text-right">Stock actual</th>
            <th className="p-3">Unidad</th><th className="p-3">Estado</th><th className="p-3">Movimiento</th>
          </tr></thead>
          <tbody>
            {data.products.map((product) => {
              const config = settings.get(product.id);
              const unit = units.get(config?.base_inventory_unit_id ?? config?.inventory_unit_id ?? config?.base_unit_id ?? "") ?? product.unit?.abbreviation ?? "—";
              return <tr key={product.id} className="border-t">
                <td className="p-3 font-medium">{product.name}</td>
                <td className="p-3 text-right tabular-nums">{Number(product.stock_current).toLocaleString("es-BO", { maximumFractionDigits: 3 })}</td>
                <td className="p-3">{unit}</td>
                <td className="p-3">{product.stock_status === "ok" ? "Normal" : product.stock_status === "stock_bajo" ? "Bajo" : product.stock_status === "sin_stock" ? "Sin stock" : "Regularización pendiente"}</td>
                <td className="p-3"><StockAdjustmentDialog product={product} history={data.movementHistory[product.id] ?? []} canManage={auth.user.role === "administrador" || auth.user.role === "inventario"} /></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-end gap-3 text-sm">
        {page > 1 ? <Link href={queryFor(page - 1)} className="underline">Anterior</Link> : null}
        <span>Página {data.pagination.page} de {data.pagination.totalPages}</span>
        {page < data.pagination.totalPages ? <Link href={queryFor(page + 1)} className="underline">Siguiente</Link> : null}
      </div>
    </div>
  );
}
