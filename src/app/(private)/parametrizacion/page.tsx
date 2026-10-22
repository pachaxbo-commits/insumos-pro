import { QbParametrizationPanel } from "@/components/products/qb-parametrization-panel";
import { QbPhysicalUnitCorrectionPanel } from "@/components/products/qb-physical-unit-correction-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRoleAccess } from "@/lib/auth/session";
import { getProductsCatalogData } from "@/lib/products/data";
import { getPhysicalUnitCorrectionReview } from "@/lib/products/physical-unit-corrections";

export default async function ParametrizacionPage() {
  const auth = await requireRoleAccess("/parametrizacion");
  const data = await getProductsCatalogData({}, { includeQbParametrization: true });
  const canManage = auth.user.role === "administrador";
  const unitCorrectionReview = canManage
    ? await getPhysicalUnitCorrectionReview()
    : { candidates: [], units: [], totalProductsReviewed: 0, auditError: null };

  return (
    <div className="space-y-4">
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
      <QbPhysicalUnitCorrectionPanel
        candidates={unitCorrectionReview.candidates}
        units={unitCorrectionReview.units}
        totalProductsReviewed={unitCorrectionReview.totalProductsReviewed}
        auditError={unitCorrectionReview.auditError}
        canManage={canManage}
      />
    </div>
  );
}
