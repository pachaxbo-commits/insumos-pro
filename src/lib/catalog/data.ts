import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PUBLIC_CATALOG_AVAILABILITIES,
  type PublicCatalogAvailability,
  type PublicCatalogCategory,
  type PublicCatalogProduct,
} from "@/types/catalog";

type PublicCatalogRow = {
  product_id: string;
  product_name: string;
  public_description: string | null;
  image_url: string | null;
  reference_price: number | string;
  unit_name: string;
  unit_abbreviation: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  minimum_quantity: number | string;
  quantity_step: number | string;
  availability: string;
  product_sort_order: number;
  category_sort_order: number;
};

export type PublicCatalogData = {
  products: PublicCatalogProduct[];
  categories: PublicCatalogCategory[];
  error?: string;
};

function sanitizePublicImageUrl(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function isAvailability(value: string): value is PublicCatalogAvailability {
  return PUBLIC_CATALOG_AVAILABILITIES.includes(value as PublicCatalogAvailability);
}

function positiveNumber(value: number | string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function getPublicCatalogData(): Promise<PublicCatalogData> {
  noStore();

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      products: [],
      categories: [],
      error: "El catalogo no esta disponible porque falta configurar Supabase.",
    };
  }

  const { data, error } = await supabase.rpc("get_public_catalog");

  if (error) {
    return {
      products: [],
      categories: [],
      error: "No pudimos cargar el catalogo. Intenta nuevamente en unos minutos.",
    };
  }

  const rows = (data ?? []) as PublicCatalogRow[];
  const products = rows
    .filter(
      (row) =>
        row.product_id &&
        row.product_name &&
        row.category_id &&
        row.category_slug &&
        isAvailability(row.availability),
    )
    .map<PublicCatalogProduct>((row) => ({
      id: row.product_id,
      name: row.product_name,
      description: row.public_description,
      imageUrl: sanitizePublicImageUrl(row.image_url),
      referencePrice: positiveNumber(row.reference_price, 0),
      unitName: row.unit_name,
      unitAbbreviation: row.unit_abbreviation,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      minimumQuantity: positiveNumber(row.minimum_quantity, 1),
      quantityStep: positiveNumber(row.quantity_step, 1),
      availability: row.availability as PublicCatalogAvailability,
      sortOrder: Number(row.product_sort_order) || 0,
      categorySortOrder: Number(row.category_sort_order) || 0,
    }))
    .filter((product) => product.referencePrice > 0);

  const categoryMap = new Map<string, PublicCatalogCategory>();

  for (const product of products) {
    if (!categoryMap.has(product.categoryId)) {
      categoryMap.set(product.categoryId, {
        id: product.categoryId,
        name: product.categoryName,
        slug: product.categorySlug,
        sortOrder: product.categorySortOrder,
      });
    }
  }

  const categories = [...categoryMap.values()].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "es"),
  );

  return { products, categories };
}
