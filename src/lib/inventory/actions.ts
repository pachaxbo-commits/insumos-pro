"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionState = {
  success: boolean;
  message?: string;
};

const mutationRoles = new Set(["administrador", "inventario"]);

const movementSchema = z.object({
  product_id: z.uuid("Selecciona un producto."),
  movement_type: z.enum(["entrada", "salida", "ajuste", "merma"]),
  quantity: z.coerce
    .number()
    .finite("La cantidad debe ser valida.")
    .nonnegative("La cantidad no puede ser negativa."),
  reason: z.string().trim().min(3, "El motivo debe tener al menos 3 caracteres."),
  notes: z.preprocess(
    (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z.string().nullable(),
  ),
}).superRefine((value, context) => {
  if (value.movement_type !== "ajuste" && value.quantity === 0) {
    context.addIssue({ code: "custom", path: ["quantity"],
      message: "La cantidad debe ser mayor a cero." });
  }
  if (Math.abs(value.quantity * 1000 - Math.round(value.quantity * 1000)) > 0.0000001) {
    context.addIssue({ code: "custom", path: ["quantity"],
      message: "La cantidad admite como máximo tres decimales." });
  }
});

async function assertCanRegisterMovement() {
  const auth = await requireAuthenticatedUser();

  if (!auth.user.role || !mutationRoles.has(auth.user.role)) {
    return {
      allowed: false as const,
      message: "Tu rol solo permite lectura en inventario.",
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      allowed: false as const,
      message: "Supabase no esta configurado.",
    };
  }

  return { allowed: true as const, supabase, userId: auth.user.id };
}

export async function createInventoryMovementAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanRegisterMovement();

  if (!access.allowed) return { success: false, message: access.message };

  const parsed = movementSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos del movimiento.",
    };
  }

  const { data, error } = await access.supabase.rpc("register_inventory_movement", {
    p_product_id: parsed.data.product_id,
    p_movement_type: parsed.data.movement_type,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
    p_notes: parsed.data.notes,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "create_inventory_movement",
    entityType: "inventory_movement",
    entityId: typeof data === "string" ? data : null,
    metadata: {
      product_id: parsed.data.product_id,
      movement_type: parsed.data.movement_type,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
    },
  });

  revalidatePath("/inventario");
  revalidatePath("/productos");
  revalidatePath("/stock");
  revalidatePath("/catalogo");

  return { success: true, message: "Movimiento registrado correctamente." };
}
