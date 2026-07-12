"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QbOrderActionState } from "@/types/qb-orders";

const actionState = (success: boolean, message: string): QbOrderActionState => ({
  success,
  message,
});

const uuidSchema = z.string().uuid();

const preparationLineSchema = z.object({
  orderItemId: z.string().uuid(),
  status: z.enum(["completo", "parcial", "no_disponible"]),
  actualAllowedUnitId: z.string().uuid().optional().nullable(),
  actualQuantity: z.coerce.number().min(0).max(10000).optional().default(0),
  notes: z.string().max(500).optional().default(""),
});

const savePreparationSchema = z.object({
  orderId: z.string().uuid(),
  internalNotes: z.string().max(1200).optional().default(""),
  markPrepared: z.coerce.boolean().optional().default(true),
  items: z.array(preparationLineSchema).min(1),
});

async function getSupabaseOrState() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { state: actionState(false, "Faltan variables publicas de Supabase.") };
  return { supabase };
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }

  return fallback;
}

export async function startQbOrderPreparationAction(
  _previous: QbOrderActionState,
  formData: FormData,
): Promise<QbOrderActionState> {
  await requireRoleAccess("/pedidos");

  const orderId = uuidSchema.safeParse(formData.get("order_id"));
  if (!orderId.success) return actionState(false, "Pedido QB invalido.");

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { error } = await supabase.rpc("start_qb_order_preparation", {
    p_order_id: orderId.data,
  });

  if (error) {
    return actionState(false, errorMessage(error, "No se pudo iniciar la preparacion QB."));
  }

  revalidatePath("/pedidos");
  return actionState(true, "Preparacion QB iniciada.");
}

export async function saveQbOrderPreparationAction(
  _previous: QbOrderActionState,
  formData: FormData,
): Promise<QbOrderActionState> {
  await requireRoleAccess("/pedidos");

  let items: unknown;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return actionState(false, "Items de preparacion invalidos.");
  }

  const parsed = savePreparationSchema.safeParse({
    orderId: formData.get("order_id"),
    internalNotes: formData.get("internal_notes"),
    markPrepared: formData.get("mark_prepared") !== "false",
    items,
  });

  if (!parsed.success) {
    return actionState(false, "Revisa cantidades, estados y unidades de preparacion.");
  }

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { error } = await supabase.rpc("save_qb_order_preparation", {
    p_order_id: parsed.data.orderId,
    p_items: parsed.data.items.map((item) => ({
      order_item_id: item.orderItemId,
      status: item.status,
      actual_allowed_unit_id: item.actualAllowedUnitId || null,
      actual_quantity: item.status === "no_disponible" ? 0 : item.actualQuantity,
      notes: item.notes,
    })),
    p_internal_notes: parsed.data.internalNotes,
    p_mark_prepared: parsed.data.markPrepared,
  });

  if (error) {
    return actionState(false, errorMessage(error, "No se pudo guardar la preparacion QB."));
  }

  revalidatePath("/pedidos");
  return actionState(true, parsed.data.markPrepared ? "Pedido QB preparado." : "Preparacion QB guardada.");
}

export async function confirmQbOrderDeliveryAction(
  _previous: QbOrderActionState,
  formData: FormData,
): Promise<QbOrderActionState> {
  await requireRoleAccess("/pedidos");

  const orderId = uuidSchema.safeParse(formData.get("order_id"));
  if (!orderId.success) return actionState(false, "Pedido QB invalido.");

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { error } = await supabase.rpc("confirm_qb_order_delivery", {
    p_order_id: orderId.data,
  });

  if (error) {
    return actionState(false, errorMessage(error, "No se pudo confirmar la entrega QB."));
  }

  revalidatePath("/pedidos");
  return actionState(true, "Entrega QB confirmada y stock descontado.");
}

export async function cancelQbOrderBeforeDeliveryAction(
  _previous: QbOrderActionState,
  formData: FormData,
): Promise<QbOrderActionState> {
  await requireRoleAccess("/pedidos");

  const orderId = uuidSchema.safeParse(formData.get("order_id"));
  const reason = z.string().max(500).optional().safeParse(formData.get("reason") ?? "");

  if (!orderId.success || !reason.success) {
    return actionState(false, "Datos de cancelacion invalidos.");
  }

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { error } = await supabase.rpc("cancel_qb_order_before_delivery", {
    p_order_id: orderId.data,
    p_reason: reason.data,
  });

  if (error) {
    return actionState(false, errorMessage(error, "No se pudo cancelar el pedido QB."));
  }

  revalidatePath("/pedidos");
  return actionState(true, "Pedido QB cancelado antes de entrega.");
}
