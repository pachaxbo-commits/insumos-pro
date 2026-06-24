import { ProductManagement } from "@/components/products/product-management";
import { PageHeader } from "@/components/layout/page-header";
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
  const data = await getProductsCatalogData(filters);
  const canManage =
    auth.user.role === "administrador" || auth.user.role === "inventario";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Catalogo"
        title="Productos, categorias y unidades"
        description="Gestiona el catalogo base conectado a Supabase. El stock se actualiza mediante movimientos de inventario, compras y ventas confirmadas."
      />
      <ProductManagement {...data} filters={filters} canManage={canManage} />
    </div>
  );
}
