import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  MatrixLine,
  MatrixOrder,
  OperationalMatrixData,
} from "@/types/operational-matrix";
import type { UserRole } from "@/types/auth";

function numberOr(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function snapshotText(snapshot: unknown, key: string) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const value = (snapshot as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export async function getOperationalMatrixData(
  operationalDate: string,
  role: UserRole,
): Promise<OperationalMatrixData> {
  noStore();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { operationalDate, role, orders: [], lines: [] };

  const { data: orderData, error: orderError } = await supabase
    .from("qb_orders")
    .select("id, public_reference, status, updated_at, customer_snapshot, location_snapshot")
    .eq("operational_date", operationalDate)
    .order("submitted_at", { ascending: true });
  if (orderError) throw new Error(`No se pudo cargar la matriz: ${orderError.message}`);

  const rawOrders = orderData ?? [];
  const orderIds = rawOrders.map((order) => String(order.id));
  if (!orderIds.length) return { operationalDate, role, orders: [], lines: [] };

  const [dayResult, itemsResult, preparationsResult, confirmationsResult] =
    await Promise.all([
      supabase
        .from("qb_operational_day_orders")
        .select("order_id, position, row_version")
        .in("order_id", orderIds),
      supabase
        .from("qb_order_items")
        .select(
          "id, order_id, product_id, source_label, base_unit_symbol, requested_quantity, row_version, product:products(name, category:product_categories(name))",
        )
        .in("order_id", orderIds)
        .order("sort_order", { ascending: true }),
      supabase
        .from("qb_order_preparations")
        .select("id, order_id, status")
        .in("order_id", orderIds),
      supabase
        .from("qb_order_delivery_confirmations")
        .select("order_id, status")
        .in("order_id", orderIds),
    ]);
  for (const result of [dayResult, itemsResult, preparationsResult, confirmationsResult]) {
    if (result.error) throw new Error(`No se pudo cargar la matriz: ${result.error.message}`);
  }

  const itemRows = itemsResult.data ?? [];
  const itemIds = itemRows.map((item) => String(item.id));
  const preparationIds = (preparationsResult.data ?? []).map((item) => String(item.id));
  const [preparationItemsResult, deliveryItemsResult] = await Promise.all([
    preparationIds.length
      ? supabase
          .from("qb_order_preparation_items")
          .select("id, preparation_id, order_item_id, actual_quantity, actual_base_quantity, preparation_check, notes, row_version, prepared_at_line, prepared_by:profiles!prepared_by_line(full_name)")
          .in("preparation_id", preparationIds)
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? supabase
          .from("qb_order_delivery_items")
          .select(
            "order_item_id, externally_sourced_quantity, delivered_quantity, delivered_base_quantity, delivery_check, delivery_note, row_version, delivered_at, delivered_by_profile:profiles!delivered_by(full_name)",
          )
          .in("order_item_id", itemIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (preparationItemsResult.error || deliveryItemsResult.error) {
    throw new Error(
      `No se pudo cargar el detalle: ${
        preparationItemsResult.error?.message ?? deliveryItemsResult.error?.message
      }`,
    );
  }

  const days = new Map(
    (dayResult.data ?? []).map((row) => [String(row.order_id), row]),
  );
  const preparations = new Map(
    (preparationsResult.data ?? []).map((row) => [String(row.order_id), row]),
  );
  const confirmations = new Map(
    (confirmationsResult.data ?? []).map((row) => [String(row.order_id), row]),
  );
  const prepItems = new Map(
    (preparationItemsResult.data ?? []).map((row) => [String(row.order_item_id), row]),
  );
  const deliveryItems = new Map(
    (deliveryItemsResult.data ?? []).map((row) => [String(row.order_item_id), row]),
  );

  const orders: MatrixOrder[] = rawOrders
    .map((order, index) => {
      const id = String(order.id);
      const day = days.get(id);
      const preparation = preparations.get(id);
      return {
        id,
        reference: String(order.public_reference),
        customerName:
          snapshotText(order.customer_snapshot, "business_name") ??
          snapshotText(order.customer_snapshot, "responsible_name") ??
          "Cliente",
        locationLabel:
          snapshotText(order.location_snapshot, "label") ??
          snapshotText(order.location_snapshot, "address"),
        status: String(order.status),
        updatedAt: String(order.updated_at),
        position: numberOr(day?.position, index + 1),
        positionVersion: numberOr(day?.row_version),
        preparationStatus: preparation ? String(preparation.status) : null,
        deliveryStatus: confirmations.has(id)
          ? String(confirmations.get(id)?.status)
          : null,
      };
    })
    .sort((a, b) => a.position - b.position);

  const lines: MatrixLine[] = itemRows.map((item) => {
    const product = Array.isArray(item.product) ? item.product[0] : item.product;
    const categoryValue = (product as { category?: unknown } | null)?.category;
    const category = Array.isArray(categoryValue) ? categoryValue[0] : categoryValue;
    const prep = prepItems.get(String(item.id));
    const delivery = deliveryItems.get(String(item.id));
    const preparedByValue = (prep as { prepared_by?: unknown } | undefined)?.prepared_by;
    const preparedBy = Array.isArray(preparedByValue) ? preparedByValue[0] : preparedByValue;
    const deliveredByValue = (delivery as { delivered_by_profile?: unknown } | undefined)?.delivered_by_profile;
    const deliveredBy = Array.isArray(deliveredByValue) ? deliveredByValue[0] : deliveredByValue;
    return {
      orderItemId: String(item.id),
      orderId: String(item.order_id),
      productId: String(item.product_id),
      productName: String((product as { name?: unknown } | null)?.name ?? "Producto"),
      categoryName: String((category as { name?: unknown } | null)?.name ?? "Sin categoría"),
      sourceLabel: String(item.source_label),
      baseUnitSymbol: String(item.base_unit_symbol),
      requestedQuantity: numberOr(item.requested_quantity),
      requestedVersion: numberOr(item.row_version),
      preparedQuantity: numberOr(prep?.actual_quantity),
      preparedBaseQuantity: numberOr(prep?.actual_base_quantity),
      preparationCheck: Boolean(prep?.preparation_check),
      preparationNote: String(prep?.notes ?? ""),
      preparationVersion: numberOr(prep?.row_version),
      preparedBy: String((preparedBy as { full_name?: unknown } | null)?.full_name ?? "") || null,
      preparedAt: prep?.prepared_at_line ? String(prep.prepared_at_line) : null,
      externalQuantity: numberOr(delivery?.externally_sourced_quantity),
      deliveredQuantity: numberOr(delivery?.delivered_quantity),
      deliveredBaseQuantity: numberOr(delivery?.delivered_base_quantity),
      deliveryCheck: Boolean(delivery?.delivery_check),
      deliveryNote: String(delivery?.delivery_note ?? ""),
      deliveryVersion: numberOr(delivery?.row_version),
      deliveredBy: String((deliveredBy as { full_name?: unknown } | null)?.full_name ?? "") || null,
      deliveredAt: delivery?.delivered_at ? String(delivery.delivered_at) : null,
    };
  });
  return { operationalDate, role, orders, lines };
}
