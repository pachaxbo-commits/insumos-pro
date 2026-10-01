"use server";

import { revalidatePath } from "next/cache";

import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { testDataResetEnabled } from "@/lib/test-data-reset/config";

export type ResetMode = "receipts" | "orders" | "stock";
export type ResetActionState = { success: boolean; message: string };
export type ResetPreview = {
  mode: ResetMode;
  receipts: number;
  orders: number;
  preparations: number;
  deliveries: number;
  delivery_stock_movements: number;
  stock_products_nonzero: number;
  stock_movements: number;
  stock_receipts: number;
  stock_lots: number;
  stock_dependencies: number;
  customers_preserved: number;
  products_preserved: number;
  profiles_preserved: number;
};

export async function getTestDataResetPreview(mode: ResetMode) {
  await requireRoleAccess("/configuracion/datos-prueba");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { data: null, error: "Supabase no está disponible." };
  const { data, error } = await supabase.rpc("preview_qb_test_data_reset", { p_mode: mode });
  return { data: data as ResetPreview | null, error: error?.message ?? null };
}

export async function resetTestDataAction(
  _previous: ResetActionState,
  formData: FormData,
): Promise<ResetActionState> {
  const auth = await requireRoleAccess("/configuracion/datos-prueba");
  if (auth.user.role !== "administrador") return { success: false, message: "Acceso denegado." };
  if (!testDataResetEnabled()) return { success: false, message: "La limpieza está desactivada en el servidor." };
  const mode = formData.get("mode");
  if (mode !== "receipts" && mode !== "orders" && mode !== "stock") return { success: false, message: "Selecciona un grupo válido." };
  if (formData.get("confirmation") !== "BORRAR DATOS") return { success: false, message: "Escribe BORRAR DATOS exactamente." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { success: false, message: "Falta la configuración privada de mantenimiento." };
  const { error } = mode === "stock"
    ? await admin.rpc("reset_qb_stock_test_data", {
        p_actor: auth.user.id,
        p_confirmation: "BORRAR DATOS",
      })
    : await admin.rpc("execute_qb_test_data_reset", {
        p_actor: auth.user.id,
        p_mode: mode,
        p_confirmation: "BORRAR DATOS",
      });
  if (error) return { success: false, message: "No se pudo completar la limpieza. Ningún grupo quedó parcialmente borrado." };
  for (const path of ["/configuracion/datos-prueba", "/pedidos", "/matriz-operativa", "/recibos", "/stock", "/historial"]) revalidatePath(path);
  return { success: true, message: "Datos de prueba seleccionados eliminados." };
}
