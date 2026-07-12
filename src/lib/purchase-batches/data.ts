import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateMarginPercentage, getStockStatus } from "@/lib/products/utils";
import type { Profile } from "@/types/auth";
import type {
  PurchaseBatchLineWithRelations,
  PurchaseBatchTotals,
  PurchaseBatchWithRelations,
} from "@/types/purchase-batches";
import type { ProductCategory, ProductWithRelations, UnitOfMeasure } from "@/types/products";
import type { Supplier } from "@/types/purchases";

type ProductQueryRow = Omit<ProductWithRelations, "margin_percentage" | "stock_status" | "category" | "unit"> & {
  category: ProductCategory | ProductCategory[] | null;
  unit: UnitOfMeasure | UnitOfMeasure[] | null;
};

type ClassificationWithResults = NonNullable<PurchaseBatchLineWithRelations["classification"]>;

type ClassificationResultQueryRow = Omit<ClassificationWithResults["results"][number], "product"> & {
  product: ProductQueryRow | ProductQueryRow[] | null;
};

type ClassificationQueryRow = Omit<
  ClassificationWithResults,
  "results"
> & {
  results: ClassificationResultQueryRow[] | null;
};

type BatchLineQueryRow = Omit<
  PurchaseBatchLineWithRelations,
  "product" | "supplier" | "classification"
> & {
  product: ProductQueryRow | ProductQueryRow[] | null;
  supplier: Supplier | Supplier[] | null;
  classification: ClassificationQueryRow | ClassificationQueryRow[] | null;
};

type BatchQueryRow = Omit<PurchaseBatchWithRelations, "lines" | "created_by_profile"> & {
  lines: BatchLineQueryRow[] | null;
  child_purchases: PurchaseBatchWithRelations["child_purchases"] | null;
  created_by_profile:
    | Pick<Profile, "id" | "full_name" | "role">
    | Pick<Profile, "id" | "full_name" | "role">[]
    | null;
};

export type PurchaseBatchesData = {
  batches: PurchaseBatchWithRelations[];
  activeBatch: PurchaseBatchWithRelations | null;
  suppliers: Supplier[];
  products: ProductWithRelations[];
  totals: PurchaseBatchTotals;
  error?: string;
};

const emptyTotals: PurchaseBatchTotals = {
  total: 0,
  cash: 0,
  qrTransfer: 0,
  credit: 0,
  bySupplier: [],
};

const supplierSelect = "id, name, contact_name, phone, address, notes, is_active, created_at, updated_at";

const productSelect =
  "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, requires_classification, is_active, created_at, updated_at, category:product_categories(id, name, description, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)";

function normalizeProduct(product: ProductQueryRow): ProductWithRelations {
  const category = Array.isArray(product.category) ? product.category[0] ?? null : product.category;
  const unit = Array.isArray(product.unit) ? product.unit[0] ?? null : product.unit;

  return {
    ...product,
    requires_classification: Boolean(product.requires_classification),
    category,
    unit,
    margin_percentage: calculateMarginPercentage(
      Number(product.purchase_price),
      Number(product.sale_price),
    ),
    stock_status: getStockStatus(product),
  };
}

function calculateTotals(batch: PurchaseBatchWithRelations | null): PurchaseBatchTotals {
  if (!batch) return emptyTotals;

  const supplierTotals = new Map<string, { supplier_id: string; supplier_name: string; total: number }>();

  const totals = batch.lines.reduce(
    (acc, line) => {
      const subtotal = Number(line.subtotal);
      acc.total += subtotal;

      if (line.payment_method === "efectivo") acc.cash += subtotal;
      if (line.payment_method === "qr" || line.payment_method === "transferencia") {
        acc.qrTransfer += subtotal;
      }
      if (line.payment_method === "credito") acc.credit += subtotal;

      const supplierId = line.supplier_id;
      const supplierName = line.supplier_name ?? line.supplier?.name ?? "Proveedor";
      const current = supplierTotals.get(supplierId) ?? {
        supplier_id: supplierId,
        supplier_name: supplierName,
        total: 0,
      };
      current.total += subtotal;
      supplierTotals.set(supplierId, current);

      return acc;
    },
    { ...emptyTotals, bySupplier: [] },
  );

  return {
    ...totals,
    bySupplier: Array.from(supplierTotals.values()).sort((a, b) => b.total - a.total),
  };
}

export async function getPurchaseBatchesData(activeBatchId?: string): Promise<PurchaseBatchesData> {
  noStore();

  const empty: PurchaseBatchesData = {
    batches: [],
    activeBatch: null,
    suppliers: [],
    products: [],
    totals: emptyTotals,
  };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ...empty, error: "Supabase no esta configurado." };

  const [suppliersResult, productsResult, batchesResult] = await Promise.all([
    supabase.from("suppliers").select(supplierSelect).eq("is_active", true).order("name"),
    supabase.from("products").select(productSelect).eq("is_active", true).order("name"),
    supabase
      .from("purchase_batches")
      .select(
        `id, batch_date, status, notes, created_by, confirmed_by, confirmed_at, child_purchase_ids, confirmation_summary, created_at, updated_at,
         lines:purchase_batch_lines(id, batch_id, product_id, supplier_id, product_name, supplier_name, unit_name, unit_abbreviation, requires_classification, quantity, unit_cost, subtotal, payment_method, notes, sort_order, line_revision, created_at, updated_at, product:products(${productSelect}), supplier:suppliers(${supplierSelect}), classification:purchase_batch_line_classifications(id, batch_id, batch_line_id, base_product_id, base_product_name, base_quantity, base_unit_name, base_unit_abbreviation, original_subtotal, waste_quantity, waste_unit_name, waste_unit_abbreviation, distribution_method, status, line_revision, notes, classified_by, classified_at, created_at, updated_at, results:purchase_batch_classification_results(id, classification_id, product_id, product_name, unit_name, unit_abbreviation, quantity, sale_price_snapshot, sale_value, assigned_cost, unit_cost, sort_order, created_at, product:products(${productSelect})))),
         child_purchases:purchases(id, supplier_id, purchase_date, status, payment_status, payment_method, total),
         created_by_profile:profiles!purchase_batches_created_by_fkey(id, full_name, role)`,
      )
      .order("updated_at", { ascending: false })
      .limit(20),
  ]);

  if (suppliersResult.error || productsResult.error || batchesResult.error) {
    return {
      ...empty,
      error:
        suppliersResult.error?.message ??
        productsResult.error?.message ??
        batchesResult.error?.message ??
        "No se pudieron cargar compras multiples.",
    };
  }

  const suppliers = (suppliersResult.data ?? []) as Supplier[];
  const products = ((productsResult.data ?? []) as unknown as ProductQueryRow[]).map(normalizeProduct);
  const rows = (batchesResult.data ?? []) as unknown as BatchQueryRow[];
  const batches = rows.map((batch) => {
    const createdByProfile = Array.isArray(batch.created_by_profile)
      ? batch.created_by_profile[0] ?? null
      : batch.created_by_profile;

    return {
      ...batch,
      child_purchase_ids: batch.child_purchase_ids ?? [],
      confirmation_summary: batch.confirmation_summary ?? {},
      child_purchases: batch.child_purchases ?? [],
      created_by_profile: createdByProfile,
      lines: (batch.lines ?? [])
        .map((line) => {
          const product = Array.isArray(line.product) ? line.product[0] ?? null : line.product;
          const supplier = Array.isArray(line.supplier) ? line.supplier[0] ?? null : line.supplier;
          const classification = Array.isArray(line.classification)
            ? line.classification[0] ?? null
            : line.classification;

          return {
            ...line,
            product: product ? normalizeProduct(product) : null,
            supplier,
            classification: classification
              ? {
                  ...classification,
                  results: (classification.results ?? [])
                    .map((result) => {
                      const resultProduct = Array.isArray(result.product)
                        ? result.product[0] ?? null
                        : result.product;

                      return {
                        ...result,
                        product: resultProduct ? normalizeProduct(resultProduct) : null,
                      };
                    })
                    .sort((a, b) => a.sort_order - b.sort_order),
                }
              : null,
          };
        })
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    };
  });

  const activeBatch =
    batches.find((batch) => batch.id === activeBatchId) ?? batches[0] ?? null;

  return {
    batches,
    activeBatch,
    suppliers,
    products,
    totals: calculateTotals(activeBatch),
  };
}
