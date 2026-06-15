"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CASH_SOURCE_TYPES, PAYMENT_METHODS_FINANCE } from "@/types/finance";

type ActionState = {
  success: boolean;
  message?: string;
};

const financeRoles = new Set(["administrador", "finanzas"]);
const initialError = "No se pudo completar la operacion.";

const optionalText = z.preprocess(
  (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  },
  z.string().nullable(),
);

const paymentSchema = z.object({
  id: z.uuid("Cuenta invalida."),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
  payment_method: z.enum(PAYMENT_METHODS_FINANCE),
  payment_date: z.string().min(10, "Selecciona una fecha."),
  notes: optionalText,
});

const manualCashSchema = z.object({
  source_type: z.enum(["ingreso_manual", "gasto_manual"]),
  amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
  payment_method: z.enum(PAYMENT_METHODS_FINANCE),
  movement_date: z.string().min(10, "Selecciona una fecha."),
  notes: optionalText,
  category: z.enum(CASH_SOURCE_TYPES).optional(),
});

async function assertCanManageFinance() {
  const auth = await requireAuthenticatedUser();

  if (!auth.user.role || !financeRoles.has(auth.user.role)) {
    return {
      allowed: false as const,
      message: "Tu rol no permite gestionar finanzas.",
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

function financeMessage(message?: string) {
  if (!message) return initialError;

  if (message.includes("mayor al saldo")) {
    return "El pago no puede ser mayor al saldo pendiente.";
  }

  if (message.includes("Cuenta por cobrar no encontrada")) {
    return "Cuenta por cobrar no encontrada o ya cerrada.";
  }

  if (message.includes("Cuenta por pagar no encontrada")) {
    return "Cuenta por pagar no encontrada o ya cerrada.";
  }

  return message;
}

function revalidateFinance() {
  revalidatePath("/finanzas");
  revalidatePath("/clientes");
  revalidatePath("/compras");
  revalidatePath("/ventas");
}

export async function registerReceivablePaymentAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageFinance();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = paymentSchema.safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
    payment_method: formData.get("payment_method"),
    payment_date: formData.get("payment_date"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? initialError };
  }

  const { data, error } = await access.supabase.rpc("register_customer_payment", {
    p_accounts_receivable_id: parsed.data.id,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.payment_method,
    p_payment_date: parsed.data.payment_date,
    p_notes: parsed.data.notes,
  });

  if (error) return { success: false, message: financeMessage(error.message) };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "register_customer_payment",
    entityType: "payment",
    entityId: typeof data === "string" ? data : null,
    metadata: {
      accounts_receivable_id: parsed.data.id,
      amount: parsed.data.amount,
      payment_method: parsed.data.payment_method,
    },
  });

  revalidateFinance();
  return { success: true, message: "Cobro registrado correctamente." };
}

export async function registerPayablePaymentAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageFinance();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = paymentSchema.safeParse({
    id: formData.get("id"),
    amount: formData.get("amount"),
    payment_method: formData.get("payment_method"),
    payment_date: formData.get("payment_date"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? initialError };
  }

  const { data, error } = await access.supabase.rpc("register_supplier_payment", {
    p_accounts_payable_id: parsed.data.id,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.payment_method,
    p_payment_date: parsed.data.payment_date,
    p_notes: parsed.data.notes,
  });

  if (error) return { success: false, message: financeMessage(error.message) };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "register_supplier_payment",
    entityType: "payment",
    entityId: typeof data === "string" ? data : null,
    metadata: {
      accounts_payable_id: parsed.data.id,
      amount: parsed.data.amount,
      payment_method: parsed.data.payment_method,
    },
  });

  revalidateFinance();
  return { success: true, message: "Pago registrado correctamente." };
}

export async function registerManualCashMovementAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await assertCanManageFinance();
  if (!access.allowed) return { success: false, message: access.message };

  const parsed = manualCashSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? initialError };
  }

  const { data, error } = await access.supabase.rpc("register_manual_cash_movement", {
    p_source_type: parsed.data.source_type,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.payment_method,
    p_movement_date: parsed.data.movement_date,
    p_notes: parsed.data.notes,
  });

  if (error) return { success: false, message: financeMessage(error.message) };

  await writeAuditLog({
    supabase: access.supabase,
    userId: access.userId,
    action: "register_manual_cash_movement",
    entityType: "cash_movement",
    entityId: typeof data === "string" ? data : null,
    metadata: {
      source_type: parsed.data.source_type,
      amount: parsed.data.amount,
      payment_method: parsed.data.payment_method,
    },
  });

  revalidateFinance();
  return { success: true, message: "Movimiento manual registrado correctamente." };
}
