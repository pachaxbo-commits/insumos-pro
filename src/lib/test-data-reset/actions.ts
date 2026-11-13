"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResetMode = "receipts" | "orders";
export type ResetActionState = { success: boolean; message: string };
export type ResetPreview = {
  receipts: number;
  receipt_options: { id: string; label: string; status: string }[];
  orders: number;
  preparations: number;
  deliveries: number;
  delivery_stock_movements: number;
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
    mode: z.enum(["receipts","orders"]),
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
  return { success: true, message: "Limpieza completada: " + data.orders + " pedidos y " + data.receipts + " recibos." };
}
