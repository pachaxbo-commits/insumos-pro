"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/auth";

export type MatrixActionResult = {
  success: boolean;
  message: string;
  data?: unknown;
  conflict?: boolean;
};

const id = z.string().uuid();
const key = z.string().min(8).max(200);
const quantity = z.number().finite().min(0).max(999999999);

async function rpc(
  name: string,
  payload: Record<string, unknown>,
  allowedRoles: UserRole[],
  revalidate = true,
): Promise<MatrixActionResult> {
  const auth = await requireRoleAccess("/matriz-operativa");
  if (!auth.user.role || !allowedRoles.includes(auth.user.role)) {
    return {
      success: false,
      message: "Esta acción no está habilitada para tu etapa del flujo.",
    };
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { success: false, message: "Falta la conexion publica de Supabase." };
  const { data, error } = await supabase.rpc(name, payload);
  if (error) {
    return {
      success: false,
      message: error.message,
      conflict: error.code === "40001" || error.message.includes("QB_MATRIX_CONFLICT"),
    };
  }
  if (revalidate) {
    revalidatePath("/matriz-operativa");
    revalidatePath("/pedidos");
  }
  return { success: true, message: "Cambio guardado.", data };
}

export async function saveMatrixPreparationAction(input: unknown) {
  const parsed = z.object({
    orderItemId: id,
    expectedVersion: z.number().int().min(0),
    preparedQuantity: quantity,
    preparationCheck: z.boolean(),
    actualWeightKg: quantity.nullable(),
    note: z.string().max(500),
    idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Preparacion invalida." };
  return rpc("save_qb_matrix_preparation_item_with_weight", {
    p_order_item_id: parsed.data.orderItemId,
    p_expected_version: parsed.data.expectedVersion,
    p_prepared_quantity: parsed.data.preparedQuantity,
    p_preparation_check: parsed.data.preparationCheck,
    p_actual_weight_kg: parsed.data.actualWeightKg,
    p_note: parsed.data.note,
    p_idempotency_key: parsed.data.idempotencyKey,
  }, ["inventario"], false);
}

export async function saveMatrixDeliveryAction(input: unknown) {
  const parsed = z.object({
    orderItemId: id,
    expectedVersion: z.number().int().min(0),
    externalQuantity: quantity,
    deliveredQuantity: quantity,
    deliveryCheck: z.boolean(),
    actualWeightKg: quantity.nullable(),
    note: z.string().max(500),
    idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Entrega invalida." };
  return rpc("save_qb_matrix_delivery_item_with_weight", {
    p_order_item_id: parsed.data.orderItemId,
    p_expected_version: parsed.data.expectedVersion,
    p_externally_sourced_quantity: parsed.data.externalQuantity,
    p_delivered_quantity: parsed.data.deliveredQuantity,
    p_delivery_check: parsed.data.deliveryCheck,
    p_actual_weight_kg: parsed.data.actualWeightKg,
    p_note: parsed.data.note,
    p_idempotency_key: parsed.data.idempotencyKey,
  }, ["entregador"], false);
}

export async function finalizeMatrixPreparationAction(input: unknown) {
  const parsed = z.object({
    orderId: id, expectedUpdatedAt: z.string().datetime(), idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Pedido invalido." };
  return rpc("finalize_qb_matrix_preparation", {
    p_order_id: parsed.data.orderId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
  }, ["inventario"]);
}

export async function confirmMatrixDeliveryAction(input: unknown) {
  const parsed = z.object({
    orderId: id, expectedUpdatedAt: z.string().datetime(), idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Pedido invalido." };
  const payload = {
    p_order_id: parsed.data.orderId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
  };
  const firstAttempt = await rpc(
    "confirm_qb_matrix_delivery",
    payload,
    ["entregador"],
  );
  if (!firstAttempt.conflict) return firstAttempt;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return firstAttempt;
  const { data: currentOrder, error } = await supabase
    .from("qb_orders")
    .select("updated_at")
    .eq("id", parsed.data.orderId)
    .single();
  if (error || !currentOrder?.updated_at) return firstAttempt;

  return rpc(
    "confirm_qb_matrix_delivery",
    {
      ...payload,
      p_expected_updated_at: String(currentOrder.updated_at),
    },
    ["entregador"],
  );
}

export async function reopenMatrixDeliveryAction(input: unknown) {
  const parsed = z.object({
    orderId: id,
    expectedUpdatedAt: z.string().datetime(),
    reason: z.string().min(3).max(500),
    idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Indica un motivo valido." };
  return rpc("reopen_qb_matrix_delivery", {
    p_order_id: parsed.data.orderId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
  }, ["entregador"]);
}

export async function correctMatrixRequestAction(input: unknown) {
  const parsed = z.object({
    orderItemId: id,
    expectedVersion: z.number().int().min(0),
    requestedQuantity: z.number().finite().positive(),
    reason: z.string().min(3).max(500),
    idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Correccion invalida." };
  return rpc("admin_update_qb_requested_quantity", {
    p_order_item_id: parsed.data.orderItemId,
    p_expected_version: parsed.data.expectedVersion,
    p_requested_quantity: parsed.data.requestedQuantity,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
  }, ["administrador"]);
}

export async function reorderMatrixOrdersAction(input: unknown) {
  const parsed = z.object({
    operationalDate: z.string().date(),
    orderIds: z.array(id).min(1),
    expectedVersions: z.record(z.string(), z.number().int().min(0)),
    idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Orden invalido." };
  return rpc("reorder_qb_operational_day_orders", {
    p_operational_date: parsed.data.operationalDate,
    p_order_ids: parsed.data.orderIds,
    p_expected_versions: parsed.data.expectedVersions,
    p_idempotency_key: parsed.data.idempotencyKey,
  }, ["administrador"]);
}
