import { unstable_noStore as noStore } from "next/cache";

import { getProductsCatalogData } from "@/lib/products/data";
import { calculateMarginPercentage, getStockStatus } from "@/lib/products/utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/auth";
import type {
  ProductCategory,
  ProductWithRelations,
  UnitOfMeasure,
} from "@/types/products";
import type {
  QbIngresosData,
  QbMerchandiseReceiptClassificationResult,
  QbMerchandiseReceiptLineWithRelations,
  QbMerchandiseReceiptMovement,
  QbMerchandiseReceiptWithRelations,
} from "@/types/qb-ingresos";

type ProductQueryRow = Omit<
  ProductWithRelations,
  "margin_percentage" | "stock_status" | "category" | "unit"
> & {
  category: ProductCategory | ProductCategory[] | null;
  unit: UnitOfMeasure | UnitOfMeasure[] | null;
};

type ClassificationResultQueryRow = Omit<
  QbMerchandiseReceiptClassificationResult,
  "output_product"
> & {
  output_product: ProductQueryRow | ProductQueryRow[] | null;
};

type MovementQueryRow = Omit<QbMerchandiseReceiptMovement, "product"> & {
  product: ProductQueryRow | ProductQueryRow[] | null;
};

type LineQueryRow = Omit<
  QbMerchandiseReceiptLineWithRelations,
  "product" | "classification_results" | "movements"
> & {
  product: ProductQueryRow | ProductQueryRow[] | null;
  classification_results: ClassificationResultQueryRow[] | null;
  movements: MovementQueryRow[] | null;
};

type ReceiptQueryRow = Omit<
  QbMerchandiseReceiptWithRelations,
  "lines" | "created_by_profile"
> & {
  lines: LineQueryRow[] | null;
  created_by_profile:
    | Pick<Profile, "id" | "full_name" | "role">
    | Pick<Profile, "id" | "full_name" | "role">[]
    | null;
};

function normalizeProduct(product: ProductQueryRow): ProductWithRelations {
  const category = Array.isArray(product.category) ? product.category[0] ?? null : product.category;
  const unit = Array.isArray(product.unit) ? product.unit[0] ?? null : product.unit;

  return {
    ...product,
    requires_classification: Boolean(product.requires_classification),
    is_sellable: product.is_sellable !== false,
    catalog_description: product.catalog_description ?? null,
    catalog_sort_order: Number(product.catalog_sort_order ?? 0),
    catalog_min_quantity: Number(product.catalog_min_quantity ?? 1),
    catalog_quantity_step: Number(product.catalog_quantity_step ?? 1),
    category,
    unit,
    margin_percentage: calculateMarginPercentage(
      Number(product.purchase_price),
      Number(product.sale_price),
    ),
    stock_status: getStockStatus(product),
  };
}

function getQbIngresosWarning(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("does not exist") ||
    normalizedMessage.includes("could not find") ||
    normalizedMessage.includes("relation")
  ) {
    return "El registro de ingresos no está disponible. Comunícate con el administrador de QB Insumos.";
  }

  return "No pudimos cargar el registro de ingresos. Inténtalo nuevamente o comunícate con el administrador de QB Insumos.";
}

export async function getQbIngresosData(): Promise<QbIngresosData> {
  noStore();

  const catalogData = await getProductsCatalogData(
    { status: "active" },
    { includeQbParametrization: true },
  );

  const supabase = await createSupabaseServerClient();

  const baseData: QbIngresosData = {
    receipts: [],
    products: catalogData.products,
    qbUnitDimensions: catalogData.qbUnitDimensions,
    qbUnits: catalogData.qbUnits,
    qbProductUnitSettings: catalogData.qbProductUnitSettings,
    qbProductPresentations: catalogData.qbProductPresentations,
    qbProductAllowedUnits: catalogData.qbProductAllowedUnits,
    qbProductClassificationOutputs: catalogData.qbProductClassificationOutputs,
    qbParametrizationWarning: catalogData.qbParametrizationWarning,
    error: catalogData.error,
  };

  if (!supabase) {
    return {
      ...baseData,
      error: catalogData.error ?? "No pudimos cargar los ingresos en este momento. Comunícate con el administrador de QB Insumos.",
    };
  }

  const productSelect =
    "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, requires_classification, is_sellable, catalog_description, catalog_sort_order, catalog_min_quantity, catalog_quantity_step, is_active, created_at, updated_at, category:product_categories(id, name, description, catalog_slug, catalog_sort_order, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)";

  const receiptsResult = await supabase
    .from("qb_merchandise_receipts")
    .select(
      `id, receipt_date, status, reference_code, supplier_name, notes, created_by, updated_by, confirmed_by, confirmed_at, annulled_by, annulled_at, annulled_reason, created_at, updated_at,
       created_by_profile:profiles!qb_merchandise_receipts_created_by_fkey(id, full_name, role),
       lines:qb_merchandise_receipt_lines(id, receipt_id, product_id, allowed_unit_id, source_kind, source_unit_id, product_presentation_id, source_label, source_quantity, base_unit_id, base_unit_symbol, base_quantity, conversion_factor_to_base, conversion_snapshot_id, unit_cost, total_cost, requires_classification, notes, created_by, updated_by, created_at, updated_at,
         product:products(${productSelect}),
         classification_results:qb_merchandise_receipt_classification_results(id, line_id, configured_output_id, output_type, output_product_id, label, base_quantity, assigned_cost, notes, sort_order, created_by, updated_by, created_at, updated_at, output_product:products!qb_merchandise_receipt_classification_re_output_product_id_fkey(${productSelect})),
         movements:qb_merchandise_receipt_movements(id, receipt_id, line_id, classification_result_id, inventory_movement_id, product_id, movement_type, movement_role, movement_quantity, created_at, product:products(${productSelect}))
       )`,
    )
    .order("updated_at", { ascending: false })
    .limit(30);

  if (receiptsResult.error) {
    return {
      ...baseData,
      qbIngresosWarning: getQbIngresosWarning(receiptsResult.error.message),
    };
  }

  const rows = (receiptsResult.data ?? []) as unknown as ReceiptQueryRow[];

  return {
    ...baseData,
    receipts: rows.map((receipt) => {
      const createdByProfile = Array.isArray(receipt.created_by_profile)
        ? receipt.created_by_profile[0] ?? null
        : receipt.created_by_profile;

      return {
        ...receipt,
        created_by_profile: createdByProfile,
        lines: (receipt.lines ?? [])
          .map((line) => {
            const product = Array.isArray(line.product) ? line.product[0] ?? null : line.product;

            return {
              ...line,
              product: product ? normalizeProduct(product) : null,
              classification_results: (line.classification_results ?? [])
                .map((result) => {
                  const outputProduct = Array.isArray(result.output_product)
                    ? result.output_product[0] ?? null
                    : result.output_product;

                  return {
                    ...result,
                    output_product: outputProduct ? normalizeProduct(outputProduct) : null,
                  };
                })
                .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
              movements: (line.movements ?? []).map((movement) => {
                const movementProduct = Array.isArray(movement.product)
                  ? movement.product[0] ?? null
                  : movement.product;

                return {
                  ...movement,
                  product: movementProduct ? normalizeProduct(movementProduct) : null,
                };
              }),
            };
          })
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      };
    }),
  };
}
