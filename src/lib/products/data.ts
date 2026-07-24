import { cache } from "react";
import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  calculateMarginPercentage,
  getStockStatus,
} from "@/lib/products/utils";
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

type ProductRow = Omit<
  ProductWithRelations,
  "margin_percentage" | "stock_status"
>;
type SupabaseServerClient = NonNullable<
  Awaited<ReturnType<typeof createSupabaseServerClient>>
>;

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
  productIdsWithMovements: string[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: {
    activeProducts: number;
    lowStockProducts: number;
    publicProducts: number;
  };
  error?: string;
} & QbParametrizationData;

type ProductsCatalogOptions = {
  includeQbParametrization?: boolean;
  includeSummary?: boolean;
  parametrizationScope?: "full" | "list";
  page?: number;
  pageSize?: number;
};

export type ProductReferenceData = {
  categories: ProductCategory[];
  units: UnitOfMeasure[];
  qbUnits: QbUnit[];
  error?: string;
};

export const PRODUCTS_PAGE_SIZE = 25;

function normalizeProductSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

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
  productIds: string[],
  qbUnits: QbUnit[],
  scope: "full" | "list",
): Promise<QbParametrizationData> {
  const [
    dimensionsResult,
    settingsResult,
    presentationsResult,
    allowedUnitsResult,
    classificationOutputsResult,
  ] = await Promise.all([
    scope === "full"
      ? supabase
          .from("qb_unit_dimensions")
          .select(
            "id, code, name, base_unit_code, is_active, sort_order, created_by, updated_by, created_at, updated_at",
          )
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? supabase
          .from("qb_product_unit_settings")
          .select(
            "product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id, base_price_unit_id, base_sale_price, supports_amount_bs, is_visible_in_qb_catalog, is_classifiable, classification_mode, is_qb_active, internal_notes, notes, created_by, updated_by, created_at, updated_at",
          )
          .in("product_id", productIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    scope === "full" && productIds.length
      ? supabase
          .from("qb_product_presentations")
          .select(
            "id, product_id, name, symbol, contained_quantity, contained_unit_id, base_quantity, base_unit_id, conversion_factor_to_base, allow_purchase, allow_order, allow_sale, allow_inventory, is_active, sort_order, notes, created_by, updated_by, created_at, updated_at",
          )
          .order("sort_order", { ascending: true })
          .in("product_id", productIds)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    scope === "full" && productIds.length
      ? supabase
          .from("qb_product_allowed_units")
          .select(
            "id, product_id, usage_context, unit_id, presentation_id, is_default, quantity_step, min_quantity, is_active, sort_order, notes, created_by, updated_by, created_at, updated_at",
          )
          .order("usage_context", { ascending: true })
          .in("product_id", productIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    scope === "full" && productIds.length
      ? supabase
          .from("qb_product_classification_outputs")
          .select(
            "id, source_product_id, output_type, output_product_id, label, expected_percentage, is_active, sort_order, notes, created_by, updated_by, created_at, updated_at",
          )
          .order("sort_order", { ascending: true })
          .in("source_product_id", productIds)
          .order("label", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const qbError =
    dimensionsResult.error ??
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
    qbUnits,
    qbProductUnitSettings: (settingsResult.data ??
      []) as QbProductUnitSettings[],
    qbProductPresentations: (presentationsResult.data ??
      []) as QbProductPresentation[],
    qbProductAllowedUnits: (allowedUnitsResult.data ??
      []) as QbProductAllowedUnit[],
    qbProductClassificationOutputs: (classificationOutputsResult.data ??
      []) as QbProductClassificationOutput[],
  };
}

export const getProductReferenceData = cache(
  async (): Promise<ProductReferenceData> => {
    const supabase = await createSupabaseServerClient();

    if (!supabase) {
      return {
        categories: [],
        units: [],
        qbUnits: [],
        error: "No pudimos cargar las opciones del producto en este momento.",
      };
    }

    const [categoriesResult, unitsResult, qbUnitsResult] = await Promise.all([
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
      supabase
        .from("qb_units")
        .select(
          "id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base, is_active, sort_order, created_by, updated_by, created_at, updated_at",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    const error =
      categoriesResult.error ?? unitsResult.error ?? qbUnitsResult.error;

    return {
      categories: (categoriesResult.data ?? []) as ProductCategory[],
      units: (unitsResult.data ?? []) as UnitOfMeasure[],
      qbUnits: (qbUnitsResult.data ?? []) as QbUnit[],
      ...(error
        ? {
            error:
              "No pudimos cargar las opciones del producto en este momento.",
          }
        : {}),
    };
  },
);

export async function getProductsCatalogData(
  filters: ProductFilters = {},
  options: ProductsCatalogOptions = {},
): Promise<ProductsCatalogData> {
  noStore();

  const supabase = await createSupabaseServerClient();

  const requestedPage = Math.max(1, Math.trunc(options.page ?? 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Math.trunc(options.pageSize ?? 100)),
  );
  const isPaginated = options.pageSize !== undefined;

  if (!supabase) {
    return {
      products: [],
      categories: [],
      units: [],
      productIdsWithMovements: [],
      pagination: { page: requestedPage, pageSize, total: 0, totalPages: 1 },
      summary: { activeProducts: 0, lowStockProducts: 0, publicProducts: 0 },
      ...getEmptyQbParametrizationData(),
      error:
        "No pudimos cargar los productos en este momento. Comunícate con el administrador de QB Insumos.",
    };
  }

  const normalizedSearch = normalizeProductSearch(filters.q ?? "");
  let matchingProductIds: string[] | null = null;
  if (normalizedSearch) {
    let directoryQuery = supabase
      .from("products")
      .select("id, name, sku")
      .order("name", { ascending: true });
    if (filters.category && filters.category !== "all") {
      directoryQuery = directoryQuery.eq("category_id", filters.category);
    }
    if (filters.status === "active") {
      directoryQuery = directoryQuery.eq("is_active", true);
    }
    if (filters.status === "inactive") {
      directoryQuery = directoryQuery.eq("is_active", false);
    }

    const directoryResult = await directoryQuery;
    matchingProductIds = directoryResult.error
      ? []
      : (directoryResult.data ?? [])
          .filter((product) =>
            normalizeProductSearch(
              `${product.name} ${product.sku ?? ""}`,
            ).includes(normalizedSearch),
          )
          .map((product) => product.id);
  }

  let productsQuery = supabase
    .from("products")
    .select(
      "id, name, sku, category_id, unit_id, stock_current, stock_min, purchase_price, sale_price, supplier_name, image_url, matrix_color, controls_actual_weight, requires_classification, is_sellable, catalog_description, catalog_sort_order, catalog_min_quantity, catalog_quantity_step, is_active, created_at, updated_at, category:product_categories(id, name, description, catalog_slug, catalog_sort_order, is_active, created_at, updated_at), unit:units_of_measure(id, name, abbreviation, is_active, created_at, updated_at)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (matchingProductIds) {
    productsQuery = matchingProductIds.length
      ? productsQuery.in("id", matchingProductIds)
      : productsQuery.eq("name", "__qb_product_search_without_matches__");
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

  if (isPaginated && filters.stock !== "low") {
    const from = (requestedPage - 1) * pageSize;
    productsQuery = productsQuery.range(from, from + pageSize - 1);
  }

  const referencePromise = getProductReferenceData();
  const summaryProductsPromise = options.includeSummary
    ? supabase
        .from("products")
        .select("id, stock_current, stock_min, is_active")
    : Promise.resolve({ data: [], error: null });
  const visibleSettingsPromise = options.includeSummary
    ? supabase
        .from("qb_product_unit_settings")
        .select("product_id")
        .eq("is_qb_active", true)
        .eq("is_visible_in_qb_catalog", true)
    : Promise.resolve({ data: [], error: null });

  const [
    referenceData,
    productsResult,
    summaryProductsResult,
    visibleSettingsResult,
  ] = await Promise.all([
    referencePromise,
    productsQuery,
    summaryProductsPromise,
    visibleSettingsPromise,
  ]);

  if (referenceData.error || productsResult.error) {
    return {
      products: [],
      categories: [],
      units: [],
      productIdsWithMovements: [],
      pagination: { page: requestedPage, pageSize, total: 0, totalPages: 1 },
      summary: { activeProducts: 0, lowStockProducts: 0, publicProducts: 0 },
      ...getEmptyQbParametrizationData(),
      error:
        "No pudimos cargar el Catálogo en este momento. Inténtalo nuevamente o comunícate con el administrador de QB Insumos.",
    };
  }

  const allRows = (productsResult.data ?? []) as unknown as ProductQueryRow[];
  const stockFilteredRows =
    filters.stock === "low"
      ? allRows.filter((product) => getStockStatus(product) !== "ok")
      : allRows;
  const total =
    filters.stock === "low"
      ? stockFilteredRows.length
      : (productsResult.count ?? stockFilteredRows.length);
  const rows =
    isPaginated && filters.stock === "low"
      ? stockFilteredRows.slice(
          (requestedPage - 1) * pageSize,
          requestedPage * pageSize,
        )
      : stockFilteredRows;
  const productIds = rows.map((product) => product.id);
  const [qbParametrizationData, movementProductsResult] = await Promise.all([
    options.includeQbParametrization
      ? loadQbParametrizationData(
          supabase,
          productIds,
          referenceData.qbUnits,
          options.parametrizationScope ?? "full",
        )
      : Promise.resolve(getEmptyQbParametrizationData()),
    productIds.length
      ? supabase
          .from("inventory_movements")
          .select("product_id")
          .in("product_id", productIds)
      : Promise.resolve({
          data: [] as Array<{ product_id: string }>,
          error: null,
        }),
  ]);

  const products = rows.map((product) => ({
    ...product,
    requires_classification: Boolean(product.requires_classification),
    controls_actual_weight: Boolean(product.controls_actual_weight),
    is_sellable: product.is_sellable !== false,
    catalog_description: product.catalog_description ?? null,
    catalog_sort_order: Number(product.catalog_sort_order ?? 0),
    catalog_min_quantity: Number(product.catalog_min_quantity ?? 1),
    catalog_quantity_step: Number(product.catalog_quantity_step ?? 1),
    category: Array.isArray(product.category)
      ? (product.category[0] ?? null)
      : product.category,
    unit: Array.isArray(product.unit)
      ? (product.unit[0] ?? null)
      : product.unit,
    margin_percentage: calculateMarginPercentage(
      Number(product.purchase_price),
      Number(product.sale_price),
    ),
    stock_status: getStockStatus(product),
  }));

  return {
    categories: referenceData.categories,
    units: referenceData.units,
    productIdsWithMovements: movementProductsResult.error
      ? []
      : [
          ...new Set(
            (
              (movementProductsResult.data ?? []) as Array<{
                product_id: string;
              }>
            ).map((row) => row.product_id),
          ),
        ],
    ...qbParametrizationData,
    pagination: {
      page: requestedPage,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    summary: (() => {
      const summaryRows = (summaryProductsResult.data ?? []) as Array<{
        id: string;
        stock_current: number | string;
        stock_min: number | string;
        is_active: boolean;
      }>;
      const activeIds = new Set(
        summaryRows
          .filter((product) => product.is_active)
          .map((product) => product.id),
      );
      const visibleIds = new Set(
        (
          (visibleSettingsResult.data ?? []) as Array<{ product_id: string }>
        ).map((settings) => settings.product_id),
      );

      return {
        activeProducts: summaryRows.filter((product) => product.is_active)
          .length,
        lowStockProducts: summaryRows.filter(
          (product) =>
            getStockStatus({
              stock_current: Number(product.stock_current),
              stock_min: Number(product.stock_min),
            }) !== "ok",
        ).length,
        publicProducts: [...visibleIds].filter((productId) =>
          activeIds.has(productId),
        ).length,
      };
    })(),
    products,
  };
}
