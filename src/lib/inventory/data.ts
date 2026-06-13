import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateMarginPercentage, getStockStatus } from "@/lib/products/utils";
import type { InventoryFilters, InventoryMovementWithRelations, InventorySummary } from "@/types/inventory";
import type { ProductWithRelations } from "@/types/products";
import type { Profile } from "@/types/auth";

type ProductQueryRow = Omit<ProductWithRelations, "margin_percentage" | "stock_status" | "category" | "unit"> & {
  category: ProductWithRelations["category"] | ProductWithRelations["category"][] | null;
  unit: ProductWithRelations["unit"] | ProductWithRelations["unit"][] | null;
};

type MovementQueryRow = Omit<InventoryMovementWithRelations, "product" | "created_by_profile"> & {
  product: ProductQueryRow | ProductQueryRow[] | null;
  created_by_profile: Pick<Profile, "id" | "full_name" | "role"> | Pick<Profile, "id" | "full_name" | "role">[] | null;
};

export type InventoryData = {
  products: ProductWithRelations[];
  movements: InventoryMovementWithRelations[];
  summary: InventorySummary;
  alerts: ProductWithRelations[];
};

function normalizeProduct(product: ProductQueryRow): ProductWithRelations {
  const category = Array.isArray(product.category) ? product.category[0] ?? null : product.category;
  const unit = Array.isArray(product.unit) ? product.unit[0] ?? null : product.unit;

  return {
    ...product,
    category,
    unit,
    margin_percentage: calculateMarginPercentage(
      Number(product.purchase_price),
      Number(product.sale_price),
    ),
    stock_status: getStockStatus(product),
  };
}

function getDateRange(date?: string) {
  const target = date ? new Date(`${date}T00:00:00`) : new Date();
  const start = new Date(target);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export async function getInventoryData(filters: InventoryFilters = {}): Promise<InventoryData> {
  noStore();

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      products: [],
      movements: [],
      alerts: [],
      summary: {
        totalProducts: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        movementsToday: 0,
      },
    };
  }

  const productSelect =
    "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, is_active, created_at, updated_at, category:product_categories(id, name, description, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)";

  const productsResult = await supabase
    .from("products")
    .select(productSelect)
    .eq("is_active", true)
    .order("name", { ascending: true });

  let movementsQuery = supabase
    .from("inventory_movements")
    .select(
      `id, product_id, movement_type, quantity, stock_before, stock_after, reason, notes, created_by, created_at,
       product:products(${productSelect}),
       created_by_profile:profiles!inventory_movements_created_by_fkey(id, full_name, role)`,
    )
    .order("created_at", { ascending: false })
    .limit(80);

  if (filters.product && filters.product !== "all") {
    movementsQuery = movementsQuery.eq("product_id", filters.product);
  }

  if (filters.type && filters.type !== "all") {
    movementsQuery = movementsQuery.eq("movement_type", filters.type);
  }

  if (filters.date) {
    const range = getDateRange(filters.date);
    movementsQuery = movementsQuery.gte("created_at", range.start).lt("created_at", range.end);
  }

  const todayRange = getDateRange();

  const [movementsResult, movementsTodayResult] = await Promise.all([
    movementsQuery,
    supabase
      .from("inventory_movements")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayRange.start)
      .lt("created_at", todayRange.end),
  ]);

  if (productsResult.error || movementsResult.error) {
    return {
      products: [],
      movements: [],
      alerts: [],
      summary: {
        totalProducts: 0,
        lowStockProducts: 0,
        outOfStockProducts: 0,
        movementsToday: 0,
      },
    };
  }

  const products = ((productsResult.data ?? []) as unknown as ProductQueryRow[]).map(normalizeProduct);
  const alerts = products.filter((product) => product.stock_status !== "ok");
  const movementRows = (movementsResult.data ?? []) as unknown as MovementQueryRow[];

  const movements = movementRows.map((movement) => {
    const product = Array.isArray(movement.product)
      ? movement.product[0] ?? null
      : movement.product;
    const createdByProfile = Array.isArray(movement.created_by_profile)
      ? movement.created_by_profile[0] ?? null
      : movement.created_by_profile;

    return {
      ...movement,
      product: product ? normalizeProduct(product) : null,
      created_by_profile: createdByProfile,
    };
  });

  return {
    products,
    movements,
    alerts,
    summary: {
      totalProducts: products.length,
      lowStockProducts: products.filter((product) => product.stock_status === "stock_bajo").length,
      outOfStockProducts: products.filter((product) => product.stock_status === "sin_stock").length,
      movementsToday: movementsTodayResult.count ?? 0,
    },
  };
}
