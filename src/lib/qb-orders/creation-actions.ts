"use server";

import { z } from "zod";

import { requireRoleAccess } from "@/lib/auth/session";
import { getInternalOrderCreationData } from "@/lib/qb-orders/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  QbInternalOrderCreationData,
  QbRepeatableOrder,
} from "@/types/qb-orders";

export async function getInternalOrderCreationDataAction(): Promise<
  | { success: true; data: QbInternalOrderCreationData }
  | { success: false; message: string }
> {
  const auth = await requireRoleAccess("/pedidos");
  if (auth.user.role !== "administrador") {
    return {
      success: false,
      message: "Solo un administrador puede registrar pedidos.",
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      success: false,
      message: "No pudimos cargar las opciones del pedido.",
    };
  }

  const data = await getInternalOrderCreationData(supabase);
  return { success: true, data };
}

const repeatSelectionSchema = z.object({
  customerId: z.uuid(),
  locationId: z.uuid(),
});

type RepeatOrderResult =
  | { success: true; order: QbRepeatableOrder | null }
  | { success: false; message: string };

export async function getLastRepeatableOrderAction(
  customerId: string,
  locationId: string,
): Promise<RepeatOrderResult> {
  const auth = await requireRoleAccess("/pedidos");
  if (auth.user.role !== "administrador") {
    return {
      success: false,
      message: "Solo un administrador puede repetir pedidos.",
    };
  }

  const selection = repeatSelectionSchema.safeParse({ customerId, locationId });
  if (!selection.success) {
    return { success: false, message: "Selecciona un cliente y una ubicación." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      success: false,
      message: "No pudimos consultar el último pedido.",
    };
  }

  const selectOrder =
    "id, submitted_at, customer_location_id, location_snapshot";
  const sameLocation = await supabase
    .from("qb_orders")
    .select(selectOrder)
    .eq("customer_account_id", selection.data.customerId)
    .eq("customer_location_id", selection.data.locationId)
    .neq("status", "cancelado")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sameLocation.error) {
    return {
      success: false,
      message: "No pudimos consultar el último pedido.",
    };
  }

  const fallback = sameLocation.data
    ? null
    : await supabase
        .from("qb_orders")
        .select(selectOrder)
        .eq("customer_account_id", selection.data.customerId)
        .neq("status", "cancelado")
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (fallback?.error) {
    return {
      success: false,
      message: "No pudimos consultar el último pedido.",
    };
  }

  const order = sameLocation.data ?? fallback?.data;
  if (!order) return { success: true, order: null };

  const items = await supabase
    .from("qb_order_items")
    .select(
      "product_id, allowed_unit_id, order_input_mode, requested_quantity, requested_amount_bs, customer_notes",
    )
    .eq("order_id", order.id)
    .order("sort_order", { ascending: true });

  if (items.error) {
    return {
      success: false,
      message: "No pudimos cargar las líneas del último pedido.",
    };
  }

  const snapshot =
    order.location_snapshot && typeof order.location_snapshot === "object"
      ? (order.location_snapshot as Record<string, unknown>)
      : {};
  const locationLabel = [snapshot.label, snapshot.address]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" — ");

  return {
    success: true,
    order: {
      id: String(order.id),
      submittedAt: String(order.submitted_at),
      locationId: order.customer_location_id
        ? String(order.customer_location_id)
        : null,
      locationLabel: locationLabel || "Ubicación no identificada",
      sameLocation:
        String(order.customer_location_id) === selection.data.locationId,
      lines: (items.data ?? []).map((item) => ({
        productId: String(item.product_id),
        allowedUnitId: item.allowed_unit_id
          ? String(item.allowed_unit_id)
          : null,
        inputMode:
          item.order_input_mode === "amount_bs" ? "amount_bs" : "quantity",
        quantity: Number(item.requested_quantity),
        requestedAmountBs:
          item.requested_amount_bs === null
            ? null
            : Number(item.requested_amount_bs),
        notes: String(item.customer_notes ?? ""),
      })),
    },
  };
}
