import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateMarginPercentage, getStockStatus } from "@/lib/products/utils";
import type {
  ProductCategory,
  ProductFilters,
  ProductWithRelations,
  UnitOfMeasure,
} from "@/types/products";

type ProductRow = Omit<ProductWithRelations, "margin_percentage" | "stock_status">;

type ProductQueryRow = Omit<ProductRow, "category" | "unit"> & {
  category: ProductCategory | ProductCategory[] | null;
  unit: UnitOfMeasure | UnitOfMeasure[] | null;
};

export type ProductsCatalogData = {
  products: ProductWithRelations[];
  categories: ProductCategory[];
  units: UnitOfMeasure[];
};

export async function getProductsCatalogData(
  filters: ProductFilters = {},
): Promise<ProductsCatalogData> {
  noStore();

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { products: [], categories: [], units: [] };
  }

  const [categoriesResult, unitsResult] = await Promise.all([
    supabase
      .from("product_categories")
      .select("id, name, description, is_active, created_at, updated_at")
      .order("name", { ascending: true }),
    supabase
      .from("units_of_measure")
      .select("id, name, abbreviation, is_active, created_at, updated_at")
      .order("name", { ascending: true }),
  ]);

  let productsQuery = supabase
    .from("products")
    .select(
      "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, is_active, created_at, updated_at, category:product_categories(id, name, description, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)",
    )
    .order("created_at", { ascending: false });

  if (filters.q?.trim()) {
    const query = filters.q.trim().replaceAll("%", "");
    productsQuery = productsQuery.or(`name.ilike.%${query}%,sku.ilike.%${query}%`);
  }

  if (filters.category && filters.category !== "all") {
    productsQuery = productsQuery.eq("category_id", filters.category);
  }

  if (filters.status === "active") {
    productsQuery = productsQuery.eq("is_active", true);
  }

  if (filters.status === "inactive") {
    productsQuery = productsQuery.eq("is_active", false);
  }

  const productsResult = await productsQuery;

  if (categoriesResult.error || unitsResult.error || productsResult.error) {
    return { products: [], categories: [], units: [] };
  }

  const rows = (productsResult.data ?? []) as unknown as ProductQueryRow[];

  const products = rows.map((product) => ({
    ...product,
    category: Array.isArray(product.category) ? product.category[0] ?? null : product.category,
    unit: Array.isArray(product.unit) ? product.unit[0] ?? null : product.unit,
    margin_percentage: calculateMarginPercentage(
      Number(product.purchase_price),
      Number(product.sale_price),
    ),
    stock_status: getStockStatus(product),
  }));

  return {
    categories: (categoriesResult.data ?? []) as ProductCategory[],
    units: (unitsResult.data ?? []) as UnitOfMeasure[],
    products:
      filters.stock === "low"
        ? products.filter((product) => product.stock_status !== "ok")
        : products,
  };
}
