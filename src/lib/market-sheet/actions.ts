"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MarketSheetLineRef } from "@/lib/market-sheet/model";

export type MarketSheetActionResult = {
  success: boolean;
  message: string;
  data?: unknown;
};

const priceSchema = z.object({
  productId: z.string().uuid(),
  newPrice: z.number().finite().min(0).max(999999).nullable(),
});

export async function updateMarketSheetProductPriceAction(
  productId: string,
  newPrice: number | null,
): Promise<MarketSheetActionResult> {
  const auth = await requireRoleAccess("/matriz-operativa");
  if (auth.user.role !== "administrador") {
    return {
      success: false,
      message: "Solo un administrador puede actualizar el precio de provisión.",
    };
  }

  const parsed = priceSchema.safeParse({ productId, newPrice });
  if (!parsed.success) {
    return {
      success: false,
      message: "Precio de provisión inválido.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { success: false, message: "Error al conectar con la base de datos." };
  }

  // Fetch current product settings
  const { data: settings, error: settingsError } = await supabase
    .from("qb_product_unit_settings")
    .select("base_unit_id, base_price_unit_id, base_sale_price")
    .eq("product_id", parsed.data.productId)
    .maybeSingle();

  if (settingsError || !settings) {
    return {
      success: false,
      message: "No se encontraron las configuraciones del producto.",
    };
  }

  const priceUnitId = settings.base_price_unit_id ?? settings.base_unit_id;
  const isRemove = parsed.data.newPrice === null;

  const { error } = await supabase.rpc("update_qb_product_pricing_v2", {
    p_product_id: parsed.data.productId,
    p_price_unit_id: priceUnitId,
    p_new_price: isRemove ? null : parsed.data.newPrice,
    p_expected_price: settings.base_sale_price,
    p_expected_price_unit_id: settings.base_price_unit_id,
    p_remove_price: isRemove,
  });

  if (error) {
    return {
      success: false,
      message: error.message || "No se pudo actualizar el precio.",
    };
  }

  revalidatePath("/matriz-operativa/mercado");
  revalidatePath("/matriz-operativa");
  revalidatePath("/productos");
  revalidatePath("/pedidos");
  revalidatePath("/recibos");

  return {
    success: true,
    message: "Precio de provisión actualizado.",
  };
}

export async function updateMarketSheetProductActualAction(
  productId: string,
  controlsActualWeight: boolean,
  actualValue: number | null,
  lines: MarketSheetLineRef[],
): Promise<MarketSheetActionResult> {
  const auth = await requireRoleAccess("/matriz-operativa");
  if (auth.user.role !== "administrador" && auth.user.role !== "inventario") {
    return {
      success: false,
      message: "No tienes permiso para actualizar cantidades preparadas.",
    };
  }

  if (!lines || lines.length === 0) {
    return {
      success: false,
      message: "No hay pedidos asociados para actualizar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { success: false, message: "Error al conectar con la base de datos." };
  }

  const totalRequested = lines.reduce(
    (sum, line) => sum + (line.requestedQuantity || 0),
    0,
  );

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let lineActual: number | null = null;

    if (actualValue !== null && actualValue >= 0) {
      if (lines.length === 1) {
        lineActual = actualValue;
      } else if (totalRequested > 0) {
        const ratio = line.requestedQuantity / totalRequested;
        lineActual = Number((actualValue * ratio).toFixed(4));
      } else {
        lineActual = Number((actualValue / lines.length).toFixed(4));
      }
    }

    const { error } = await supabase.rpc(
      "save_qb_matrix_preparation_item_with_unit",
      {
        p_order_item_id: line.orderItemId,
        p_expected_version: line.preparationVersion,
        p_prepared_quantity: controlsActualWeight
          ? line.requestedQuantity
          : (lineActual ?? line.requestedQuantity),
        p_preparation_check: lineActual !== null && lineActual > 0,
        p_actual_weight_kg: controlsActualWeight ? lineActual : null,
        p_display_unit_id: "original",
        p_note: "",
        p_idempotency_key: `market-sheet-${line.orderItemId}-${Date.now()}-${index}`,
      },
    );

    if (error) {
      return {
        success: false,
        message:
          error.message ||
          "No se pudo guardar la cantidad real en la preparación.",
      };
    }
  }

  revalidatePath("/matriz-operativa/mercado");
  revalidatePath("/matriz-operativa");

  return {
    success: true,
    message: "Cantidad/peso real guardado.",
  };
}
