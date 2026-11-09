"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CostRuleActionState = { success: boolean; message?: string };

const schema = z.object({
  productId: z.string().uuid(),
  allowedUnitId: z.string().uuid(),
  basis: z.enum(["commercial_unit", "actual_weight"]),
  rate: z.coerce.number().finite().positive().max(999999999999),
  referenceWeightUnitId: z.string().uuid().nullable(),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
  rowVersion: z.preprocess((value) => value === "" ? null : value,
    z.union([z.null(), z.coerce.number().int().positive()])),
});

export async function saveQbProductCostRuleAction(
  _previous: CostRuleActionState,
  formData: FormData,
): Promise<CostRuleActionState> {
  await requireRoleAccess("/configuracion/costos");
  const parsed = schema.safeParse({
    productId: formData.get("product_id"),
    allowedUnitId: formData.get("allowed_unit_id"),
    basis: formData.get("cost_basis"),
    rate: formData.get("rate_amount"),
    referenceWeightUnitId: formData.get("reference_weight_unit_id") || null,
    active: formData.get("is_active"),
    rowVersion: formData.get("row_version"),
  });
  if (!parsed.success) return { success: false, message: "Revisa la tarifa y las unidades seleccionadas." };
  if (parsed.data.basis === "actual_weight" && !parsed.data.referenceWeightUnitId) {
    return { success: false, message: "Selecciona la unidad de referencia del costo por peso." };
  }
  if (parsed.data.basis === "commercial_unit" && parsed.data.referenceWeightUnitId) {
    return { success: false, message: "El costo comercial no usa una unidad de peso." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "No está disponible la conexión de datos." };
  const { error } = await supabase.rpc("upsert_qb_product_cost_rule", {
    p_product_id: parsed.data.productId,
    p_order_allowed_unit_id: parsed.data.allowedUnitId,
    p_cost_basis: parsed.data.basis,
    p_rate_amount: parsed.data.rate,
    p_reference_weight_unit_id: parsed.data.referenceWeightUnitId,
    p_is_active: parsed.data.active,
    p_expected_row_version: parsed.data.rowVersion,
  });
  if (error) {
    const message = String(error.message ?? "");
    if (message.includes("QB_COST_RULE_CONFLICT")) return { success: false, message: "La regla cambió en otra sesión. Recarga la página antes de volver a guardar." };
    if (message.includes("QB_COST_RULE_WEIGHT_UNIT_INVALID")) return { success: false, message: "La referencia elegida no es una unidad de peso válida normalizada a KG." };
    if (message.includes("QB_COST_RULE_ORDER_UNIT_INVALID")) return { success: false, message: "La presentación dejó de estar habilitada para pedidos. Recarga la página." };
    if (message.includes("QB_COST_RULE_ADMIN_REQUIRED")) return { success: false, message: "Solo Administración puede configurar costos." };
    return { success: false, message: "No se pudo guardar la regla. Verifica los datos y vuelve a intentarlo." };
  }
  revalidatePath("/configuracion/costos");
  return { success: true, message: "Regla guardada. Se aplicará a los nuevos Recibos." };
}
