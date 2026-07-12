"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  PublicOrderQuoteActionState,
  PublicOrderQuoteResult,
  PublicOrderQuoteSnapshot,
} from "@/types/orders";

const tokenSchema = z
  .string()
  .trim()
  .min(40)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);

type QuoteRpcRow = {
  result_code: string;
  quote_snapshot: PublicOrderQuoteSnapshot | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getQuoteMessage(status: string) {
  const messages: Record<string, string> = {
    invalid: "Este enlace no es valido.",
    expired: "Este enlace vencio. Solicita uno nuevo al equipo de ventas.",
    revoked: "Este enlace fue revocado. Solicita un resumen actualizado.",
    outdated: "El pedido cambio despues de emitir este resumen. Solicita un enlace nuevo.",
    unavailable: "Este pedido ya no esta disponible para confirmacion.",
  };

  return messages[status] ?? "No pudimos cargar el resumen del pedido.";
}

export async function loadPublicOrderQuoteAction(
  rawToken: string,
): Promise<PublicOrderQuoteResult> {
  const parsed = tokenSchema.safeParse(rawToken);

  if (!parsed.success) {
    return { status: "invalid", message: getQuoteMessage("invalid") };
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return {
      status: "error",
      message: "La confirmacion en linea no esta disponible temporalmente.",
    };
  }

  const { data, error } = await admin.rpc("get_public_order_quote", {
    p_token_hash: hashToken(parsed.data),
  });

  if (error) {
    return {
      status: "error",
      message: "No pudimos cargar el resumen. Intenta nuevamente.",
    };
  }

  const result = ((data ?? []) as QuoteRpcRow[])[0];

  if (!result) {
    return { status: "invalid", message: getQuoteMessage("invalid") };
  }

  if (result.result_code === "valid" || result.result_code === "confirmed") {
    if (!result.quote_snapshot) {
      return { status: "error", message: "El resumen no esta disponible." };
    }

    return {
      status: result.result_code,
      snapshot: result.quote_snapshot,
      message:
        result.result_code === "confirmed"
          ? "Este pedido ya fue confirmado."
          : undefined,
    };
  }

  return {
    status: result.result_code as PublicOrderQuoteResult["status"],
    message: getQuoteMessage(result.result_code),
  };
}

async function handleQuoteAction(
  action: "confirm" | "request_contact",
  formData: FormData,
): Promise<PublicOrderQuoteActionState> {
  const parsed = tokenSchema.safeParse(formData.get("token"));

  if (!parsed.success) {
    return { success: false, message: "El enlace no es valido." };
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    return {
      success: false,
      message: "La confirmacion en linea no esta disponible temporalmente.",
    };
  }

  const { data, error } = await admin.rpc("handle_public_order_quote", {
    p_token_hash: hashToken(parsed.data),
    p_action: action,
  });

  if (error) {
    return {
      success: false,
      message: "No pudimos completar la solicitud. Intenta nuevamente.",
    };
  }

  const result = typeof data === "string" ? data : String(data ?? "");

  if (result === "confirmed" || result === "already_confirmed") {
    revalidatePath("/pedidos");
    return {
      success: true,
      status: result,
      message:
        result === "already_confirmed"
          ? "Este pedido ya estaba confirmado."
          : "Pedido confirmado correctamente.",
    };
  }

  if (result === "contact_requested") {
    revalidatePath("/pedidos");
    return {
      success: true,
      status: "contact_requested",
      message: "Solicitud enviada. El equipo de ventas se pondra en contacto.",
    };
  }

  return { success: false, message: getQuoteMessage(result) };
}

export async function confirmPublicOrderQuoteAction(
  _previousState: PublicOrderQuoteActionState,
  formData: FormData,
): Promise<PublicOrderQuoteActionState> {
  return handleQuoteAction("confirm", formData);
}

export async function requestPublicOrderContactAction(
  _previousState: PublicOrderQuoteActionState,
  formData: FormData,
): Promise<PublicOrderQuoteActionState> {
  return handleQuoteAction("request_contact", formData);
}
