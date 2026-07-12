"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ORDER_ITEM_STATUSES } from "@/types/orders";
import { SALE_PAYMENT_TYPES } from "@/types/sales";

type ActionState = {
  success: boolean;
  message?: string;
  secureLink?: string;
  expiresAt?: string;
};

const orderRoles = new Set(["administrador", "ventas"]);

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().nullable(),
);

const orderSchema = z.object({
  customer_id: z.uuid("Selecciona un cliente."),
  order_date: z.string().min(10, "Selecciona una fecha."),
  payment_type: z.enum(SALE_PAYMENT_TYPES),
  notes: optionalText,
});

const itemSchema = z.object({
  product_id: z.uuid(),
  requested_quantity: z.coerce.number().finite().positive(),
  unit_price: z.coerce.number().min(0),
});

const prepareItemSchema = z.object({
  id: z.uuid("Item invalido."),
  status: z.enum(ORDER_ITEM_STATUSES),
  actual_quantity: z.coerce
    .number()
    .finite("La cantidad real debe ser valida.")
    .min(0, "La cantidad real no puede ser negativa."),
  notes: optionalText,
});

const confirmOrderSchema = z.object({
  id: z.uuid("Pedido invalido."),
  payment_type: z.enum(SALE_PAYMENT_TYPES),
});

const cancelOrderSchema = z.object({
  id: z.uuid("Pedido invalido."),
  reason: z.string().trim().min(5, "Indica un motivo de cancelacion."),
});

const linkPublicOrderSchema = z.object({
  id: z.uuid("Pedido invalido."),
  customer_id: z.uuid("Selecciona un cliente."),
});

const reviewPublicOrderSchema = z
  .object({
    id: z.uuid("Pedido invalido."),
    contact_name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(25),
    delivery_type: z.enum(["delivery", "recojo"]),
    delivery_address: z.string().trim().max(300),
    delivery_time_window: z.string().trim().min(3).max(100),
    expected_payment_method: z.enum(["efectivo", "qr", "mixto"]),
    notes: optionalText,
  })
  .superRefine((value, context) => {
    if (value.delivery_type === "delivery" && value.delivery_address.length < 5) {
      context.addIssue({
        code: "custom",
        path: ["delivery_address"],
        message: "La direccion es obligatoria para delivery.",
      });
    }
  });

const orderIdSchema = z.object({
  id: z.uuid("Pedido invalido."),
});

const adjustPriceSchema = z.object({
  id: z.uuid("Item invalido."),
  final_unit_price: z.coerce
    .number()
    .finite("El precio final debe ser valido.")
    .positive("El precio final debe ser mayor a cero."),
  reason: z.string().trim().min(10, "El motivo debe tener al menos 10 caracteres.").max(500),
});

const revokeQuoteSchema = z.object({
  id: z.uuid("Pedido invalido."),
  reason: z.string().trim().min(5, "Indica un motivo para revocar el enlace.").max(500),
});

const manualConfirmSchema = z.object({
  id: z.uuid("Pedido invalido."),
  reason: z
    .string()
    .trim()
    .min(10, "Describe la confirmacion por llamada o WhatsApp.")
    .max(500),
});

const fulfillmentSchema = z
  .object({
    id: z.uuid("Pedido invalido."),
    fulfillment_type: z.enum(["delivery", "recojo"]),
    confirmation: z.string().trim(),
    authorize_outstanding: z
      .string()
      .optional()
      .transform((value) => value === "true"),
    outstanding_authorization_reason: optionalText,
    outstanding_due_date: z.preprocess(
      (value) => {
        if (typeof value !== "string" || !value.trim()) return null;
        return value;
      },
      z.string().date("Fecha de vencimiento invalida.").nullable(),
    ),
  })
  .superRefine((value, context) => {
    const expected = value.fulfillment_type === "delivery" ? "DESPACHAR" : "ENTREGAR";
    if (value.confirmation !== expected) {
      context.addIssue({
        code: "custom",
        path: ["confirmation"],
        message: `Escribe ${expected} para confirmar.`,
      });
    }
  });

const initialPaymentSchema = z
  .object({
    paymentMethod: z.enum(["efectivo", "qr", "transferencia"]),
    amount: z
      .number()
      .finite()
      .positive("Cada pago debe ser mayor a cero.")
      .max(999999999, "El monto es demasiado alto.")
      .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
        "Los pagos admiten como maximo dos decimales.",
      ),
    externalReference: z.string().trim().max(120).nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.paymentMethod !== "efectivo" &&
      (value.externalReference?.length ?? 0) < 3
    ) {
      context.addIssue({
        code: "custom",
        path: ["externalReference"],
        message: "QR y transferencia requieren una referencia.",
      });
    }
  });

async function assertOrderAccess(deniedMessage: string) {
  const auth = await requireAuthenticatedUser();

  if (!auth.user.role || !orderRoles.has(auth.user.role)) {
    return {
      allowed: false as const,
      message: deniedMessage,
    };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      allowed: false as const,
      message: "Supabase no esta configurado.",
    };
  }

  return {
    allowed: true as const,
    supabase,
    userId: auth.user.id,
    userRole: auth.user.role,
  };
}

function parseOrderItems(formData: FormData) {
  const items: Array<z.infer<typeof itemSchema>> = [];

  for (let index = 0; index < 12; index += 1) {
    const productId = formData.get(`item_product_id_${index}`);
    const requestedQuantity = formData.get(`item_requested_quantity_${index}`);
    const unitPrice = formData.get(`item_unit_price_${index}`);

    if (!productId && !requestedQuantity && !unitPrice) continue;
    if (typeof productId !== "string" || !productId) continue;

    const parsed = itemSchema.safeParse({
      product_id: productId,
      requested_quantity: requestedQuantity,
      unit_price: unitPrice,
    });

    if (parsed.success) items.push(parsed.data);
  }

  return items;
}

function getBusinessErrorMessage(message: string | undefined) {
  if (!message) return "No se pudo completar la operacion.";

  if (message.includes("Stock insuficiente")) {
    return "Stock insuficiente para confirmar la venta del pedido. Revisa las cantidades reales.";
  }

  if (message.includes("El cliente no esta habilitado para ventas a credito")) {
    return "Este cliente esta configurado como contado y no puede generar ventas a credito.";
  }

  if (message.includes("limite de credito")) {
    return "La venta supera el limite de credito disponible para este cliente.";
  }

  if (message.includes("saldo de un cliente contado")) {
    return "Un cliente de contado solo puede quedar con saldo si un administrador lo autoriza, indica el motivo y define el vencimiento.";
  }

  if (message.includes("QR y transferencia requieren")) {
    return "Los pagos por QR o transferencia necesitan una referencia.";
  }

  if (
    message.includes("pagos no pueden superar") ||
    message.includes("pago no puede ser mayor")
  ) {
    return "El total pagado no puede superar el saldo de la venta.";
  }

  if (message.includes("confirmacion vigente")) {
    return "La version final del pedido no tiene una confirmacion vigente del cliente.";
  }

  if (message.includes("procesado con otra solicitud")) {
    return "El pedido ya fue procesado con otros datos. Recarga la pagina para ver el cierre.";
  }

  if (message.includes("ya fue confirmado")) {
    return "El pedido ya fue confirmado y no puede confirmarse nuevamente.";
  }

  if (message.includes("items pendientes")) {
    return "El pedido todavia tiene items pendientes. Marcalos como preparados, parciales o sin stock.";
  }

  return message;
}

function revalidateOrders() {
  revalidatePath("/pedidos");
  revalidatePath("/ventas");
  revalidatePath("/inventario");
  revalidatePath("/productos");
  revalidatePath("/finanzas");
  revalidatePath("/reportes");
  revalidatePath("/");
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return `${hasPlus ? "+" : ""}${digits}`;
}

function parseInitialPayments(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    const result = z.array(initialPaymentSchema).max(10).safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function paymentIdempotencyKey(orderId: string, index: number) {
  const hash = createHash("sha256")
    .update(`insumos-pro:order-payment:${orderId}:${index}`)
    .digest("hex");

  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

async function getApplicationOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";

  if (!host) return null;
  return `${protocol}://${host}`;
}

export async function createOrderAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite crear pedidos.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = orderSchema.safeParse(Object.fromEntries(formData));
  const items = parseOrderItems(formData);

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el pedido." };
  }

  if (!items.length) {
    return { success: false, message: "Agrega al menos un producto al pedido." };
  }

  const { error } = await access.supabase.rpc("create_order", {
    p_customer_id: parsed.data.customer_id,
    p_order_date: parsed.data.order_date,
    p_payment_type: parsed.data.payment_type,
    p_notes: parsed.data.notes,
    p_items: items,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return { success: true, message: "Pedido creado correctamente." };
}

export async function prepareOrderItemAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite preparar pedidos.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = prepareItemSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el item." };
  }

  const { error } = await access.supabase.rpc("prepare_order_item", {
    p_order_item_id: parsed.data.id,
    p_status: parsed.data.status,
    p_actual_quantity: parsed.data.actual_quantity,
    p_notes: parsed.data.notes,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return { success: true, message: "Item actualizado." };
}

export async function confirmPreparedOrderAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite confirmar pedidos.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = confirmOrderSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa el pedido." };
  }

  const { error } = await access.supabase.rpc("confirm_prepared_order", {
    p_order_id: parsed.data.id,
    p_payment_type: parsed.data.payment_type,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return { success: true, message: "Pedido confirmado como venta real." };
}

export async function cancelOrderAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite cancelar pedidos.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = cancelOrderSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Revisa la cancelacion." };
  }

  const { error } = await access.supabase.rpc("cancel_order", {
    p_order_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return { success: true, message: "Pedido cancelado." };
}

export async function linkPublicOrderCustomerAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite revisar pedidos publicos.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = linkPublicOrderSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa el cliente seleccionado.",
    };
  }

  const { error } = await access.supabase.rpc("link_public_order_customer", {
    p_order_id: parsed.data.id,
    p_customer_id: parsed.data.customer_id,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return {
    success: true,
    message: "Cliente vinculado. Revisa los datos y libera el pedido cuando este listo.",
  };
}

export async function updatePublicOrderReviewAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite revisar pedidos publicos.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = reviewPublicOrderSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos del pedido.",
    };
  }

  const phone = normalizePhone(parsed.data.phone);

  if (!/^\+?[0-9]{7,15}$/.test(phone)) {
    return { success: false, message: "Ingresa un celular o WhatsApp valido." };
  }

  const { error } = await access.supabase.rpc("update_public_order_review", {
    p_order_id: parsed.data.id,
    p_contact_name: parsed.data.contact_name,
    p_phone: phone,
    p_delivery_type: parsed.data.delivery_type,
    p_delivery_address:
      parsed.data.delivery_type === "delivery" ? parsed.data.delivery_address : null,
    p_delivery_time_window: parsed.data.delivery_time_window,
    p_expected_payment_method: parsed.data.expected_payment_method,
    p_notes: parsed.data.notes,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return { success: true, message: "Datos de revision actualizados." };
}

export async function releasePublicOrderAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite liberar pedidos.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = orderIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Pedido invalido." };
  }

  const { error } = await access.supabase.rpc("release_public_order_to_preparation", {
    p_order_id: parsed.data.id,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return { success: true, message: "Pedido enviado a preparacion." };
}

export async function adjustPublicOrderItemPriceAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite ajustar precios.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = adjustPriceSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa el precio final.",
    };
  }

  const { error } = await access.supabase.rpc("adjust_public_order_item_price", {
    p_order_item_id: parsed.data.id,
    p_final_unit_price: parsed.data.final_unit_price,
    p_reason: parsed.data.reason,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return { success: true, message: "Precio final actualizado y auditado." };
}

export async function issuePublicOrderQuoteAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite emitir resumenes.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = orderIdSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Pedido invalido." };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await access.supabase.rpc("issue_public_order_quote", {
    p_order_id: parsed.data.id,
    p_token_hash: tokenHash,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  const result = (
    (data ?? []) as Array<{ expires_at?: string; quote_version?: number }>
  )[0];
  const origin = await getApplicationOrigin();

  if (!origin || !result?.expires_at) {
    return {
      success: false,
      message: "El resumen fue emitido, pero no se pudo construir el enlace para compartir.",
    };
  }

  revalidateOrders();
  return {
    success: true,
    message: `Resumen version ${result.quote_version ?? ""} generado. Copia el enlace ahora.`,
    secureLink: `${origin}/pedido/confirmar#${token}`,
    expiresAt: result.expires_at,
  };
}

export async function revokePublicOrderQuoteAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite revocar enlaces.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = revokeQuoteSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa el motivo de revocacion.",
    };
  }

  const { error } = await access.supabase.rpc("revoke_public_order_quote", {
    p_order_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return { success: true, message: "Enlace revocado." };
}

export async function confirmPublicOrderManuallyAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess("Tu rol no permite confirmar manualmente.");
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = manualConfirmSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa la confirmacion manual.",
    };
  }

  const { error } = await access.supabase.rpc("confirm_public_order_manually", {
    p_order_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });

  if (error) return { success: false, message: getBusinessErrorMessage(error.message) };

  revalidateOrders();
  return {
    success: true,
    message: "Confirmacion del cliente registrada sin crear venta ni mover stock.",
  };
}

export async function fulfillConfirmedOrderAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertOrderAccess(
    "Tu rol no permite despachar, entregar o registrar pagos de pedidos.",
  );
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = fulfillmentSchema.safeParse(Object.fromEntries(formData));
  const payments = parseInitialPayments(formData.get("payments"));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa el cierre del pedido.",
    };
  }

  if (!payments) {
    return {
      success: false,
      message: "La lista de pagos iniciales contiene datos invalidos.",
    };
  }

  const normalizedPayments = payments.map((payment, index) => ({
    idempotency_key: paymentIdempotencyKey(parsed.data.id, index),
    payment_method: payment.paymentMethod,
    amount: payment.amount,
    external_reference:
      payment.paymentMethod === "efectivo" ? null : payment.externalReference,
  }));

  const { data, error } = await access.supabase.rpc("fulfill_confirmed_order", {
    p_order_id: parsed.data.id,
    p_fulfillment_type: parsed.data.fulfillment_type,
    p_idempotency_key: parsed.data.id,
    p_payments: normalizedPayments,
    p_authorize_outstanding: parsed.data.authorize_outstanding,
    p_outstanding_authorization_reason:
      parsed.data.outstanding_authorization_reason,
    p_outstanding_due_date: parsed.data.outstanding_due_date,
  });

  if (error) {
    return {
      success: false,
      message: getBusinessErrorMessage(error.message),
    };
  }

  const result = (
    (data ?? []) as Array<{
      order_status?: string;
      sale_payment_status?: string;
      result_code?: string;
    }>
  )[0];

  revalidateOrders();

  const operation =
    parsed.data.fulfillment_type === "delivery" ? "despachado" : "entregado";
  const repeated = result?.result_code === "already_fulfilled";

  return {
    success: true,
    message: repeated
      ? `El pedido ya estaba ${operation}; se reutilizo el cierre existente.`
      : `Pedido ${operation}. Venta, stock y pagos iniciales quedaron registrados.`,
  };
}
