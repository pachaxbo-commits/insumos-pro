"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import {
  isValidWhatsApp,
  normalizeRegistrationText,
} from "@/lib/customer-registration/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QbCatalogActionState } from "@/types/qb-catalog";

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

const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === "") return null;
      if (typeof value !== "string" && typeof value !== "number") return Number.NaN;
      return Number(value);
    },
    z.number().finite().min(min).max(max).nullable(),
  );

const profileSchema = z.object({
  business_name: z.string().trim().min(2, "Ingresa el nombre del negocio.").max(120),
  responsible_name: z.string().trim().min(2, "Ingresa el nombre del responsable.").max(120),
  phone: z
    .string()
    .transform(normalizeRegistrationText)
    .refine(isValidWhatsApp, "Ingresa un número de WhatsApp válido."),
});

const locationSchema = z
  .object({
    id: z.uuid().optional(),
    label: z.string().trim().min(2, "Nombra la ubicación.").max(80),
    address: z.string().trim().min(5, "Ingresa una dirección o ubicación.").max(300),
    reference: optionalText(300),
    phone: optionalText(25).refine(
      (value) =>
        !value ||
        (/^\+?[0-9\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15),
      "Teléfono de ubicación inválido.",
    ),
    latitude: optionalCoordinate(-90, 90),
    longitude: optionalCoordinate(-180, 180),
    google_place_id: optionalText(200),
    is_primary: z.enum(["on", "true", "1"]).optional(),
  })
  .superRefine((value, context) => {
    if ((value.latitude === null) !== (value.longitude === null)) {
      context.addIssue({
        code: "custom",
        message: "Selecciona nuevamente la ubicación en el mapa.",
        path: ["latitude"],
      });
    }
  });

const idSchema = z.object({
  id: z.uuid("Ubicacion invalida."),
});

const orderItemSchema = z
  .object({
    productId: z.uuid(),
    inputMode: z.enum(["quantity", "amount_bs"]).optional().default("quantity"),
    allowedUnitId: z.uuid().optional(),
    quantity: z.number().finite().positive().max(MAX_LINE_QUANTITY).optional(),
    requestedAmountBs: z.number().finite().positive().max(1000000).optional(),
    notes: z.string().trim().max(500).optional().default(""),
  })
  .superRefine((item, context) => {
    if (item.inputMode === "amount_bs") {
      if (
        item.requestedAmountBs === undefined ||
        Math.abs(item.requestedAmountBs * 100 - Math.round(item.requestedAmountBs * 100)) > 0.000001
      ) {
        context.addIssue({ code: "custom", path: ["requestedAmountBs"], message: "Ingresa un importe valido con hasta dos decimales." });
      }
      return;
    }

    if (!item.allowedUnitId || item.quantity === undefined) {
      context.addIssue({ code: "custom", path: ["quantity"], message: "Selecciona una unidad y cantidad validas." });
    } else if (Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) > 0.000001) {
      context.addIssue({ code: "custom", path: ["quantity"], message: "Cada cantidad admite como maximo tres decimales." });
    }
  });

const submitOrderSchema = z.object({
  location_id: z.uuid("Selecciona una ubicacion."),
  customer_notes: optionalText(1000),
  idempotency_key: z.uuid("No pudimos validar el envio. Recarga e intenta nuevamente."),
  company_website: z.string().max(200).optional().default(""),
});

async function getAuthenticatedCustomer() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, customerId: null, message: "Falta configurar Supabase." };

  const { data: claims } = await supabase.auth.getClaims();
  const customerId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

  if (!customerId) {
    return { supabase, customerId: null, message: "Inicia sesion como cliente." };
  }

  const { data: account, error } = await supabase
    .from("customer_accounts")
    .select("id, is_active")
    .eq("id", customerId)
    .maybeSingle<{ id: string; is_active: boolean }>();

  if (error || !account?.is_active) {
    return { supabase, customerId: null, message: "Cuenta de cliente no disponible." };
  }

  return { supabase, customerId, message: null };
}

async function isSameOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!origin || !host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function parseOrderItems(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    const result = z.array(orderItemSchema).min(1).max(MAX_ORDER_ITEMS).safeParse(parsed);
    if (!result.success) return null;

    const productIds = new Set(result.data.map((item) => item.productId));
    return productIds.size === result.data.length ? result.data : null;
  } catch {
    return null;
  }
}

function qbOrderMessage(code: string) {
  const messages: Record<string, string> = {
    unauthenticated: "Inicia sesion para enviar el pedido.",
    missing_customer: "Cuenta de cliente no disponible.",
    invalid_location: "Selecciona una ubicacion activa.",
    empty_cart: "Agrega al menos un producto.",
    too_many_items: `El pedido puede tener maximo ${MAX_ORDER_ITEMS} productos.`,
    invalid_idempotency: "No pudimos validar el envio. Recarga e intenta nuevamente.",
    already_created: "Este pedido ya fue recibido.",
  };

  return messages[code] ?? "No pudimos enviar el pedido. Revisa los productos y unidades.";
}

export async function updateQbCustomerProfileAction(
  _state: QbCatalogActionState,
  formData: FormData,
): Promise<QbCatalogActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message };
  }

  const access = await getAuthenticatedCustomer();
  if (!access.supabase || !access.customerId) {
    return { success: false, message: access.message ?? "Inicia sesion." };
  }

  const { error } = await access.supabase.rpc("update_qb_customer_profile", {
    p_business_name: parsed.data.business_name,
    p_responsible_name: parsed.data.responsible_name,
    p_phone: parsed.data.phone,
  });

  if (error) return { success: false, message: "No pudimos guardar tus datos." };

  revalidatePath("/mi-cuenta");
  return { success: true, message: "Datos actualizados." };
}

export async function saveQbCustomerLocationAction(
  _state: QbCatalogActionState,
  formData: FormData,
): Promise<QbCatalogActionState> {
  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message };
  }

  const access = await getAuthenticatedCustomer();
  if (!access.supabase || !access.customerId) {
    return { success: false, message: access.message ?? "Inicia sesion." };
  }

  const { data, error } = await access.supabase.rpc("save_own_qb_customer_location", {
    p_id: parsed.data.id ?? null,
    p_label: parsed.data.label,
    p_address: parsed.data.address,
    p_reference: parsed.data.reference,
    p_phone: parsed.data.phone,
    p_latitude: parsed.data.latitude,
    p_longitude: parsed.data.longitude,
    p_google_place_id: parsed.data.google_place_id,
    p_is_primary: Boolean(parsed.data.is_primary),
  });

  if (error || typeof data !== "string") {
    return { success: false, message: "No pudimos guardar la ubicación." };
  }

  revalidatePath("/mi-cuenta");
  revalidatePath("/catalogo/checkout");
  return { success: true, message: "Ubicación guardada.", locationId: data };
}

export async function setPrimaryQbCustomerLocationAction(
  _state: QbCatalogActionState,
  formData: FormData,
): Promise<QbCatalogActionState> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message };

  const access = await getAuthenticatedCustomer();
  if (!access.supabase || !access.customerId) {
    return { success: false, message: access.message ?? "Inicia sesión." };
  }

  const { data, error } = await access.supabase.rpc(
    "set_own_qb_customer_location_primary",
    { p_id: parsed.data.id },
  );
  if (error || data !== true) {
    return { success: false, message: "No pudimos cambiar la ubicación principal." };
  }

  revalidatePath("/mi-cuenta");
  revalidatePath("/catalogo/checkout");
  return { success: true, message: "Ubicación principal actualizada." };
}

export async function deactivateQbCustomerLocationAction(
  _state: QbCatalogActionState,
  formData: FormData,
): Promise<QbCatalogActionState> {
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message };

  const access = await getAuthenticatedCustomer();
  if (!access.supabase || !access.customerId) {
    return { success: false, message: access.message ?? "Inicia sesion." };
  }

  const { data, error } = await access.supabase.rpc(
    "deactivate_own_qb_customer_location",
    { p_id: parsed.data.id },
  );

  if (error || data !== true) {
    return { success: false, message: "No pudimos eliminar la ubicación." };
  }

  revalidatePath("/mi-cuenta");
  revalidatePath("/catalogo/checkout");
  return { success: true, message: "Ubicación eliminada." };
}

export async function submitQbCatalogOrderAction(
  _state: QbCatalogActionState,
  formData: FormData,
): Promise<QbCatalogActionState> {
  const parsed = submitOrderSchema.safeParse(Object.fromEntries(formData));
  const items = parseOrderItems(formData.get("items"));

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message };
  }

  if (parsed.data.company_website) {
    return { success: false, message: "No pudimos validar el envio. Intenta nuevamente." };
  }

  if (!items) {
    return {
      success: false,
      message: `El pedido debe incluir entre 1 y ${MAX_ORDER_ITEMS} productos sin repetir.`,
    };
  }

  if (!(await isSameOrigin())) {
    return { success: false, message: "No pudimos validar el origen del envio." };
  }

  const access = await getAuthenticatedCustomer();
  if (!access.supabase || !access.customerId) {
    return { success: false, message: access.message ?? "Inicia sesion." };
  }

  const { data, error } = await access.supabase.rpc("create_qb17_catalog_order", {
    p_location_id: parsed.data.location_id,
    p_customer_notes: parsed.data.customer_notes,
    p_items: items.map((item) =>
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
    p_idempotency_key: parsed.data.idempotency_key,
  });

  if (error) {
    return {
      success: false,
      message: "No pudimos enviar el pedido. Revisa las cantidades, importes y productos disponibles.",
    };
  }

  const result = ((data ?? []) as Array<{
    created_order_id: string | null;
    order_reference: string | null;
    result_code: string;
  }>)[0];

  if (!result || !["created", "already_created"].includes(result.result_code)) {
    return { success: false, message: qbOrderMessage(result?.result_code ?? "unknown") };
  }

  revalidatePath("/mi-cuenta");
  revalidatePath("/pedidos");

  return {
    success: true,
    message: "Pedido enviado y recibido para preparacion.",
    reference: result.order_reference ?? undefined,
  };
}
