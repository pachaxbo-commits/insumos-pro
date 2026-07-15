import { QbParametrizationPanel } from "@/components/products/qb-parametrization-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRoleAccess } from "@/lib/auth/session";
import { getProductsCatalogData } from "@/lib/products/data";

export default async function ParametrizacionPage() {
  const auth = await requireRoleAccess("/parametrizacion");
  const data = await getProductsCatalogData({}, { includeQbParametrization: true });
  const canManage = auth.user.role === "administrador" || auth.user.role === "inventario";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Productos"
        title="Parametrización"
        description="Define las unidades, conversiones y presentaciones disponibles para los productos."
      />
      {data.error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar la base de productos</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      ) : null}
      <QbParametrizationPanel
        products={data.products}
        qbUnitDimensions={data.qbUnitDimensions}
        qbUnits={data.qbUnits}
        qbProductPresentations={data.qbProductPresentations}
        qbParametrizationWarning={data.qbParametrizationWarning}
        canManage={canManage}
      />
    </div>
  );
}
