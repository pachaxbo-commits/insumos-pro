"use server";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  QbClassificationEditorData,
  QbProductClassificationOutput,
  QbProductPresentation,
  QbProductUnitSettings,
  QbUnit,
} from "@/types/products";

type ProductOptionRow = {
  id: string;
  name: string;
  is_active: boolean;
  category: { name: string } | { name: string }[] | null;
};

export async function getProductClassificationEditorDataAction(
  productId: string,
): Promise<
  | { success: true; data: QbClassificationEditorData }
  | { success: false; message: string }
> {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador") {
    return {
      success: false,
      message: "Solo un administrador puede configurar la clasificación.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      success: false,
      message: "No pudimos cargar la configuración de clasificación.",
    };
  }

  const [
    productsResult,
    settingsResult,
    presentationsResult,
    outputsResult,
    unitsResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, is_active, category:product_categories(name)")
      .order("name", { ascending: true }),
    supabase
      .from("qb_product_unit_settings")
      .select(
        "product_id, base_unit_id, inventory_unit_id, base_inventory_unit_id, base_price_unit_id, base_sale_price, supports_amount_bs, is_visible_in_qb_catalog, is_classifiable, classification_mode, is_qb_active, internal_notes, notes, created_by, updated_by, created_at, updated_at",
      ),
    supabase
      .from("qb_product_presentations")
      .select(
        "id, product_id, name, symbol, contained_quantity, contained_unit_id, base_quantity, base_unit_id, conversion_factor_to_base, allow_purchase, allow_order, allow_sale, allow_inventory, is_active, sort_order, notes, created_by, updated_by, created_at, updated_at",
      )
      .eq("product_id", productId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("qb_product_classification_outputs")
      .select(
        "id, source_product_id, output_type, output_product_id, label, expected_percentage, is_active, sort_order, notes, created_by, updated_by, created_at, updated_at",
      )
      .eq("source_product_id", productId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("qb_units")
      .select(
        "id, dimension_id, code, name, symbol, conversion_factor_to_base, is_base, is_active, sort_order, created_by, updated_by, created_at, updated_at",
      )
      .order("sort_order", { ascending: true }),
  ]);

  const error =
    productsResult.error ??
    settingsResult.error ??
    presentationsResult.error ??
    outputsResult.error ??
    unitsResult.error;
  if (error) {
    return {
      success: false,
      message: "No pudimos cargar la configuración de clasificación.",
    };
  }

  const settings = (settingsResult.data ?? []) as QbProductUnitSettings[];
  const settingsByProduct = new Map(
    settings.map((productSettings) => [
      productSettings.product_id,
      productSettings,
    ]),
  );

  return {
    success: true,
    data: {
      products: (
        (productsResult.data ?? []) as unknown as ProductOptionRow[]
      ).map((product) => {
        const category = Array.isArray(product.category)
          ? (product.category[0] ?? null)
          : product.category;
        const productSettings = settingsByProduct.get(product.id);
        return {
          id: product.id,
          name: product.name,
          categoryName: category?.name ?? null,
          isActive: product.is_active,
          baseUnitId: productSettings?.base_unit_id ?? null,
          isQbActive: productSettings?.is_qb_active ?? false,
        };
      }),
      settings: settingsByProduct.get(productId) ?? null,
      presentations: (presentationsResult.data ??
        []) as QbProductPresentation[],
      outputs: (outputsResult.data ?? []) as QbProductClassificationOutput[],
      units: (unitsResult.data ?? []) as QbUnit[],
    },
  };
}
