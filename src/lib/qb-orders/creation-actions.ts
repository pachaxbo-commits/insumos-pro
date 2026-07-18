"use server";

import { requireRoleAccess } from "@/lib/auth/session";
import { getInternalOrderCreationData } from "@/lib/qb-orders/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QbInternalOrderCreationData } from "@/types/qb-orders";

export async function getInternalOrderCreationDataAction(): Promise<
  | { success: true; data: QbInternalOrderCreationData }
  | { success: false; message: string }
> {
  const auth = await requireRoleAccess("/pedidos");
  if (auth.user.role !== "administrador") {
    return {
      success: false,
      message: "Solo un administrador puede registrar pedidos.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      success: false,
      message: "No pudimos cargar las opciones del pedido.",
    };
  }

  const data = await getInternalOrderCreationData(supabase);
  return { success: true, data };
}
