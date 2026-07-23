"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRoleAccess } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MatrixActionResult = {
  success: boolean;
  message: string;
  data?: unknown;
  conflict?: boolean;
};

const id = z.string().uuid();
const key = z.string().min(8).max(200);
const quantity = z.number().finite().min(0).max(999999999);

async function rpc(name: string, payload: Record<string, unknown>): Promise<MatrixActionResult> {
  await requireRoleAccess("/matriz-operativa");
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
  revalidatePath("/matriz-operativa");
  revalidatePath("/pedidos");
  return { success: true, message: "Cambio guardado.", data };
}

export async function saveMatrixPreparationAction(input: unknown) {
  const parsed = z.object({
    orderItemId: id,
    expectedVersion: z.number().int().min(0),
    preparedQuantity: quantity,
    preparationCheck: z.boolean(),
    note: z.string().max(500),
    idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Preparacion invalida." };
  return rpc("save_qb_matrix_preparation_item", {
    p_order_item_id: parsed.data.orderItemId,
    p_expected_version: parsed.data.expectedVersion,
    p_prepared_quantity: parsed.data.preparedQuantity,
    p_preparation_check: parsed.data.preparationCheck,
    p_note: parsed.data.note,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
}

export async function saveMatrixDeliveryAction(input: unknown) {
  const parsed = z.object({
    orderItemId: id,
    expectedVersion: z.number().int().min(0),
    externalQuantity: quantity,
    deliveredQuantity: quantity,
    deliveryCheck: z.boolean(),
    note: z.string().max(500),
    idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Entrega invalida." };
  return rpc("save_qb_matrix_delivery_item", {
    p_order_item_id: parsed.data.orderItemId,
    p_expected_version: parsed.data.expectedVersion,
    p_externally_sourced_quantity: parsed.data.externalQuantity,
    p_delivered_quantity: parsed.data.deliveredQuantity,
    p_delivery_check: parsed.data.deliveryCheck,
    p_note: parsed.data.note,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
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
  });
}

export async function confirmMatrixDeliveryAction(input: unknown) {
  const parsed = z.object({
    orderId: id, expectedUpdatedAt: z.string().datetime(), idempotencyKey: key,
  }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Pedido invalido." };
  return rpc("confirm_qb_matrix_delivery", {
    p_order_id: parsed.data.orderId,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
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
  });
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
  });
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
  });
}

