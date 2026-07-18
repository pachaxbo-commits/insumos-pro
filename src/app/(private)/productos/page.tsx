import { Suspense } from "react";
import Link from "next/link";
import { PackagePlus, SlidersHorizontal } from "lucide-react";

import { NewProductDialog } from "@/components/products/new-product-dialog";
import { ProductManagement } from "@/components/products/product-management";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireRoleAccess } from "@/lib/auth/session";
import {
  getProductReferenceData,
  getProductsCatalogData,
  PRODUCTS_PAGE_SIZE,
} from "@/lib/products/data";
import { getQbOperationalSettingsData } from "@/lib/operational-settings/data";
import type { ProductFilters } from "@/types/products";

type ProductosPageProps = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    status?: string;
    stock?: string;
    page?: string;
  }>;
};

function normalizeFilters(
  params: Awaited<ProductosPageProps["searchParams"]>,
): ProductFilters {
  return {
    q: params.q,
    category: params.category,
    status:
      params.status === "active" ||
      params.status === "inactive" ||
      params.status === "all"
        ? params.status
        : "all",
    stock: params.stock === "low" ? "low" : "all",
  };
}

function normalizePage(value?: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function ProductsLoadingState() {
  return (
    <div className="space-y-4" aria-label="Cargando productos">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-white/60 bg-white/55"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-2xl border border-white/60 bg-white/55" />
    </div>
  );
}

async function ProductPageActions({ canManage }: { canManage: boolean }) {
  const references = await getProductReferenceData();

  return (
    <div className="flex flex-wrap gap-2">
      {canManage && !references.error ? (
        <NewProductDialog
          categories={references.categories}
          qbUnits={references.qbUnits}
        />
      ) : null}
      <Button asChild variant="outline" className="rounded-xl">
        <Link href="/parametrizacion">
          <SlidersHorizontal className="size-4" />
          Reglas de unidades
        </Link>
      </Button>
    </div>
  );
}

async function ProductsCatalogContent({
  filters,
  page,
  canManage,
  canManagePrice,
}: {
  filters: ProductFilters;
  page: number;
  canManage: boolean;
  canManagePrice: boolean;
}) {
  const [data, operationalSettings] = await Promise.all([
    getProductsCatalogData(filters, {
      includeQbParametrization: true,
      includeSummary: true,
      parametrizationScope: "list",
      page,
      pageSize: PRODUCTS_PAGE_SIZE,
    }),
    getQbOperationalSettingsData(),
  ]);

  return (
    <>
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
        productIdsWithMovements={data.productIdsWithMovements}
        filters={filters}
        qbUnits={data.qbUnits}
        qbProductUnitSettings={data.qbProductUnitSettings}
        qbParametrizationWarning={data.qbParametrizationWarning}
        canManage={canManage}
        canManagePrice={canManagePrice}
        strictStockControl={operationalSettings.strictStockControl}
        pagination={data.pagination}
        summary={data.summary}
      />
    </>
  );
}

export default async function ProductosPage({
  searchParams,
}: ProductosPageProps) {
  const authPromise = requireRoleAccess("/productos");
  const params = await searchParams;
  const filters = normalizeFilters(params);
  const page = normalizePage(params.page);
  const auth = await authPromise;
  const canManage = auth.user.role === "administrador";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Gestiona el catálogo, las categorías, las unidades y la información comercial de los productos."
        action={
          <Suspense
            fallback={
              <Button disabled className="rounded-xl">
                <PackagePlus className="size-4" />
                Nuevo producto
              </Button>
            }
          >
            <ProductPageActions canManage={canManage} />
          </Suspense>
        }
      />
      <Suspense fallback={<ProductsLoadingState />}>
        <ProductsCatalogContent
          filters={filters}
          page={page}
          canManage={canManage}
          canManagePrice={auth.user.role === "administrador"}
        />
      </Suspense>
    </div>
  );
}
