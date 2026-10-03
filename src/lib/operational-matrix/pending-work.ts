import "server-only";

import { unstable_noStore as noStore } from "next/cache";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { todayInBolivia } from "@/lib/date-time";

export type PendingOrderItem = {
  id: string;
  publicReference: string;
  customerName: string;
  operationalDate: string;
  status: string;
  customerNotes?: string;
  isOverdue: boolean;
};

export type PendingDateSummary = {
  date: string;
  orderCount: number;
  productCount?: number;
  isOverdue: boolean;
  orders: PendingOrderItem[];
};

export type PendingStageSummary = {
  stage: "preparacion" | "entrega" | "mercado";
  totalOrders: number;
  totalProducts?: number;
  dates: PendingDateSummary[];
  oldestPendingDate: string | null;
};

function customerNameFromSnapshot(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "Cliente";
  const rec = snapshot as Record<string, unknown>;
  const name =
    (typeof rec.business_name === "string" && rec.business_name.trim()) ||
    (typeof rec.responsible_name === "string" && rec.responsible_name.trim());
  return name || "Cliente";
}

export async function getPendingPreparationWork(): Promise<PendingStageSummary> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const today = todayInBolivia();

  if (!supabase) {
    return {
      stage: "preparacion",
      totalOrders: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const { data, error } = await supabase
    .from("qb_orders")
    .select("id, public_reference, customer_snapshot, customer_notes, operational_date, status, submitted_at")
    .in("status", ["pendiente_preparacion", "en_preparacion"])
    .order("operational_date", { ascending: true })
    .order("submitted_at", { ascending: true });

  if (error || !data) {
    return {
      stage: "preparacion",
      totalOrders: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const dateMap = new Map<string, PendingOrderItem[]>();
  for (const row of data) {
    const dateStr = String(row.operational_date);
    const item: PendingOrderItem = {
      id: String(row.id),
      publicReference: String(row.public_reference),
      customerName: customerNameFromSnapshot(row.customer_snapshot),
      operationalDate: dateStr,
      status: String(row.status),
      customerNotes: typeof row.customer_notes === "string" ? row.customer_notes : undefined,
      isOverdue: dateStr < today,
    };
    const list = dateMap.get(dateStr) ?? [];
    list.push(item);
    dateMap.set(dateStr, list);
  }

  const dates: PendingDateSummary[] = [...dateMap.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, orders]) => ({
      date,
      orderCount: orders.length,
      isOverdue: date < today,
      orders,
    }));

  return {
    stage: "preparacion",
    totalOrders: data.length,
    dates,
    oldestPendingDate: dates[0]?.date ?? null,
  };
}

export async function getPendingDeliveryWork(): Promise<PendingStageSummary> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const today = todayInBolivia();

  if (!supabase) {
    return {
      stage: "entrega",
      totalOrders: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const { data, error } = await supabase
    .from("qb_orders")
    .select("id, public_reference, customer_snapshot, customer_notes, operational_date, status, submitted_at")
    .eq("status", "preparado")
    .order("operational_date", { ascending: true })
    .order("submitted_at", { ascending: true });

  if (error || !data) {
    return {
      stage: "entrega",
      totalOrders: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const dateMap = new Map<string, PendingOrderItem[]>();
  for (const row of data) {
    const dateStr = String(row.operational_date);
    const item: PendingOrderItem = {
      id: String(row.id),
      publicReference: String(row.public_reference),
      customerName: customerNameFromSnapshot(row.customer_snapshot),
      operationalDate: dateStr,
      status: String(row.status),
      customerNotes: typeof row.customer_notes === "string" ? row.customer_notes : undefined,
      isOverdue: dateStr < today,
    };
    const list = dateMap.get(dateStr) ?? [];
    list.push(item);
    dateMap.set(dateStr, list);
  }

  const dates: PendingDateSummary[] = [...dateMap.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, orders]) => ({
      date,
      orderCount: orders.length,
      isOverdue: date < today,
      orders,
    }));

  return {
    stage: "entrega",
    totalOrders: data.length,
    dates,
    oldestPendingDate: dates[0]?.date ?? null,
  };
}

export async function getPendingProvisionWork(): Promise<PendingStageSummary> {
  noStore();
  const supabase = await createSupabaseServerClient();
  const today = todayInBolivia();

  if (!supabase) {
    return {
      stage: "mercado",
      totalOrders: 0,
      totalProducts: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const { data: orders, error: ordersError } = await supabase
    .from("qb_orders")
    .select("id, public_reference, customer_snapshot, customer_notes, operational_date, status, submitted_at")
    .in("status", ["pendiente_preparacion", "en_preparacion"])
    .order("operational_date", { ascending: true })
    .order("submitted_at", { ascending: true });

  if (ordersError || !orders || !orders.length) {
    return {
      stage: "mercado",
      totalOrders: 0,
      totalProducts: 0,
      dates: [],
      oldestPendingDate: null,
    };
  }

  const orderIds = orders.map((o) => String(o.id));
  const { data: items } = await supabase
    .from("qb_order_items")
    .select("order_id, product_id")
    .in("order_id", orderIds);

  const orderToProducts = new Map<string, Set<string>>();
  for (const item of items ?? []) {
    const oId = String(item.order_id);
    const pId = String(item.product_id);
    const set = orderToProducts.get(oId) ?? new Set<string>();
    set.add(pId);
    orderToProducts.set(oId, set);
  }

  const dateMap = new Map<string, { orders: PendingOrderItem[]; products: Set<string> }>();
  const globalProducts = new Set<string>();

  for (const row of orders) {
    const dateStr = String(row.operational_date);
    const oId = String(row.id);
    const item: PendingOrderItem = {
      id: oId,
      publicReference: String(row.public_reference),
      customerName: customerNameFromSnapshot(row.customer_snapshot),
      operationalDate: dateStr,
      status: String(row.status),
      customerNotes: typeof row.customer_notes === "string" ? row.customer_notes : undefined,
      isOverdue: dateStr < today,
    };

    const entry = dateMap.get(dateStr) ?? { orders: [], products: new Set<string>() };
    entry.orders.push(item);
    const orderProds = orderToProducts.get(oId);
    if (orderProds) {
      for (const p of orderProds) {
        entry.products.add(p);
        globalProducts.add(p);
      }
    }
    dateMap.set(dateStr, entry);
  }

  const dates: PendingDateSummary[] = [...dateMap.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, entry]) => ({
      date,
      orderCount: entry.orders.length,
      productCount: entry.products.size,
      isOverdue: date < today,
      orders: entry.orders,
    }));

  return {
    stage: "mercado",
    totalOrders: orders.length,
    totalProducts: globalProducts.size,
    dates,
    oldestPendingDate: dates[0]?.date ?? null,
  };
}
