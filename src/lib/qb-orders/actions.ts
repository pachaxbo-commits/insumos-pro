"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRoleAccess } from "@/lib/auth/session";
import { parseInternalOrderFormData } from "@/lib/qb-orders/internal-order-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QbOrderActionState } from "@/types/qb-orders";

const actionState = (
  success: boolean,
  message: string,
  refreshRequired = false,
): QbOrderActionState => ({
  success,
  message,
  refreshRequired,
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
  expectedUpdatedAt: z.string().trim().min(1),
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

function orderMutationErrorState(error: unknown, fallback: string) {
  const message = errorMessage(error, fallback);
  const normalized = message.toLocaleLowerCase("es");
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const conflictSignals = [
    "ya fue",
    "ya tiene",
    "solo se puede",
    "solo se pueden",
    "no puede entrar",
    "no se puede editar",
    "no encontrado",
    "no preparada",
  ];

  if (
    code === "40001"
    || normalized.includes("cambió en otro dispositivo")
    || conflictSignals.some((signal) => normalized.includes(signal))
  ) {
    return actionState(
      false,
      "El pedido cambió en otro dispositivo. Actualiza la vista antes de continuar.",
      true,
    );
  }

  return actionState(false, message);
}

function internalOrderRpcErrorMessage(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  if (message.includes("QB17_AMOUNT_UNAVAILABLE")) {
    return "El producto no está disponible para pedidos por importe.";
  }
  if (
    message.includes("QB17_INVALID_AMOUNT") ||
    message.includes("QB17_AMOUNT_TOO_SMALL_OR_LARGE")
  ) {
    return "Ingresa un importe válido.";
  }

  return "No pudimos crear el pedido. Revisa los datos e inténtalo nuevamente.";
}

function internalOrderResultMessage(resultCode: string) {
  switch (resultCode) {
    case "invalid_customer":
      return "Selecciona un cliente activo.";
    case "invalid_location":
      return "Selecciona una ubicación activa del cliente.";
    case "product_unavailable":
      return "Uno de los productos ya no está disponible.";
    case "invalid_unit":
      return "Selecciona una unidad permitida para cada producto.";
    case "invalid_quantity":
      return "Ingresa una cantidad válida.";
    case "unsupported_amount_mode":
      return "El producto no está disponible para pedidos por importe.";
    case "duplicate_product":
      return "No repitas un producto en el mismo pedido.";
    case "invalid_contact":
      return "Revisa los datos del cliente sin cuenta.";
    default:
      return "No pudimos crear el pedido. Revisa los datos e inténtalo nuevamente.";
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

  const parsed = parseInternalOrderFormData(formData);

  if (!parsed.success) {
    return actionState(false, parsed.error.issues[0]?.message ?? "Revisa el pedido.");
  }

  const { supabase } = await getSupabaseOrState();
  if (!supabase) {
    return actionState(
      false,
      "No pudimos crear el pedido en este momento. Inténtalo nuevamente.",
    );
  }

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
    return actionState(false, internalOrderRpcErrorMessage(error));
  }

  const result = ((data ?? []) as Array<{
    created_order_id: string | null;
    order_reference: string | null;
    result_code: string;
  }>)[0];
  if (!result || !["created", "already_created"].includes(result.result_code)) {
    return actionState(false, internalOrderResultMessage(result?.result_code ?? ""));
  }

  const orderId = uuidSchema.safeParse(result.created_order_id);
  const reference = result.order_reference?.trim();
  if (!orderId.success || !reference) {
    return actionState(
      false,
      "No pudimos confirmar la creación del pedido. Inténtalo nuevamente sin cambiar los datos.",
    );
  }

  revalidatePath("/pedidos");
  return {
    success: true,
    message:
      result.result_code === "already_created"
        ? "El pedido ya había sido recibido."
        : "Pedido creado y enviado a preparación.",
    reference,
    orderId: orderId.data,
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

  const { error } = await supabase.rpc("start_qb_order_preparation_versioned", {
    p_order_id: orderId.data,
    p_expected_updated_at: formData.get("expected_updated_at"),
  });

  if (error) {
    return orderMutationErrorState(error, "No se pudo iniciar la preparación QB.");
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
    expectedUpdatedAt: formData.get("expected_updated_at"),
    internalNotes: formData.get("internal_notes"),
    markPrepared: formData.get("mark_prepared") !== "false",
    items,
  });

  if (!parsed.success) {
    return actionState(false, "Revisa cantidades, estados y unidades de preparacion.");
  }

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { error } = await supabase.rpc("save_qb_order_preparation_versioned", {
    p_order_id: parsed.data.orderId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
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
    return {
      ...orderMutationErrorState(error, "No se pudo guardar la preparación QB."),
      orderId: parsed.data.orderId,
    };
  }

  revalidatePath("/pedidos");
  return {
    ...actionState(true, parsed.data.markPrepared ? "Pedido QB preparado." : "Preparacion QB guardada."),
    orderId: parsed.data.orderId,
  };
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

  const { error } = await supabase.rpc("confirm_qb_order_delivery_versioned", {
    p_order_id: orderId.data,
    p_expected_updated_at: formData.get("expected_updated_at"),
  });

  if (error) {
    return orderMutationErrorState(error, "No se pudo confirmar la entrega QB.");
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

  const { error } = await supabase.rpc("cancel_qb_order_before_delivery_versioned", {
    p_order_id: orderId.data,
    p_expected_updated_at: formData.get("expected_updated_at"),
    p_reason: reason.data,
  });

  if (error) {
    return orderMutationErrorState(error, "No se pudo cancelar el pedido QB.");
  }

  revalidatePath("/pedidos");
  return actionState(true, "Pedido QB cancelado antes de entrega.");
}
