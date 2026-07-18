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

const internalOrderItemSchema = z
  .object({
    productId: z.string().uuid(),
    inputMode: z.enum(["quantity", "amount_bs"]).optional().default("quantity"),
    allowedUnitId: z.string().uuid().optional(),
    quantity: z.number().finite().positive().max(10000).optional(),
    requestedAmountBs: z.number().finite().positive().max(1000000).optional(),
    notes: z.string().trim().max(500).optional().default(""),
  })
  .superRefine((item, context) => {
    if (item.inputMode === "amount_bs") {
      if (
        item.requestedAmountBs === undefined ||
        Math.abs(item.requestedAmountBs * 100 - Math.round(item.requestedAmountBs * 100)) > 0.000001
      ) {
        context.addIssue({ code: "custom", path: ["requestedAmountBs"], message: "Ingresa un importe valido." });
      }
      return;
    }
    if (!item.allowedUnitId || item.quantity === undefined) {
      context.addIssue({ code: "custom", path: ["quantity"], message: "Selecciona unidad y cantidad." });
    }
  });

const createInternalOrderSchema = z
  .object({
    orderMode: z.enum(["registered", "guest"]),
    customerAccountId: z.string().uuid().optional().nullable(),
    customerLocationId: z.string().uuid().optional().nullable(),
    businessName: z.string().trim().max(120).optional().default(""),
    responsibleName: z.string().trim().max(120).optional().default(""),
    phone: z.string().trim().max(25).optional().default(""),
    email: z.string().trim().email().max(254).optional().or(z.literal("")).default(""),
    address: z.string().trim().max(300).optional().default(""),
    locationLabel: z.string().trim().max(80).optional().default(""),
    locationReference: z.string().trim().max(300).optional().default(""),
    customerNotes: z.string().trim().max(1000).optional().default(""),
    idempotencyKey: z.string().uuid(),
    items: z.array(internalOrderItemSchema).min(1).max(30),
  })
  .superRefine((value, context) => {
    if (value.orderMode === "registered") {
      if (!value.customerAccountId) {
        context.addIssue({ code: "custom", path: ["customerAccountId"], message: "Selecciona un cliente." });
      }
      if (!value.customerLocationId) {
        context.addIssue({ code: "custom", path: ["customerLocationId"], message: "Selecciona una ubicacion." });
      }
      return;
    }

    if (value.businessName.length < 2) {
      context.addIssue({ code: "custom", path: ["businessName"], message: "Ingresa el nombre del negocio." });
    }
    if (value.responsibleName.length < 2) {
      context.addIssue({ code: "custom", path: ["responsibleName"], message: "Ingresa el nombre del responsable." });
    }
    const phoneDigits = value.phone.replace(/\D/g, "");
    if (!/^\+?[0-9\s()-]+$/.test(value.phone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
      context.addIssue({ code: "custom", path: ["phone"], message: "Ingresa un telefono valido." });
    }
    if (value.address.length < 5) {
      context.addIssue({ code: "custom", path: ["address"], message: "Ingresa una direccion." });
    }
  });

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

function parseInternalOrderItems(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  try {
    const parsed = z.array(internalOrderItemSchema).min(1).max(30).safeParse(JSON.parse(value));
    if (!parsed.success) return null;
    return new Set(parsed.data.map((item) => item.productId)).size === parsed.data.length
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

export async function createQbInternalOrderAction(
  _previous: QbOrderActionState,
  formData: FormData,
): Promise<QbOrderActionState> {
  const auth = await requireRoleAccess("/pedidos");
  if (auth.user.role !== "administrador") {
    return actionState(false, "Solo un administrador puede crear pedidos internos.");
  }

  const items = parseInternalOrderItems(formData.get("items"));
  if (!items) return actionState(false, "Agrega productos validos sin repetir.");

  const parsed = createInternalOrderSchema.safeParse({
    orderMode: formData.get("order_mode"),
    customerAccountId: formData.get("customer_account_id") || null,
    customerLocationId: formData.get("customer_location_id") || null,
    businessName: formData.get("business_name"),
    responsibleName: formData.get("responsible_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
    locationLabel: formData.get("location_label"),
    locationReference: formData.get("location_reference"),
    customerNotes: formData.get("customer_notes"),
    idempotencyKey: formData.get("idempotency_key"),
    items,
  });

  if (!parsed.success) {
    return actionState(false, parsed.error.issues[0]?.message ?? "Revisa el pedido.");
  }

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { data, error } = await supabase.rpc("create_qb17_internal_catalog_order", {
    p_order_mode: parsed.data.orderMode,
    p_customer_account_id: parsed.data.customerAccountId,
    p_customer_location_id: parsed.data.customerLocationId,
    p_business_name: parsed.data.businessName || null,
    p_full_name: parsed.data.responsibleName || null,
    p_phone: parsed.data.phone || null,
    p_email: parsed.data.email || null,
    p_address: parsed.data.address || null,
    p_location_label: parsed.data.locationLabel || null,
    p_location_reference: parsed.data.locationReference || null,
    p_customer_notes: parsed.data.customerNotes || null,
    p_items: parsed.data.items.map((item) =>
      item.inputMode === "amount_bs"
        ? {
            product_id: item.productId,
            input_mode: "amount_bs",
            requested_amount_bs: item.requestedAmountBs,
            notes: item.notes || null,
          }
        : {
            product_id: item.productId,
            input_mode: "quantity",
            allowed_unit_id: item.allowedUnitId,
            quantity: item.quantity,
            notes: item.notes || null,
          },
    ),
    p_idempotency_key: parsed.data.idempotencyKey,
  });

  if (error) {
    return actionState(false, errorMessage(error, "No se pudo crear el pedido."));
  }

  const result = ((data ?? []) as Array<{
    order_reference: string | null;
    result_code: string;
  }>)[0];
  if (!result || !["created", "already_created"].includes(result.result_code)) {
    return actionState(false, "No se pudo crear el pedido. Revisa cliente, ubicacion y productos.");
  }

  revalidatePath("/pedidos");
  return {
    success: true,
    message: result.result_code === "already_created" ? "El pedido ya habia sido recibido." : "Pedido creado y enviado a preparacion.",
    reference: result.order_reference ?? undefined,
  };
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
