"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResetMode = "receipts" | "orders" | "stock" | "orders_stock";
export type ResetActionState = { success: boolean; message: string };
export type ResetPreview = {
  receipts: number;
  receipt_options: { id: string; label: string; status: string }[];
  orders: number;
  preparations: number;
  deliveries: number;
  delivery_stock_movements: number;
  products_stock_zeroed: number;
  inventory_movements: number;
  merchandise_receipts: number;
  inventory_lots: number;
  customers_preserved: number;
  products_preserved: number;
  profiles_preserved: number;
  revision: string;
};

export async function getTestDataResetPreview(mode: ResetMode) {
  await requireRoleAccess("/configuracion/datos-prueba");
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { data: null, error: "Supabase no está disponible." };
  const { data, error } = await supabase.rpc("preview_qb_owner_cleanup", { p_mode: mode });
  return { data: data as ResetPreview | null, error: error?.message ?? null };
}

export async function resetTestDataAction(_previous: ResetActionState, formData: FormData): Promise<ResetActionState> {
  const auth = await requireRoleAccess("/configuracion/datos-prueba");
  if (auth.user.role !== "administrador") return { success: false, message: "Acceso denegado." };
  const parsed = z.object({
    mode: z.enum(["receipts","orders","stock","orders_stock"]),
    revision: z.string().regex(/^[a-f0-9]{32}$/),
    receipts: z.array(z.string().uuid()),
    confirmation: z.literal("BORRAR DATOS"),
  }).safeParse({ mode: formData.get("mode"), revision: formData.get("revision"),
    receipts: formData.getAll("receipt"), confirmation: formData.get("confirmation") });
  if (!parsed.success) return { success: false, message: "Revisa la selección y escribe BORRAR DATOS exactamente." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "Supabase no está disponible." };
  const { data, error } = await supabase.rpc("execute_qb_owner_cleanup", {
    p_mode: parsed.data.mode, p_receipts: parsed.data.receipts,
    p_revision: parsed.data.revision, p_confirmation: parsed.data.confirmation,
  });
  if (error) return { success: false, message: "Limpieza cancelada. " + error.message };
  for (const path of ["/configuracion/datos-prueba", "/pedidos", "/matriz-operativa", "/recibos", "/stock", "/historial"]) revalidatePath(path);
  const message = parsed.data.mode === "receipts"
    ? `Limpieza completada: ${data.receipts} recibos eliminados. Pedidos y stock conservados.`
    : parsed.data.mode === "orders"
      ? `Limpieza completada: ${data.orders} pedidos y ${data.receipts} recibos eliminados. ${data.inventory_movements ?? 0} movimientos vinculados revertidos.`
      : parsed.data.mode === "stock"
        ? `Limpieza completada: ${data.inventory_movements ?? 0} movimientos, ${data.merchandise_receipts ?? 0} ingresos y ${data.inventory_lots ?? 0} lotes eliminados. ${data.products_stock_zeroed ?? 0} productos quedaron con stock cero.`
        : `Limpieza integral completada: ${data.orders} pedidos, ${data.receipts} recibos y ${data.inventory_movements ?? 0} movimientos eliminados. ${data.products_stock_zeroed ?? 0} productos quedaron con stock cero.`;
  return { success: true, message };
}
