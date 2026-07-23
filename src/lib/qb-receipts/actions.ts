"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { QbReceiptActionState } from "@/types/qb-receipts";

const initialFailure = (message: string): QbReceiptActionState => ({ success: false, message });

const uuidSchema = z.string().uuid();

const createDraftSchema = z.object({
  customerId: z.string().uuid(),
  orderIds: z.array(z.string().uuid()).min(1),
});

const nullableReceiptPriceSchema = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return Number(trimmed);
  }
  return value;
}, z.number().finite().positive().max(99999999).nullable());

const receiptLineUpdateSchema = z
  .object({
    lineId: z.string().uuid(),
    basePriceUsed: nullableReceiptPriceSchema,
    expectedBasePrice: nullableReceiptPriceSchema,
    saveAsNewBasePrice: z.coerce.boolean().optional().default(false),
    notes: z.string().max(500).optional().default(""),
  })
  .superRefine((line, context) => {
    if (line.basePriceUsed === null && line.saveAsNewBasePrice) {
      context.addIssue({
        code: "custom",
        path: ["saveAsNewBasePrice"],
        message: "Ingresa un precio positivo antes de guardarlo como precio base.",
      });
    }
    if (
      line.saveAsNewBasePrice
      && line.basePriceUsed !== null
      && Math.abs(line.basePriceUsed * 100 - Math.round(line.basePriceUsed * 100)) > 0.00000001
    ) {
      context.addIssue({
        code: "custom",
        path: ["basePriceUsed"],
        message: "El precio base admite como máximo dos decimales.",
      });
    }
  });

const receiptFactorSchema = z.coerce.number().refine(
  (value) => value === 0 || value === 5,
  "Cada factor debe estar desactivado (0%) o activado (5%).",
);

const updateDraftSchema = z.object({
  receiptId: z.string().uuid(),
  distanceFactorPercent: receiptFactorSchema,
  exigencyFactorPercent: receiptFactorSchema,
  weatherFactorPercent: receiptFactorSchema,
  extraordinaryFactorPercent: receiptFactorSchema,
  visibleNote: z.string().max(1000).optional().default(""),
  internalNotes: z.string().max(1500).optional().default(""),
  lines: z.array(receiptLineUpdateSchema).optional().default([]),
});

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "").trim();
    if (message) return message;
  }

  return fallback;
}

function receiptUpdateErrorMessage(error: unknown) {
  const message = errorMessage(error, "No se pudo actualizar el recibo QB.");
  const messages: Record<string, string> = {
    QB_PRICE_CONCURRENT_CHANGE: "El precio base cambió mientras editabas. Actualiza la página y revisa el precio antes de volver a guardarlo.",
    QB_PRICE_INVALID: "El precio base debe ser positivo y tener como máximo dos decimales.",
    QB_PRICE_PRODUCT_INACTIVE: "No se puede guardar un precio base para un producto inactivo.",
    QB_PRICE_UNIT_INVALID: "La unidad configurada no permite guardar este precio como precio base.",
    QB_PRICE_ADMIN_REQUIRED: "Solo un administrador puede cambiar precios base.",
  };
  const code = Object.keys(messages).find((candidate) => message.includes(candidate));
  return code ? messages[code] : message;
}

async function getSupabaseOrState() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { state: initialFailure("Faltan variables publicas de Supabase.") };
  return { supabase };
}

export async function createQbReceiptDraftAction(
  _previous: QbReceiptActionState,
  formData: FormData,
): Promise<QbReceiptActionState> {
  await requireRoleAccess("/recibos");

  let orderIds: unknown;
  try {
    orderIds = JSON.parse(String(formData.get("order_ids") ?? "[]"));
  } catch {
    return initialFailure("Seleccion de pedidos invalida.");
  }

  const parsed = createDraftSchema.safeParse({
    customerId: formData.get("customer_id"),
    orderIds,
  });

  if (!parsed.success) {
    return initialFailure("Selecciona un cliente y al menos un pedido entregado.");
  }

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { data, error } = await supabase.rpc("create_qb_receipt_draft", {
    p_customer_account_id: parsed.data.customerId,
    p_order_ids: parsed.data.orderIds,
  });

  if (error) {
    return initialFailure(errorMessage(error, "No se pudo crear el recibo QB."));
  }

  revalidatePath("/recibos");
  return {
    success: true,
    message: "Recibo QB creado en borrador.",
    receiptId: typeof data === "string" ? data : undefined,
  };
}

export async function updateQbReceiptDraftAction(
  _previous: QbReceiptActionState,
  formData: FormData,
): Promise<QbReceiptActionState> {
  await requireRoleAccess("/recibos");

  let lines: unknown;
  try {
    lines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return initialFailure("Lineas de recibo invalidas.");
  }

  const parsed = updateDraftSchema.safeParse({
    receiptId: formData.get("receipt_id"),
    distanceFactorPercent: formData.get("distance_factor_percent"),
    exigencyFactorPercent: formData.get("exigency_factor_percent"),
    weatherFactorPercent: formData.get("weather_factor_percent"),
    extraordinaryFactorPercent: formData.get("extraordinary_factor_percent"),
    visibleNote: formData.get("visible_note"),
    internalNotes: formData.get("internal_notes"),
    lines,
  });

  if (!parsed.success) {
    return initialFailure(
      "El precio debe ser un número positivo válido o quedar pendiente. Cada factor debe ser 0% o 5%.",
    );
  }

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { error } = await supabase.rpc("update_qb_receipt_draft", {
    p_receipt_id: parsed.data.receiptId,
    p_distance_factor_percent: parsed.data.distanceFactorPercent,
    p_exigency_factor_percent: parsed.data.exigencyFactorPercent,
    p_weather_factor_percent: parsed.data.weatherFactorPercent,
    p_extraordinary_factor_percent: parsed.data.extraordinaryFactorPercent,
    p_visible_note: parsed.data.visibleNote,
    p_internal_notes: parsed.data.internalNotes,
    p_lines: parsed.data.lines.map((line) => ({
      line_id: line.lineId,
      base_price_used: line.basePriceUsed,
      expected_base_price: line.expectedBasePrice,
      save_as_new_base_price: line.saveAsNewBasePrice,
      notes: line.notes,
    })),
  });

  if (error) {
    return initialFailure(receiptUpdateErrorMessage(error));
  }

  revalidatePath("/recibos");
  revalidatePath(`/recibos/${parsed.data.receiptId}`);
  return { success: true, message: "Recibo QB actualizado." };
}

export async function emitQbReceiptAction(
  _previous: QbReceiptActionState,
  formData: FormData,
): Promise<QbReceiptActionState> {
  await requireRoleAccess("/recibos");

  const receiptId = uuidSchema.safeParse(formData.get("receipt_id"));
  if (!receiptId.success) return initialFailure("Recibo QB invalido.");

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { error } = await supabase.rpc("emit_qb_receipt", {
    p_receipt_id: receiptId.data,
  });

  if (error) {
    return initialFailure(errorMessage(error, "No se pudo emitir el recibo QB."));
  }

  revalidatePath("/recibos");
  revalidatePath(`/recibos/${receiptId.data}`);
  return { success: true, message: "Recibo QB emitido." };
}

export async function voidQbReceiptAction(
  _previous: QbReceiptActionState,
  formData: FormData,
): Promise<QbReceiptActionState> {
  await requireRoleAccess("/recibos");

  const receiptId = uuidSchema.safeParse(formData.get("receipt_id"));
  const reason = z.string().max(500).optional().safeParse(formData.get("reason") ?? "");

  if (!receiptId.success || !reason.success) {
    return initialFailure("Datos de anulacion invalidos.");
  }

  const { supabase, state } = await getSupabaseOrState();
  if (!supabase) return state;

  const { error } = await supabase.rpc("void_qb_receipt", {
    p_receipt_id: receiptId.data,
    p_reason: reason.data,
  });

  if (error) {
    return initialFailure(errorMessage(error, "No se pudo anular el recibo QB."));
  }

  revalidatePath("/recibos");
  revalidatePath(`/recibos/${receiptId.data}`);
  return { success: true, message: "Recibo QB anulado." };
}
