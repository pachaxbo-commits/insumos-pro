import { PageHeader } from "@/components/layout/page-header";
import { StockView } from "@/components/stock/stock-view";
import { requireRoleAccess } from "@/lib/auth/session";
import { getProductsCatalogData } from "@/lib/products/data";

export default async function StockPage() {
  const auth = await requireRoleAccess("/stock");
  const data = await getProductsCatalogData(
    { status: "active", stock: "all" },
    {
      includeQbParametrization: true,
      includeSummary: false,
      parametrizationScope: "list",
    },
  );

  const unitsMap = Object.fromEntries(data.qbUnits.map((u) => [u.id, u.symbol]));
  const settingsMap = Object.fromEntries(
    data.qbProductUnitSettings.map((item) => [item.product_id, item]),
  );

  const canManage =
    auth.user.role === "administrador" || auth.user.role === "inventario";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Operación"
        title="Stock"
        description="Consulta existencias, alertas y movimientos registrados con scroll continuo y búsqueda en tiempo real."
      />
      {data.error ? (
        <p role="alert" className="text-sm text-rose-700">
          {data.error}
        </p>
      ) : null}
      <StockView
        products={data.products}
        categories={data.categories}
        unitsMap={unitsMap}
        settingsMap={settingsMap}
        movementHistory={data.movementHistory}
        canManage={canManage}
      />
    </div>
  );
}
