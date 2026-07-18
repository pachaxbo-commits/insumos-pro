"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OperationalSettingsActionState = {
  success: boolean;
  message?: string;
};

const schema = z.object({
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  confirmation: z.string().trim().max(80).optional(),
});

export async function setQbStrictStockControlAction(
  _previousState: OperationalSettingsActionState,
  formData: FormData,
): Promise<OperationalSettingsActionState> {
  const auth = await requireAuthenticatedUser();
  if (auth.user.role !== "administrador") {
    return {
      success: false,
      message: "Solo un administrador puede cambiar el control de stock.",
    };
  }

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "Selecciona un estado válido." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase)
    return {
      success: false,
      message: "No se pudo conectar con la configuración.",
    };

  const { error } = await supabase.rpc("set_qb_strict_stock_control", {
    p_enabled: parsed.data.enabled,
    p_confirmation: parsed.data.confirmation ?? null,
  });

  if (error) {
    const messages: Record<string, string> = {
      QB_STOCK_ADMIN_REQUIRED:
        "Solo un administrador puede cambiar el control de stock.",
      QB_STOCK_CONFIRMATION_REQUIRED:
        "Escribe ACTIVAR CONTROL ESTRICTO para confirmar la activación.",
      QB_STOCK_MODE_REQUIRED: "Selecciona un estado válido.",
    };
    const code = Object.keys(messages).find((candidate) =>
      error.message.includes(candidate),
    );
    return {
      success: false,
      message: code
        ? messages[code]
        : "No se pudo actualizar el control de stock.",
    };
  }

  for (const path of [
    "/",
    "/configuracion",
    "/inventario",
    "/pedidos",
    "/productos",
  ]) {
    revalidatePath(path);
  }
  return {
    success: true,
    message: parsed.data.enabled
      ? "Control estricto de stock activado."
      : "Modo piloto con stock provisional activado.",
  };
}
