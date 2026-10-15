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
  reference_unit_id: z.preprocess((value) => value === "" || value == null ? null : value, z.uuid().nullable()),
  reference_price: z.preprocess((value) => value === "" || value == null ? null : value,
    z.coerce.number().finite().min(0).max(999999).nullable()),
  notes: z.string().max(2000),
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
  if (parsed.data.reference_unit_id) {
    const { data: unit } = await supabase.from("qb_units")
      .select("name, symbol, is_active").eq("id", parsed.data.reference_unit_id)
      .maybeSingle<{ name: string; symbol: string; is_active: boolean }>();
    if (!unit?.is_active || !/arroba|cuartilla|libra/i.test(`${unit.name} ${unit.symbol}`)) {
      return { success: false, message: "Unidad de referencia inválida." };
    }
  }
  if (parsed.data.reference_price !== null && parsed.data.reference_unit_id === null) {
    return { success: false, message: "Elige unidad para el precio referencial." };
  }
  const { data: line, error: readError } = await supabase
    .from("qb_merchandise_receipt_lines")
    .select("id, receipt:qb_merchandise_receipts!qb_merchandise_receipt_lines_receipt_id_fkey(status)")
    .eq("id", parsed.data.id).maybeSingle();
  if (readError || !line) return { success: false, message: "Compra no encontrada." };
  const receipt = Array.isArray(line.receipt) ? line.receipt[0] : line.receipt;
  if (receipt?.status !== "borrador") {
    return { success: false, message: "Solo se edita una compra antes de confirmar su ingreso." };
  }
  const { error } = await supabase.from("qb_merchandise_receipt_lines")
    .update({
      reference_unit_id: parsed.data.reference_unit_id,
      reference_price: parsed.data.reference_price,
      reference_price_origin: parsed.data.reference_price === null ? null : "manual",
      notes: parsed.data.notes.trim() || null,
      updated_by: auth.user.id,
    }).eq("id", parsed.data.id);
  if (error) return { success: false, message: error.message };
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
