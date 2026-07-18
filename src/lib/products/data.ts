import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateMarginPercentage, getStockStatus } from "@/lib/products/utils";
import type {
  ProductCategory,
  ProductFilters,
  ProductWithRelations,
  QbProductAllowedUnit,
  QbProductClassificationOutput,
  QbProductPresentation,
  QbProductUnitSettings,
  QbUnit,
  QbUnitDimension,
  UnitOfMeasure,
} from "@/types/products";

type ProductRow = Omit<ProductWithRelations, "margin_percentage" | "stock_status">;
type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

type ProductQueryRow = Omit<ProductRow, "category" | "unit"> & {
  category: ProductCategory | ProductCategory[] | null;
  unit: UnitOfMeasure | UnitOfMeasure[] | null;
};

type QbParametrizationData = {
  qbUnitDimensions: QbUnitDimension[];
  qbUnits: QbUnit[];
  qbProductUnitSettings: QbProductUnitSettings[];
  qbProductPresentations: QbProductPresentation[];
  qbProductAllowedUnits: QbProductAllowedUnit[];
  qbProductClassificationOutputs: QbProductClassificationOutput[];
  qbParametrizationWarning?: string;
};

export type ProductsCatalogData = {
  products: ProductWithRelations[];
  categories: ProductCategory[];
  units: UnitOfMeasure[];
  error?: string;
} & QbParametrizationData;

type ProductsCatalogOptions = {
  includeQbParametrization?: boolean;
};

function getEmptyQbParametrizationData(): QbParametrizationData {
  return {
    qbUnitDimensions: [],
    qbUnits: [],
    qbProductUnitSettings: [],
    qbProductPresentations: [],
    qbProductAllowedUnits: [],
    qbProductClassificationOutputs: [],
  };
}

function getQbParametrizationWarning(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("does not exist") ||
    normalizedMessage.includes("could not find") ||
    normalizedMessage.includes("relation")
  ) {
    return "La configuración de unidades y presentaciones no está disponible. Comunícate con el administrador de QB Insumos.";
  }

  return "No pudimos cargar la configuración de unidades y presentaciones. Inténtalo nuevamente o comunícate con el administrador de QB Insumos.";
}

async function loadQbParametrizationData(
  supabase: SupabaseServerClient,
): Promise<QbParametrizationData> {
  const [
    dimensionsResult,
    qbUnitsResult,
    settingsResult,
    presentationsResult,
    allowedUnitsResult,
    classificationOutputsResult,
  ] = await Promise.all([
      supabase
        .from("qb_unit_dimensions")
        .select(
          "id, code, name, base_unit_code, is_active, sort_order, created_by, updated_by, created_at, updated_at",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("qb_units")
        .select(
          "id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base, is_active, sort_order, created_by, updated_by, created_at, updated_at",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("qb_product_unit_settings")
        .select(
          "product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id, base_price_unit_id, base_sale_price, supports_amount_bs, is_visible_in_qb_catalog, is_classifiable, classification_mode, is_qb_active, internal_notes, notes, created_by, updated_by, created_at, updated_at",
        )
        .order("updated_at", { ascending: false }),
      supabase
        .from("qb_product_presentations")
        .select(
          "id, product_id, name, symbol, contained_quantity, contained_unit_id, base_quantity, base_unit_id, conversion_factor_to_base, allow_purchase, allow_order, allow_sale, allow_inventory, is_active, sort_order, notes, created_by, updated_by, created_at, updated_at",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("qb_product_allowed_units")
        .select(
          "id, product_id, usage_context, unit_id, presentation_id, is_default, quantity_step, min_quantity, is_active, sort_order, notes, created_by, updated_by, created_at, updated_at",
        )
        .order("usage_context", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("qb_product_classification_outputs")
        .select(
          "id, source_product_id, output_type, output_product_id, label, expected_percentage, is_active, sort_order, notes, created_by, updated_by, created_at, updated_at",
        )
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true }),
    ]);

  const qbError =
    dimensionsResult.error ??
    qbUnitsResult.error ??
    settingsResult.error ??
    presentationsResult.error ??
    allowedUnitsResult.error ??
    classificationOutputsResult.error;

  if (qbError) {
    return {
      ...getEmptyQbParametrizationData(),
      qbParametrizationWarning: getQbParametrizationWarning(qbError.message),
    };
  }

  return {
    qbUnitDimensions: (dimensionsResult.data ?? []) as QbUnitDimension[],
    qbUnits: (qbUnitsResult.data ?? []) as QbUnit[],
    qbProductUnitSettings: (settingsResult.data ?? []) as QbProductUnitSettings[],
    qbProductPresentations: (presentationsResult.data ?? []) as QbProductPresentation[],
    qbProductAllowedUnits: (allowedUnitsResult.data ?? []) as QbProductAllowedUnit[],
    qbProductClassificationOutputs: (classificationOutputsResult.data ??
      []) as QbProductClassificationOutput[],
  };
}

export async function getProductsCatalogData(
  filters: ProductFilters = {},
  options: ProductsCatalogOptions = {},
): Promise<ProductsCatalogData> {
  noStore();

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      products: [],
      categories: [],
      units: [],
      ...getEmptyQbParametrizationData(),
      error: "No pudimos cargar los productos en este momento. Comunícate con el administrador de QB Insumos.",
    };
  }

  const [categoriesResult, unitsResult] = await Promise.all([
    supabase
      .from("product_categories")
      .select(
        "id, name, description, catalog_slug, catalog_sort_order, is_active, created_at, updated_at",
      )
      .order("name", { ascending: true }),
    supabase
      .from("units_of_measure")
      .select("id, name, abbreviation, is_active, created_at, updated_at")
      .order("name", { ascending: true }),
  ]);

  let productsQuery = supabase
    .from("products")
    .select(
      "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, requires_classification, is_sellable, catalog_description, catalog_sort_order, catalog_min_quantity, catalog_quantity_step, is_active, created_at, updated_at, category:product_categories(id, name, description, catalog_slug, catalog_sort_order, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)",
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
    return {
      products: [],
      categories: [],
      units: [],
      ...getEmptyQbParametrizationData(),
      error: "No pudimos cargar el Catálogo en este momento. Inténtalo nuevamente o comunícate con el administrador de QB Insumos.",
    };
  }

  const qbParametrizationData = options.includeQbParametrization
    ? await loadQbParametrizationData(supabase)
    : getEmptyQbParametrizationData();
  const rows = (productsResult.data ?? []) as unknown as ProductQueryRow[];

  const products = rows.map((product) => ({
    ...product,
    requires_classification: Boolean(product.requires_classification),
    is_sellable: product.is_sellable !== false,
    catalog_description: product.catalog_description ?? null,
    catalog_sort_order: Number(product.catalog_sort_order ?? 0),
    catalog_min_quantity: Number(product.catalog_min_quantity ?? 1),
    catalog_quantity_step: Number(product.catalog_quantity_step ?? 1),
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
    ...qbParametrizationData,
    products:
      filters.stock === "low"
        ? products.filter((product) => product.stock_status !== "ok")
        : products,
  };
}
