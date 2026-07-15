import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";

import { ProductManagement } from "@/components/products/product-management";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireRoleAccess } from "@/lib/auth/session";
import { getProductsCatalogData } from "@/lib/products/data";
import type { ProductFilters } from "@/types/products";

type ProductosPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    status?: string;
    stock?: string;
  }>;
};

function normalizeFilters(params: Awaited<ProductosPageProps["searchParams"]>): ProductFilters {
  return {
    q: params.q,
    category: params.category,
    status:
      params.status === "active" || params.status === "inactive" || params.status === "all"
        ? params.status
        : "all",
    stock: params.stock === "low" ? "low" : "all",
  };
}

export default async function ProductosPage({ searchParams }: ProductosPageProps) {
  const auth = await requireRoleAccess("/productos");
  const filters = normalizeFilters(await searchParams);
  const data = await getProductsCatalogData(filters, { includeQbParametrization: true });
  const canManage =
    auth.user.role === "administrador" || auth.user.role === "inventario";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Gestiona el catálogo, las categorías, las unidades y la información comercial de los productos."
        action={
          <Button asChild variant="outline" className="rounded-xl">
            <Link href="/parametrizacion">
              <SlidersHorizontal className="size-4" />
              Reglas de unidades
            </Link>
          </Button>
        }
      />
      {data.error ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudieron cargar los productos</AlertTitle>
          <AlertDescription>{data.error}</AlertDescription>
        </Alert>
      ) : null}
      <ProductManagement
        products={data.products}
        categories={data.categories}
        units={data.units}
        filters={filters}
        qbUnitDimensions={data.qbUnitDimensions}
        qbUnits={data.qbUnits}
        qbProductUnitSettings={data.qbProductUnitSettings}
        qbProductPresentations={data.qbProductPresentations}
        qbProductAllowedUnits={data.qbProductAllowedUnits}
        qbProductClassificationOutputs={data.qbProductClassificationOutputs}
        qbParametrizationWarning={data.qbParametrizationWarning}
        canManage={canManage}
      />
    </div>
  );
}
