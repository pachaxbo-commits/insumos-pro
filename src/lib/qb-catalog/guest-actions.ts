"use server";

import "server-only";

import { createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  QbGuestOrderActionResult,
  QbGuestOrderInput,
} from "@/types/qb-guest-order";

const MAX_ORDER_ITEMS = 30;
const MAX_LINE_QUANTITY = 10000;

const optionalText = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    },
    z.string().max(max).nullable(),
  );

const guestOrderItemSchema = z.object({
  productId: z.uuid(),
  allowedUnitId: z.uuid(),
  quantity: z
    .number()
    .finite()
    .positive()
    .max(MAX_LINE_QUANTITY)
    .refine(
      (quantity) => Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 0.000001,
      "Cada cantidad admite como maximo tres decimales.",
    ),
  notes: optionalText(500).optional(),
});

const guestOrderSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  fullName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .min(7)
    .max(25)
    .regex(/^\+?[0-9\s()-]+$/),
  email: optionalText(254).refine(
    (value) => !value || z.email().safeParse(value).success,
    "Correo invalido.",
  ),
  address: z.string().trim().min(5).max(300),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  label: optionalText(80).refine((value) => !value || value.length >= 2),
  reference: optionalText(300),
  googlePlaceId: optionalText(200),
  customerNotes: optionalText(1000),
  idempotencyKey: z.string().trim().pipe(z.uuid()),
  items: z.array(guestOrderItemSchema).min(1).max(MAX_ORDER_ITEMS),
});

type GuestOrderRpcRow = {
  created_order_id: string | null;
  order_reference: string | null;
  order_status: string | null;
  order_created_at: string | null;
  result_code: string;
};

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return `${hasPlus ? "+" : ""}${digits}`;
}

function secureHash(value: string, salt: string, purpose: string) {
  return createHmac("sha256", salt).update(`${purpose}:${value}`).digest("hex");
}

function getRequestFingerprint(requestHeaders: Headers) {
  const forwardedFor =
    requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    requestHeaders.get("x-real-ip")?.trim() ??
    "unknown";
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 200) ?? "unknown";
  return `${forwardedFor}|${userAgent}`;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function isSameOrigin(requestHeaders: Headers) {
  const origin = requestHeaders.get("origin");
  const host =
    firstHeaderValue(requestHeaders.get("x-forwarded-host")) ??
    firstHeaderValue(requestHeaders.get("host"));

  if (!origin || !host) return process.env.NODE_ENV !== "production";

  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function publicRpcMessage(resultCode: string): QbGuestOrderActionResult {
  if (resultCode === "rate_limited") {
    return {
      success: false,
      code: "rate_limited",
      message: "Recibimos varios intentos seguidos. Espera unos minutos antes de reintentar.",
    };
  }

  const messages: Record<string, string> = {
    invalid_contact: "Revisa los datos de contacto del pedido.",
    invalid_location: "Revisa la direccion y las coordenadas de entrega.",
    invalid_notes: "Las notas del pedido son demasiado largas.",
    empty_cart: "Agrega al menos un producto al pedido.",
    too_many_items: `El pedido puede incluir como maximo ${MAX_ORDER_ITEMS} productos.`,
    invalid_items: "Revisa los productos y unidades del pedido.",
    duplicate_product: "El pedido contiene un producto repetido.",
    invalid_quantity: "Revisa las cantidades solicitadas.",
    product_unavailable: "Uno de los productos ya no esta disponible.",
    unit_unavailable: "Una unidad seleccionada ya no esta disponible.",
    invalid_idempotency: "No pudimos validar el envio. Recarga e intenta nuevamente.",
    invalid_payload_hash: "No pudimos validar el contenido del pedido.",
    invalid_request: "No pudimos validar el pedido.",
  };

  return {
    success: false,
    code: "order_rejected",
    message: messages[resultCode] ?? "No pudimos recibir el pedido. Revisa los datos e intenta nuevamente.",
  };
}

export async function submitQbGuestCatalogOrderAction(
  payload: QbGuestOrderInput,
): Promise<QbGuestOrderActionResult> {
  const parsed = guestOrderSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      success: false,
      code: "validation_error",
      message: "Revisa los datos de contacto, ubicacion y productos del pedido.",
    };
  }

  const productIds = new Set(parsed.data.items.map((item) => item.productId));
  if (productIds.size !== parsed.data.items.length) {
    return {
      success: false,
      code: "validation_error",
      message: "El pedido contiene un producto repetido.",
    };
  }

  const phoneNormalized = normalizePhone(parsed.data.phone);
  if (!/^\+?[0-9]{7,15}$/.test(phoneNormalized)) {
    return {
      success: false,
      code: "validation_error",
      message: "Ingresa un telefono o WhatsApp valido.",
    };
  }

  const requestHeaders = await headers();
  if (!isSameOrigin(requestHeaders)) {
    return {
      success: false,
      code: "origin_rejected",
      message: "No pudimos validar el origen del envio.",
    };
  }

  const rateLimitSalt = process.env.ORDER_RATE_LIMIT_SALT;
  const admin = createSupabaseAdminClient();

  if (!admin || !rateLimitSalt || rateLimitSalt.length < 32) {
    return {
      success: false,
      code: "service_unavailable",
      message: "Los pedidos para invitados no estan disponibles temporalmente.",
    };
  }

  const requestFingerprintHash = secureHash(
    getRequestFingerprint(requestHeaders),
    rateLimitSalt,
    "qb-guest-request",
  );
  const phoneHash = secureHash(phoneNormalized, rateLimitSalt, "qb-guest-phone");
  const idempotencyKey = parsed.data.idempotencyKey.toLowerCase();
  const normalizedItems = parsed.data.items.map((item) => ({
    product_id: item.productId.toLowerCase(),
    allowed_unit_id: item.allowedUnitId.toLowerCase(),
    quantity: item.quantity,
    notes: item.notes ?? null,
  }));
  const canonicalPayload = {
    business_name: parsed.data.businessName,
    full_name: parsed.data.fullName,
    phone_normalized: phoneNormalized,
    email: parsed.data.email?.toLowerCase() ?? null,
    location: {
      label: parsed.data.label ?? null,
      address: parsed.data.address,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      reference: parsed.data.reference ?? null,
      google_place_id: parsed.data.googlePlaceId ?? null,
    },
    customer_notes: parsed.data.customerNotes ?? null,
    items: normalizedItems,
  };
  const requestPayloadHash = secureHash(
    JSON.stringify(canonicalPayload),
    rateLimitSalt,
    "qb-guest-payload-v1",
  );

  const { data, error } = await admin.rpc("create_qb_guest_catalog_order", {
    p_business_name: parsed.data.businessName,
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_phone_normalized: phoneNormalized,
    p_email: canonicalPayload.email,
    p_address: parsed.data.address,
    p_latitude: parsed.data.latitude.toString(),
    p_longitude: parsed.data.longitude.toString(),
    p_label: canonicalPayload.location.label,
    p_reference: canonicalPayload.location.reference,
    p_google_place_id: canonicalPayload.location.google_place_id,
    p_customer_notes: canonicalPayload.customer_notes,
    p_items: normalizedItems,
    p_idempotency_key: idempotencyKey,
    p_request_payload_hash: requestPayloadHash,
    p_request_fingerprint_hash: requestFingerprintHash,
    p_phone_hash: phoneHash,
  });

  if (error) {
    return {
      success: false,
      code: "service_unavailable",
      message: "No pudimos recibir el pedido. Tus productos pueden conservarse para reintentar.",
    };
  }

  const result = ((data ?? []) as GuestOrderRpcRow[])[0];
  if (result?.result_code === "idempotency_conflict") {
    return {
      success: false,
      code: "idempotency_conflict",
      message:
        "Los datos del pedido cambiaron desde el ultimo intento. Recarga el checkout y vuelve a enviarlo.",
    };
  }

  if (!result || !["created", "already_created"].includes(result.result_code)) {
    return publicRpcMessage(result?.result_code ?? "unknown");
  }

  if (!result.order_reference) {
    return {
      success: false,
      code: "service_unavailable",
      message: "El pedido fue recibido, pero no pudimos obtener su numero.",
    };
  }

  revalidatePath("/pedidos");

  return {
    success: true,
    code: result.result_code === "already_created" ? "already_created" : "created",
    message:
      result.result_code === "already_created"
        ? "Este pedido ya habia sido recibido."
        : "Pedido recibido para preparacion.",
    reference: result.order_reference,
  };
}
