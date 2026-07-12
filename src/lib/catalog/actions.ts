"use server";

import { createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  PUBLIC_DELIVERY_TYPES,
  PUBLIC_EXPECTED_PAYMENT_METHODS,
  type PublicCheckoutActionState,
} from "@/types/catalog";

const MAX_ORDER_ITEMS = 30;
const MAX_LINE_QUANTITY = 10000;

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().max(1000, "Las observaciones no pueden superar 1000 caracteres.").nullable(),
);

const checkoutSchema = z
  .object({
    contact_name: z
      .string()
      .trim()
      .min(2, "Ingresa tu nombre o el nombre del negocio.")
      .max(120, "El nombre es demasiado largo."),
    phone: z
      .string()
      .trim()
      .min(7, "Ingresa un celular o WhatsApp valido.")
      .max(25, "El celular o WhatsApp es demasiado largo."),
    delivery_type: z.enum(PUBLIC_DELIVERY_TYPES),
    delivery_address: z.string().trim().max(300, "La direccion es demasiado larga."),
    delivery_time_window: z
      .string()
      .trim()
      .min(3, "Indica un horario aproximado.")
      .max(100, "El horario es demasiado largo."),
    expected_payment_method: z.enum(PUBLIC_EXPECTED_PAYMENT_METHODS),
    notes: optionalText,
    idempotency_key: z.uuid("No pudimos validar el envio. Recarga la pagina e intenta nuevamente."),
    company_website: z.string().max(200).optional().default(""),
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

const checkoutItemSchema = z.object({
  productId: z.uuid(),
  quantity: z
    .number()
    .finite()
    .positive()
    .max(MAX_LINE_QUANTITY)
    .refine(
      (quantity) => Math.abs(quantity * 1000 - Math.round(quantity * 1000)) < 0.000001,
      "Cada cantidad admite como maximo tres decimales.",
    ),
});

type PublicOrderRpcRow = {
  created_order_id: string | null;
  order_reference: string | null;
  result_code: string;
};

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return `${hasPlus ? "+" : ""}${digits}`;
}

function parseItems(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    const result = z.array(checkoutItemSchema).min(1).max(MAX_ORDER_ITEMS).safeParse(parsed);

    if (!result.success) return null;

    const ids = new Set(result.data.map((item) => item.productId));
    return ids.size === result.data.length ? result.data : null;
  } catch {
    return null;
  }
}

function getClientIp(requestHeaders: Headers) {
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || requestHeaders.get("x-real-ip")?.trim() || "unknown";
}

function isSameOrigin(requestHeaders: Headers) {
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!origin || !host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function secureHash(value: string, salt: string, purpose: string) {
  return createHmac("sha256", salt).update(`${purpose}:${value}`).digest("hex");
}

function getPublicErrorMessage(resultCode: string) {
  const messages: Record<string, string> = {
    rate_limited:
      "Recibimos varios intentos seguidos. Espera unos minutos antes de enviar otro pedido.",
    invalid_contact: "Revisa el nombre y el numero de celular o WhatsApp.",
    invalid_delivery: "Revisa el tipo, direccion y horario de entrega o recojo.",
    invalid_payment: "Selecciona una forma de pago esperada valida.",
    invalid_notes: "Las observaciones son demasiado largas.",
    invalid_items: "El carrito no es valido. Regresa al catalogo y revisa los productos.",
    duplicate_product: "El carrito contiene un producto repetido.",
    invalid_quantity: "Una de las cantidades solicitadas no es valida.",
    invalid_quantity_step:
      "Una cantidad ya no coincide con el minimo o incremento permitido. Revisa el carrito.",
    product_unavailable:
      "Uno de los productos ya no esta disponible en el catalogo. Regresa y actualiza el carrito.",
    product_sold_out:
      "Uno de los productos se marco como agotado. Regresa al catalogo para retirarlo.",
  };

  return messages[resultCode] ?? "No pudimos enviar el pedido. Intenta nuevamente.";
}

export async function submitPublicOrderAction(
  _previousState: PublicCheckoutActionState,
  formData: FormData,
): Promise<PublicCheckoutActionState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  const items = parseItems(formData.get("items"));

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Revisa los datos del pedido.",
    };
  }

  // El honeypot nunca escribe ni vacia el carrito.
  if (parsed.data.company_website) {
    return {
      success: false,
      message: "No pudimos validar el envio. Intenta nuevamente.",
    };
  }

  if (!items) {
    return {
      success: false,
      message: `El pedido debe incluir entre 1 y ${MAX_ORDER_ITEMS} productos sin repetir.`,
    };
  }

  const phone = normalizePhone(parsed.data.phone);

  if (!/^\+?[0-9]{7,15}$/.test(phone)) {
    return { success: false, message: "Ingresa un celular o WhatsApp valido." };
  }

  const requestHeaders = await headers();

  if (!isSameOrigin(requestHeaders)) {
    return { success: false, message: "No pudimos validar el origen del envio." };
  }

  const rateLimitSalt = process.env.ORDER_RATE_LIMIT_SALT;
  const admin = createSupabaseAdminClient();

  if (!admin || !rateLimitSalt || rateLimitSalt.length < 32) {
    return {
      success: false,
      message: "Los pedidos en linea no estan disponibles temporalmente.",
    };
  }

  const ipHash = secureHash(getClientIp(requestHeaders), rateLimitSalt, "public-order-ip");
  const idempotencyHash = secureHash(
    parsed.data.idempotency_key,
    rateLimitSalt,
    "public-order-idempotency",
  );

  const { data, error } = await admin.rpc("create_public_catalog_order", {
    p_contact_name: parsed.data.contact_name,
    p_phone: phone,
    p_delivery_type: parsed.data.delivery_type,
    p_delivery_address:
      parsed.data.delivery_type === "delivery" ? parsed.data.delivery_address : null,
    p_delivery_time_window: parsed.data.delivery_time_window,
    p_expected_payment_method: parsed.data.expected_payment_method,
    p_notes: parsed.data.notes,
    p_items: items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
    p_ip_hash: ipHash,
    p_idempotency_key_hash: idempotencyHash,
  });

  if (error) {
    return {
      success: false,
      message: "No pudimos enviar el pedido. Tus productos siguen guardados para reintentar.",
    };
  }

  const result = ((data ?? []) as PublicOrderRpcRow[])[0];

  if (!result || !["created", "already_created"].includes(result.result_code)) {
    return {
      success: false,
      message: getPublicErrorMessage(result?.result_code ?? "unknown"),
    };
  }

  if (!result.order_reference) {
    return {
      success: false,
      message: "El pedido fue recibido, pero no pudimos obtener su referencia.",
    };
  }

  const sessionClient = await createSupabaseServerClient();
  const { data: claims } = (await sessionClient?.auth.getClaims()) ?? { data: null };
  const authenticatedId =
    typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;

  if (authenticatedId && result.created_order_id) {
    const { data: account } = await admin
      .from("customer_accounts")
      .select("id, is_active")
      .eq("id", authenticatedId)
      .maybeSingle<{ id: string; is_active: boolean }>();

    if (account?.is_active) {
      const { error: linkError } = await admin.rpc(
        "link_public_order_customer_account",
        {
          p_order_id: result.created_order_id,
          p_idempotency_key_hash: idempotencyHash,
          p_customer_account_id: account.id,
        },
      );

      if (linkError) {
        return {
          success: false,
          message:
            "El pedido fue recibido, pero no pudimos vincularlo a tu cuenta. Reintenta sin vaciar el carrito.",
        };
      }
    }
  }

  revalidatePath("/pedidos");
  revalidatePath("/mi-cuenta");

  return {
    success: true,
    message: "Pedido enviado correctamente.",
    reference: result.order_reference,
  };
}
