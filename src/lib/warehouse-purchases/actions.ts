"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const expenseSchema = z.object({
  clientKey: z.uuid(),
  concept: z.string().trim().min(1).max(180),
  amount: z.coerce.number().finite().positive().max(999999999),
});

export async function saveWarehouseOperatingExpensesAction(
  date: string,
  rows: Array<{ clientKey: string; concept: string; amount: number }>,
  deletedIds: string[],
) {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador" && auth.user.role !== "inventario") {
    return { success: false, message: "No tienes permiso para guardar gastos operativos." };
  }
  const parsedDate = z.iso.date().safeParse(date);
  const parsedRows = z.array(expenseSchema).max(500).safeParse(rows);
  const parsedDeleted = z.array(z.uuid()).max(500).safeParse(deletedIds);
  if (!parsedDate.success || !parsedRows.success || !parsedDeleted.success) {
    return { success: false, message: "Revisa la fecha, conceptos e importes de los gastos." };
  }
  if (new Set(parsedRows.data.map((row) => row.clientKey)).size !== parsedRows.data.length ||
    new Set(parsedDeleted.data).size !== parsedDeleted.data.length) {
    return { success: false, message: "Hay filas repetidas en la lista de gastos." };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "Supabase no disponible." };
  const { data, error } = await supabase.rpc("save_qb_warehouse_operating_expenses", {
    p_expense_date: parsedDate.data,
    p_rows: parsedRows.data,
    p_deleted_ids: parsedDeleted.data,
  });
  if (error) {
    const message = error.message.includes("QB_EXPENSE_ROW_CONFLICT")
      ? "Una fila cambió o se quitó en otra sesión. Recarga la hoja antes de guardar."
      : "No se pudieron guardar los gastos. Revisa los datos y vuelve a intentar.";
    return { success: false, message };
  }
  revalidatePath("/ingresos/compras-almacen");
  revalidatePath("/api/ingresos/compras-almacen.xlsx");
  return { success: true, message: `${Number(data ?? 0)} cambios guardados.` };
}

const schema = z.object({
  id: z.uuid(),
  expected_updated_at: z.iso.datetime({ offset: true }),
  source_quantity: z.coerce.number().finite().positive().max(999999999),
  unit_cost: z.coerce.number().finite().min(0).max(999999999),
  allowed_unit_id: z.preprocess((value) => value === "" || value == null || value === "commercial:unmeasured" ? null : value, z.uuid().nullable()),
  commercial_label: z.preprocess((value) => typeof value === "string" ? value : "", z.string().trim().max(120)),
  reference_unit_id: z.preprocess((value) => value === "" || value == null ? null : value, z.uuid().nullable()),
  reference_price: z.preprocess((value) => value === "" || value == null ? null : value,
    z.coerce.number().finite().min(0).max(999999).nullable()),
  reference_price_origin: z.preprocess((value) => value === "" || value == null ? null : value, z.enum(["manual", "calculated"]).nullable()),
  notes: z.string().max(2000),
  effective_quantity: z.preprocess((value) => value === "" || value == null ? null : value,
    z.coerce.number().finite().positive().max(999999999).nullable()),
  effective_unit_id: z.preprocess((value) => value === "" || value == null ? null : value, z.uuid().nullable()),
});

export async function updateWarehousePurchaseAction(formData: FormData) {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador" && auth.user.role !== "inventario") {
    return { success: false, message: "No tienes permiso para editar compras." };
  }
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: "Revisa el precio y la unidad de referencia." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "Supabase no disponible." };
  if (parsed.data.reference_price !== null && parsed.data.reference_unit_id === null) {
    return { success: false, message: "Elige unidad para el precio referencial." };
  }
  if (!parsed.data.allowed_unit_id && !parsed.data.commercial_label.trim()) {
    return { success: false, message: "Selecciona una presentación de compra." };
  }
  if (parsed.data.effective_quantity !== null && parsed.data.effective_unit_id === null) {
    return { success: false, message: "Completa la cantidad y unidad física efectiva." };
  }
  const { error } = await supabase.rpc("update_qb_warehouse_purchase_draft", {
    p_line_id: parsed.data.id,
    p_expected_updated_at: parsed.data.expected_updated_at,
    p_source_quantity: parsed.data.source_quantity,
    p_unit_cost: parsed.data.unit_cost,
    p_allowed_unit_id: parsed.data.allowed_unit_id,
    p_commercial_label: parsed.data.commercial_label || null,
    p_reference_unit_id: parsed.data.reference_price === null ? null : parsed.data.reference_unit_id,
    p_reference_price: parsed.data.reference_price,
    p_reference_price_origin: parsed.data.reference_price_origin,
    p_notes: parsed.data.notes,
    p_effective_quantity: parsed.data.effective_quantity,
    p_effective_unit_id: parsed.data.effective_quantity === null ? null : parsed.data.effective_unit_id,
  });
  if (error) {
    const message = error.message.includes("QB_PURCHASE_ROW_CONFLICT")
      ? "Esta compra cambió en otra sesión. Recarga antes de guardar tus cambios."
      : error.message;
    return { success: false, message };
  }
  revalidatePath("/ingresos/compras-almacen");
  return { success: true, message: "Compra actualizada." };
}

export async function measureWarehousePurchaseAction(formData: FormData) {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador" && auth.user.role !== "inventario") {
    return { success: false, message: "No tienes permiso para registrar cantidad física." };
  }
  const parsed = z.object({
    id: z.uuid(),
    actual_base_quantity: z.coerce.number().finite().positive(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: "Cantidad física inválida." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "Supabase no disponible." };
  const { error } = await supabase.rpc("set_warehouse_purchase_actual_quantity", {
    p_line_id: parsed.data.id,
    p_actual_base_quantity: parsed.data.actual_base_quantity,
  });
  if (error) return { success: false, message: error.message };
  revalidatePath("/ingresos/compras-almacen");
  revalidatePath("/ingresos");
  return { success: true, message: "Cantidad física útil guardada. Ahora puedes confirmar el ingreso." };
}

export async function confirmWarehousePurchaseAction(formData: FormData) {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador" && auth.user.role !== "inventario") {
    return { success: false, message: "No tienes permiso para confirmar ingresos de almacén." };
  }
  const parsed = z.object({ id: z.uuid(), confirmation: z.literal("CONFIRMAR") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: "Confirma explícitamente el ingreso físico." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "Supabase no disponible." };
  const { error } = await supabase.rpc("confirm_qb_warehouse_purchase_draft", {
    p_receipt_id: parsed.data.id,
  });
  if (error) return { success: false, message: error.message };
  revalidatePath("/ingresos/compras-almacen");
  revalidatePath("/ingresos");
  revalidatePath("/stock");
  return { success: true, message: "Ingreso físico confirmado; el stock se registró una sola vez." };
}

export async function annulWarehousePurchaseDraftAction(formData: FormData) {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador" && auth.user.role !== "inventario") {
    return { success: false, message: "No tienes permiso para anular compras." };
  }
  const parsed = z.object({ id: z.uuid(), reason: z.string().trim().min(4).max(500) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: "Escribe un motivo válido para anular el borrador." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "Supabase no disponible." };
  const { error } = await supabase.rpc("annul_qb_warehouse_purchase_draft", {
    p_receipt_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  if (error) return { success: false, message: error.message };
  revalidatePath("/ingresos/compras-almacen");
  revalidatePath("/ingresos");
  return { success: true, message: "Borrador de compra anulado; su historial de auditoría se conserva." };
}
