import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HistoryOrder } from "./summary";

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getOperationalHistory(startDate: string, endDate: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { orders: [] as HistoryOrder[], truncated: false, error: "Supabase no disponible." };
  const { data: rawOrders, error: orderError } = await supabase.from("qb_orders")
    .select("id, operational_date, public_reference, customer_account_id, customer_snapshot, status")
    .gte("operational_date", startDate).lte("operational_date", endDate)
    .order("operational_date", { ascending: false }).limit(1001);
  if (orderError) return { orders: [] as HistoryOrder[], truncated: false, error: orderError.message };
  const selectedOrders = (rawOrders ?? []).slice(0, 1000);
  const orderIds = selectedOrders.map((row) => String(row.id));
  if (!orderIds.length) return { orders: [] as HistoryOrder[], truncated: false, error: null };
  const [itemsResult, receiptLinksResult] = await Promise.all([
    supabase.from("qb_order_items")
      .select("id, order_id, product_id, source_label, requested_quantity, product:products(name)")
      .in("order_id", orderIds).limit(5001),
    supabase.from("qb_receipt_orders")
      .select("receipt_id, order_id, inclusion_status").in("order_id", orderIds).limit(2001),
  ]);
  if (itemsResult.error || receiptLinksResult.error) return { orders: [] as HistoryOrder[], truncated: false, error: itemsResult.error?.message ?? receiptLinksResult.error?.message ?? "Error de consulta." };
  const items = (itemsResult.data ?? []).slice(0, 5000);
  const itemIds = items.map((item) => String(item.id));
  const receiptIds = [...new Set((receiptLinksResult.data ?? []).map((row) => String(row.receipt_id)))];
  const [preparations, deliveries, receipts] = await Promise.all([
    itemIds.length ? supabase.from("qb_order_preparation_items").select("order_item_id, actual_quantity").in("order_item_id", itemIds).limit(5001) : Promise.resolve({ data: [], error: null }),
    itemIds.length ? supabase.from("qb_order_delivery_items").select("order_item_id, delivered_quantity").in("order_item_id", itemIds).limit(5001) : Promise.resolve({ data: [], error: null }),
    receiptIds.length ? supabase.from("qb_receipts").select("id, receipt_number, status").in("id", receiptIds).limit(2001) : Promise.resolve({ data: [], error: null }),
  ]);
  if (preparations.error || deliveries.error || receipts.error) return { orders: [] as HistoryOrder[], truncated: false, error: preparations.error?.message ?? deliveries.error?.message ?? receipts.error?.message ?? "Error de consulta." };
  const preparationByItem = new Map((preparations.data ?? []).map((row) => [String(row.order_item_id), number(row.actual_quantity)]));
  const deliveryByItem = new Map((deliveries.data ?? []).map((row) => [String(row.order_item_id), number(row.delivered_quantity)]));
  const receiptById = new Map((receipts.data ?? []).map((row) => [String(row.id), row]));
  const orders: HistoryOrder[] = selectedOrders.map((row) => {
    const snapshot = row.customer_snapshot as Record<string, unknown> | null;
    return {
      id: String(row.id), date: String(row.operational_date), reference: String(row.public_reference),
      customerId: String(row.customer_account_id),
      customerName: text(snapshot?.business_name, text(snapshot?.responsible_name, text(snapshot?.full_name, "Cliente"))),
      status: String(row.status),
      lines: items.filter((item) => item.order_id === row.id).map((item) => {
        const product = Array.isArray(item.product) ? item.product[0] : item.product;
        return { productId: String(item.product_id), productName: text(product?.name, "Producto"),
          unit: String(item.source_label), requested: number(item.requested_quantity),
          prepared: preparationByItem.get(String(item.id)) ?? 0,
          delivered: deliveryByItem.get(String(item.id)) ?? 0 };
      }),
      receipts: (receiptLinksResult.data ?? []).filter((link) => link.order_id === row.id)
        .flatMap((link) => {
          const receipt = receiptById.get(String(link.receipt_id));
          return receipt ? [{ id: String(receipt.id), number: String(receipt.receipt_number), status: String(receipt.status) }] : [];
        }),
    };
  });
  return { orders, truncated: (rawOrders?.length ?? 0) > 1000 || (itemsResult.data?.length ?? 0) > 5000, error: null };
}
