import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateMarginPercentage, getStockStatus } from "@/lib/products/utils";
import type { Profile } from "@/types/auth";
import type { ProductCategory, ProductWithRelations, UnitOfMeasure } from "@/types/products";
import type {
  PurchaseFilters,
  PurchaseItemWithProduct,
  PurchasesSummary,
  PurchaseWithRelations,
  Supplier,
  SupplierFilters,
} from "@/types/purchases";

type ProductQueryRow = Omit<ProductWithRelations, "margin_percentage" | "stock_status" | "category" | "unit"> & {
  category: ProductCategory | ProductCategory[] | null;
  unit: UnitOfMeasure | UnitOfMeasure[] | null;
};

type PurchaseItemQueryRow = Omit<PurchaseItemWithProduct, "product"> & {
  product: ProductQueryRow | ProductQueryRow[] | null;
};

type PurchaseQueryRow = Omit<PurchaseWithRelations, "supplier" | "items" | "created_by_profile"> & {
  supplier: Supplier | Supplier[] | null;
  items: PurchaseItemQueryRow[] | null;
  created_by_profile: Pick<Profile, "id" | "full_name" | "role"> | Pick<Profile, "id" | "full_name" | "role">[] | null;
};

export type SuppliersData = {
  suppliers: Supplier[];
};

export type PurchasesData = {
  purchases: PurchaseWithRelations[];
  suppliers: Supplier[];
  products: ProductWithRelations[];
  summary: PurchasesSummary;
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

function getDateRange(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start: start.toISOString(), end: end.toISOString() };
}

export async function getSuppliersData(filters: SupplierFilters = {}): Promise<SuppliersData> {
  noStore();

  const supabase = await createSupabaseServerClient();

  if (!supabase) return { suppliers: [] };

  let query = supabase
    .from("suppliers")
    .select("id, name, contact_name, phone, address, notes, is_active, created_at, updated_at")
    .order("name", { ascending: true });

  if (filters.q?.trim()) {
    const search = filters.q.trim().replaceAll("%", "");
    query = query.or(`name.ilike.%${search}%,contact_name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  if (filters.status === "active") query = query.eq("is_active", true);
  if (filters.status === "inactive") query = query.eq("is_active", false);

  const { data, error } = await query;

  if (error) return { suppliers: [] };

  return { suppliers: (data ?? []) as Supplier[] };
}

export async function getPurchasesData(filters: PurchaseFilters = {}): Promise<PurchasesData> {
  noStore();

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      purchases: [],
      suppliers: [],
      products: [],
      summary: {
        totalPurchases: 0,
        draftPurchases: 0,
        confirmedPurchases: 0,
        pendingPayments: 0,
      },
    };
  }

  const productSelect =
    "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, is_active, created_at, updated_at, category:product_categories(id, name, description, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)";

  const [suppliersResult, productsResult] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, contact_name, phone, address, notes, is_active, created_at, updated_at")
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select(productSelect)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  let purchasesQuery = supabase
    .from("purchases")
    .select(
      `id, supplier_id, purchase_date, status, payment_status, payment_method, subtotal, total, notes, created_by, created_at, updated_at, canceled_reason, canceled_by, canceled_at, reversal_status,
       supplier:suppliers(id, name, contact_name, phone, address, notes, is_active, created_at, updated_at),
       items:purchase_items(id, purchase_id, product_id, quantity, unit_cost, subtotal, created_at, product:products(${productSelect})),
       created_by_profile:profiles!purchases_created_by_fkey(id, full_name, role)`,
    )
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(80);

  if (filters.supplier && filters.supplier !== "all") {
    purchasesQuery = purchasesQuery.eq("supplier_id", filters.supplier);
  }

  if (filters.status && filters.status !== "all") {
    purchasesQuery = purchasesQuery.eq("status", filters.status);
  }

  if (filters.date) {
    const range = getDateRange(filters.date);
    purchasesQuery = purchasesQuery.gte("purchase_date", range.start.slice(0, 10)).lt("purchase_date", range.end.slice(0, 10));
  }

  const purchasesResult = await purchasesQuery;

  if (suppliersResult.error || productsResult.error || purchasesResult.error) {
    return {
      purchases: [],
      suppliers: [],
      products: [],
      summary: {
        totalPurchases: 0,
        draftPurchases: 0,
        confirmedPurchases: 0,
        pendingPayments: 0,
      },
    };
  }

  const products = ((productsResult.data ?? []) as unknown as ProductQueryRow[]).map(normalizeProduct);
  const rows = (purchasesResult.data ?? []) as unknown as PurchaseQueryRow[];

  const purchases = rows.map((purchase) => {
    const supplier = Array.isArray(purchase.supplier)
      ? purchase.supplier[0] ?? null
      : purchase.supplier;
    const createdByProfile = Array.isArray(purchase.created_by_profile)
      ? purchase.created_by_profile[0] ?? null
      : purchase.created_by_profile;

    return {
      ...purchase,
      supplier,
      created_by_profile: createdByProfile,
      items: (purchase.items ?? []).map((item) => {
        const product = Array.isArray(item.product) ? item.product[0] ?? null : item.product;

        return {
          ...item,
          product: product ? normalizeProduct(product) : null,
        };
      }),
    };
  });

  return {
    suppliers: (suppliersResult.data ?? []) as Supplier[],
    products,
    purchases,
    summary: {
      totalPurchases: purchases.length,
      draftPurchases: purchases.filter((purchase) => purchase.status === "borrador").length,
      confirmedPurchases: purchases.filter((purchase) => purchase.status === "confirmada").length,
      pendingPayments: purchases.filter((purchase) => purchase.payment_status !== "pagada").length,
    },
  };
}
